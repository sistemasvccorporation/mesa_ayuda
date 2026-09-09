from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("catalogos/categorias", views.CategoriaViewSet, basename="categorias")
router.register("catalogos/tipos-actividad", views.TipoActividadViewSet, basename="tipos")
router.register("catalogos/estados", views.EstadoViewSet, basename="estados")
router.register("solicitudes", views.SolicitudViewSet, basename="solicitudes")

urlpatterns = [
    path("catalogos/areas/", views.catalogo_areas),
    path("usuarios/", views.buscar_usuarios),
    path("admin/roles/", views.admin_roles),
    path("admin/configuracion/", views.admin_configuracion),
    path("admin/configuracion/probar/", views.admin_configuracion_probar),
    path("", include(router.urls)),
]
