from django.db import migrations


ESTADOS = [
    ("borrador", "Borrador", "#94A3B8", 1, False),
    ("enviado", "Enviado", "#EAB308", 2, False),
    ("asignado", "Asignado", "#2563EB", 3, False),
    ("en_atencion", "En atención", "#4F46E5", 4, False),
    ("pendiente_usuario", "Pendiente del usuario", "#D97706", 5, False),
    ("derivado", "Derivado", "#7C3AED", 6, False),
    ("atendido", "Resuelto", "#16A34A", 7, False),
    ("cerrado", "Cerrado", "#2D2D2D", 8, True),
    ("cancelado", "Cancelado", "#9CA3AF", 9, True),
]


def cargar_estados(apps, schema_editor):
    Estado = apps.get_model("mesa_ayuda", "EstadoSolicitud")
    Categoria = apps.get_model("mesa_ayuda", "Categoria")
    for codigo, nombre, color, orden, final in ESTADOS:
        Estado.objects.update_or_create(
            codigo=codigo,
            defaults={"nombre": nombre, "color_hex": color, "orden": orden, "es_final": final},
        )
    slas = {
        "SOP": 8,
        "CTA": 24,
        "ACC": 8,
        "MOD": 16,
        "OTR": 24,
        "MPC": 48,
        "BCK": 24,
        "MSV": 48,
        "MIM": 48,
    }
    for codigo, horas in slas.items():
        Categoria.objects.filter(codigo=codigo, sla_horas__isnull=True).update(sla_horas=horas)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("mesa_ayuda", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(cargar_estados, noop),
    ]
