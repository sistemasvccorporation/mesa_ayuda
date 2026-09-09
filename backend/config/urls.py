from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import FileResponse, Http404
from django.urls import include, path, re_path
from django.views.static import serve as static_serve

DIST = settings.ROOT_DIR / "frontend" / "dist"


def spa_index(request, *args, **kwargs):
    index = DIST / "index.html"
    if index.exists():
        return FileResponse(index.open("rb"), content_type="text/html")
    raise Http404("Frontend build not found. Ejecuta iniciar-red.bat o npm run build en frontend/.")


urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/auth/", include("users.urls")),
    path("api/", include("mesa_ayuda.urls")),
    path("api/", include("notificaciones.urls")),
    path("api/reportes/", include("reportes.urls")),
]

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

if DIST.exists():
    urlpatterns += [
        re_path(r"^assets/(?P<path>.*)$", static_serve, {"document_root": DIST / "assets"}),
        re_path(
            r"^(?P<path>(favicon\.svg|manifest\.webmanifest|registerSW\.js|sw\.js|workbox-[^/]+))$",
            static_serve,
            {"document_root": DIST},
        ),
    ]

urlpatterns += [
    re_path(r"^(?!api/|django-admin/|media/|assets/).*$", spa_index),
]
