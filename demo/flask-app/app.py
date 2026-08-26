"""
Demo Flask app with API Glimpse extension.

Run (from repo root):
  pip install -r demo/flask-app/requirements.txt
  cd demo/flask-app && flask --app app run --host 0.0.0.0 --port 4004
"""

from __future__ import annotations

import os
from typing import Any

from dotenv import load_dotenv
from flask import Flask, jsonify, request

from apiglimpse.flask import ApiGlimpse

load_dotenv()

app = Flask(__name__)
ApiGlimpse(
    app,
    agent_url=os.environ.get("API_SENSOR_AGENT_URL", "http://localhost:8080"),
    api_key=os.environ.get("API_SENSOR_KEY", ""),
    sample_rate=float(os.environ.get("API_SENSOR_SAMPLE_RATE", "1")),
    service_name=os.environ.get("API_SENSOR_SERVICE_NAME", "demo-flask-app"),
)

_users: list[dict[str, Any]] = [
    {"id": 1, "email": "alice@example.com", "name": "Alice", "phone": "555-0100"},
    {"id": 2, "email": "bob@example.com", "name": "Bob", "phone": "555-0101"},
]


@app.get("/health")
def health():
    return {"status": "ok", "service": "demo-flask-app"}


@app.get("/api/users")
def list_users():
    return {"users": _users}


@app.get("/api/users/<int:user_id>")
def get_user(user_id: int):
    user = next((u for u in _users if u["id"] == user_id), None)
    if not user:
        return jsonify({"detail": "User not found"}), 404
    return {"user": user}


@app.post("/api/users")
def create_user():
    body = request.get_json(silent=True) or {}
    user = {
        "id": len(_users) + 1,
        "email": body.get("email"),
        "name": body.get("name"),
        "phone": body.get("phone"),
        "hasPassword": bool(body.get("password")),
        "hasSsn": bool(body.get("ssn")),
    }
    _users.append(
        {
            "id": user["id"],
            "email": body.get("email"),
            "name": body.get("name"),
            "phone": body.get("phone"),
        }
    )
    return jsonify({"user": user}), 201


@app.post("/api/auth/login")
def login():
    body = request.get_json(silent=True) or {}
    if not body.get("email") or not body.get("password"):
        return jsonify({"detail": "email and password required"}), 400
    return {
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo.signature",
        "user": {"email": body.get("email")},
    }


@app.get("/api/orders/<order_id>/items/<item_id>")
def get_order_item(order_id: str, item_id: str):
    return {
        "orderId": order_id,
        "itemId": item_id,
        "sku": "SKU-100",
        "qty": 2,
    }


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "4004"))
    app.run(host="0.0.0.0", port=port, debug=True)
