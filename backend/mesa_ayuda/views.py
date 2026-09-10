from io import BytesIO

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from django.views.decorators.cache import never_cache
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from users.models import Area, Usuario
from users.serializers import AreaSerializer, PublicUserSerializer

from .models import (
    Adjunto,
    Categoria,
    Comentario,
    ConfiguracionMesa,
    EstadoSolicitud,
    MesaRolUsuario,
    Solicitud,
    TipoActividad,
)
from .permissions import IsAdminMesa, rol_de
from .serializers import (
    ConfiguracionMesaSerializer,
    CategoriaSerializer,
    ComentarioSerializer,
    EstadoSerializer,
    SolicitudDetailSerializer,
    SolicitudListSerializer,
    SolicitudWriteSerializer,
    TipoActividadSerializer,
)
from .services import (
    aplicar_transicion,
    asegurar_estados,
    exigir_smtp_si_admin,
    guardar_adjuntos,
    registrar_historial,
    siguiente_codigo,
    sla_estado,
)
from notificaciones.mail import enviar_correo_solicitud


def disparar_correo(solicitud, evento, actor):
    try:
        return enviar_correo_solicitud(solicitud, evento, actor_id=getattr(actor, "id_usuario", None))
    except Exception:
        return {
            "enviado": False,
            "mensaje": "El correo no fue enviado.",
            "enviado_a": [],
        }


def payload_solicitud(solicitud, request, correo=None):
    data = SolicitudDetailSerializer(solicitud, context={"request": request}).data
    if correo is not None:
        data["correo"] = correo
    return data


def mensaje_validacion(exc):
    msgs = getattr(exc, "messages", None)
    if msgs:
        return " ".join(str(m) for m in msgs)
    return str(exc)


def queryset_por_rol(user):
    qs = Solicitud.objects.select_related(
        "solicitante",
        "asignado_a",
        "area",
        "categoria",
        "tipo_actividad",
        "estado",
    )
    rol = rol_de(user)
    if rol == "admin":
        return qs.filter(~Q(estado_id="borrador") | Q(solicitante=user))
    if rol == "tecnico":
        return qs.filter(Q(asignado_a=user) | Q(estado_id="enviado")).exclude(
            Q(estado_id="borrador") & ~Q(solicitante=user)
        )
    return qs.filter(solicitante=user)


class CatalogoMixin:
    permission_classes = [IsAuthenticated]
    pagination_class = None


class CategoriaViewSet(CatalogoMixin, viewsets.ModelViewSet):
    queryset = Categoria.objects.all()
    serializer_class = CategoriaSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated()]
        return [IsAdminMesa()]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.rol_mesa != "admin":
            return qs.filter(activo=True)
        return qs


class TipoActividadViewSet(CatalogoMixin, viewsets.ModelViewSet):
    queryset = TipoActividad.objects.select_related("categoria")
    serializer_class = TipoActividadSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated()]
        return [IsAdminMesa()]

    def get_queryset(self):
        qs = super().get_queryset()
        categoria = self.request.query_params.get("categoria")
        if categoria:
            qs = qs.filter(categoria_id=categoria)
        if self.request.user.rol_mesa != "admin":
            qs = qs.filter(activo=True, categoria__activo=True)
        return qs


class EstadoViewSet(CatalogoMixin, viewsets.ReadOnlyModelViewSet):
    queryset = EstadoSolicitud.objects.all()
    serializer_class = EstadoSerializer


