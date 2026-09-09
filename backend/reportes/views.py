from io import BytesIO
from pathlib import Path

from django.db.models import Count
from django.http import HttpResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from mesa_ayuda.permissions import rol_de
from mesa_ayuda.views import queryset_por_rol


def aplicar_periodo(qs, request):
    anio = (request.query_params.get("anio") or "").strip()
    mes = (request.query_params.get("mes") or "").strip()
    fecha_desde = (request.query_params.get("fecha_desde") or "").strip()
    fecha_hasta = (request.query_params.get("fecha_hasta") or "").strip()
    if anio.isdigit():
        qs = qs.filter(fecha_registro__year=int(anio))
    if mes.isdigit() and 1 <= int(mes) <= 12:
        qs = qs.filter(fecha_registro__month=int(mes))
    if fecha_desde:
        qs = qs.filter(fecha_registro__date__gte=fecha_desde)
    if fecha_hasta:
        qs = qs.filter(fecha_registro__date__lte=fecha_hasta)
    return qs


def ranking_solicitantes(qs, limite=25):
    base = qs.exclude(estado_id="borrador")
    filas = list(
        base.values(
            "solicitante__nombre_completo",
            "solicitante__usuario",
            "solicitante__area__nombre",
        )
        .annotate(total=Count("id"))
        .order_by("-total", "solicitante__nombre_completo")[:limite]
    )
    ranking = []
    for i, fila in enumerate(filas, start=1):
        ranking.append(
            {
                "puesto": i,
                "nombre": fila["solicitante__nombre_completo"] or "—",
                "usuario": fila["solicitante__usuario"] or "—",
                "area": fila["solicitante__area__nombre"] or "Sin área",
                "total": fila["total"],
            }
        )
    return ranking


