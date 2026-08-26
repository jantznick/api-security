"""URLConf used by Django middleware tests."""

from __future__ import annotations

import json

from django.http import HttpResponse, JsonResponse
from django.urls import path


def json_view(_request):
    return JsonResponse({"id": "1", "email": "a@b.co"})


def empty_view(_request):
    return HttpResponse(status=204)


def bin_view(_request):
    return HttpResponse(content=bytes([0x89, 0x50, 0x4E, 0x47]), content_type="application/octet-stream")


def echo_view(request):
    body = json.loads(request.body.decode("utf-8")) if request.body else {}
    return JsonResponse({"ok": True, "echo": body.get("email")}, status=201)


urlpatterns = [
    path("json", json_view),
    path("empty", empty_view),
    path("bin", bin_view),
    path("echo", echo_view),
]
