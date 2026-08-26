"""
Demo FastAPI app with API Glimpse middleware.

Run (from repo root):
  pip install -r demo/fastapi-app/requirements.txt
  uvicorn main:app --app-dir demo/fastapi-app --host 0.0.0.0 --port 4002
"""

from __future__ import annotations

import os
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from apiglimpse import ApiGlimpseMiddleware

load_dotenv()

app = FastAPI(title="demo-fastapi-app")
app.add_middleware(
    ApiGlimpseMiddleware,
    agent_url=os.environ.get("API_SENSOR_AGENT_URL", "http://localhost:8080"),
    api_key=os.environ.get("API_SENSOR_KEY", ""),
    sample_rate=float(os.environ.get("API_SENSOR_SAMPLE_RATE", "1")),
)

_users: list[dict[str, Any]] = [
    {"id": 1, "email": "alice@example.com", "name": "Alice", "phone": "555-0100"},
    {"id": 2, "email": "bob@example.com", "name": "Bob", "phone": "555-0101"},
]


class UserCreate(BaseModel):
    email: str | None = None
    name: str | None = None
    phone: str | None = None
    password: str | None = None
    ssn: str | None = None


class LoginBody(BaseModel):
    email: str | None = None
    password: str | None = None


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "demo-fastapi-app"}


@app.get("/api/users")
def list_users() -> dict[str, Any]:
    return {"users": _users}


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


@app.post("/api/auth/login")
def login(body: LoginBody) -> dict[str, Any]:
    if not body.email or not body.password:
        raise HTTPException(status_code=400, detail="email and password required")
    return {
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo.signature",
        "user": {"email": body.email},
    }


@app.get("/api/orders/{order_id}/items/{item_id}")
def get_order_item(order_id: str, item_id: str) -> dict[str, Any]:
    return {
        "orderId": order_id,
        "itemId": item_id,
        "sku": "SKU-100",
        "qty": 2,
    }
