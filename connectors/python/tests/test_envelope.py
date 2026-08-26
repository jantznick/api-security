"""Tests for envelope / sample builders."""

from apiglimpse.envelope import create_envelope, create_sample, validate_envelope
from apiglimpse.redaction import ENVELOPE_VERSION


def test_create_sample_shape():
    sample = create_sample(
        method="post",
        path="/api/users",
        status_code=201,
        latency_ms=42,
        request_headers={
            "content-type": "application/json",
            "authorization": "Bearer secret",
            "x-request-id": "req-abc-123",
        },
        response_headers={
            "content-type": "application/json",
            "set-cookie": "sid=xyz",
        },
        request_body={
            "email": "user@example.com",
            "password": "hunter2",
            "profile": {"name": "Ada", "age": 36},
        },
        response_body={
            "id": "usr_01",
            "email": "user@example.com",
            "token": "tok_secret",
        },
        auth_observed="bearer",
        timestamp="2026-01-15T12:00:00.000Z",
    )

    assert sample["method"] == "POST"
    assert sample["path"] == "/api/users"
    assert sample["statusCode"] == 201
    assert sample["latencyMs"] == 42
    assert sample["authObserved"] == "bearer"
    assert sample["timestamp"] == "2026-01-15T12:00:00.000Z"

    assert sample["request"]["contentType"] == "application/json"
    assert sample["request"]["headers"]["authorization"] == "[REDACTED]"
    assert sample["request"]["headers"]["x-request-id"] == "req-abc-123"
    assert sample["request"]["bodyShape"]["properties"]["password"]["sample"] == "[REDACTED]"
    assert sample["request"]["bodyShape"]["properties"]["email"]["sample"] == "user@example.com"

    assert sample["response"]["headers"]["set-cookie"] == "[REDACTED]"
    assert sample["response"]["bodyShape"]["properties"]["token"]["sample"] == "[REDACTED]"


def test_create_envelope():
    samples = [
        create_sample(
            method="GET",
            path="/health",
            status_code=200,
            latency_ms=1,
            request_headers={},
            response_headers={},
            timestamp="2026-01-15T12:00:00.000Z",
        )
    ]
    env = create_envelope(api_key="ask_test", samples=samples)
    assert env["version"] == ENVELOPE_VERSION
    assert env["apiKey"] == "ask_test"
    assert len(env["samples"]) == 1
    assert "sentAt" in env
    assert validate_envelope(env) == {"ok": True}


def test_validate_envelope_rejects_bad():
    assert validate_envelope(None)["ok"] is False
    assert validate_envelope({"version": 99, "samples": []})["ok"] is False
    assert validate_envelope({"version": 1, "samples": "nope"})["ok"] is False


def test_create_sample_omits_body_when_undefined():
    sample = create_sample(
        method="GET",
        path="/",
        status_code=200,
        request_headers={},
        response_headers={},
    )
    assert sample["request"]["bodyShape"] is None
    assert sample["response"]["bodyShape"] is None
