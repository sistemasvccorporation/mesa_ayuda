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
    rol = serializers.CharField(source="rol_mesa", read_only=True)
    telefono_contacto = serializers.CharField(read_only=True)
    correo_smtp_listo = serializers.SerializerMethodField()

    class Meta:
        model = Usuario
        fields = (
            "id_usuario",
            "usuario",
            "nombre_completo",
            "correo",
            "telefono_contacto",
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

    def get_correo_smtp_listo(self, obj):
        if obj.rol_mesa != "admin":
            return True
        from mesa_ayuda.models import ConfiguracionMesa

        cfg = ConfiguracionMesa.objects.filter(id_usuario=obj.id_usuario).first()
        return bool(cfg and cfg.smtp_listo)


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
