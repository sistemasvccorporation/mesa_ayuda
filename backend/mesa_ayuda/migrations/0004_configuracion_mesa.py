from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("mesa_ayuda", "0003_avisos_sla_confirmacion"),
    ]

    operations = [
        migrations.CreateModel(
            name="ConfiguracionMesa",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("correo_destino", models.CharField(blank=True, max_length=200)),
                ("smtp_host", models.CharField(blank=True, max_length=200)),
                ("smtp_puerto", models.PositiveIntegerField(default=587)),
                ("smtp_usuario", models.CharField(blank=True, max_length=200)),
                ("smtp_clave", models.CharField(blank=True, max_length=255)),
                ("smtp_tls", models.BooleanField(default=True)),
                ("smtp_ssl", models.BooleanField(default=False)),
                ("correo_remitente", models.CharField(blank=True, max_length=200)),
            ],
            options={
                "db_table": "mesa_configuracion",
            },
        ),
    ]
