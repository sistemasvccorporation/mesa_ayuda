from django.contrib import admin

from .models import Area, Cargo, Usuario


@admin.register(Usuario)
class UsuarioAdmin(admin.ModelAdmin):
    list_display = ("id_usuario", "usuario", "nombre_completo", "correo", "activo")
    search_fields = ("usuario", "nombre_completo", "correo")
    ordering = ("nombre_completo",)


admin.site.register(Area)
admin.site.register(Cargo)
