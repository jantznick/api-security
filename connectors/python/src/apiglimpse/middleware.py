"""FastAPI / Starlette middleware — fail-open async flush + circuit breaker."""

from __future__ import annotations

import asyncio
import json
import os
import random
import time
from typing import Any, Callable

import httpx
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

from .envelope import create_envelope, create_sample

DEFAULTS = {
    "agent_url": "http://localhost:8080",
    "api_key": "",
    "sample_rate": 1.0,
    "flush_interval_ms": 1000,
    "max_batch_size": 50,
    "max_buffer_size": 500,
    "request_timeout_ms": 2000,
    "circuit_failure_threshold": 3,
    "circuit_open_ms": 15000,
}


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _observe_auth(headers: dict[str, str]) -> str:
    try:
        auth = headers.get("authorization") or headers.get("Authorization")
        if auth and str(auth).lower().startswith("bearer "):
            return "bearer"
        if headers.get("cookie") or headers.get("Cookie"):
            return "cookie"
        return "none"
    except Exception:
        return "none"


def _headers_dict(headers: Any) -> dict[str, str]:
    try:
        return {str(k): str(v) for k, v in headers.items()}
    except Exception:
        return {}


def _parse_json_bytes(raw: bytes | None) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw.decode("utf-8"))
    except Exception:
        return None


