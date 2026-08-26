"""Sample + envelope builders — mirrors packages/shared/src/envelope.js."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .redaction import ENVELOPE_VERSION, redact_headers, shape_body


def _iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _content_type(headers: dict[str, Any]) -> str | None:
    raw = headers.get("content-type")
    if raw is None:
        raw = headers.get("Content-Type")
    if raw is None:
        return None
    if isinstance(raw, (list, tuple)):
        raw = raw[0] if raw else None
    if raw is None:
        return None
    return str(raw).split(";")[0].strip() or None


def create_sample(
    *,
    method: str = "GET",
    path: str = "/",
    status_code: int = 0,
    latency_ms: float = 0,
    request_headers: dict[str, Any] | None = None,
    response_headers: dict[str, Any] | None = None,
    request_body: Any = ...,
    response_body: Any = ...,
    response_body_captured: bool | None = None,
    auth_observed: str = "none",
    timestamp: str | None = None,
) -> dict[str, Any]:
    """Build one traffic sample for the agent (bodies are shape-only).

    ``response_body_captured`` is optional wire metadata (omitted when None)
    so inventory can tell whether a response schema came from a captured body.
    """
    req_headers = request_headers or {}
    res_headers = response_headers or {}

    sample = {
        "method": str(method or "GET").upper(),
        "path": str(path or "/"),
        "statusCode": int(status_code) if status_code else 0,
        "latencyMs": float(latency_ms) if latency_ms else 0,
        "authObserved": auth_observed,
        "timestamp": timestamp or _iso_now(),
        "request": {
            "contentType": _content_type(req_headers),
            "headerNames": [str(h).lower() for h in req_headers.keys()],
            "headers": redact_headers(req_headers),
            "bodyShape": None if request_body is ... else shape_body(request_body),
        },
        "response": {
            "contentType": _content_type(res_headers),
            "headerNames": [str(h).lower() for h in res_headers.keys()],
            "headers": redact_headers(res_headers),
            "bodyShape": None if response_body is ... else shape_body(response_body),
        },
    }
    if response_body_captured is not None:
        sample["responseBodyCaptured"] = bool(response_body_captured)
    return sample


def create_envelope(*, api_key: str, samples: list[dict[str, Any]] | None) -> dict[str, Any]:
    return {
        "version": ENVELOPE_VERSION,
        "apiKey": api_key,
        "samples": list(samples) if samples is not None else [],
        "sentAt": _iso_now(),
    }


def validate_envelope(body: Any) -> dict[str, Any]:
    if not isinstance(body, dict):
        return {"ok": False, "error": "Body must be an object"}
    if body.get("version") != ENVELOPE_VERSION:
        return {"ok": False, "error": f"Unsupported envelope version: {body.get('version')}"}
    if not isinstance(body.get("samples"), list):
        return {"ok": False, "error": "samples must be an array"}
    return {"ok": True}
