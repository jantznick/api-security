"""Flask extension — fail-open sync flush + circuit breaker."""

from __future__ import annotations

import time
from typing import Any

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


def _flask_config_overrides(app: Any) -> dict[str, Any]:
    try:
        cfg = app.config
    except Exception:
        return {}
    mapping = {
        "APIGLIMPSE_AGENT_URL": "agent_url",
        "APIGLIMPSE_API_KEY": "api_key",
        "APIGLIMPSE_SAMPLE_RATE": "sample_rate",
        "APIGLIMPSE_SERVICE_NAME": "service_name",
        "APIGLIMPSE_FLUSH_INTERVAL_MS": "flush_interval_ms",
        "APIGLIMPSE_MAX_BATCH_SIZE": "max_batch_size",
        "APIGLIMPSE_MAX_BUFFER_SIZE": "max_buffer_size",
        "APIGLIMPSE_REQUEST_TIMEOUT_MS": "request_timeout_ms",
        "APIGLIMPSE_CIRCUIT_FAILURE_THRESHOLD": "circuit_failure_threshold",
        "APIGLIMPSE_CIRCUIT_OPEN_MS": "circuit_open_ms",
        # also honor API_SENSOR_* if set on app.config
        "API_SENSOR_AGENT_URL": "agent_url",
        "API_SENSOR_KEY": "api_key",
        "API_SENSOR_SAMPLE_RATE": "sample_rate",
        "API_SENSOR_SERVICE_NAME": "service_name",
    }
    out: dict[str, Any] = {}
    for src, dest in mapping.items():
        if src in cfg and cfg[src] is not None:
            out[dest] = cfg[src]
    return out


class ApiGlimpse:
    """
    Flask extension.

    ::

        from flask import Flask
        from apiglimpse.flask import ApiGlimpse

        app = Flask(__name__)
        ApiGlimpse(app, agent_url="http://localhost:8080", api_key="ask_…")
    """

    def __init__(self, app: Any | None = None, **kwargs: Any) -> None:
        self._kwargs = kwargs
        self._flusher: SyncSampleFlusher | None = None
        self.sample_rate = 1.0
        self.service_name = ""
        if app is not None:
            self.init_app(app, **kwargs)

    def init_app(self, app: Any, **kwargs: Any) -> None:
        merged = {**self._kwargs, **kwargs}
        overrides = _flask_config_overrides(app)
        # Explicit constructor kwargs win over app.config / env
        for key, value in list(merged.items()):
            if value is not None:
                overrides[key] = value
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

        app.extensions = getattr(app, "extensions", {}) or {}
        app.extensions["apiglimpse"] = self

        @app.before_request
        def _apiglimpse_before() -> None:
            from flask import g, request

            try:
                g._apiglimpse_skip = not should_sample(self.sample_rate)
            except Exception:
                g._apiglimpse_skip = True
                return
            if g._apiglimpse_skip:
                return
            g._apiglimpse_start = time.time()
            g._apiglimpse_request_body = None
            try:
                content_type = (request.content_type or "").lower()
                if "application/json" in content_type:
                    # cache=True so the view can still read the body
                    raw = request.get_data(cache=True, as_text=False)
                    g._apiglimpse_request_body = parse_json_bytes(raw)
            except Exception:
                g._apiglimpse_request_body = None

        @app.after_request
        def _apiglimpse_after(response: Any) -> Any:
            from flask import g, request

            try:
                if getattr(g, "_apiglimpse_skip", True):
                    return response
                if self._flusher is None:
                    return response

                response_body = None
                captured = False
                try:
                    content_type = (response.content_type or "").lower()
                    if "application/json" in content_type:
                        raw = response.get_data(as_text=False)
                        if isinstance(raw, (bytes, bytearray)) and len(raw) <= MAX_RESPONSE_CAPTURE_BYTES:
                            parsed = parse_json_bytes(bytes(raw))
                            if parsed is not None:
                                response_body = parsed
                                captured = True
                except Exception:
                    captured = False

                start = getattr(g, "_apiglimpse_start", time.time())
                latency_ms = (time.time() - start) * 1000.0
                req_headers = headers_dict(request.headers)
                res_headers = headers_dict(response.headers)
                request_body = getattr(g, "_apiglimpse_request_body", None)

                sample = create_sample(
                    method=request.method or "GET",
                    path=request.path or "/",
                    status_code=int(response.status_code or 0),
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
