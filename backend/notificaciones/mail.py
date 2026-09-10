import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives, get_connection
from django.utils.html import escape

logger = logging.getLogger(__name__)

EVENTOS = {
    "creada": "Nueva solicitud de mesa de ayuda",
    "enviado": "Nueva solicitud de mesa de ayuda",
    "asignada": "Solicitud asignada",
    "asignado": "Solicitud asignada",
    "derivada": "Solicitud derivada",
    "derivado": "Solicitud derivada",
    "atendido": "Solicitud resuelta",
    "cerrado": "Solicitud cerrada",
    "cancelado": "Solicitud cancelada",
    "pendiente_usuario": "Se espera respuesta del usuario",
    "en_atencion": "Solicitud en atención",
}


def conexion_correo(cfg=None):
    if cfg is None:
        return None
    host = (cfg.smtp_host or "").strip()
    user = (cfg.smtp_usuario or "").strip()
    password = (cfg.smtp_clave or "").strip()
    if not host or not user or not password:
        return None
    puerto = cfg.smtp_puerto or 587
    use_ssl = bool(cfg.smtp_ssl)
    use_tls = bool(cfg.smtp_tls) and not use_ssl
    return get_connection(
        backend="django.core.mail.backends.smtp.EmailBackend",
        host=host,
        port=int(puerto),
        username=user,
        password=password,
        use_tls=use_tls,
        use_ssl=use_ssl,
        fail_silently=False,
    )


def mensaje_error_smtp(exc):
    texto = str(exc or "")
    bajo = texto.lower()
    if "535" in texto or "incorrect authentication" in bajo or "authentication failed" in bajo:
        return (
            "El servidor rechazó usuario o contraseña (error 535). "
            "Escribe de nuevo la clave del buzón en cPanel (la de webmail, no la de SIGeCom) "
            "con el correo completo como usuario, guarda y vuelve a probar."
        )
    if "534" in texto or "5.7.3" in texto:
        return "El servidor exige otra forma de autenticación. Revisa usuario, clave y que SSL/TLS coincidan con el puerto."
    if "connection" in bajo or "timed out" in bajo or "getaddrinfo" in bajo:
        return f"No se pudo conectar al servidor SMTP. {texto}"
    return f"No se pudo enviar: {texto}"


def correo_remitente(cfg=None):
    if cfg is None:
        return "mesa-ayuda@vc-corporation.com"
    return (
        (cfg.correo_remitente or "").strip()
        or (cfg.smtp_usuario or "").strip()
        or "mesa-ayuda@vc-corporation.com"
    )


def correo_solicitante(solicitud):
    return (
        (solicitud.email_contacto or "").strip()
        or (getattr(solicitud.solicitante, "correo", None) or "").strip()
    )


def _unicos(correos):
    vistos = set()
    unicos = []
    for e in correos:
        key = (e or "").strip().lower()
        if key and key not in vistos:
            vistos.add(key)
            unicos.append(e.strip())
    return unicos


def _admins_ids():
    from mesa_ayuda.models import MesaRolUsuario

    return list(MesaRolUsuario.objects.filter(rol=MesaRolUsuario.ROL_ADMIN).values_list("id_usuario", flat=True))


def correos_mesa():
    from mesa_ayuda.models import ConfiguracionMesa
    from users.models import Usuario

    dest = []
    for uid in _admins_ids():
        user = Usuario.objects.filter(pk=uid, activo=1).first()
        if not user:
            continue
        cfg = ConfiguracionMesa.objects.filter(id_usuario=uid).first()
        if cfg:
            dest.append(cfg.correo_destino_efectivo(user))
        elif user.correo:
            dest.append(user.correo)
    return _unicos(dest)


def _url_ticket(solicitud):
    from pathlib import Path

    base = (getattr(settings, "FRONTEND_URL", "") or "http://127.0.0.1:5173").rstrip("/")
    cf = Path(settings.ROOT_DIR) / ".cloudflare-url"
    if cf.exists():
        u = cf.read_text(encoding="utf-8").strip().splitlines()[0].strip()
        if u.startswith("https://"):
            base = u.rstrip("/")
    return f"{base}/solicitudes/{solicitud.id}"


