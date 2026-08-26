"""Sync sample buffer + flush (threading) for WSGI frameworks (Django / Flask)."""

from __future__ import annotations

import threading
import time
from typing import Any

import httpx

from .envelope import create_envelope


class SyncSampleFlusher:
    """
    Fail-open buffer that POSTs envelope v1 to ``{agent_url}/v1/samples``.

    Uses a daemon thread for periodic flush so Django/Flask request threads
    are never blocked on the collector.
    """

    def __init__(
        self,
        *,
        agent_url: str,
        api_key: str,
        flush_interval_ms: int = 1000,
        max_batch_size: int = 50,
        max_buffer_size: int = 500,
        request_timeout_ms: int = 2000,
        circuit_failure_threshold: int = 3,
        circuit_open_ms: int = 15000,
    ) -> None:
        self.agent_url = agent_url.rstrip("/")
        self.api_key = api_key or ""
        self.flush_interval_ms = flush_interval_ms
        self.max_batch_size = max_batch_size
        self.max_buffer_size = max_buffer_size
        self.request_timeout_ms = request_timeout_ms
        self.circuit_failure_threshold = circuit_failure_threshold
        self.circuit_open_ms = circuit_open_ms

        self._buffer: list[dict[str, Any]] = []
        self._lock = threading.Lock()
        self._flushing = False
        self._consecutive_failures = 0
        self._circuit_open_until = 0.0
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._started = False

    def start(self) -> None:
        if self._started:
            return
        self._started = True
        self._stop.clear()
        self._thread = threading.Thread(target=self._flush_loop, name="apiglimpse-flush", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)
        self._started = False

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

    def _flush_loop(self) -> None:
        interval = max(self.flush_interval_ms, 50) / 1000.0
        while not self._stop.wait(interval):
            try:
                self.flush()
            except Exception:
                continue

    def flush(self) -> None:
        if self._flushing:
            return
        with self._lock:
            if not self._buffer:
                return
            if self._circuit_open():
                return
            self._flushing = True
            batch = self._buffer[: self.max_batch_size]
            del self._buffer[: self.max_batch_size]

        try:
            envelope = create_envelope(api_key=self.api_key, samples=batch)
            timeout = self.request_timeout_ms / 1000.0
            url = f"{self.agent_url}/v1/samples"
            with httpx.Client(timeout=timeout) as client:
                res = client.post(
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
                pass
            else:
                self._record_success()
        except Exception:
            self._record_failure()
        finally:
            self._flushing = False

    def enqueue(self, sample: dict[str, Any]) -> None:
        self.start()
        flush_now = False
        with self._lock:
            if len(self._buffer) >= self.max_buffer_size:
                self._buffer.pop(0)
            self._buffer.append(sample)
            if len(self._buffer) >= self.max_batch_size:
                flush_now = True
        if flush_now:
            # Run flush off the request thread so fail-open stays snappy.
            threading.Thread(target=self.flush, name="apiglimpse-flush-now", daemon=True).start()
