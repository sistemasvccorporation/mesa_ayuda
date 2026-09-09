from django.contrib import admin

from .models import Categoria, EstadoSolicitud, MesaRolUsuario, Solicitud, TipoActividad

admin.site.register(Categoria)
admin.site.register(TipoActividad)
admin.site.register(EstadoSolicitud)
admin.site.register(MesaRolUsuario)
admin.site.register(Solicitud)