def _texto(solicitud, evento):
    encargado = solicitud.asignado_a.nombre_completo if solicitud.asignado_a else "Sin asignar"
    adjuntos = list(solicitud.adjuntos.values_list("nombre_original", flat=True))
    lineas_adj = "\n".join(f"  - {n}" for n in adjuntos) if adjuntos else "  (ninguno)"
    return (
        f"{EVENTOS.get(evento, evento)}\n"
        f"\n"
        f"Código: {solicitud.codigo}\n"
        f"Estado: {solicitud.estado.nombre}\n"
        f"Solicitante: {solicitud.solicitante.nombre_completo}\n"
        f"Usuario: {solicitud.solicitante.usuario}\n"
        f"Área: {solicitud.area.nombre}\n"
        f"Correo: {solicitud.email_contacto or solicitud.solicitante.correo or '—'}\n"
        f"Teléfono: {solicitud.telefono_contacto or '—'}\n"
        f"Categoría: {solicitud.categoria.nombre}\n"
        f"Tipo: {solicitud.tipo_actividad.nombre}\n"
        f"Prioridad: {solicitud.prioridad}\n"
        f"Encargado: {encargado}\n"
        f"\nRequerimiento:\n{solicitud.requerimiento or '(sin texto; revisar adjuntos)'}\n"
        f"\nAdjuntos:\n{lineas_adj}\n"
        f"\nSe adjunta el ticket en PDF con el detalle completo.\n"
        f"\nAbrir en Mesa de Ayuda:\n{_url_ticket(solicitud)}\n"
    )


def _html(solicitud, evento):
    encargado = solicitud.asignado_a.nombre_completo if solicitud.asignado_a else "Sin asignar"
    adjuntos = list(solicitud.adjuntos.values_list("nombre_original", flat=True))
    adj_html = "".join(f"<li>{escape(n)}</li>" for n in adjuntos) or "<li>Ninguno</li>"
    req = escape(solicitud.requerimiento or "(sin texto; revisar adjuntos)").replace("\n", "<br>")
    filas = [
        ("Código", solicitud.codigo),
        ("Estado", solicitud.estado.nombre),
        ("Solicitante", solicitud.solicitante.nombre_completo),
        ("Usuario", solicitud.solicitante.usuario),
        ("Área", solicitud.area.nombre),
        ("Correo", solicitud.email_contacto or solicitud.solicitante.correo or "—"),
        ("Teléfono", solicitud.telefono_contacto or "—"),
        ("Categoría", solicitud.categoria.nombre),
        ("Tipo", solicitud.tipo_actividad.nombre),
        ("Prioridad", solicitud.prioridad),
        ("Encargado", encargado),
    ]
    rows = "".join(
        f"<tr><td style='padding:6px 12px;color:#64748b;width:140px'>{escape(k)}</td>"
        f"<td style='padding:6px 12px;font-weight:600'>{escape(str(v))}</td></tr>"
        for k, v in filas
    )
    url = _url_ticket(solicitud)
    return f"""
    <div style="font-family:Segoe UI,Arial,sans-serif;color:#2D2D2D;max-width:640px">
      <div style="background:#1E8C87;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0">
        <div style="font-size:12px;opacity:.85">V&amp;C · SIGeCom Mesa de Ayuda</div>
        <div style="font-size:20px;font-weight:700;margin-top:4px">{escape(EVENTOS.get(evento, evento))}</div>
      </div>
      <div style="border:1px solid #e2e8f0;border-top:0;padding:16px 8px;border-radius:0 0 12px 12px">
        <table style="width:100%;border-collapse:collapse">{rows}</table>
        <div style="padding:12px 12px 4px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.08em">Requerimiento</div>
        <div style="padding:0 12px 12px;line-height:1.5">{req}</div>
        <div style="padding:0 12px 4px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.08em">Adjuntos</div>
        <ul style="margin:0 12px 16px;padding-left:18px">{adj_html}</ul>
        <p style="padding:0 12px 8px;font-size:13px;color:#64748b">Se adjunta el ticket en PDF con el detalle completo de la solicitud.</p>
        <div style="padding:0 12px 16px">
          <a href="{escape(url)}" style="display:inline-block;background:#1E8C87;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">
            Abrir solicitud
          </a>
        </div>
      </div>
    </div>
    """


MSG_SIN_SMTP_ACTOR = (
    "El correo no fue enviado: tu usuario no tiene configurado el SMTP. "
    "Entra a Configuración, carga tu correo y tu clave, y vuelve a intentar el aviso."
)
MSG_SIN_SMTP_MESA = (
    "El correo no fue enviado: ningún administrador tiene configurado el envío de correo."
)
MSG_SIN_DEST = "El correo no fue enviado: no hay destinatarios."
MSG_ERROR = "El correo no fue enviado."


