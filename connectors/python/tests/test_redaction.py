"""Tests for redaction helpers — mirror packages/shared/src/redaction.js."""

from apiglimpse.redaction import (
    ENVELOPE_VERSION,
    SENSITIVE_HEADER_NAMES,
    redact_headers,
    redact_value,
    shape_body,
    truncate_string,
)


def test_envelope_version():
    assert ENVELOPE_VERSION == 1


def test_sensitive_headers_set():
    expected = {
        "authorization",
        "cookie",
        "set-cookie",
        "x-api-key",
        "x-auth-token",
        "proxy-authorization",
    }
    assert set(SENSITIVE_HEADER_NAMES) == expected


def test_truncate_string():
    assert truncate_string("short") == "short"
    long = "x" * 100
    out = truncate_string(long, 64)
    assert out.endswith("…")
    assert len(out) == 65  # 64 chars + ellipsis


def test_redact_headers():
    headers = {
        "Authorization": "Bearer secret-token",
        "Content-Type": "application/json",
        "X-Request-Id": "req-1",
        "Cookie": "session=abc",
    }
    out = redact_headers(headers)
    assert out["authorization"] == "[REDACTED]"
    assert out["cookie"] == "[REDACTED]"
    assert out["content-type"] == "application/json"
    assert out["x-request-id"] == "req-1"


def test_redact_value_patterns():
    assert redact_value("Bearer abc.def") == "Bearer [REDACTED]"
    jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature"
    assert redact_value(jwt) == "[REDACTED_JWT]"
    assert redact_value("ssn 123-45-6789 here") == "[REDACTED_SSN]"
    assert redact_value("4111 1111 1111 1111") == "[REDACTED_CARD]"
    assert redact_value("hello") == "hello"


def test_shape_body_primitives():
    assert shape_body(None) == {"type": "null"}
    assert shape_body("hi") == {"type": "string", "sample": "hi"}
    assert shape_body(True) == {"type": "boolean", "sample": True}
    assert shape_body(42) == {"type": "integer", "sample": 42}
    assert shape_body(3.14) == {"type": "number", "sample": 3.14}


def test_shape_body_secret_keys():
    shaped = shape_body(
        {
            "email": "user@example.com",
            "password": "hunter2",
            "api_token": "tok_live",
            "ssn": "123-45-6789",
            "cvv": "123",
            "profile": {"name": "Ada", "age": 36},
        }
    )
    assert shaped["type"] == "object"
    assert shaped["properties"]["email"]["sample"] == "user@example.com"
    assert shaped["properties"]["password"]["sample"] == "[REDACTED]"
    assert shaped["properties"]["api_token"]["sample"] == "[REDACTED]"
    assert shaped["properties"]["ssn"]["sample"] == "[REDACTED]"
    assert shaped["properties"]["cvv"]["sample"] == "[REDACTED]"
    assert shaped["properties"]["profile"]["type"] == "object"
    assert shaped["properties"]["profile"]["properties"]["age"]["type"] == "integer"
    assert shaped["truncatedKeys"] is False


def test_shape_body_caps():
    # depth truncate
    deep = {"a": {"b": {"c": {"d": {"e": "too deep"}}}}}
    shaped = shape_body(deep)
    leaf = shaped["properties"]["a"]["properties"]["b"]["properties"]["c"]["properties"]["d"]
    assert leaf == {"type": "truncated"}

    # array item cap
    arr = shape_body(list(range(10)))
    assert arr["length"] == 10
    assert len(arr["items"]) == 5

    # key cap
    many = {f"k{i}": i for i in range(50)}
    obj = shape_body(many)
    assert len(obj["properties"]) == 40
    assert obj["truncatedKeys"] is True