class SolicitudViewSet(viewsets.ModelViewSet):
    parser_classes = (MultiPartParser, FormParser, JSONParser)
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        qs = queryset_por_rol(self.request.user).distinct()
        estado = self.request.query_params.get("estado")
        categoria = self.request.query_params.get("categoria")
        area = self.request.query_params.get("area")
        prioridad = self.request.query_params.get("prioridad")
        q = self.request.query_params.get("q")
        sla = self.request.query_params.get("sla")
        bandeja = self.request.query_params.get("bandeja")
        anio = (self.request.query_params.get("anio") or "").strip()
        mes = (self.request.query_params.get("mes") or "").strip()
        fecha_desde = (self.request.query_params.get("fecha_desde") or "").strip()
        fecha_hasta = (self.request.query_params.get("fecha_hasta") or "").strip()
        if estado:
            qs = qs.filter(estado_id=estado)
        if categoria:
            qs = qs.filter(categoria_id=categoria)
        if area:
            qs = qs.filter(area_id=area)
        if prioridad:
            qs = qs.filter(prioridad=prioridad)
        if q:
            qs = qs.filter(
                Q(codigo__icontains=q)
                | Q(requerimiento__icontains=q)
                | Q(solicitante__nombre_completo__icontains=q)
                | Q(solicitante__usuario__icontains=q)
                | Q(asignado_a__nombre_completo__icontains=q)
                | Q(categoria__nombre__icontains=q)
                | Q(email_contacto__icontains=q)
            )
        if anio.isdigit():
            qs = qs.filter(fecha_registro__year=int(anio))
        if mes.isdigit() and 1 <= int(mes) <= 12:
            qs = qs.filter(fecha_registro__month=int(mes))
        if fecha_desde:
            qs = qs.filter(fecha_registro__date__gte=fecha_desde)
        if fecha_hasta:
            qs = qs.filter(fecha_registro__date__lte=fecha_hasta)
        if bandeja == "asignadas":
            qs = qs.filter(asignado_a=self.request.user).exclude(estado_id__in=["cerrado", "cancelado"])
        elif bandeja == "cola":
            qs = qs.filter(estado_id="enviado", asignado_a__isnull=True)
        elif bandeja == "mias":
            qs = qs.filter(solicitante=self.request.user)
        if sla in ("vencido", "por_vencer", "ok", "en_pausa"):
            ids = [s.id for s in qs.select_related("categoria", "estado") if sla_estado(s) == sla]
            qs = qs.filter(id__in=ids)
        return qs.distinct()

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return SolicitudWriteSerializer
        if self.action == "retrieve":
            return SolicitudDetailSerializer
        return SolicitudListSerializer

    def perform_create(self, serializer):
        user = self.request.user
        files = list(serializer.validated_data.pop("files", []) or [])
        if not files:
            files = list(self.request.FILES.getlist("files")) + list(self.request.FILES.getlist("files[]"))
        enviar = str(self.request.data.get("enviar", "")).lower() in ("1", "true", "si", "yes")
        if enviar:
            exigir_smtp_si_admin(user)
        with transaction.atomic():
            asegurar_estados()
            estado_id = "enviado" if enviar else "borrador"
            email = serializer.validated_data.get("email_contacto") or (user.correo or "")
            telefono = serializer.validated_data.get("telefono_contacto") or user.telefono_contacto
            solicitud = serializer.save(
                solicitante=user,
                codigo=siguiente_codigo(),
                email_contacto=email,
                telefono_contacto=telefono,
                estado_id=estado_id,
                fecha_envio=timezone.now() if enviar else None,
            )
            if files:
                guardar_adjuntos(solicitud, files, user)
            registrar_historial(solicitud, estado_id, user, origen="")
        if enviar:
            correo = disparar_correo(solicitud, "creada", user)
            try:
                from notificaciones.services import registrar_avisos

                registrar_avisos(solicitud, "enviado", actor=user)
            except Exception:
                pass
            solicitud._correo_aviso = correo
        return solicitud

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            solicitud = self.perform_create(serializer)
        except DjangoValidationError as exc:
            return Response({"detail": getattr(exc, "messages", [mensaje_validacion(exc)])}, status=400)
        return Response(
            payload_solicitud(solicitud, request, correo=getattr(solicitud, "_correo_aviso", None)),
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if rol_de(request.user) == "solicitante":
            if instance.solicitante_id != request.user.id_usuario:
                return Response(status=403)
            if instance.estado_id not in ("borrador", "enviado") or instance.asignado_a_id:
                return Response({"detail": "Ya no puedes editar esta solicitud."}, status=400)
        return super().update(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    def enviar(self, request, pk=None):
        solicitud = self.get_object()
        if solicitud.solicitante_id != request.user.id_usuario and rol_de(request.user) != "admin":
            return Response(status=403)
        try:
            aplicar_transicion(solicitud, "enviado", request.user)
        except DjangoValidationError as exc:
            return Response({"detail": mensaje_validacion(exc)}, status=400)
        correo = disparar_correo(solicitud, "creada", request.user)
        return Response(payload_solicitud(solicitud, request, correo))

    @action(detail=True, methods=["post"])
    def asignar(self, request, pk=None):
        if rol_de(request.user) not in ("admin", "tecnico"):
            return Response(status=403)
        solicitud = self.get_object()
        encargado_id = request.data.get("id_encargado") or request.data.get("id_tecnico")
        tomar = str(request.data.get("tomar", "")).lower() in ("1", "true")
        encargado = None
        if encargado_id:
            encargado = get_object_or_404(Usuario, pk=encargado_id, activo=1)
        elif tomar:
            encargado = request.user
        else:
            return Response(
                {"detail": "Indica id_encargado. Puede ser cualquier usuario activo de SIGeCom."},
                status=400,
            )
        try:
            aplicar_transicion(
                solicitud,
                "asignado",
                request.user,
                motivo=request.data.get("motivo", ""),
                encargado=encargado,
                tomar=tomar,
            )
        except DjangoValidationError as exc:
            return Response({"detail": mensaje_validacion(exc)}, status=400)
        correo = disparar_correo(solicitud, "asignada", request.user)
        return Response(payload_solicitud(solicitud, request, correo))

    @action(detail=True, methods=["post"])
    def derivar(self, request, pk=None):
        if rol_de(request.user) not in ("admin", "tecnico"):
            return Response(status=403)
        solicitud = self.get_object()
        encargado_id = request.data.get("id_encargado") or request.data.get("id_tecnico")
        if not encargado_id:
            return Response({"detail": "Indica el nuevo encargado (cualquier usuario activo)."}, status=400)
        encargado = get_object_or_404(Usuario, pk=encargado_id, activo=1)
        motivo = request.data.get("motivo", "")
        if not motivo:
            return Response({"detail": "La derivación requiere un motivo."}, status=400)
        try:
            aplicar_transicion(solicitud, "derivado", request.user, motivo=motivo, encargado=encargado)
        except DjangoValidationError as exc:
            return Response({"detail": mensaje_validacion(exc)}, status=400)
        correo = disparar_correo(solicitud, "derivada", request.user)
        return Response(payload_solicitud(solicitud, request, correo))

    @action(detail=True, methods=["post"])
    def transicion(self, request, pk=None):
        solicitud = self.get_object()
        nuevo = request.data.get("estado")
        motivo = request.data.get("motivo", "")
        encargado_id = request.data.get("id_encargado")
        encargado = Usuario.objects.filter(pk=encargado_id, activo=1).first() if encargado_id else None
        tomar = nuevo == "en_atencion" and not solicitud.asignado_a_id
        try:
            aplicar_transicion(
                solicitud,
                nuevo,
                request.user,
                motivo=motivo,
                encargado=encargado,
                tomar=tomar,
            )
        except DjangoValidationError as exc:
            return Response({"detail": mensaje_validacion(exc)}, status=400)
        correo = disparar_correo(solicitud, nuevo or "", request.user)
        return Response(payload_solicitud(solicitud, request, correo))

    @action(detail=True, methods=["post"])
    def comentarios(self, request, pk=None):
        solicitud = self.get_object()
        cuerpo = (request.data.get("cuerpo") or "").strip()
        if not cuerpo:
            return Response({"detail": "El comentario no puede estar vacío."}, status=400)
        es_interno = str(request.data.get("es_interno", "")).lower() in ("1", "true")
        if es_interno and rol_de(request.user) == "solicitante":
            es_interno = False
        comentario = Comentario.objects.create(
            solicitud=solicitud,
            autor=request.user,
            cuerpo=cuerpo,
            es_interno=es_interno,
        )
        files = request.FILES.getlist("files") or request.FILES.getlist("files[]")
        if files:
            try:
                guardar_adjuntos(solicitud, files, request.user, comentario=comentario)
            except DjangoValidationError as exc:
                return Response({"detail": mensaje_validacion(exc)}, status=400)
        if (
            not es_interno
            and request.user.id_usuario == solicitud.solicitante_id
            and solicitud.estado_id == "pendiente_usuario"
        ):
            try:
                aplicar_transicion(solicitud, "en_atencion", request.user)
            except DjangoValidationError:
                pass
        try:
            from notificaciones.services import registrar_aviso_comentario

            registrar_aviso_comentario(solicitud, request.user, es_interno=es_interno)
        except Exception:
            pass
        return Response(ComentarioSerializer(comentario).data, status=201)

    @action(detail=True, methods=["get"])
    def pdf(self, request, pk=None):
        from .pdf import nombre_pdf_solicitud, pdf_solicitud_bytes

        solicitud = self.get_object()
        incluir = rol_de(request.user) in ("admin", "tecnico")
        contenido = pdf_solicitud_bytes(solicitud, incluir_internos=incluir)
        return FileResponse(
            BytesIO(contenido),
            as_attachment=True,
            filename=nombre_pdf_solicitud(solicitud),
            content_type="application/pdf",
        )

    @action(detail=True, methods=["get"], url_path="adjuntos/(?P<adjunto_id>[^/.]+)/download")
    def descargar_adjunto(self, request, pk=None, adjunto_id=None):
        solicitud = self.get_object()
        adjunto = get_object_or_404(Adjunto, pk=adjunto_id, solicitud=solicitud)
        return FileResponse(adjunto.archivo.open("rb"), as_attachment=True, filename=adjunto.nombre_original)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def catalogo_areas(request):
    qs = Area.objects.filter(activo=1).order_by("nombre")
    return Response(AreaSerializer(qs, many=True).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def buscar_usuarios(request):
    qs = Usuario.objects.filter(activo=1).order_by("nombre_completo")
    query = request.query_params.get("q", "").strip()
    if query:
        qs = qs.filter(Q(nombre_completo__icontains=query) | Q(usuario__icontains=query) | Q(correo__icontains=query))
    page = int(request.query_params.get("page", 1) or 1)
    page_size = int(request.query_params.get("page_size", 300) or 300)
    start = (page - 1) * page_size
    total = qs.count()
    items = list(qs[start : start + page_size])
    return Response({"count": total, "results": PublicUserSerializer(items, many=True).data})


@api_view(["GET", "POST"])
@permission_classes([IsAdminMesa])
def admin_roles(request):
    if request.method == "GET":
        roles = MesaRolUsuario.objects.filter(rol=MesaRolUsuario.ROL_ADMIN).order_by("id_usuario")
        data = []
        for rol in roles:
            user = Usuario.objects.filter(pk=rol.id_usuario).first()
            cfg = ConfiguracionMesa.objects.filter(id_usuario=rol.id_usuario).first()
            data.append(
                {
                    "id_usuario": rol.id_usuario,
                    "rol": rol.rol,
                    "usuario": PublicUserSerializer(user).data if user else None,
                    "correo_destino": (cfg.correo_destino if cfg else "") or "",
                    "correo_smtp_listo": bool(cfg and cfg.smtp_listo),
                }
            )
        return Response(data)

    user_id = request.data.get("id_usuario")
    rol = request.data.get("rol")
    user = get_object_or_404(Usuario, pk=user_id, activo=1)
    if rol not in dict(MesaRolUsuario.ROL_CHOICES):
        return Response({"detail": "Rol inválido."}, status=400)
    actual = MesaRolUsuario.objects.filter(id_usuario=user.id_usuario).first()
    if actual and actual.rol == MesaRolUsuario.ROL_ADMIN and rol != MesaRolUsuario.ROL_ADMIN:
        otros_admins = MesaRolUsuario.objects.filter(rol=MesaRolUsuario.ROL_ADMIN).exclude(id_usuario=user.id_usuario)
        if not otros_admins.exists():
            return Response(
                {
                    "detail": "No puedes quitar el último administrador. Primero asigna Administrador de mesa a otro usuario activo."
                },
                status=400,
            )
    obj, _ = MesaRolUsuario.objects.update_or_create(id_usuario=user.id_usuario, defaults={"rol": rol})
    correo = None
    smtp_listo = False
    if obj.rol == MesaRolUsuario.ROL_ADMIN:
        cfg = ConfiguracionMesa.asegurar_para_admin(user, plantilla=request.user)
        correo = cfg.correo_destino
        smtp_listo = bool(cfg.smtp_listo)
    return Response(
        {
            "id_usuario": obj.id_usuario,
            "rol": obj.rol,
            "usuario": PublicUserSerializer(user).data,
            "correo_destino": correo,
            "correo_smtp_listo": smtp_listo,
        }
    )


def _sin_cache(response):
    response["Cache-Control"] = "no-store, no-cache, private, must-revalidate, max-age=0"
    response["Pragma"] = "no-cache"
    response["Expires"] = "0"
    response["Vary"] = "Authorization"
    return response


@api_view(["GET", "PUT", "PATCH"])
@permission_classes([IsAdminMesa])
@never_cache
def admin_configuracion(request):
    cfg = ConfiguracionMesa.obtener(request.user)
    if request.method == "GET":
        return _sin_cache(Response(ConfiguracionMesaSerializer(cfg, context={"request": request}).data))
    serializer = ConfiguracionMesaSerializer(cfg, data=request.data, partial=True, context={"request": request})
    serializer.is_valid(raise_exception=True)
    serializer.save()
    cfg.refresh_from_db()
    return _sin_cache(Response(ConfiguracionMesaSerializer(cfg, context={"request": request}).data))


@api_view(["POST"])
@permission_classes([IsAdminMesa])
@never_cache
def admin_configuracion_probar(request):
    from django.core.mail import EmailMessage

    from notificaciones.mail import conexion_correo, correo_remitente, mensaje_error_smtp

    cfg = ConfiguracionMesa.obtener(request.user)
    data = request.data or {}
    for campo in ("smtp_host", "smtp_usuario", "correo_remitente"):
        valor = (data.get(campo) or "").strip()
        if valor:
            setattr(cfg, campo, valor)
    if data.get("smtp_clave"):
        cfg.smtp_clave = data.get("smtp_clave")
    if data.get("smtp_puerto") not in (None, ""):
        try:
            cfg.smtp_puerto = int(data.get("smtp_puerto"))
        except (TypeError, ValueError):
            pass
    if "smtp_tls" in data:
        cfg.smtp_tls = bool(data.get("smtp_tls"))
    if "smtp_ssl" in data:
        cfg.smtp_ssl = bool(data.get("smtp_ssl"))
    conn = conexion_correo(cfg)
    if not conn:
        return Response(
            {
                "detail": "Falta el servidor SMTP. Completa host, usuario y clave (cPanel: mail.vc-corporation.com, puerto 465, SSL)."
            },
            status=400,
        )
    destino = (request.data.get("correo") or cfg.correo_destino_efectivo(request.user) or "").strip()
    para = [destino] if destino else []
    if not para:
        return Response({"detail": "Indica un correo de destino o guarda 'Correo donde llegan las solicitudes'."}, status=400)
    try:
        mail = EmailMessage(
            subject="[Mesa de Ayuda] Correo de prueba",
            body="Si lees esto, la configuración de correo de este administrador ya funciona.",
            from_email=correo_remitente(cfg),
            to=para,
            connection=conn,
        )
        mail.send(fail_silently=False)
    except Exception as exc:
        return Response({"detail": mensaje_error_smtp(exc)}, status=400)
    return Response({"ok": True, "enviado_a": para})
