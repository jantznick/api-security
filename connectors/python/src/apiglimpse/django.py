"""Django middleware — fail-open sync flush + circuit breaker."""

from __future__ import annotations

import time
from typing import Any, Callable

from ._common import (
    MAX_RESPONSE_CAPTURE_BYTES,
    headers_dict,
    observe_auth,
    parse_json_bytes,
    resolve_caller,
    resolve_sensor_config,
    should_sample,
)
from .envelope import create_sample
from .flush import SyncSampleFlusher


def _django_settings_overrides() -> dict[str, Any]:
    try:
        from django.conf import settings

        raw = getattr(settings, "APIGLIMPSE", None) or {}
        if not isinstance(raw, dict):
            return {}
        mapping = {
            "AGENT_URL": "agent_url",
            "API_KEY": "api_key",
            "SAMPLE_RATE": "sample_rate",
            "SERVICE_NAME": "service_name",
            "FLUSH_INTERVAL_MS": "flush_interval_ms",
            "MAX_BATCH_SIZE": "max_batch_size",
            "MAX_BUFFER_SIZE": "max_buffer_size",
            "REQUEST_TIMEOUT_MS": "request_timeout_ms",
            "CIRCUIT_FAILURE_THRESHOLD": "circuit_failure_threshold",
            "CIRCUIT_OPEN_MS": "circuit_open_ms",
        }
        out: dict[str, Any] = {}
        for src, dest in mapping.items():
            if src in raw and raw[src] is not None:
                out[dest] = raw[src]
        # also accept snake_case keys
        for dest in mapping.values():
            if dest in raw and raw[dest] is not None:
                out[dest] = raw[dest]
        return out
    except Exception:
        return {}


def _capture_request_body(request: Any) -> Any:
    try:
        content_type = (request.META.get("CONTENT_TYPE") or "").lower()
        if "application/json" not in content_type:
            return None
        raw = request.body
        return parse_json_bytes(raw)
    except Exception:
        return None


def _capture_response_body(response: Any) -> tuple[Any, bool]:
    """Return (parsed_json_or_None, captured_flag)."""
    try:
        content_type = (getattr(response, "get", lambda *_: None)("Content-Type") or "").lower()
        if "application/json" not in content_type:
            return None, False
        # StreamingHttpResponse has no .content until consumed — skip.
        if not hasattr(response, "content"):
            return None, False
        raw = response.content
        if not isinstance(raw, (bytes, bytearray)):
            raw = bytes(raw)
        if len(raw) > MAX_RESPONSE_CAPTURE_BYTES:
            return None, False
        parsed = parse_json_bytes(bytes(raw))
        if parsed is None:
            return None, False
        return parsed, True
    except Exception:
        return None, False


class ApiGlimpseDjangoMiddleware:
    """
    Django middleware class.

    Add to ``MIDDLEWARE``::

        MIDDLEWARE = [
            ...,
            "apiglimpse.django.ApiGlimpseDjangoMiddleware",
        ]

    Config via ``API_SENSOR_*`` env vars and optional ``settings.APIGLIMPSE`` dict.
    """

    def __init__(self, get_response: Callable) -> None:
        self.get_response = get_response
        overrides = _django_settings_overrides()
        cfg = resolve_sensor_config(**overrides)
        self.sample_rate = cfg["sample_rate"]
        self.service_name = cfg["service_name"]
        self._flusher = SyncSampleFlusher(
            agent_url=cfg["agent_url"],
            api_key=cfg["api_key"],
            flush_interval_ms=cfg["flush_interval_ms"],
            max_batch_size=cfg["max_batch_size"],
            max_buffer_size=cfg["max_buffer_size"],
            request_timeout_ms=cfg["request_timeout_ms"],
            circuit_failure_threshold=cfg["circuit_failure_threshold"],
            circuit_open_ms=cfg["circuit_open_ms"],
        )
        self._flusher.start()

    def __call__(self, request: Any) -> Any:
        try:
            if not should_sample(self.sample_rate):
                return self.get_response(request)
        except Exception:
            return self.get_response(request)

        start = time.time()
        request_body = _capture_request_body(request)

        try:
            response = self.get_response(request)
        except Exception:
            raise

        try:
            response_body, captured = _capture_response_body(response)
            latency_ms = (time.time() - start) * 1000.0
            path = getattr(request, "path", None) or "/"
            method = getattr(request, "method", "GET") or "GET"
            # Django request.headers is available on Django 2.2+
            try:
                req_headers = headers_dict(request.headers)
            except Exception:
                req_headers = {
                    k[5:].replace("_", "-").lower(): str(v)
                    for k, v in request.META.items()
                    if k.startswith("HTTP_")
                }
            try:
                res_headers = headers_dict(response.headers)
            except Exception:
                res_headers = {str(k): str(v) for k, v in response.items()}

            sample = create_sample(
                method=method,
                path=path,
                status_code=int(getattr(response, "status_code", 0) or 0),
                latency_ms=latency_ms,
                request_headers=req_headers,
                response_headers=res_headers,
                request_body=request_body if request_body is not None else ...,
                response_body=response_body if captured else ...,
                response_body_captured=captured,
                caller=resolve_caller(req_headers, self.service_name or None),
                auth_observed=observe_auth(req_headers),
            )
            self._flusher.enqueue(sample)
        except Exception:
            pass

        return response
