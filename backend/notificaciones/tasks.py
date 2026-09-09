from celery import shared_task


@shared_task
def notificar_solicitud(solicitud_id, evento, actor_id=None):
    from mesa_ayuda.models import Solicitud
    from notificaciones.mail import enviar_correo_solicitud

    try:
        solicitud = Solicitud.objects.select_related(
            "solicitante",
            "asignado_a",
            "estado",
            "area",
            "categoria",
            "tipo_actividad",
        ).prefetch_related("adjuntos", "comentarios__autor", "historial__actor").get(pk=solicitud_id)
    except Solicitud.DoesNotExist:
        return {"enviado": False, "mensaje": "Solicitud no encontrada.", "enviado_a": []}
    return enviar_correo_solicitud(solicitud, evento, actor_id=actor_id)