def destinatarios_evento(solicitud, evento, cfg=None):
    dest = list(correos_mesa())
    if evento not in ("creada", "enviado") and solicitud.asignado_a and solicitud.asignado_a.correo:
        dest.append(solicitud.asignado_a.correo)
    if cfg and cfg.debe_avisar_solicitante(evento):
        correo = correo_solicitante(solicitud)
        if correo:
            dest.append(correo)
    return _unicos(dest)


def _adjuntos_mail(mail, solicitud, evento, total=0, max_bytes=8 * 1024 * 1024):
    try:
        from mesa_ayuda.pdf import nombre_pdf_solicitud, pdf_solicitud_bytes

        pdf_bytes = pdf_solicitud_bytes(solicitud, incluir_internos=False)
        mail.attach(nombre_pdf_solicitud(solicitud), pdf_bytes, "application/pdf")
        total += len(pdf_bytes)
    except Exception:
        logger.exception("No se pudo generar el PDF del ticket %s", solicitud.codigo)
    if evento not in ("creada", "enviado"):
        return total
    for adj in solicitud.adjuntos.all():
        try:
            size = adj.archivo.size
            if total + size > max_bytes:
                continue
            adj.archivo.open("rb")
            contenido = adj.archivo.read()
            adj.archivo.close()
            mail.attach(adj.nombre_original, contenido, adj.content_type or "application/octet-stream")
            total += size
        except Exception:
            logger.exception("No se pudo adjuntar %s al correo", adj.nombre_original)
    return total


def _despachar(solicitud, evento, cfg, para):
    para = _unicos(para)
    if not para:
        return False, []
    conn = conexion_correo(cfg)
    if not conn:
        return False, []
    mail = EmailMultiAlternatives(
        subject=f"[{solicitud.codigo}] {EVENTOS.get(evento, evento)}",
        body=_texto(solicitud, evento),
        from_email=correo_remitente(cfg),
        to=para,
        connection=conn,
    )
    mail.attach_alternative(_html(solicitud, evento), "text/html")
    _adjuntos_mail(mail, solicitud, evento)
    try:
        mail.send(fail_silently=False)
        logger.info("Correo de %s enviado a %s", solicitud.codigo, ", ".join(para))
        return True, para
    except Exception:
        logger.exception("No se pudo enviar el correo de %s", solicitud.codigo)
        return False, []


def enviar_correo_solicitud(solicitud, evento, actor_id=None):
    from mesa_ayuda.models import ConfiguracionMesa
    from mesa_ayuda.permissions import rol_de
    from users.models import Usuario

    actor = Usuario.objects.filter(pk=actor_id).first() if actor_id else None
    rol_actor = rol_de(actor) if actor else "solicitante"

    if rol_actor == "admin":
        cfg = ConfiguracionMesa.obtener(actor)
        if not cfg.smtp_listo:
            logger.warning("Admin %s sin SMTP; no se envió %s", actor.usuario, solicitud.codigo)
            return {"enviado": False, "mensaje": MSG_SIN_SMTP_ACTOR, "enviado_a": []}
        para = destinatarios_evento(solicitud, evento, cfg)
        if not para:
            return {"enviado": False, "mensaje": MSG_SIN_DEST, "enviado_a": []}
        ok, enviados = _despachar(solicitud, evento, cfg, para)
        if not ok:
            return {"enviado": False, "mensaje": MSG_ERROR, "enviado_a": []}
        return {"enviado": True, "mensaje": "", "enviado_a": enviados}

    configs = []
    for uid in _admins_ids():
        cfg = ConfiguracionMesa.objects.filter(id_usuario=uid).first()
        if cfg and cfg.smtp_listo:
            configs.append(cfg)
    if not configs:
        logger.warning("Ningún admin con SMTP; no se envió %s", solicitud.codigo)
        return {"enviado": False, "mensaje": MSG_SIN_SMTP_MESA, "enviado_a": []}

    enviados = []
    solicitante_ok = False
    algun_ok = False
    for cfg in configs:
        para = [cfg.correo_destino_efectivo()]
        if cfg.debe_avisar_solicitante(evento) and not solicitante_ok:
            correo = correo_solicitante(solicitud)
            if correo:
                para.append(correo)
                solicitante_ok = True
        if evento not in ("creada", "enviado") and solicitud.asignado_a and solicitud.asignado_a.correo:
            para.append(solicitud.asignado_a.correo)
        ok, dest = _despachar(solicitud, evento, cfg, para)
        if ok:
            algun_ok = True
            enviados.extend(dest)
    if not algun_ok:
        return {"enviado": False, "mensaje": MSG_ERROR, "enviado_a": []}
    return {"enviado": True, "mensaje": "", "enviado_a": _unicos(enviados)}
