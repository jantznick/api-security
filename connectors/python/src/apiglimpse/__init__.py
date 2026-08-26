"""API Glimpse Python connector — FastAPI / Django / Flask."""

from .envelope import create_envelope, create_sample, validate_envelope
from .middleware import ApiGlimpseMiddleware
from .redaction import (
    ENVELOPE_VERSION,
    SENSITIVE_HEADER_NAMES,
    redact_headers,
    redact_value,
    shape_body,
    truncate_string,
)

__all__ = [
    "ENVELOPE_VERSION",
    "SENSITIVE_HEADER_NAMES",
    "ApiGlimpseMiddleware",
    "create_envelope",
    "create_sample",
    "redact_headers",
    "redact_value",
    "shape_body",
    "truncate_string",
    "validate_envelope",
]

__version__ = "0.1.0"


def __getattr__(name: str):
    """Lazy framework adapters so core install stays light."""
    if name == "ApiGlimpseDjangoMiddleware":
        from .django import ApiGlimpseDjangoMiddleware

        return ApiGlimpseDjangoMiddleware
    if name == "ApiGlimpse":
        from .flask import ApiGlimpse

        return ApiGlimpse
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
