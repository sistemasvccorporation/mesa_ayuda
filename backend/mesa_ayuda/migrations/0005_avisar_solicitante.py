from django.db import migrations, models


def _eventos_aviso_solicitante_default():
    return [
        "enviado",
        "asignado",
        "en_atencion",
        "pendiente_usuario",
        "derivado",
        "atendido",
        "cerrado",
        "cancelado",
    ]


class Migration(migrations.Migration):

    dependencies = [
        ("mesa_ayuda", "0004_configuracion_mesa"),
    ]

    operations = [
        migrations.AddField(
            model_name="configuracionmesa",
            name="avisar_solicitante",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="configuracionmesa",
            name="avisar_solicitante_eventos",
            field=models.JSONField(blank=True, default=_eventos_aviso_solicitante_default),
        ),
    ]
