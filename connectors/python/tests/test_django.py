"""Django middleware integration tests."""

from __future__ import annotations

import json
import time
from typing import Any

import httpx
import pytest

django = pytest.importorskip("django")


def _configure_django():
    from django.conf import settings

    if settings.configured:
        return settings

    settings.configure(
        DEBUG=True,
        SECRET_KEY="test-secret",
        ROOT_URLCONF="django_urls",
        ALLOWED_HOSTS=["*"],
        MIDDLEWARE=[
            "django.middleware.common.CommonMiddleware",
            "apiglimpse.django.ApiGlimpseDjangoMiddleware",
        ],
        APIGLIMPSE={
            "AGENT_URL": "http://agent.test",
            "API_KEY": "ask_test",
            "SAMPLE_RATE": 1.0,
            "FLUSH_INTERVAL_MS": 50,
            "MAX_BATCH_SIZE": 1,
        },
        USE_TZ=True,
    )
    django.setup()
    return settings


class CapturingTransport(httpx.BaseTransport):
    def __init__(self) -> None:
        self.envelopes: list[dict[str, Any]] = []

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8"))
        self.envelopes.append(body)
        return httpx.Response(202, json={"accepted": 1})


@pytest.fixture
def transport(monkeypatch):
    _configure_django()
    cap = CapturingTransport()

    class FakeClient(httpx.Client):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = cap
            kwargs.setdefault("base_url", "http://agent.test")
            super().__init__(*args, **kwargs)

    monkeypatch.setattr("apiglimpse.flush.httpx.Client", FakeClient)
    return cap


def _wait_envelope(transport, timeout: float = 2.0) -> dict[str, Any]:
    deadline = time.time() + timeout
    while not transport.envelopes and time.time() < deadline:
        time.sleep(0.05)
    assert transport.envelopes, "expected envelope POST"
    return transport.envelopes[-1]


def test_django_json_response_shape(transport):
    from django.test import Client

    client = Client()
    res = client.get("/json")
    assert res.status_code == 200
    assert res.json()["id"] == "1"

    sample = _wait_envelope(transport)["samples"][0]
    assert sample["responseBodyCaptured"] is True
    assert sample["response"]["bodyShape"]["properties"]["id"]["sample"] == "1"
    assert sample["response"]["bodyShape"]["properties"]["email"]["sample"] == "a@b.co"
    assert sample["method"] == "GET"
    assert sample["path"] == "/json"


def test_django_request_body_shape(transport):
    from django.test import Client

    client = Client()
    res = client.post(
        "/echo",
        data=json.dumps({"email": "ada@example.com", "password": "secret"}),
        content_type="application/json",
    )
    assert res.status_code == 201

    sample = _wait_envelope(transport)["samples"][0]
    assert sample["request"]["bodyShape"]["properties"]["password"]["sample"] == "[REDACTED]"
    assert sample["request"]["bodyShape"]["properties"]["email"]["sample"] == "ada@example.com"


def test_django_empty_and_binary_not_captured(transport):
    from django.test import Client

    client = Client()
    assert client.get("/empty").status_code == 204
    sample = _wait_envelope(transport)["samples"][0]
    assert sample["responseBodyCaptured"] is False
    assert sample["response"]["bodyShape"] is None

    transport.envelopes.clear()
    bin_res = client.get("/bin")
    assert bin_res.status_code == 200
    sample = _wait_envelope(transport)["samples"][0]
    assert sample["responseBodyCaptured"] is False


def test_django_fail_open(monkeypatch):
    _configure_django()

    class BoomTransport(httpx.BaseTransport):
        def handle_request(self, request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("down")

    class FakeClient(httpx.Client):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = BoomTransport()
            kwargs.setdefault("base_url", "http://agent.test")
            super().__init__(*args, **kwargs)

    monkeypatch.setattr("apiglimpse.flush.httpx.Client", FakeClient)

    from django.test import Client

    client = Client()
    res = client.get("/json")
    assert res.status_code == 200
    assert res.json()["id"] == "1"
