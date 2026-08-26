"""Minimal Django settings for the API Glimpse demo."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "demo-insecure-change-me")
DEBUG = True
ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "demo_api",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
    "apiglimpse.django.ApiGlimpseDjangoMiddleware",
]

ROOT_URLCONF = "demo_project.urls"
WSGI_APPLICATION = "demo_project.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

APIGLIMPSE = {
    "AGENT_URL": os.environ.get("API_SENSOR_AGENT_URL", "http://localhost:8080"),
    "API_KEY": os.environ.get("API_SENSOR_KEY", ""),
    "SAMPLE_RATE": float(os.environ.get("API_SENSOR_SAMPLE_RATE", "1")),
    "SERVICE_NAME": os.environ.get("API_SENSOR_SERVICE_NAME", "demo-django-app"),
}