class ApiGlimpseMiddleware(BaseHTTPMiddleware):
    """
    Capture request/response metadata, redact secrets, buffer samples, and
    POST envelope v1 to ``{agent_url}/v1/samples`` with ``X-API-Key``.

    Never blocks or fails the customer request because of API Glimpse.
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        agent_url: str | None = None,
        api_key: str | None = None,
        sample_rate: float | None = None,
        flush_interval_ms: int | None = None,
        max_batch_size: int | None = None,
        max_buffer_size: int | None = None,
        request_timeout_ms: int | None = None,
        circuit_failure_threshold: int | None = None,
        circuit_open_ms: int | None = None,
    ) -> None:
        super().__init__(app)

        env_agent = os.environ.get("API_SENSOR_AGENT_URL") or DEFAULTS["agent_url"]
        env_key = os.environ.get("API_SENSOR_KEY") or DEFAULTS["api_key"]
        env_rate = _env_float("API_SENSOR_SAMPLE_RATE", DEFAULTS["sample_rate"])

        self.agent_url = (agent_url if agent_url is not None else env_agent).rstrip("/")
        self.api_key = api_key if api_key is not None else env_key
        self.sample_rate = sample_rate if sample_rate is not None else env_rate
        self.flush_interval_ms = (
            flush_interval_ms if flush_interval_ms is not None else DEFAULTS["flush_interval_ms"]
        )
        self.max_batch_size = (
            max_batch_size if max_batch_size is not None else DEFAULTS["max_batch_size"]
        )
        self.max_buffer_size = (
            max_buffer_size if max_buffer_size is not None else DEFAULTS["max_buffer_size"]
        )
        self.request_timeout_ms = (
            request_timeout_ms
            if request_timeout_ms is not None
            else DEFAULTS["request_timeout_ms"]
        )
        self.circuit_failure_threshold = (
            circuit_failure_threshold
            if circuit_failure_threshold is not None
            else DEFAULTS["circuit_failure_threshold"]
        )
        self.circuit_open_ms = (
            circuit_open_ms if circuit_open_ms is not None else DEFAULTS["circuit_open_ms"]
        )

        self._buffer: list[dict[str, Any]] = []
        self._flushing = False
        self._consecutive_failures = 0
        self._circuit_open_until = 0.0
        self._flush_task: asyncio.Task[None] | None = None
        self._lock = asyncio.Lock()
        self._started = False

    def _should_sample(self) -> bool:
        if self.sample_rate >= 1:
            return True
        if self.sample_rate <= 0:
            return False
        return random.random() < self.sample_rate

    def _circuit_open(self) -> bool:
        return time.time() * 1000 < self._circuit_open_until

    def _record_failure(self) -> None:
        self._consecutive_failures += 1
        if self._consecutive_failures >= self.circuit_failure_threshold:
            self._circuit_open_until = time.time() * 1000 + self.circuit_open_ms
            self._consecutive_failures = 0

    def _record_success(self) -> None:
        self._consecutive_failures = 0
        self._circuit_open_until = 0.0

    def _ensure_flusher(self) -> None:
        if self._started:
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        self._started = True
        self._flush_task = loop.create_task(self._flush_loop())

    async def _flush_loop(self) -> None:
        interval = max(self.flush_interval_ms, 50) / 1000.0
        while True:
            try:
                await asyncio.sleep(interval)
                await self._flush()
            except asyncio.CancelledError:
                break
            except Exception:
                # fail-open: never crash the flusher permanently
                continue

    async def _flush(self) -> None:
        if self._flushing or not self._buffer:
            return
        if self._circuit_open():
            return

        self._flushing = True
        async with self._lock:
            batch = self._buffer[: self.max_batch_size]
            del self._buffer[: self.max_batch_size]

        try:
            envelope = create_envelope(api_key=self.api_key, samples=batch)
            timeout = self.request_timeout_ms / 1000.0
            url = f"{self.agent_url}/v1/samples"
            async with httpx.AsyncClient(timeout=timeout) as client:
                res = await client.post(
                    url,
                    json=envelope,
                    headers={
                        "Content-Type": "application/json",
                        "X-API-Key": self.api_key or "",
                    },
                )
            if not res.is_success and res.status_code >= 500:
                self._record_failure()
            elif not res.is_success and res.status_code == 401:
                # bad key — drop, do not trip circuit forever
                pass
            else:
                self._record_success()
        except Exception:
            self._record_failure()
        finally:
            self._flushing = False

    def _enqueue(self, sample: dict[str, Any]) -> None:
        if len(self._buffer) >= self.max_buffer_size:
            self._buffer.pop(0)
        self._buffer.append(sample)
        if len(self._buffer) >= self.max_batch_size:
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(self._flush())
            except RuntimeError:
                pass

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        self._ensure_flusher()

        try:
            if not self._should_sample():
                return await call_next(request)
        except Exception:
            return await call_next(request)

        start = time.time()
        request_body: Any = None
        response_body: Any = None

        try:
            content_type = (request.headers.get("content-type") or "").lower()
            if "application/json" in content_type:
                raw = await request.body()
                request_body = _parse_json_bytes(raw)

                async def receive() -> dict[str, Any]:
                    return {"type": "http.request", "body": raw, "more_body": False}

                request = Request(request.scope, receive)
        except Exception:
            request_body = None

        try:
            response = await call_next(request)
        except Exception:
            # Never mask app errors; still no sample if we couldn't get a response
            raise

        try:
            # Capture JSON response body without breaking streaming consumers
            resp_ct = (response.headers.get("content-type") or "").lower()
            if "application/json" in resp_ct and hasattr(response, "body_iterator"):
                chunks: list[bytes] = []
                async for chunk in response.body_iterator:
                    if isinstance(chunk, str):
                        chunks.append(chunk.encode("utf-8"))
                    else:
                        chunks.append(chunk)
                body_bytes = b"".join(chunks)
                response_body = _parse_json_bytes(body_bytes)

                async def body_iter():
                    yield body_bytes

                response = Response(
                    content=body_bytes,
                    status_code=response.status_code,
                    headers=dict(response.headers),
                    media_type=response.media_type,
                    background=response.background,
                )

            latency_ms = (time.time() - start) * 1000.0
            path = request.url.path or "/"
            sample = create_sample(
                method=request.method,
                path=path,
                status_code=response.status_code,
                latency_ms=latency_ms,
                request_headers=_headers_dict(request.headers),
                response_headers=_headers_dict(response.headers),
                request_body=request_body,
                response_body=response_body,
                auth_observed=_observe_auth(_headers_dict(request.headers)),
            )
            self._enqueue(sample)
        except Exception:
            # fail-open: never break the app
            pass

        return response
