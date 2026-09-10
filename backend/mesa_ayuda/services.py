from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db.models import Max
from django.utils import timezone

from users.models import Usuario

from .models import Adjunto, Comentario, ConfiguracionMesa, EstadoSolicitud, HistorialEstado, MesaRolUsuario, Solicitud

MENSAJE_SMTP_INCOMPLETO = (
    "Debes configurar tu correo SMTP antes de enviar. Entra a Configuración, guarda servidor, correo y clave."
)


def exigir_smtp_si_admin(actor):
    rol = getattr(actor, "rol_mesa", "solicitante") or "solicitante"
    if rol != "admin":
        return
    cfg = ConfiguracionMesa.objects.filter(id_usuario=actor.id_usuario).first()
    if not cfg or not cfg.smtp_listo:
        raise ValidationError(MENSAJE_SMTP_INCOMPLETO)

ESTADOS_SISTEMA = [
    ("borrador", "Borrador", "#94A3B8", 1, False),
    ("enviado", "Enviado", "#EAB308", 2, False),
    ("asignado", "Asignado", "#2563EB", 3, False),
    ("en_atencion", "En atención", "#4F46E5", 4, False),
    ("pendiente_usuario", "Pendiente del usuario", "#D97706", 5, False),
    ("derivado", "Derivado", "#7C3AED", 6, False),
    ("atendido", "Resuelto", "#16A34A", 7, False),
    ("cerrado", "Cerrado", "#2D2D2D", 8, True),
    ("cancelado", "Cancelado", "#9CA3AF", 9, True),
]

NOMBRES_ESTADO = {c: n for c, n, *_ in ESTADOS_SISTEMA}

ESTADOS_ABIERTOS = {
    "enviado",
    "asignado",
    "en_atencion",
    "pendiente_usuario",
    "derivado",
}

SLA_FACTOR = {
    "baja": 1.5,
    "media": 1.0,
    "alta": 0.7,
    "critica": 0.4,
}

# Destinos permitidos por rol (validación de servidor)
TRANSICIONES = {
    "solicitante": {
        "borrador": ["enviado"],
        "enviado": ["cancelado"],
        "asignado": ["cancelado"],
        "pendiente_usuario": ["en_atencion"],
        "atendido": ["en_atencion", "cerrado"],
        "cerrado": ["en_atencion"],
    },
    "tecnico": {
        "enviado": ["asignado", "en_atencion"],
        "asignado": ["en_atencion", "pendiente_usuario", "atendido", "derivado"],
        "derivado": ["asignado", "en_atencion", "pendiente_usuario", "atendido"],
        "en_atencion": ["pendiente_usuario", "atendido", "derivado"],
        "pendiente_usuario": ["en_atencion", "atendido"],
        "atendido": ["cerrado", "en_atencion"],
    },
    "admin": {
        "borrador": ["enviado"],
        "enviado": ["asignado", "en_atencion", "cancelado"],
        "asignado": ["en_atencion", "pendiente_usuario", "atendido", "derivado", "cancelado"],
        "derivado": ["asignado", "en_atencion", "pendiente_usuario", "atendido", "cancelado"],
        "en_atencion": ["pendiente_usuario", "atendido", "derivado", "cancelado"],
        "pendiente_usuario": ["en_atencion", "atendido", "cancelado"],
        "atendido": ["cerrado", "en_atencion"],
        "cerrado": ["en_atencion"],
        "cancelado": ["enviado"],
    },
}

MOTIVO_OBLIGATORIO = {"atendido", "cerrado", "cancelado", "derivado", "pendiente_usuario"}


def nombre_estado(codigo):
    if not codigo:
        return "Nuevo"
    return NOMBRES_ESTADO.get(codigo, codigo.replace("_", " ").title())


def asegurar_estados():
    for codigo, nombre, color, orden, final in ESTADOS_SISTEMA:
        EstadoSolicitud.objects.update_or_create(
            codigo=codigo,
            defaults={"nombre": nombre, "color_hex": color, "orden": orden, "es_final": final},
        )