def _fuentes():
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    candidatos = [
        (Path(r"C:\Windows\Fonts\arial.ttf"), Path(r"C:\Windows\Fonts\arialbd.ttf")),
        (
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        ),
    ]
    for regular, bold in candidatos:
        if regular.exists() and bold.exists():
            if "ReporteSans" not in pdfmetrics.getRegisteredFontNames():
                pdfmetrics.registerFont(TTFont("ReporteSans", str(regular)))
                pdfmetrics.registerFont(TTFont("ReporteSans-Bold", str(bold)))
            return "ReporteSans", "ReporteSans-Bold"
    return "Helvetica", "Helvetica-Bold"


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard(request):
    from mesa_ayuda.services import sla_estado

    qs = aplicar_periodo(queryset_por_rol(request.user).select_related("categoria", "estado"), request)
    abiertas = qs.exclude(estado_id__in=["cerrado", "cancelado", "borrador"])
    vencidas = sum(1 for s in abiertas if sla_estado(s) == "vencido")
    por_estado = list(qs.values("estado_id", "estado__nombre", "estado__color_hex").annotate(total=Count("id")))
    por_categoria = list(qs.values("categoria__nombre").annotate(total=Count("id")).order_by("-total")[:8])
    por_area = list(qs.values("area__nombre").annotate(total=Count("id")).order_by("-total")[:8])
    por_encargado = list(
        qs.exclude(asignado_a__isnull=True)
        .values("asignado_a__nombre_completo")
        .annotate(total=Count("id"))
        .order_by("-total")[:8]
    )
    return Response(
        {
            "rol": rol_de(request.user),
            "totales": {
                "todas": qs.exclude(estado_id="borrador").count(),
                "abiertas": abiertas.count(),
                "enviadas": qs.filter(estado_id="enviado").count(),
                "sin_asignar": qs.filter(estado_id="enviado", asignado_a__isnull=True).count(),
                "asignadas": qs.filter(estado_id__in=["asignado", "en_atencion", "derivado", "pendiente_usuario"]).count(),
                "pendiente_usuario": qs.filter(estado_id="pendiente_usuario").count(),
                "atendidas": qs.filter(estado_id="atendido").count(),
                "cerradas": qs.filter(estado_id="cerrado").count(),
                "canceladas": qs.filter(estado_id="cancelado").count(),
                "vencidas": vencidas,
                "mias": qs.filter(solicitante=request.user).count(),
                "a_mi_cargo": qs.filter(asignado_a=request.user).exclude(estado_id__in=["cerrado", "cancelado"]).count(),
            },
            "por_estado": por_estado,
            "por_categoria": por_categoria,
            "por_area": por_area,
            "por_encargado": por_encargado,
            "ranking_solicitantes": ranking_solicitantes(qs),
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def export_excel(request):
    if rol_de(request.user) != "admin":
        return Response(status=403)
    import pandas as pd

    qs = aplicar_periodo(
        queryset_por_rol(request.user).select_related(
            "solicitante", "asignado_a", "area", "categoria", "tipo_actividad", "estado"
        ),
        request,
    )
    ranking = ranking_solicitantes(qs, limite=50)
    tickets = qs.exclude(estado_id="borrador")
    filas = [
        {
            "Código": s.codigo,
            "Fecha": s.fecha_registro.strftime("%Y-%m-%d %H:%M") if s.fecha_registro else "",
            "Solicitante": s.solicitante.nombre_completo,
            "Usuario": s.solicitante.usuario,
            "Área": s.area.nombre,
            "Categoría": s.categoria.nombre,
            "Tipo": s.tipo_actividad.nombre,
            "Estado": s.estado.nombre,
            "Encargado": s.asignado_a.nombre_completo if s.asignado_a else "",
            "Prioridad": s.prioridad,
        }
        for s in tickets
    ]
    ranking_filas = [
        {
            "Puesto": r["puesto"],
            "Usuario": r["usuario"],
            "Nombre": r["nombre"],
            "Área": r["area"],
            "Solicitudes registradas": r["total"],
        }
        for r in ranking
    ]
    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        pd.DataFrame(ranking_filas).to_excel(writer, index=False, sheet_name="Ranking usuarios")
        pd.DataFrame(filas).to_excel(writer, index=False, sheet_name="Solicitudes")
    response = HttpResponse(
        buffer.getvalue(),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    response["Content-Disposition"] = 'attachment; filename="reporte_mesa_ayuda.xlsx"'
    return response


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def export_pdf(request):
    if rol_de(request.user) != "admin":
        return Response(status=403)
    from reportlab.lib.colors import HexColor
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    qs = aplicar_periodo(
        queryset_por_rol(request.user).select_related(
            "solicitante", "asignado_a", "area", "categoria", "estado"
        ),
        request,
    )
    ranking = ranking_solicitantes(qs, limite=25)
    tickets = list(qs.exclude(estado_id="borrador")[:80])
    regular, bold = _fuentes()
    teal = HexColor("#1E8C87")
    charcoal = HexColor("#2D2D2D")
    muted = HexColor("#64748B")
    line = HexColor("#E2E8F0")
    mint = HexColor("#F0F9F9")

    styles = {
        "h": ParagraphStyle("h", fontName=bold, fontSize=11, textColor=teal, spaceBefore=8, spaceAfter=6),
        "p": ParagraphStyle("p", fontName=regular, fontSize=8, textColor=charcoal, leading=11),
        "muted": ParagraphStyle("muted", fontName=regular, fontSize=8, textColor=muted, leading=11),
        "th": ParagraphStyle("th", fontName=bold, fontSize=8, textColor=charcoal, leading=11),
    }

    story = [
        Paragraph("SIGeCom · Mesa de Ayuda", styles["muted"]),
        Paragraph("Reporte de solicitudes y ranking de usuarios", styles["h"]),
        Paragraph(
            "Ranking de quienes más solicitudes han registrado (sin borradores).",
            styles["muted"],
        ),
        Spacer(1, 3 * mm),
    ]

    if ranking:
        data = [[
            Paragraph("#", styles["th"]),
            Paragraph("Nombre", styles["th"]),
            Paragraph("Usuario", styles["th"]),
            Paragraph("Área", styles["th"]),
            Paragraph("Solicitudes", styles["th"]),
        ]]
        for r in ranking:
            data.append([
                Paragraph(str(r["puesto"]), styles["p"]),
                Paragraph(r["nombre"], styles["p"]),
                Paragraph(r["usuario"], styles["p"]),
                Paragraph(r["area"], styles["p"]),
                Paragraph(str(r["total"]), styles["p"]),
            ])
        tabla = Table(data, colWidths=[12 * mm, 62 * mm, 38 * mm, 42 * mm, 26 * mm])
        tabla.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), mint),
                    ("BACKGROUND", (0, 1), (-1, 1), HexColor("#D7F0EE")),
                    ("BOX", (0, 0), (-1, -1), 0.4, line),
                    ("INNERGRID", (0, 0), (-1, -1), 0.3, line),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 5),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        story.append(tabla)
    else:
        story.append(Paragraph("Aún no hay solicitudes registradas en este período.", styles["muted"]))

    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph("Listado de solicitudes", styles["h"]))
    tdata = [[
        Paragraph("Código", styles["th"]),
        Paragraph("Solicitante", styles["th"]),
        Paragraph("Estado", styles["th"]),
        Paragraph("Encargado", styles["th"]),
    ]]
    for s in tickets:
        tdata.append([
            Paragraph(s.codigo or "—", styles["p"]),
            Paragraph(s.solicitante.nombre_completo, styles["p"]),
            Paragraph(s.estado.nombre, styles["p"]),
            Paragraph(s.asignado_a.nombre_completo if s.asignado_a else "—", styles["p"]),
        ])
    if len(tdata) == 1:
        story.append(Paragraph("Sin tickets en el período.", styles["muted"]))
    else:
        lista = Table(tdata, colWidths=[36 * mm, 58 * mm, 38 * mm, 48 * mm])
        lista.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), mint),
                    ("BOX", (0, 0), (-1, -1), 0.4, line),
                    ("INNERGRID", (0, 0), (-1, -1), 0.3, line),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 4),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ]
            )
        )
        story.append(lista)

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title="Reporte Mesa de Ayuda",
        author="SIGeCom",
    )
    doc.build(story)
    response = HttpResponse(buffer.getvalue(), content_type="application/pdf")
    response["Content-Disposition"] = 'attachment; filename="reporte_mesa_ayuda.pdf"'
    return response
