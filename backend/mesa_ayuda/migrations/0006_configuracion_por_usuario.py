from django.conf import settings
from django.db import migrations, models


def asignar_config_por_usuario(apps, schema_editor):
    Config = apps.get_model("mesa_ayuda", "ConfiguracionMesa")
    Rol = apps.get_model("mesa_ayuda", "MesaRolUsuario")
    Usuario = apps.get_model("users", "Usuario")

    uid = None
    admin = Rol.objects.filter(rol="admin").first()
    if admin:
        uid = admin.id_usuario
    if not uid:
        bootstrap = (getattr(settings, "MESA_BOOTSTRAP_ADMIN", "") or "ronaldo.roman").strip().lower()
        user = Usuario.objects.filter(usuario__iexact=bootstrap).first()
        if user:
            uid = user.id_usuario
    if not uid:
        user = Usuario.objects.filter(activo=1).first()
        if user:
            uid = user.id_usuario

    vistos = set()
    for cfg in Config.objects.order_by("id"):
        if not cfg.id_usuario:
            if uid and uid not in vistos:
                cfg.id_usuario = uid
                cfg.save(update_fields=["id_usuario"])
                vistos.add(uid)
            else:
                cfg.delete()
        elif cfg.id_usuario in vistos:
            cfg.delete()
        else:
            vistos.add(cfg.id_usuario)


class Migration(migrations.Migration):

    dependencies = [
        ("mesa_ayuda", "0005_avisar_solicitante"),
    ]

    operations = [
        migrations.AddField(
            model_name="configuracionmesa",
            name="id_usuario",
            field=models.IntegerField(null=True),
        ),
        migrations.RunPython(asignar_config_por_usuario, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="configuracionmesa",
            name="id_usuario",
            field=models.IntegerField(unique=True),
        ),
    ]
