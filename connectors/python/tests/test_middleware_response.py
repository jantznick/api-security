"""Integration tests: JSON response shapes reach the envelope."""

from __future__ import annotations

import asyncio
import json
from typing import Any

import httpx
import pytest
from fastapi import FastAPI, Response
from fastapi.testclient import TestClient
from starlette.responses import StreamingResponse

from apiglimpse.middleware import ApiGlimpseMiddleware


class CapturingTransport(httpx.AsyncBaseTransport):
    """Collect POSTed envelopes instead of talking to a real agent."""

    def __init__(self) -> None:
        self.envelopes: list[dict[str, Any]] = []
        self._event = asyncio.Event()

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8"))
        self.envelopes.append(body)
        self._event.set()
        return httpx.Response(202, json={"accepted": 1})

    async def wait(self, timeout: float = 2.0) -> dict[str, Any]:
        await asyncio.wait_for(self._event.wait(), timeout=timeout)
        self._event.clear()
        return self.envelopes[-1]


@pytest.fixture
def transport(monkeypatch):
    cap = CapturingTransport()

    class FakeAsyncClient(httpx.AsyncClient):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = cap
            kwargs.setdefault("base_url", "http://agent.test")
            super().__init__(*args, **kwargs)

    monkeypatch.setattr("apiglimpse.middleware.httpx.AsyncClient", FakeAsyncClient)
    return cap


def _make_app(transport) -> FastAPI:
    app = FastAPI()
    app.add_middleware(
        ApiGlimpseMiddleware,
        agent_url="http://agent.test",
        api_key="ask_test",
        sample_rate=1.0,
        flush_interval_ms=50,
        max_batch_size=1,
    )

    @app.get("/json")
    def json_route():
        return {"id": "1", "email": "a@b.co"}

    @app.get("/empty")
    def empty_route():
        return Response(status_code=204)

    @app.get("/bin")
    def bin_route():
        return Response(content=bytes([0x89, 0x50, 0x4E, 0x47]), media_type="application/octet-stream")

    @app.get("/stream")
    def stream_route():
        async def gen():
            yield b'{"partial":'
            yield b"true}"

        return StreamingResponse(gen(), media_type="application/json")

    return app


def test_json_response_shape_reaches_envelope(transport):
    app = _make_app(transport)
    client = TestClient(app)
    res = client.get("/json")
    assert res.status_code == 200
    assert res.json()["id"] == "1"

    # Force flush via middleware buffer (max_batch_size=1 should have flushed)
    # Give the async flush a moment if needed
    import time

    deadline = time.time() + 2
    while not transport.envelopes and time.time() < deadline:
        time.sleep(0.05)

    assert transport.envelopes, "expected envelope POST"
    sample = transport.envelopes[-1]["samples"][0]
    assert sample["responseBodyCaptured"] is True
    assert sample["response"]["bodyShape"]["type"] == "object"
    assert sample["response"]["bodyShape"]["properties"]["id"]["sample"] == "1"
    assert sample["response"]["bodyShape"]["properties"]["email"]["sample"] == "a@b.co"


def test_empty_body_not_captured(transport):
    app = _make_app(transport)
    client = TestClient(app)
    res = client.get("/empty")
    assert res.status_code == 204

    import time

    deadline = time.time() + 2
    while not transport.envelopes and time.time() < deadline:
        time.sleep(0.05)

    sample = transport.envelopes[-1]["samples"][0]
    assert sample["responseBodyCaptured"] is False
    assert sample["response"]["bodyShape"] is None


def test_binary_skipped(transport):
    app = _make_app(transport)
    client = TestClient(app)
    res = client.get("/bin")
    assert res.status_code == 200
    assert res.content[:4] == bytes([0x89, 0x50, 0x4E, 0x47])

    import time

    deadline = time.time() + 2
    while not transport.envelopes and time.time() < deadline:
        time.sleep(0.05)

    sample = transport.envelopes[-1]["samples"][0]
    assert sample["responseBodyCaptured"] is False
    assert sample["response"]["bodyShape"] is None


def test_fail_open_when_collector_errors(monkeypatch):
    class BoomTransport(httpx.AsyncBaseTransport):
        async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("down")

    class FakeAsyncClient(httpx.AsyncClient):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = BoomTransport()
            kwargs.setdefault("base_url", "http://agent.test")
            super().__init__(*args, **kwargs)

    monkeypatch.setattr("apiglimpse.middleware.httpx.AsyncClient", FakeAsyncClient)

    app = FastAPI()
    app.add_middleware(
        ApiGlimpseMiddleware,
        agent_url="http://agent.test",
        api_key="ask_x",
        sample_rate=1.0,
        flush_interval_ms=30,
        max_batch_size=1,
        request_timeout_ms=50,
    )

    @app.get("/health")
    def health():
        return {"status": "ok"}

    client = TestClient(app)
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
