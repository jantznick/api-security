"""Client-side redaction + body shaping — mirrors packages/shared/src/redaction.js."""

from __future__ import annotations

import math
import re
from typing import Any

ENVELOPE_VERSION = 1

SENSITIVE_HEADER_NAMES = frozenset(
    {
        "authorization",
        "cookie",
        "set-cookie",
        "x-api-key",
        "x-auth-token",
        "proxy-authorization",
    }
)

_MAX_STRING = 64
_MAX_HEADER_VAL = 128
_MAX_DEPTH = 4
_MAX_KEYS = 40
_MAX_ARRAY_ITEMS = 5

_RE_BEARER = re.compile(r"^Bearer\s+", re.IGNORECASE)
_RE_JWT = re.compile(r"^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")
_RE_SSN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
_RE_CARD = re.compile(r"\b(?:\d[ -]*?){13,19}\b")


def truncate_string(value: Any, max_len: int = _MAX_STRING) -> str:
    s = str(value)
    if len(s) <= max_len:
        return s
    return f"{s[:max_len]}…"


def redact_headers(headers: dict[str, Any] | None = None) -> dict[str, str]:
    """Redact sensitive header values; keep names for auth observation."""
    out: dict[str, str] = {}
    if not headers:
        return out
    for raw_key, raw_val in headers.items():
        key = str(raw_key).lower()
        if key in SENSITIVE_HEADER_NAMES:
            out[key] = "[REDACTED]"
            continue
        if isinstance(raw_val, (list, tuple)):
            val = ", ".join(str(v) for v in raw_val)
        else:
            val = "" if raw_val is None else str(raw_val)
        out[key] = truncate_string(val, _MAX_HEADER_VAL)
    return out


def redact_value(value: Any) -> Any:
    """Best-effort value redaction for known secret-ish patterns."""
    if not isinstance(value, str):
        return value
    if _RE_BEARER.search(value):
        return "Bearer [REDACTED]"
    if _RE_JWT.match(value):
        return "[REDACTED_JWT]"
    if _RE_SSN.search(value):
        return "[REDACTED_SSN]"
    if _RE_CARD.search(value):
        return "[REDACTED_CARD]"
    return truncate_string(value)


def _is_secret_key(key: str) -> bool:
    lower = key.lower()
    if lower in ("cvv", "cvc"):
        return True
    return (
        "password" in lower
        or "secret" in lower
        or "token" in lower
        or "ssn" in lower
    )


def shape_body(body: Any, depth: int = 0) -> dict[str, Any]:
    """
    Convert a JSON body into a truncated shape sample (types + short values).
    Caps match JS: string 64 / depth 4 / keys 40 / array items 5.
    """
    if body is None:
        return {"type": "null"}

    if depth >= _MAX_DEPTH:
        return {"type": "truncated"}

    if isinstance(body, bool):
        # bool before int — bool is a subclass of int in Python
        return {"type": "boolean", "sample": body}

    if isinstance(body, str):
        return {"type": "string", "sample": redact_value(body)}

    if isinstance(body, int) and not isinstance(body, bool):
        return {"type": "integer", "sample": body}

    if isinstance(body, float):
        if math.isnan(body) or math.isinf(body):
            return {"type": "number", "sample": None}
        if body.is_integer():
            return {"type": "integer", "sample": int(body)}
        return {"type": "number", "sample": body}

    if isinstance(body, list):
        items = [shape_body(item, depth + 1) for item in body[:_MAX_ARRAY_ITEMS]]
        return {
            "type": "array",
            "length": len(body),
            "items": items,
        }

    if isinstance(body, dict):
        keys = list(body.keys())[:_MAX_KEYS]
        properties: dict[str, Any] = {}
        for key in keys:
            key_str = str(key)
            if _is_secret_key(key_str):
                properties[key_str] = {"type": "string", "sample": "[REDACTED]"}
            else:
                properties[key_str] = shape_body(body[key], depth + 1)
        return {
            "type": "object",
            "properties": properties,
            "truncatedKeys": len(body) > _MAX_KEYS,
        }

    return {"type": "unknown"}