def transiciones_permitidas(estado_actual, rol):
    return TRANSICIONES.get(rol, {}).get(estado_actual, [])


def _accion(codigo, etiqueta, requiere_motivo=False, variante="primary"):
    return {
        "codigo": codigo,
        "etiqueta": etiqueta,
        "requiere_motivo": requiere_motivo,
        "variante": variante,
    }


def acciones_disponibles(solicitud, rol):
    estado = solicitud.estado_id
    if rol == "solicitante":
        if estado == "borrador":
            return [_accion("enviado", "Enviar solicitud")]
        if estado in ("enviado", "asignado"):
            return [_accion("cancelado", "Cancelar solicitud", True, "danger")]
        if estado == "pendiente_usuario":
            return [_accion("en_atencion", "Ya respondí")]
        if estado == "atendido":
            return [
                _accion("cerrado", "Confirmar que quedó resuelto"),
                _accion("en_atencion", "Aún no quedó", True, "neutral"),
            ]
        if estado == "cerrado":
            return [_accion("en_atencion", "Reabrir solicitud", True)]
        return []

    acciones = []
    if estado == "enviado":
        acciones.append(_accion("en_atencion", "Tomar e iniciar atención"))
    if estado in ("asignado", "derivado"):
        acciones.append(_accion("en_atencion", "Iniciar atención"))
        acciones.append(_accion("pendiente_usuario", "Esperar respuesta del usuario", True, "neutral"))
        acciones.append(_accion("atendido", "Marcar como resuelto", True))
    if estado == "en_atencion":
        acciones.append(_accion("pendiente_usuario", "Esperar respuesta del usuario", True, "neutral"))
        acciones.append(_accion("atendido", "Marcar como resuelto", True))
    if estado == "pendiente_usuario":
        acciones.append(_accion("en_atencion", "Retomar atención"))
        acciones.append(_accion("atendido", "Marcar como resuelto", True))
    if estado == "atendido":
        acciones.append(_accion("cerrado", "Cerrar solicitud", True))
        acciones.append(_accion("en_atencion", "Reabrir", True, "neutral"))
    if estado == "cerrado" and rol == "admin":
        acciones.append(_accion("en_atencion", "Reabrir", True, "neutral"))
    if estado == "cancelado" and rol == "admin":
        acciones.append(_accion("enviado", "Reactivar", True, "neutral"))
    if rol == "admin" and estado in ESTADOS_ABIERTOS:
        if not any(a["codigo"] == "cancelado" for a in acciones):
            acciones.append(_accion("cancelado", "Cancelar", True, "danger"))
    return acciones


def segundos_pausa_sla(solicitud):
    extra = int(getattr(solicitud, "sla_segundos_pausados", 0) or 0)
    inicio_pausa = getattr(solicitud, "sla_pausa_desde", None)
    if inicio_pausa:
        extra += max(0, int((timezone.now() - inicio_pausa).total_seconds()))
    return extra


def actualizar_pausa_sla(solicitud, origen, destino, now):
    if origen == "pendiente_usuario" and destino != "pendiente_usuario":
        if solicitud.sla_pausa_desde:
            delta = int((now - solicitud.sla_pausa_desde).total_seconds())
            solicitud.sla_segundos_pausados = int(solicitud.sla_segundos_pausados or 0) + max(0, delta)
            solicitud.sla_pausa_desde = None
    if destino == "pendiente_usuario" and origen != "pendiente_usuario":
        solicitud.sla_pausa_desde = now


def sla_horas_efectivas(solicitud):
    base = getattr(getattr(solicitud, "categoria", None), "sla_horas", None)
    if not base:
        return None
    return max(1, round(base * SLA_FACTOR.get(solicitud.prioridad or "media", 1.0)))


