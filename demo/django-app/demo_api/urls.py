from __future__ import annotations

import json
from typing import Any

from django.http import HttpRequest, HttpResponse, JsonResponse
from django.urls import path
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

_users: list[dict[str, Any]] = [
    {"id": 1, "email": "alice@example.com", "name": "Alice", "phone": "555-0100"},
    {"id": 2, "email": "bob@example.com", "name": "Bob", "phone": "555-0101"},
]


def health(_request: HttpRequest) -> JsonResponse:
    return JsonResponse({"status": "ok", "service": "demo-django-app"})


@csrf_exempt
@require_http_methods(["GET", "POST"])
def users(request: HttpRequest) -> JsonResponse:
    if request.method == "GET":
        return JsonResponse({"users": _users})

    try:
        body = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"detail": "invalid json"}, status=400)
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
    return JsonResponse({"user": user}, status=201)


def get_user(_request: HttpRequest, user_id: int) -> HttpResponse:
    user = next((u for u in _users if u["id"] == user_id), None)
    if not user:
        return JsonResponse({"detail": "User not found"}, status=404)
    return JsonResponse({"user": user})


@csrf_exempt
@require_http_methods(["POST"])
def login(request: HttpRequest) -> JsonResponse:
    try:
        body = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"detail": "invalid json"}, status=400)
    if not body.get("email") or not body.get("password"):
        return JsonResponse({"detail": "email and password required"}, status=400)
    return JsonResponse(
        {
            "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo.signature",
            "user": {"email": body.get("email")},
        }
    )


def get_order_item(_request: HttpRequest, order_id: str, item_id: str) -> JsonResponse:
    return JsonResponse(
        {
            "orderId": order_id,
            "itemId": item_id,
            "sku": "SKU-100",
            "qty": 2,
        }
    )


urlpatterns = [
    path("health", health),
    path("api/users", users),
    path("api/users/<int:user_id>", get_user),
    path("api/auth/login", login),
    path("api/orders/<str:order_id>/items/<str:item_id>", get_order_item),
]
