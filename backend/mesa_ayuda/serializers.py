from django.utils import timezone
from django.utils.text import slugify
from rest_framework import serializers

from users.models import Area, Usuario
from users.serializers import PublicUserSerializer

from .models import Adjunto, Categoria, Comentario, ConfiguracionMesa, EstadoSolicitud, HistorialEstado, MesaRolUsuario, Solicitud, TipoActividad
from .services import acciones_disponibles, nombre_estado, resumen_sla, validar_adjunto


class CategoriaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Categoria
        fields = ("id", "nombre", "codigo", "descripcion", "activo", "orden", "sla_horas")

    def validate_codigo(self, value):
        return (value or "").strip().upper()

    def create(self, validated_data):
        if not validated_data.get("codigo"):
            validated_data["codigo"] = slugify(validated_data["nombre"])[:50].upper().replace("-", "_")
        return super().create(validated_data)


class TipoActividadSerializer(serializers.ModelSerializer):
    categoria_nombre = serializers.CharField(source="categoria.nombre", read_only=True)

    class Meta:
        model = TipoActividad
        fields = ("id", "categoria", "categoria_nombre", "nombre", "codigo", "activo", "orden")

    def create(self, validated_data):
        if not validated_data.get("codigo"):
            cat = validated_data["categoria"]
            base = slugify(validated_data["nombre"])[:40] or "tipo"
            codigo = f"{cat.codigo}-{base}"[:80]
            n = 1
            while TipoActividad.objects.filter(categoria=cat, codigo=codigo).exists():
                n += 1
                codigo = f"{cat.codigo}-{base}-{n}"[:80]
            validated_data["codigo"] = codigo
        return super().create(validated_data)


class EstadoSerializer(serializers.ModelSerializer):
    class Meta:
        model = EstadoSolicitud
        fields = ("codigo", "nombre", "color_hex", "orden", "es_final")


class AdjuntoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Adjunto
        fields = ("id", "nombre_original", "content_type", "tamano_bytes", "fecha")


class ComentarioSerializer(serializers.ModelSerializer):
    autor_nombre = serializers.CharField(source="autor.nombre_completo", read_only=True)
    adjuntos = AdjuntoSerializer(many=True, read_only=True)

    class Meta:
        model = Comentario
        fields = ("id", "cuerpo", "es_interno", "fecha", "autor_nombre", "adjuntos")
        read_only_fields = ("fecha", "autor_nombre", "adjuntos")


class HistorialSerializer(serializers.ModelSerializer):
    actor_nombre = serializers.CharField(source="actor.nombre_completo", read_only=True)
    estado_origen_nombre = serializers.SerializerMethodField()
    estado_destino_nombre = serializers.SerializerMethodField()

    class Meta:
        model = HistorialEstado
        fields = (
            "id",
            "estado_origen",
            "estado_destino",
            "estado_origen_nombre",
            "estado_destino_nombre",
            "motivo",
            "fecha",
            "actor_nombre",
        )

    def get_estado_origen_nombre(self, obj):
        return nombre_estado(obj.estado_origen)

    def get_estado_destino_nombre(self, obj):
        return nombre_estado(obj.estado_destino)


class SolicitudListSerializer(serializers.ModelSerializer):
    categoria_nombre = serializers.CharField(source="categoria.nombre", read_only=True)
    tipo_nombre = serializers.CharField(source="tipo_actividad.nombre", read_only=True)
    estado_nombre = serializers.CharField(source="estado.nombre", read_only=True)
    estado_color = serializers.CharField(source="estado.color_hex", read_only=True)
    estado_codigo = serializers.CharField(source="estado.codigo", read_only=True)
    solicitante_nombre = serializers.CharField(source="solicitante.nombre_completo", read_only=True)
    asignado_nombre = serializers.CharField(source="asignado_a.nombre_completo", read_only=True)
    area_nombre = serializers.CharField(source="area.nombre", read_only=True)
    sla_horas = serializers.SerializerMethodField()
    fecha_limite = serializers.SerializerMethodField()
    sla_estado = serializers.SerializerMethodField()

    class Meta:
        model = Solicitud
        fields = (
            "id",
            "codigo",
            "fecha_registro",
            "categoria_nombre",
            "tipo_nombre",
            "estado_codigo",
            "estado_nombre",
            "estado_color",
            "solicitante_nombre",
            "asignado_nombre",
            "area_nombre",
            "prioridad",
            "requerimiento",
            "sla_horas",
            "fecha_limite",
            "sla_estado",
        )

    def _sla(self, obj):
        if not hasattr(obj, "_sla_cache"):
            obj._sla_cache = resumen_sla(obj)
        return obj._sla_cache

    def get_sla_horas(self, obj):
        return self._sla(obj)["sla_horas"]

    def get_fecha_limite(self, obj):
        return self._sla(obj)["fecha_limite"]

    def get_sla_estado(self, obj):
        return self._sla(obj)["sla_estado"]


