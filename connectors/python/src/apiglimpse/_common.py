"""Shared helpers for FastAPI / Django / Flask connectors."""

from __future__ import annotations

import json
import os
import random
from typing import Any

DEFAULTS = {
    "agent_url": "http://localhost:8080",
    "api_key": "",
    "sample_rate": 1.0,
    "flush_interval_ms": 1000,
    "max_batch_size": 50,
    "max_buffer_size": 500,
    "request_timeout_ms": 2000,
    "circuit_failure_threshold": 3,
    "circuit_open_ms": 15000,
}

MAX_RESPONSE_CAPTURE_BYTES = 64 * 1024


def env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def observe_auth(headers: dict[str, str]) -> str:
    try:
        auth = headers.get("authorization") or headers.get("Authorization")
        if auth and str(auth).lower().startswith("bearer "):
            return "bearer"
        if headers.get("cookie") or headers.get("Cookie"):
            return "cookie"
        return "none"
    except Exception:
        return "none"


def headers_dict(headers: Any) -> dict[str, str]:
    try:
        return {str(k): str(v) for k, v in headers.items()}
    except Exception:
        return {}


def parse_json_bytes(raw: bytes | None) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw.decode("utf-8"))
    except Exception:
        return None


def resolve_caller(headers: dict[str, str], service_name: str | None) -> dict[str, Any]:
    """Mirror packages/shared resolveCallerHints (explicit service name preferred)."""
    lower = {str(k).lower(): v for k, v in (headers or {}).items()}
    explicit = (
        str(lower.get("x-service-name") or lower.get("x-client-name") or service_name or "").strip()
        or None
    )
    ua = str(lower.get("user-agent") or "").lower()
    if "curl/" in ua or ua == "curl":
        family = "curl"
    elif any(x in ua for x in ("mozilla/", "chrome/", "safari/", "firefox/", "edg/")):
        family = "browser"
    elif any(
        x in ua
        for x in ("axios", "node-fetch", "go-http", "python-requests", "okhttp", "java/", "apiglimpse")
    ):
        family = "sdk"
    else:
        family = "unknown"
    if explicit:
        return {
            "key": f"svc:{explicit.lower()}",
            "label": explicit,
            "serviceName": explicit,
            "userAgentFamily": family,
        }
    return {
        "key": f"ua:{family}",
        "label": f"ua:{family}",
        "serviceName": None,
        "userAgentFamily": family,
    }


def should_sample(sample_rate: float) -> bool:
    if sample_rate >= 1:
        return True
    if sample_rate <= 0:
        return False
    return random.random() < sample_rate


def resolve_sensor_config(
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
) -> dict[str, Any]:
    """Merge constructor kwargs with ``API_SENSOR_*`` env and package defaults."""
    env_agent = os.environ.get("API_SENSOR_AGENT_URL") or DEFAULTS["agent_url"]
    env_key = os.environ.get("API_SENSOR_KEY") or DEFAULTS["api_key"]
    env_rate = env_float("API_SENSOR_SAMPLE_RATE", DEFAULTS["sample_rate"])
    env_svc = os.environ.get("API_SENSOR_SERVICE_NAME") or ""

    return {
        "agent_url": (agent_url if agent_url is not None else env_agent).rstrip("/"),
        "api_key": api_key if api_key is not None else env_key,
        "sample_rate": sample_rate if sample_rate is not None else env_rate,
        "service_name": service_name if service_name is not None else env_svc,
        "flush_interval_ms": (
            flush_interval_ms if flush_interval_ms is not None else DEFAULTS["flush_interval_ms"]
        ),
        "max_batch_size": (
            max_batch_size if max_batch_size is not None else DEFAULTS["max_batch_size"]
        ),
        "max_buffer_size": (
            max_buffer_size if max_buffer_size is not None else DEFAULTS["max_buffer_size"]
        ),
        "request_timeout_ms": (
            request_timeout_ms
            if request_timeout_ms is not None
            else DEFAULTS["request_timeout_ms"]
        ),
        "circuit_failure_threshold": (
            circuit_failure_threshold
            if circuit_failure_threshold is not None
            else DEFAULTS["circuit_failure_threshold"]
        ),
        "circuit_open_ms": (
            circuit_open_ms if circuit_open_ms is not None else DEFAULTS["circuit_open_ms"]
        ),
    }
