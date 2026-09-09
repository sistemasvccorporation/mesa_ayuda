from mesa_ayuda.models import MesaRolUsuario
from users.models import Usuario

from .models import Aviso


def _crear(destinatario_id, solicitud, evento, titulo, cuerpo, actor_id=None):
    if not destinatario_id or destinatario_id == actor_id:
        return
    if not Usuario.objects.filter(pk=destinatario_id, activo=1).exists():
        return
    Aviso.objects.create(
        destinatario_id=destinatario_id,
        solicitud=solicitud,
        evento=evento,
        titulo=titulo[:200],
        cuerpo=cuerpo or "",
    )


def ids_admins():
    return list(MesaRolUsuario.objects.filter(rol=MesaRolUsuario.ROL_ADMIN).values_list("id_usuario", flat=True))


def registrar_avisos(solicitud, evento, actor=None, origen=""):
    actor_id = getattr(actor, "id_usuario", None)
    codigo = solicitud.codigo or f"#{solicitud.pk}"
    solicitante_id = solicitud.solicitante_id
    encargado_id = solicitud.asignado_a_id

    if evento in ("enviado", "creada"):
        for admin_id in ids_admins():
            _crear(
                admin_id,
                solicitud,
                "enviado",
                f"Nueva solicitud {codigo}",
                f"{solicitud.solicitante.nombre_completo} registró un requerimiento.",
                actor_id,
            )
    elif evento in ("asignado", "asignada", "derivado", "derivada"):
        _crear(
            encargado_id,
            solicitud,
            "asignado",
            f"Te asignaron {codigo}",
            "Quedaste como encargado de esta solicitud.",
            actor_id,
        )
    elif evento == "pendiente_usuario":
        _crear(
            solicitante_id,
            solicitud,
            "pendiente_usuario",
            f"Respuesta pendiente en {codigo}",
            "El equipo espera una respuesta o un adjunto tuyo para continuar.",
            actor_id,
        )
    elif evento == "atendido":
        _crear(
            solicitante_id,
            solicitud,
            "atendido",
            f"{codigo} quedó resuelto",
            "Confirma si el requerimiento quedó atendido, o reabre si aún no.",
            actor_id,
        )
    elif evento == "cerrado":
        _crear(
            solicitante_id,
            solicitud,
            "cerrado",
            f"{codigo} se cerró",
            "La solicitud quedó cerrada.",
            actor_id,
        )
        if encargado_id:
            _crear(
                encargado_id,
                solicitud,
                "cerrado",
                f"{codigo} se cerró",
                "El ticket que tenías a cargo quedó cerrado.",
                actor_id,
            )
    elif evento == "cancelado":
        for uid in {solicitante_id, encargado_id, *ids_admins()}:
            _crear(uid, solicitud, "cancelado", f"{codigo} se canceló", "La solicitud fue cancelada.", actor_id)
    elif evento == "en_atencion":
        if origen == "pendiente_usuario":
            _crear(
                encargado_id,
                solicitud,
                "en_atencion",
                f"{codigo}: el usuario respondió",
                "Puedes retomar la atención.",
                actor_id,
            )
        elif origen in ("atendido", "cerrado"):
            _crear(
                encargado_id,
                solicitud,
                "reabierto",
                f"{codigo} se reabrió",
                "La solicitud volvió a En atención.",
                actor_id,
            )
            for admin_id in ids_admins():
                _crear(admin_id, solicitud, "reabierto", f"{codigo} se reabrió", "Una solicitud resuelta volvió a abrirse.", actor_id)
    elif evento == "comentario":
        if actor_id == solicitante_id:
            _crear(
                encargado_id,
                solicitud,
                "comentario",
                f"Nuevo comentario en {codigo}",
                "El solicitante escribió en el ticket.",
                actor_id,
            )
        else:
            _crear(
                solicitante_id,
                solicitud,
                "comentario",
                f"Nuevo comentario en {codigo}",
                "Hay una actualización en tu solicitud.",
                actor_id,
            )


def registrar_aviso_comentario(solicitud, autor, es_interno=False):
    if es_interno:
        return
    registrar_avisos(solicitud, "comentario", actor=autor)