def fecha_limite_sla(solicitud):
    horas = sla_horas_efectivas(solicitud)
    if not horas:
        return None
    inicio = solicitud.fecha_envio or solicitud.fecha_registro
    if not inicio:
        return None
    return inicio + timedelta(hours=horas) + timedelta(seconds=segundos_pausa_sla(solicitud))


def sla_estado(solicitud):
    if solicitud.estado_id == "pendiente_usuario":
        return "en_pausa"
    if solicitud.estado_id not in ESTADOS_ABIERTOS:
        return "no_aplica"
    limite = fecha_limite_sla(solicitud)
    if not limite:
        return "sin_sla"
    now = timezone.now()
    if now > limite:
        return "vencido"
    if (limite - now).total_seconds() <= 4 * 3600:
        return "por_vencer"
    return "ok"


def resumen_sla(solicitud):
    limite = fecha_limite_sla(solicitud)
    return {
        "sla_horas": sla_horas_efectivas(solicitud),
        "fecha_limite": limite.isoformat() if limite else None,
        "sla_estado": sla_estado(solicitud),
        "sla_en_pausa": solicitud.estado_id == "pendiente_usuario",
    }


def asegurar_rol_encargado(usuario):
    """Any active user can become ticket owner; promote solicitante to tecnico."""
    rol, created = MesaRolUsuario.objects.get_or_create(
        id_usuario=usuario.id_usuario,
        defaults={"rol": MesaRolUsuario.ROL_TECNICO},
    )
    if rol.rol == MesaRolUsuario.ROL_SOLICITANTE:
        rol.rol = MesaRolUsuario.ROL_TECNICO
        rol.save(update_fields=["rol"])
    return rol


def siguiente_codigo():
    year = timezone.now().year
    prefix = f"MA-{year}-"
    last = (
        Solicitud.objects.select_for_update()
        .filter(codigo__startswith=prefix)
        .aggregate(max_code=Max("codigo"))
        .get("max_code")
    )
    seq = 1
    if last:
        try:
            seq = int(str(last).split("-")[-1]) + 1
        except ValueError:
            seq = Solicitud.objects.filter(codigo__startswith=prefix).count() + 1
    return f"{prefix}{seq:06d}"


def registrar_historial(solicitud, destino, actor, motivo="", origen=None):
    HistorialEstado.objects.create(
        solicitud=solicitud,
        estado_origen=origen if origen is not None else (solicitud.estado_id or ""),
        estado_destino=destino,
        actor=actor,
        motivo=motivo or "",
    )


def validar_adjunto(archivo):
    ext = Path(archivo.name).suffix.lower()
    if ext not in settings.ALLOWED_ATTACHMENT_EXTS:
        raise ValidationError("Solo se permiten archivos PNG, JPG y PDF.")
    content_type = getattr(archivo, "content_type", "") or ""
    if content_type and content_type not in settings.ALLOWED_ATTACHMENT_MIMES:
        raise ValidationError("El tipo de archivo no está permitido.")
    max_bytes = settings.MAX_ATTACHMENT_MB * 1024 * 1024
    if archivo.size > max_bytes:
        raise ValidationError(f"El archivo supera {settings.MAX_ATTACHMENT_MB} MB.")
    return ext, content_type or "application/octet-stream"


def guardar_adjuntos(solicitud, files, usuario, comentario=None):
    actuales = solicitud.adjuntos.count()
    if actuales + len(files) > settings.MAX_ATTACHMENTS:
        raise ValidationError(f"Máximo {settings.MAX_ATTACHMENTS} archivos por solicitud.")
    creados = []
    for archivo in files:
        ext, content_type = validar_adjunto(archivo)
        creados.append(
            Adjunto.objects.create(
                solicitud=solicitud,
                comentario=comentario,
                archivo=archivo,
                nombre_original=archivo.name,
                content_type=content_type,
                tamano_bytes=archivo.size,
                subido_por=usuario,
            )
        )
    return creados


