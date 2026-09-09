from django.urls import path

from .views import dashboard, export_excel, export_pdf

urlpatterns = [
    path("dashboard/", dashboard),
    path("solicitudes.xlsx", export_excel),
    path("solicitudes.pdf", export_pdf),
]
