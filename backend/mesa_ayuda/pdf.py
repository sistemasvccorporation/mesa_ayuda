from io import BytesIO
from pathlib import Path

from django.utils import timezone
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .services import fecha_limite_sla, nombre_estado, resumen_sla

TEAL = HexColor("#1E8C87")
CHARCOAL = HexColor("#2D2D2D")
MUTED = HexColor("#64748B")
LINE = HexColor("#E2E8F0")
MINT = HexColor("#F0F9F9")

PRIORIDAD = {"baja": "Baja", "media": "Media", "alta": "Alta", "critica": "Crítica"}
SLA_TXT = {
    "ok": "En tiempo",
    "por_vencer": "Por vencer",
    "vencido": "Vencido",
    "en_pausa": "En pausa (espera al usuario)",
    "sin_sla": "Sin SLA",
    "no_aplica": "No aplica",
}

_FUENTES_OK = False
_LOGO = Path(__file__).resolve().parent / "assets" / "logo-vc.png"


def _registrar_fuentes():
    global _FUENTES_OK
    if _FUENTES_OK:
        return
    candidatos = [
        (Path(r"C:\Windows\Fonts\arial.ttf"), Path(r"C:\Windows\Fonts\arialbd.ttf")),
        (
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        ),
        (
            Path("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"),
            Path("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"),
        ),
    ]
    for regular, bold in candidatos:
        if regular.exists() and bold.exists():
            pdfmetrics.registerFont(TTFont("TicketSans", str(regular)))
            pdfmetrics.registerFont(TTFont("TicketSans-Bold", str(bold)))
            _FUENTES_OK = True
            return


def _font(bold=False):
    if _FUENTES_OK:
        return "TicketSans-Bold" if bold else "TicketSans"
    return "Helvetica-Bold" if bold else "Helvetica"


