from django.conf import settings
from django.db import models

from users.models import Area, Usuario


class MesaRolUsuario(models.Model):
    ROL_SOLICITANTE = "solicitante"
    ROL_TECNICO = "tecnico"
    ROL_ADMIN = "admin"
    ROL_CHOICES = (
        (ROL_SOLICITANTE, "Solicitante"),
        (ROL_TECNICO, "Técnico / Encargado"),
        (ROL_ADMIN, "Administrador de mesa"),
    )

    id_usuario = models.IntegerField(unique=True)
    rol = models.CharField(max_length=20, choices=ROL_CHOICES)

    class Meta:
        db_table = "mesa_roles_usuario"

    def __str__(self):
        return f"{self.id_usuario}:{self.rol}"


class Categoria(models.Model):
    nombre = models.CharField(max_length=150)
    codigo = models.CharField(max_length=50, unique=True)
    descripcion = models.TextField(blank=True)
    activo = models.BooleanField(default=True)
    orden = models.PositiveIntegerField(default=0)
    sla_horas = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        db_table = "mesa_categorias"
        ordering = ["orden", "nombre"]

    def __str__(self):
        return self.nombre


class TipoActividad(models.Model):
    categoria = models.ForeignKey(Categoria, related_name="tipos", on_delete=models.CASCADE)
    nombre = models.CharField(max_length=180)
    codigo = models.CharField(max_length=80)
    activo = models.BooleanField(default=True)
    orden = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "mesa_tipos_actividad"
        ordering = ["orden", "nombre"]
        unique_together = ("categoria", "codigo")

    def __str__(self):
        return self.nombre


class EstadoSolicitud(models.Model):
    codigo = models.CharField(max_length=30, primary_key=True)
    nombre = models.CharField(max_length=60)
    color_hex = models.CharField(max_length=7)
    orden = models.PositiveIntegerField(default=0)
    es_final = models.BooleanField(default=False)

    class Meta:
        db_table = "mesa_estados"
        ordering = ["orden"]

    def __str__(self):
        return self.nombre


