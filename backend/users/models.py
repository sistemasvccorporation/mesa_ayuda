from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.db import models

from .fields import SafeDateField


class Area(models.Model):
    id_area = models.AutoField(primary_key=True)
    nombre = models.CharField(max_length=100)
    responsable = models.CharField(max_length=100)
    telefono = models.CharField(max_length=45, null=True, blank=True)
    correlativo = models.IntegerField(null=True, blank=True)
    activo = models.IntegerField()

    class Meta:
        db_table = "areas"
        managed = False

    def __str__(self):
        return self.nombre


class Cargo(models.Model):
    id_cargo = models.AutoField(primary_key=True)
    nombre = models.CharField(max_length=100)
    nombre_ingles = models.CharField(max_length=100, null=True, blank=True)
    nivel = models.IntegerField(null=True, blank=True)
    activo = models.CharField(max_length=45, null=True, blank=True)

    class Meta:
        db_table = "cargos"
        managed = False

    def __str__(self):
        return self.nombre


class Banco(models.Model):
    id_banco = models.AutoField(primary_key=True)
    codigo = models.CharField(max_length=2, unique=True)
    nombre = models.CharField(max_length=150)
    activo = models.BooleanField(default=True)

    class Meta:
        db_table = "bancos"
        managed = False


class UsuarioManager(BaseUserManager):
    def get_by_natural_key(self, username):
        return self.get(**{self.model.USERNAME_FIELD: username})

    def create_user(self, usuario, password=None, **extra_fields):
        extra_fields.setdefault("nombre_completo", usuario)
        extra_fields.setdefault("activo", 1)
        user = self.model(usuario=usuario, **extra_fields)
        if password:
            user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, usuario, password=None, **extra_fields):
        return self.create_user(usuario, password, **extra_fields)


class Usuario(AbstractBaseUser):
    last_login = None

    id_usuario = models.AutoField(primary_key=True)
    usuario = models.CharField(max_length=100, unique=True)
    nombre_completo = models.CharField(max_length=100)
    correo = models.CharField(max_length=100, null=True, blank=True)
    correo_personal = models.CharField(max_length=100, null=True, blank=True)
    fecha_creacion = models.CharField(max_length=100, null=True, blank=True)
    dni = models.CharField(max_length=8, null=True, blank=True)
    telefono = models.CharField(max_length=100, null=True, blank=True)
    movil_personal = models.CharField(max_length=100, null=True, blank=True)
    movil_coorporativo = models.CharField(max_length=100, null=True, blank=True)
    fecha_nacimiento = SafeDateField(null=True, blank=True)
    fecha_ingreso = SafeDateField(null=True, blank=True)
    password = models.CharField(max_length=128, db_column="contrasena", null=True, blank=True)
    documento = models.CharField(max_length=100, null=True, blank=True)
    direccion = models.CharField(max_length=200, null=True, blank=True)
    estado_civil = models.CharField(max_length=11, null=True, blank=True)
    genero = models.CharField(max_length=1, null=True, blank=True)
    id_banco = models.ForeignKey(
        Banco, db_column="id_banco", on_delete=models.DO_NOTHING, null=True, blank=True
    )
    nro_cuenta = models.CharField(max_length=100, null=True, blank=True)
    afp = models.IntegerField(null=True, blank=True)
    activo = models.IntegerField(null=True, blank=True)
    area = models.ForeignKey(Area, db_column="id_area", on_delete=models.DO_NOTHING, related_name="usuarios")
    cargo = models.ForeignKey(Cargo, db_column="id_cargo", on_delete=models.DO_NOTHING, related_name="usuarios")

    USERNAME_FIELD = "usuario"
    REQUIRED_FIELDS = []

    objects = UsuarioManager()

    class Meta:
        db_table = "usuarios"
        managed = False

    def __str__(self):
        return self.nombre_completo or self.usuario

    @property
    def is_active(self):
        return self.activo == 1

    @is_active.setter
    def is_active(self, value):
        self.activo = 1 if value else 0

    @property
    def is_staff(self):
        return self.rol_mesa == "admin"

    @property
    def is_superuser(self):
        return False

    def has_perm(self, perm, obj=None):
        return self.rol_mesa == "admin"

    def has_module_perms(self, app_label):
        return self.rol_mesa == "admin"

    def get_full_name(self):
        return self.nombre_completo

    def get_short_name(self):
        return self.usuario

    @property
    def rol_mesa(self):
        from django.conf import settings
        from mesa_ayuda.models import MesaRolUsuario

        rol = MesaRolUsuario.objects.filter(id_usuario=self.id_usuario).values_list("rol", flat=True).first()
        if rol:
            return rol
        bootstrap = (getattr(settings, "MESA_BOOTSTRAP_ADMIN", "") or "ronaldo.roman").strip().lower()
        if (self.usuario or "").strip().lower() == bootstrap:
            return "admin"
        return "solicitante"

    @property
    def telefono_contacto(self):
        for value in (self.movil_coorporativo, self.movil_personal, self.telefono):
            if value and str(value).strip():
                return str(value).strip()
        return ""