def _esc(texto):
    return str(texto or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")


def _fmt(dt):
    if not dt:
        return "—"
    return timezone.localtime(dt).strftime("%d/%m/%Y %H:%M")


def _styles():
    return {
        "h": ParagraphStyle("h", fontName=_font(True), fontSize=10, textColor=TEAL, spaceBefore=10, spaceAfter=5, leading=13),
        "label": ParagraphStyle("label", fontName=_font(), fontSize=7.5, textColor=MUTED, leading=10),
        "value": ParagraphStyle("value", fontName=_font(True), fontSize=9, textColor=CHARCOAL, leading=12),
        "body": ParagraphStyle("body", fontName=_font(), fontSize=9, textColor=CHARCOAL, leading=13),
        "small": ParagraphStyle("small", fontName=_font(), fontSize=8, textColor=CHARCOAL, leading=11),
        "muted": ParagraphStyle("muted", fontName=_font(), fontSize=8, textColor=MUTED, leading=11),
    }


def _encabezado(canvas, doc, solicitud):
    canvas.saveState()
    canvas.setFillColor(TEAL)
    canvas.rect(0, A4[1] - 28 * mm, A4[0], 28 * mm, fill=1, stroke=0)
    canvas.setFillColor(CHARCOAL)
    canvas.rect(0, 0, A4[0], 12 * mm, fill=1, stroke=0)
    canvas.setFillColor(white)
    if _LOGO.exists():
        canvas.roundRect(14 * mm, A4[1] - 25 * mm, 46 * mm, 20 * mm, 2.2 * mm, fill=1, stroke=0)
        canvas.drawImage(
            ImageReader(str(_LOGO)),
            16 * mm,
            A4[1] - 23.5 * mm,
            width=42 * mm,
            height=17 * mm,
            preserveAspectRatio=True,
            mask="auto",
        )
        canvas.setFont(_font(True), 12)
        canvas.drawString(64 * mm, A4[1] - 13 * mm, "SIGeCom")
        canvas.setFont(_font(), 8)
        canvas.drawString(64 * mm, A4[1] - 19 * mm, "Mesa de Ayuda")
    else:
        canvas.setFont(_font(True), 16)
        canvas.drawString(16 * mm, A4[1] - 14 * mm, "V&C")
        canvas.setFont(_font(), 8)
        canvas.drawString(16 * mm, A4[1] - 20 * mm, "SIGeCom  ·  Mesa de Ayuda")
    codigo = solicitud.codigo or f"#{solicitud.pk}"
    canvas.setFont(_font(True), 11)
    canvas.drawRightString(A4[0] - 16 * mm, A4[1] - 13 * mm, codigo)
    canvas.setFont(_font(), 8)
    estado = solicitud.estado.nombre if solicitud.estado_id else "—"
    canvas.drawRightString(A4[0] - 16 * mm, A4[1] - 20 * mm, f"Ticket  ·  {estado}")
    canvas.setFont(_font(), 7.5)
    canvas.drawString(16 * mm, 5 * mm, "V&C Corporation · Documento generado automáticamente")
    canvas.drawRightString(A4[0] - 16 * mm, 5 * mm, f"Página {doc.page}")
    canvas.restoreState()


def _tamano(bytes_n):
    n = int(bytes_n or 0)
    if n >= 1024 * 1024:
        return f"{n / (1024 * 1024):.1f} MB"
    if n >= 1024:
        return f"{n / 1024:.1f} KB"
    return f"{n} B"


def pdf_solicitud_bytes(solicitud, incluir_internos=False):
    _registrar_fuentes()
    styles = _styles()
    sla = resumen_sla(solicitud)
    encargado = solicitud.asignado_a.nombre_completo if solicitud.asignado_a else "Sin asignar"
    correo = solicitud.email_contacto or getattr(solicitud.solicitante, "correo", "") or "—"

    filas = [
        ("Código", solicitud.codigo or f"#{solicitud.pk}"),
        ("Estado", solicitud.estado.nombre if solicitud.estado_id else "—"),
        ("Solicitante", solicitud.solicitante.nombre_completo),
        ("Usuario SIGeCom", solicitud.solicitante.usuario),
        ("Área", solicitud.area.nombre if solicitud.area_id else "—"),
        ("Encargado", encargado),
        ("Correo de contacto", correo),
        ("Teléfono", solicitud.telefono_contacto or "—"),
        ("Categoría", solicitud.categoria.nombre if solicitud.categoria_id else "—"),
        ("Tipo de actividad", solicitud.tipo_actividad.nombre if solicitud.tipo_actividad_id else "—"),
        ("Prioridad", PRIORIDAD.get(solicitud.prioridad, solicitud.prioridad or "—")),
        ("SLA", SLA_TXT.get(sla.get("sla_estado"), "—")),
        ("Registrado", _fmt(solicitud.fecha_registro)),
        ("Enviado", _fmt(solicitud.fecha_envio)),
        ("Asignado", _fmt(solicitud.fecha_asignacion)),
        ("Atención", _fmt(solicitud.fecha_atencion)),
        ("Cierre", _fmt(solicitud.fecha_cierre)),
        ("Límite SLA", _fmt(fecha_limite_sla(solicitud))),
    ]
    if solicitud.confirmado_solicitante_en:
        filas.append(("Confirmado por el usuario", _fmt(solicitud.confirmado_solicitante_en)))

    data_kv = []
    for i in range(0, len(filas), 2):
        izq_k, izq_v = filas[i]
        der = filas[i + 1] if i + 1 < len(filas) else ("", "")
        data_kv.append(
            [
                [Paragraph(_esc(izq_k), styles["label"]), Paragraph(_esc(izq_v), styles["value"])],
                [Paragraph(_esc(der[0]), styles["label"]), Paragraph(_esc(der[1]), styles["value"])] if der[0] else "",
            ]
        )

    tabla = Table(data_kv, colWidths=[90 * mm, 90 * mm])
    tabla.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), MINT),
                ("BOX", (0, 0), (-1, -1), 0.4, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )

    story = [
        Spacer(1, 3 * mm),
        Paragraph("Datos de la solicitud", styles["h"]),
        tabla,
        Paragraph("Requerimiento", styles["h"]),
        Paragraph(_esc((solicitud.requerimiento or "").strip() or "(Sin texto; revisar adjuntos.)"), styles["body"]),
        Paragraph("Archivos adjuntos", styles["h"]),
    ]

    adjuntos = list(solicitud.adjuntos.all())
    if not adjuntos:
        story.append(Paragraph("Ninguno.", styles["muted"]))
    else:
        for adj in adjuntos:
            story.append(Paragraph(f"• {_esc(adj.nombre_original)}  ({_tamano(adj.tamano_bytes)})", styles["small"]))

    story.append(Paragraph("Historial de estados", styles["h"]))
    historial = list(solicitud.historial.select_related("actor").all())
    if not historial:
        story.append(Paragraph("Sin movimientos aún.", styles["muted"]))
    else:
        hrows = [
            [
                Paragraph("Fecha", styles["label"]),
                Paragraph("Cambio", styles["label"]),
                Paragraph("Por", styles["label"]),
                Paragraph("Nota", styles["label"]),
            ]
        ]
        for h in historial:
            origen = nombre_estado(h.estado_origen) if h.estado_origen else "Nuevo"
            hrows.append(
                [
                    Paragraph(_esc(_fmt(h.fecha)), styles["small"]),
                    Paragraph(_esc(f"{origen} → {nombre_estado(h.estado_destino)}"), styles["small"]),
                    Paragraph(_esc(h.actor.nombre_completo if h.actor_id else "—"), styles["small"]),
                    Paragraph(_esc(h.motivo or "—"), styles["small"]),
                ]
            )
        ht = Table(hrows, colWidths=[32 * mm, 48 * mm, 42 * mm, 58 * mm])
        ht.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), HexColor("#E6F4F3")),
                    ("BOX", (0, 0), (-1, -1), 0.4, LINE),
                    ("INNERGRID", (0, 0), (-1, -1), 0.3, LINE),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 5),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        story.append(ht)

    comentarios = list(solicitud.comentarios.select_related("autor").all())
    if not incluir_internos:
        comentarios = [c for c in comentarios if not c.es_interno]
    story.append(Paragraph("Comentarios", styles["h"]))
    if not comentarios:
        story.append(Paragraph("Sin comentarios públicos.", styles["muted"]))
    else:
        for c in comentarios:
            marca = " (interno)" if c.es_interno else ""
            autor = c.autor.nombre_completo if c.autor_id else "—"
            story.append(Paragraph(f"<b>{_esc(autor)}{marca}</b>  ·  {_esc(_fmt(c.fecha))}", styles["small"]))
            story.append(Paragraph(_esc(c.cuerpo), styles["body"]))
            story.append(Spacer(1, 2 * mm))

    story.extend(
        [
            Spacer(1, 4 * mm),
            HRFlowable(width="100%", thickness=0.4, color=LINE),
            Spacer(1, 2 * mm),
            Paragraph(
                "Este PDF es el ticket de la solicitud. Los comentarios internos del equipo no se incluyen cuando el documento se envía por correo.",
                styles["muted"],
            ),
        ]
    )

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=34 * mm,
        bottomMargin=16 * mm,
        title=f"Ticket {solicitud.codigo}",
        author="SIGeCom Mesa de Ayuda",
    )
    doc.build(
        story,
        onFirstPage=lambda c, d: _encabezado(c, d, solicitud),
        onLaterPages=lambda c, d: _encabezado(c, d, solicitud),
    )
    return buffer.getvalue()


def nombre_pdf_solicitud(solicitud):
    codigo = (solicitud.codigo or f"solicitud-{solicitud.pk}").replace("/", "-")
    return f"Ticket-{codigo}.pdf"
