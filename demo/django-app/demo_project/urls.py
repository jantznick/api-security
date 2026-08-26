from django.urls import include, path

urlpatterns = [
    path("", include("demo_api.urls")),
]
