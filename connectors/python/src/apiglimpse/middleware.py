"""FastAPI / Starlette middleware — fail-open async flush + circuit breaker."""

from __future__ import annotations

import asyncio
import time
from typing import Any, Callable

import httpx
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

from ._common import (
    MAX_RESPONSE_CAPTURE_BYTES,
    headers_dict,
    observe_auth,
    parse_json_bytes,
    resolve_caller,
    resolve_sensor_config,
    should_sample,
)
from .envelope import create_envelope, create_sample

# Re-export for tests / callers that historically patched middleware.DEFAULTS
from ._common import DEFAULTS  # noqa: F401


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
        service_name: str | None = None,
        flush_interval_ms: int | None = None,
        max_batch_size: int | None = None,
        max_buffer_size: int | None = None,
        request_timeout_ms: int | None = None,
        circuit_failure_threshold: int | None = None,
        circuit_open_ms: int | None = None,
    ) -> None:
        super().__init__(app)

        cfg = resolve_sensor_config(
            agent_url=agent_url,
            api_key=api_key,
            sample_rate=sample_rate,
            service_name=service_name,
            flush_interval_ms=flush_interval_ms,
            max_batch_size=max_batch_size,
            max_buffer_size=max_buffer_size,
            request_timeout_ms=request_timeout_ms,
            circuit_failure_threshold=circuit_failure_threshold,
            circuit_open_ms=circuit_open_ms,
        )
        self.agent_url = cfg["agent_url"]
        self.api_key = cfg["api_key"]
        self.sample_rate = cfg["sample_rate"]
        self.service_name = cfg["service_name"]
        self.flush_interval_ms = cfg["flush_interval_ms"]
        self.max_batch_size = cfg["max_batch_size"]
        self.max_buffer_size = cfg["max_buffer_size"]
        self.request_timeout_ms = cfg["request_timeout_ms"]
        self.circuit_failure_threshold = cfg["circuit_failure_threshold"]
        self.circuit_open_ms = cfg["circuit_open_ms"]

        self._buffer: list[dict[str, Any]] = []
        self._flushing = False
        self._consecutive_failures = 0
        self._circuit_open_until = 0.0
        self._flush_task: asyncio.Task[None] | None = None
        self._lock = asyncio.Lock()
        self._started = False

    def _should_sample(self) -> bool:
        return should_sample(self.sample_rate)

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
                request_body = parse_json_bytes(raw)

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
            # Capture JSON response body without breaking streaming consumers.
            # Skip binary / non-JSON / oversized bodies (shapes only, never raw store).
            resp_ct = (response.headers.get("content-type") or "").lower()
            response_body_captured = False
            if "application/json" in resp_ct and hasattr(response, "body_iterator"):
                chunks: list[bytes] = []
                total = 0
                oversized = False
                async for chunk in response.body_iterator:
                    if isinstance(chunk, str):
                        chunk = chunk.encode("utf-8")
                    total += len(chunk)
                    if total > MAX_RESPONSE_CAPTURE_BYTES:
                        oversized = True
                    if not oversized:
                        chunks.append(chunk)
                    else:
                        # Still drain the iterator so the client gets the full body
                        chunks.append(chunk)
                body_bytes = b"".join(chunks)
                if not oversized:
                    parsed = parse_json_bytes(body_bytes)
                    if parsed is not None:
                        response_body = parsed
                        response_body_captured = True
                    elif body_bytes:
                        # Empty-parseable or invalid JSON — not captured
                        response_body = None
                    else:
                        response_body = None
                else:
                    response_body = None

                response = Response(
                    content=body_bytes,
                    status_code=response.status_code,
                    headers=dict(response.headers),
                    media_type=response.media_type,
                    background=response.background,
                )
            elif "application/json" not in resp_ct:
                # Binary / text / streaming content-types are not shaped
                response_body = None

            latency_ms = (time.time() - start) * 1000.0
            path = request.url.path or "/"
            req_headers = headers_dict(request.headers)
            sample = create_sample(
                method=request.method,
                path=path,
                status_code=response.status_code,
                latency_ms=latency_ms,
                request_headers=req_headers,
                response_headers=headers_dict(response.headers),
                request_body=request_body if request_body is not None else ...,
                response_body=response_body if response_body_captured else ...,
                response_body_captured=response_body_captured,
                caller=resolve_caller(req_headers, self.service_name or None),
                auth_observed=observe_auth(req_headers),
            )
            self._enqueue(sample)
        except Exception:
            # fail-open: never break the app
            pass

        return response