class Solicitud(models.Model):
    PRIORIDAD_CHOICES = (
        ("baja", "Baja"),
        ("media", "Media"),
        ("alta", "Alta"),
        ("critica", "Crítica"),
    )

    codigo = models.CharField(max_length=20, unique=True, blank=True)
    fecha_registro = models.DateTimeField(auto_now_add=True)
    solicitante = models.ForeignKey(
        Usuario,
        db_column="id_solicitante",
        related_name="solicitudes_creadas",
        on_delete=models.DO_NOTHING,
    )
    email_contacto = models.CharField(max_length=100, blank=True)
    telefono_contacto = models.CharField(max_length=100, blank=True)
    area = models.ForeignKey(Area, db_column="id_area", on_delete=models.DO_NOTHING)
    categoria = models.ForeignKey(Categoria, on_delete=models.PROTECT)
    tipo_actividad = models.ForeignKey(TipoActividad, on_delete=models.PROTECT)
    requerimiento = models.TextField(blank=True, default="")
    estado = models.ForeignKey(
        EstadoSolicitud,
        db_column="estado",
        on_delete=models.PROTECT,
        default="borrador",
    )
    asignado_a = models.ForeignKey(
        Usuario,
        db_column="id_asignado",
        related_name="solicitudes_asignadas",
        on_delete=models.DO_NOTHING,
        null=True,
        blank=True,
    )
    prioridad = models.CharField(max_length=10, choices=PRIORIDAD_CHOICES, default="media")
    fecha_envio = models.DateTimeField(null=True, blank=True)
    fecha_asignacion = models.DateTimeField(null=True, blank=True)
    fecha_atencion = models.DateTimeField(null=True, blank=True)
    fecha_cierre = models.DateTimeField(null=True, blank=True)
    sla_segundos_pausados = models.PositiveIntegerField(default=0)
    sla_pausa_desde = models.DateTimeField(null=True, blank=True)
    confirmado_solicitante_en = models.DateTimeField(null=True, blank=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "mesa_solicitudes"
        ordering = ["-fecha_registro"]

    def __str__(self):
        return self.codigo or f"solicitud-{self.pk}"


class Comentario(models.Model):
    solicitud = models.ForeignKey(Solicitud, related_name="comentarios", on_delete=models.CASCADE)
    autor = models.ForeignKey(Usuario, db_column="id_autor", on_delete=models.DO_NOTHING)
    cuerpo = models.TextField()
    es_interno = models.BooleanField(default=False)
    fecha = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "mesa_comentarios"
        ordering = ["fecha"]


class Adjunto(models.Model):
    solicitud = models.ForeignKey(Solicitud, related_name="adjuntos", on_delete=models.CASCADE)
    comentario = models.ForeignKey(
        Comentario, related_name="adjuntos", on_delete=models.SET_NULL, null=True, blank=True
    )
    archivo = models.FileField(upload_to="solicitudes/%Y/%m/")
    nombre_original = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    tamano_bytes = models.PositiveIntegerField()
    subido_por = models.ForeignKey(Usuario, db_column="id_subido_por", on_delete=models.DO_NOTHING)
    fecha = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "mesa_adjuntos"


class HistorialEstado(models.Model):
    solicitud = models.ForeignKey(Solicitud, related_name="historial", on_delete=models.CASCADE)
    estado_origen = models.CharField(max_length=30, blank=True)
    estado_destino = models.CharField(max_length=30)
    actor = models.ForeignKey(Usuario, db_column="id_actor", on_delete=models.DO_NOTHING)
    motivo = models.TextField(blank=True)
    fecha = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "mesa_historial_estado"
        ordering = ["fecha"]


EVENTOS_AVISO_SOLICITANTE = [
    "enviado",
    "asignado",
    "en_atencion",
    "pendiente_usuario",
    "derivado",
    "atendido",
    "cerrado",
    "cancelado",
]


def _eventos_aviso_solicitante_default():
    return list(EVENTOS_AVISO_SOLICITANTE)


class ConfiguracionMesa(models.Model):
    id_usuario = models.IntegerField(unique=True)
    correo_destino = models.CharField(max_length=200, blank=True)
    smtp_host = models.CharField(max_length=200, blank=True)
    smtp_puerto = models.PositiveIntegerField(default=587)
    smtp_usuario = models.CharField(max_length=200, blank=True)
    smtp_clave = models.CharField(max_length=255, blank=True)
    smtp_tls = models.BooleanField(default=True)
    smtp_ssl = models.BooleanField(default=False)
    correo_remitente = models.CharField(max_length=200, blank=True)
    avisar_solicitante = models.BooleanField(default=True)
    avisar_solicitante_eventos = models.JSONField(default=_eventos_aviso_solicitante_default, blank=True)

    class Meta:
        db_table = "mesa_configuracion"

    def __str__(self):
        return f"Configuración correo usuario {self.id_usuario}"

    @classmethod
    def obtener(cls, usuario):
        from users.models import Usuario

        uid = getattr(usuario, "id_usuario", usuario)
        user = usuario if hasattr(usuario, "correo") else Usuario.objects.filter(pk=uid).first()
        correo = (getattr(user, "correo", None) or "").strip()
        obj, _ = cls.objects.get_or_create(
            id_usuario=uid,
            defaults={
                "correo_destino": correo,
                "smtp_usuario": correo,
                "correo_remitente": correo,
            },
        )
        return obj

    @property
    def smtp_listo(self):
        return bool(
            (self.smtp_host or "").strip()
            and (self.smtp_usuario or "").strip()
            and (self.smtp_clave or "").strip()
        )

    def correo_destino_efectivo(self, usuario=None):
        if (self.correo_destino or "").strip():
            return self.correo_destino.strip()
        if usuario and getattr(usuario, "correo", None):
            return usuario.correo.strip()
        from users.models import Usuario

        user = Usuario.objects.filter(pk=self.id_usuario).first()
        return (user.correo or "").strip() if user and user.correo else ""

    def debe_avisar_solicitante(self, evento):
        if not self.avisar_solicitante:
            return False
        clave = {
            "creada": "enviado",
            "asignada": "asignado",
            "derivada": "derivado",
        }.get(evento, evento)
        eventos = self.avisar_solicitante_eventos
        if not eventos:
            return False
        return clave in eventos