def aplicar_transicion(solicitud, nuevo_estado, actor, motivo="", encargado=None, tomar=False):
    if nuevo_estado == "enviado":
        exigir_smtp_si_admin(actor)

    rol = actor.rol_mesa
    actuales = list(transiciones_permitidas(solicitud.estado_id, rol))
    if tomar and solicitud.estado_id == "enviado" and rol in ("tecnico", "admin"):
        actuales = list(set(actuales + ["asignado", "en_atencion"]))
    if nuevo_estado not in actuales:
        raise ValidationError(
            f"No puedes pasar de {nombre_estado(solicitud.estado_id)} a {nombre_estado(nuevo_estado)}."
        )

    motivo = (motivo or "").strip()
    origen = solicitud.estado_id
    reabrir = nuevo_estado == "en_atencion" and origen in ("atendido", "cerrado")
    confirmacion = rol == "solicitante" and nuevo_estado == "cerrado" and origen == "atendido"
    if confirmacion and not motivo:
        motivo = "El solicitante confirmó que el requerimiento quedó resuelto."
    if (nuevo_estado in MOTIVO_OBLIGATORIO or reabrir) and not confirmacion:
        if not motivo:
            raise ValidationError("Esta acción requiere un comentario o motivo.")

    if nuevo_estado == "cerrado" and origen != "atendido":
        raise ValidationError("Solo se puede cerrar una solicitud que ya está resuelta.")

    now = timezone.now()

    if nuevo_estado == "asignado":
        target = encargado or (actor if tomar else None)
        if not target:
            raise ValidationError("Debes indicar el usuario encargado.")
        if target.activo != 1:
            raise ValidationError("El encargado debe ser un usuario activo.")
        asegurar_rol_encargado(target)
        solicitud.asignado_a = target
        solicitud.fecha_asignacion = now

    if nuevo_estado == "derivado":
        if not encargado:
            raise ValidationError("Indica el nuevo encargado para derivar.")
        if encargado.activo != 1:
            raise ValidationError("El encargado debe ser un usuario activo.")
        asegurar_rol_encargado(encargado)
        solicitud.asignado_a = encargado
        solicitud.fecha_asignacion = now

    if nuevo_estado == "en_atencion":
        if not solicitud.asignado_a_id:
            if rol in ("tecnico", "admin"):
                solicitud.asignado_a = actor
                asegurar_rol_encargado(actor)
                solicitud.fecha_asignacion = solicitud.fecha_asignacion or now
            else:
                raise ValidationError("La solicitud aún no tiene encargado.")
        if not solicitud.fecha_atencion or reabrir:
            solicitud.fecha_atencion = now
        if reabrir:
            solicitud.fecha_cierre = None

    if nuevo_estado == "pendiente_usuario" and not solicitud.asignado_a_id:
        raise ValidationError("Asigna un encargado antes de esperar respuesta.")

    if nuevo_estado == "enviado" and not solicitud.fecha_envio:
        solicitud.fecha_envio = now

    if nuevo_estado == "cerrado":
        solicitud.fecha_cierre = now
        if confirmacion:
            solicitud.confirmado_solicitante_en = now

    if nuevo_estado == "cancelado":
        solicitud.fecha_cierre = now

    actualizar_pausa_sla(solicitud, origen, nuevo_estado, now)
    solicitud.estado = EstadoSolicitud.objects.get(pk=nuevo_estado)
    solicitud.save()
    registrar_historial(solicitud, nuevo_estado, actor, motivo=motivo, origen=origen)
    if motivo:
        Comentario.objects.create(
            solicitud=solicitud,
            autor=actor,
            cuerpo=motivo,
            es_interno=False,
        )
    try:
        from notificaciones.services import registrar_avisos

        registrar_avisos(solicitud, nuevo_estado, actor=actor, origen=origen)
    except Exception:
        pass
    return solicitud