class SolicitudDetailSerializer(SolicitudListSerializer):
    acciones = serializers.SerializerMethodField()
    transiciones = serializers.SerializerMethodField()
    adjuntos = serializers.SerializerMethodField()
    comentarios = serializers.SerializerMethodField()
    historial = HistorialSerializer(many=True, read_only=True)
    email_contacto = serializers.CharField()
    telefono_contacto = serializers.CharField()
    categoria = serializers.IntegerField(source="categoria_id")
    tipo_actividad = serializers.IntegerField(source="tipo_actividad_id")
    area = serializers.IntegerField(source="area_id")
    asignado_a = PublicUserSerializer(read_only=True)
    confirmado_solicitante_en = serializers.DateTimeField(read_only=True)

    class Meta(SolicitudListSerializer.Meta):
        fields = SolicitudListSerializer.Meta.fields + (
            "email_contacto",
            "telefono_contacto",
            "categoria",
            "tipo_actividad",
            "area",
            "asignado_a",
            "acciones",
            "transiciones",
            "adjuntos",
            "comentarios",
            "historial",
            "fecha_envio",
            "fecha_asignacion",
            "fecha_atencion",
            "fecha_cierre",
            "confirmado_solicitante_en",
        )

    def get_acciones(self, obj):
        request = self.context.get("request")
        rol = getattr(request.user, "rol_mesa", "solicitante") if request else "solicitante"
        return acciones_disponibles(obj, rol)

    def get_transiciones(self, obj):
        return [a["codigo"] for a in self.get_acciones(obj)]

    def get_adjuntos(self, obj):
        qs = obj.adjuntos.filter(comentario__isnull=True)
        return AdjuntoSerializer(qs, many=True).data

    def get_comentarios(self, obj):
        request = self.context.get("request")
        qs = obj.comentarios.select_related("autor").prefetch_related("adjuntos")
        if request and getattr(request.user, "rol_mesa", "solicitante") == "solicitante":
            qs = qs.filter(es_interno=False)
        return ComentarioSerializer(qs, many=True).data


class SolicitudWriteSerializer(serializers.ModelSerializer):
    files = serializers.ListField(child=serializers.FileField(), write_only=True, required=False)
    requerimiento = serializers.CharField(required=False, allow_blank=True, default="")

    class Meta:
        model = Solicitud
        fields = (
            "email_contacto",
            "telefono_contacto",
            "area",
            "categoria",
            "tipo_actividad",
            "requerimiento",
            "prioridad",
            "files",
        )

    def validate(self, attrs):
        categoria = attrs.get("categoria") or getattr(self.instance, "categoria", None)
        tipo = attrs.get("tipo_actividad") or getattr(self.instance, "tipo_actividad", None)
        if categoria and tipo and tipo.categoria_id != categoria.id:
            raise serializers.ValidationError(
                {"tipo_actividad": "El tipo de actividad no pertenece a la categoría seleccionada."}
            )
        return attrs

    def validate_files(self, files):
        for f in files:
            validar_adjunto(f)
        return files


class MesaRolSerializer(serializers.Serializer):
    id_usuario = serializers.IntegerField()
    rol = serializers.ChoiceField(choices=MesaRolUsuario.ROL_CHOICES)
    usuario = serializers.SerializerMethodField()

    def get_usuario(self, obj):
        user = Usuario.objects.filter(pk=obj.id_usuario).first()
        return PublicUserSerializer(user).data if user else None


class ConfiguracionMesaSerializer(serializers.ModelSerializer):
    smtp_clave = serializers.CharField(write_only=True, required=False, allow_blank=True)
    smtp_clave_configurada = serializers.SerializerMethodField()
    smtp_listo = serializers.SerializerMethodField()
    correo_sugerido = serializers.SerializerMethodField()

    class Meta:
        model = ConfiguracionMesa
        fields = (
            "id_usuario",
            "correo_destino",
            "smtp_host",
            "smtp_puerto",
            "smtp_usuario",
            "smtp_clave",
            "smtp_clave_configurada",
            "smtp_listo",
            "smtp_tls",
            "smtp_ssl",
            "correo_remitente",
            "avisar_solicitante",
            "avisar_solicitante_eventos",
            "correo_sugerido",
        )
        read_only_fields = ("id_usuario", "smtp_clave_configurada", "smtp_listo", "correo_sugerido")

    def validate_avisar_solicitante_eventos(self, value):
        from .models import EVENTOS_AVISO_SOLICITANTE

        if value is None:
            return list(EVENTOS_AVISO_SOLICITANTE)
        if not isinstance(value, list):
            raise serializers.ValidationError("Debe ser una lista de eventos.")
        permitidos = set(EVENTOS_AVISO_SOLICITANTE)
        return [e for e in value if e in permitidos]

    def get_smtp_clave_configurada(self, obj):
        return bool(obj.smtp_clave)

    def get_smtp_listo(self, obj):
        return bool(obj.smtp_listo)

    def get_correo_sugerido(self, obj):
        request = self.context.get("request")
        if request and getattr(request.user, "correo", None):
            return request.user.correo
        return ""

    def update(self, instance, validated_data):
        clave = validated_data.pop("smtp_clave", None)
        for k, v in validated_data.items():
            setattr(instance, k, v)
        if clave:
            instance.smtp_clave = clave
        instance.save()
        return instance
