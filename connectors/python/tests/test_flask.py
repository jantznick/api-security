"""Flask extension integration tests."""

from __future__ import annotations

import json
import time
from typing import Any

import httpx
import pytest


class CapturingTransport(httpx.BaseTransport):
    def __init__(self) -> None:
        self.envelopes: list[dict[str, Any]] = []

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8"))
        self.envelopes.append(body)
        return httpx.Response(202, json={"accepted": 1})


@pytest.fixture
def transport(monkeypatch):
    cap = CapturingTransport()

    class FakeClient(httpx.Client):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = cap
            kwargs.setdefault("base_url", "http://agent.test")
            super().__init__(*args, **kwargs)

    monkeypatch.setattr("apiglimpse.flush.httpx.Client", FakeClient)
    return cap


def _make_app():
    flask = pytest.importorskip("flask")
    from apiglimpse.flask import ApiGlimpse

    app = flask.Flask(__name__)
    ApiGlimpse(
        app,
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
        return ("", 204)

    @app.get("/bin")
    def bin_route():
        return flask.Response(bytes([0x89, 0x50, 0x4E, 0x47]), mimetype="application/octet-stream")

    @app.post("/echo")
    def echo_route():
        body = flask.request.get_json(silent=True) or {}
        return flask.jsonify({"ok": True, "echo": body.get("email")}), 201

    return app


def _wait_envelope(transport, timeout: float = 2.0) -> dict[str, Any]:
    deadline = time.time() + timeout
    while not transport.envelopes and time.time() < deadline:
        time.sleep(0.05)
    assert transport.envelopes, "expected envelope POST"
    return transport.envelopes[-1]


def test_flask_json_response_shape(transport):
    app = _make_app()
    client = app.test_client()
    res = client.get("/json")
    assert res.status_code == 200
    assert res.get_json()["id"] == "1"

    sample = _wait_envelope(transport)["samples"][0]
    assert sample["responseBodyCaptured"] is True
    assert sample["response"]["bodyShape"]["properties"]["id"]["sample"] == "1"
    assert sample["method"] == "GET"
    assert sample["path"] == "/json"


def test_flask_request_body_shape(transport):
    app = _make_app()
    client = app.test_client()
    res = client.post(
        "/echo",
        data=json.dumps({"email": "ada@example.com", "password": "secret"}),
        content_type="application/json",
    )
    assert res.status_code == 201

    sample = _wait_envelope(transport)["samples"][0]
    assert sample["request"]["bodyShape"]["properties"]["password"]["sample"] == "[REDACTED]"
    assert sample["request"]["bodyShape"]["properties"]["email"]["sample"] == "ada@example.com"
    assert sample["response"]["bodyShape"]["properties"]["echo"]["sample"] == "ada@example.com"


def test_flask_empty_and_binary_not_captured(transport):
    app = _make_app()
    client = app.test_client()

    assert client.get("/empty").status_code == 204
    sample = _wait_envelope(transport)["samples"][0]
    assert sample["responseBodyCaptured"] is False

    transport.envelopes.clear()
    assert client.get("/bin").status_code == 200
    sample = _wait_envelope(transport)["samples"][0]
    assert sample["responseBodyCaptured"] is False


def test_flask_fail_open(monkeypatch):
    class BoomTransport(httpx.BaseTransport):
        def handle_request(self, request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("down")

    class FakeClient(httpx.Client):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = BoomTransport()
            kwargs.setdefault("base_url", "http://agent.test")
            super().__init__(*args, **kwargs)

    monkeypatch.setattr("apiglimpse.flush.httpx.Client", FakeClient)

    app = _make_app()
    client = app.test_client()
    res = client.get("/json")
    assert res.status_code == 200
    assert res.get_json() == {"id": "1", "email": "a@b.co"}
