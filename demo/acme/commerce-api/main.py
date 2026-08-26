"""Acme commerce-api — private FastAPI hop in the checkout chain."""

from __future__ import annotations

import os
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from apiglimpse import ApiGlimpseMiddleware

load_dotenv()

SERVICE = os.environ.get("API_SENSOR_SERVICE_NAME", "commerce-api")
FULFILLMENT_URL = os.environ.get("FULFILLMENT_URL", "http://fulfillment-api:4013")

app = FastAPI(title="acme-commerce-api")
app.add_middleware(
    ApiGlimpseMiddleware,
    agent_url=os.environ.get("API_SENSOR_AGENT_URL", "http://localhost:8080"),
    api_key=os.environ.get("API_SENSOR_KEY", ""),
    sample_rate=float(os.environ.get("API_SENSOR_SAMPLE_RATE", "1")),
    service_name=SERVICE,
)

_users: list[dict[str, Any]] = [
    {"id": 1, "email": "alice@example.com", "name": "Alice", "phone": "555-0100"},
]


class UserCreate(BaseModel):
    email: str | None = None
    name: str | None = None
    phone: str | None = None
    password: str | None = None
    ssn: str | None = None


class CheckoutBody(BaseModel):
    orderId: str | None = None
    amount: float | None = None
    email: str | None = None
    cardPan: str | None = None
    skipFulfillment: bool = False
    triggerShadowExport: bool = False


def outbound_headers() -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "X-Service-Name": SERVICE,
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": SERVICE}


@app.get("/api/users/{user_id}")
def get_user(user_id: int) -> dict[str, Any]:
    user = next((u for u in _users if u["id"] == user_id), None)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"user": user}


@app.post("/api/users", status_code=201)
def create_user(body: UserCreate) -> dict[str, Any]:
    user = {
        "id": len(_users) + 1,
        "email": body.email,
        "name": body.name,
        "phone": body.phone,
        "hasPassword": bool(body.password),
        "hasSsn": bool(body.ssn),
    }
    _users.append(
        {
            "id": user["id"],
            "email": body.email,
            "name": body.name,
            "phone": body.phone,
        }
    )
    return {"user": user}


@app.post("/api/checkout")
async def checkout(body: CheckoutBody) -> dict[str, Any]:
    user = await _ensure_user(body.email or "alice@example.com")

    if body.skipFulfillment:
        return {
            "status": "checkout_partial",
            "userId": user["id"],
            "message": "Fulfillment hop skipped (demo missing edge)",
        }

    payload = {
        "orderId": body.orderId or f"ord_{user['id']}",
        "amount": body.amount or 99.99,
        "cardPan": body.cardPan or "4111111111111111",
        "triggerShadowExport": body.triggerShadowExport,
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{FULFILLMENT_URL.rstrip('/')}/api/checkout",
            json=payload,
            headers=outbound_headers(),
        )

    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail=resp.text)

    return {
        "status": "checkout_complete",
        "userId": user["id"],
        "fulfillment": resp.json(),
    }


async def _ensure_user(email: str) -> dict[str, Any]:
    existing = next((u for u in _users if u.get("email") == email), None)
    if existing:
        return existing
    user = {"id": len(_users) + 1, "email": email, "name": "Demo User", "phone": "555-0199"}
    _users.append(user)
    return user
