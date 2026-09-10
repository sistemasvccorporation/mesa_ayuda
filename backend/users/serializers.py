from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework import serializers

from .models import Area, Usuario


class AreaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Area
        fields = ("id_area", "nombre", "responsable", "telefono", "activo")


class MeSerializer(serializers.ModelSerializer):
    area = serializers.SerializerMethodField()
    cargo = serializers.SerializerMethodField()
    banco = serializers.SerializerMethodField()
    rol = serializers.CharField(source="rol_mesa", read_only=True)
    telefono_contacto = serializers.CharField(read_only=True)
    correo_smtp_listo = serializers.SerializerMethodField()
    fecha_nacimiento = serializers.DateField(required=False, allow_null=True)
    fecha_ingreso = serializers.DateField(read_only=True)

    class Meta:
        model = Usuario
        fields = (
            "id_usuario",
            "usuario",
            "nombre_completo",
            "correo",
            "correo_personal",
            "telefono",
            "movil_personal",
            "movil_coorporativo",
            "telefono_contacto",
            "dni",
            "documento",
            "direccion",
            "estado_civil",
            "genero",
            "fecha_nacimiento",
            "fecha_ingreso",
            "fecha_creacion",
            "nro_cuenta",
            "banco",
            "area",
            "cargo",
            "activo",
            "rol",
            "correo_smtp_listo",
        )
        read_only_fields = (
            "id_usuario",
            "usuario",
            "telefono_contacto",
            "fecha_ingreso",
            "fecha_creacion",
            "nro_cuenta",
            "banco",
            "area",
            "cargo",
            "activo",
            "rol",
            "correo_smtp_listo",
        )

    def get_area(self, obj):
        try:
            if not obj.area_id:
                return None
            return {"id_area": obj.area_id, "nombre": obj.area.nombre}
        except Exception:
            return {"id_area": obj.area_id, "nombre": "Sin área"}

    def get_cargo(self, obj):
        try:
            if not obj.cargo_id:
                return None
            return {"id_cargo": obj.cargo_id, "nombre": obj.cargo.nombre}
        except Exception:
            return {"id_cargo": obj.cargo_id, "nombre": "Sin cargo"}

    def get_banco(self, obj):
        try:
            if not obj.id_banco_id:
                return None
            return {"id_banco": obj.id_banco_id, "nombre": obj.id_banco.nombre}
        except Exception:
            return None

    def get_correo_smtp_listo(self, obj):
        if obj.rol_mesa != "admin":
            return True
        from mesa_ayuda.models import ConfiguracionMesa

        cfg = ConfiguracionMesa.objects.filter(id_usuario=obj.id_usuario).first()
        return bool(cfg and cfg.smtp_listo)


class PerfilUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Usuario
        fields = (
            "nombre_completo",
            "correo",
            "correo_personal",
            "telefono",
            "movil_personal",
            "movil_coorporativo",
            "dni",
            "documento",
            "direccion",
            "estado_civil",
            "genero",
            "fecha_nacimiento",
        )

    def validate_nombre_completo(self, value):
        nombre = (value or "").strip()
        if not nombre:
            raise serializers.ValidationError("El nombre no puede quedar vacío.")
        return nombre[:100]

    def _correo(self, value):
        texto = (value or "").strip()
        if not texto:
            return None
        if "@" not in texto or "." not in texto.split("@")[-1]:
            raise serializers.ValidationError("Escribe un correo válido.")
        return texto[:100]

    def validate_correo(self, value):
        return self._correo(value)

    def validate_correo_personal(self, value):
        return self._correo(value)

    def validate_dni(self, value):
        texto = (value or "").strip()
        if not texto:
            return None
        if not texto.isdigit() or len(texto) > 8:
            raise serializers.ValidationError("El DNI debe tener hasta 8 dígitos.")
        return texto

    def validate_genero(self, value):
        texto = (value or "").strip().upper()
        if not texto:
            return None
        if texto not in ("M", "F"):
            raise serializers.ValidationError("Usa M o F.")
        return texto

    def validate_estado_civil(self, value):
        texto = (value or "").strip()
        return texto[:11] or None

    def validate(self, attrs):
        for campo in ("telefono", "movil_personal", "movil_coorporativo", "documento", "direccion"):
            if campo in attrs and attrs[campo] is not None:
                attrs[campo] = str(attrs[campo]).strip() or None
        return attrs

    def update(self, instance, validated_data):
        correo_anterior = (instance.correo or "").strip()
        for campo, valor in validated_data.items():
            setattr(instance, campo, valor)
        instance.save()
        correo_nuevo = (instance.correo or "").strip()
        if correo_nuevo and correo_nuevo != correo_anterior:
            _alinear_correo_mesa(instance, correo_anterior, correo_nuevo)
        return instance


def _alinear_correo_mesa(user, correo_anterior, correo_nuevo):
    from mesa_ayuda.models import ConfiguracionMesa

    cfg = ConfiguracionMesa.objects.filter(id_usuario=user.id_usuario).first()
    if not cfg:
        return
    changed = []
    for campo in ("correo_destino", "smtp_usuario", "correo_remitente"):
        actual = (getattr(cfg, campo) or "").strip()
        if not actual or actual == correo_anterior:
            setattr(cfg, campo, correo_nuevo)
            changed.append(campo)
    if changed:
        cfg.save(update_fields=changed)


class PublicUserSerializer(serializers.ModelSerializer):
    area_nombre = serializers.SerializerMethodField()
    cargo_nombre = serializers.SerializerMethodField()
    rol = serializers.CharField(source="rol_mesa", read_only=True)

    class Meta:
        model = Usuario
        fields = (
            "id_usuario",
            "usuario",
            "nombre_completo",
            "correo",
            "area_nombre",
            "cargo_nombre",
            "rol",
        )

    def get_area_nombre(self, obj):
        try:
            return obj.area.nombre if obj.area_id else None
        except Exception:
            return None

    def get_cargo_nombre(self, obj):
        try:
            return obj.cargo.nombre if obj.cargo_id else None
        except Exception:
            return None


class SigecomTokenObtainPairSerializer(TokenObtainPairSerializer):
    username_field = "usuario"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["usuario"] = self.fields.pop("username", serializers.CharField())
        password_field = self.fields.get("password")
        if password_field:
            password_field.write_only = True

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["usuario"] = user.usuario
        token["nombre"] = user.nombre_completo
        token["rol"] = user.rol_mesa
        return token

    def validate(self, attrs):
        if "usuario" in attrs and "username" not in attrs:
            attrs["username"] = attrs["usuario"]
        data = super().validate(attrs)
        data["user"] = MeSerializer(self.user).data
        return data
