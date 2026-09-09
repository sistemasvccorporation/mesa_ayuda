from django.core.management.base import BaseCommand
from django.db import transaction

from mesa_ayuda.models import Categoria, EstadoSolicitud, MesaRolUsuario, TipoActividad
from users.models import Area, Cargo, Usuario

CATEGORIAS = [
    ("SOP", "Soporte Técnico", 1, 8),
    ("CTA", "Crear cuentas de Correo y/o Usuario", 2, 24),
    ("ACC", "Asignar Acceso a Datos en el Sistema", 3, 8),
    ("MOD", "Modificación de Datos en el Sistema", 4, 16),
    ("OTR", "Otros requerimientos del Usuario", 5, 24),
    ("MPC", "Mantenimiento Preventivo PCs/Laptops", 6, 48),
    ("BCK", "Copias de Respaldo Base de Datos", 7, 24),
    ("MSV", "Mantenimiento Preventivo Servidor", 8, 48),
    ("MIM", "Mantenimiento Preventivo Impresoras", 9, 48),
]

TIPOS = {
    "SOP": [
        "Accesos",
        "Actualización de Antivirus",
        "Apoyo Técnico Manejo ofimática",
        "Capacitación del Uso del Sistema",
        "Configuración de Equipos Informáticos",
        "Instalación / Reinstalación / Configuración de Software",
        "Instalación de componente",
        "Mantenimiento Correctivo / Preventivo",
    ],
    "CTA": ["Creación", "Configuración de Correo Electrónico", "Autocontestador de Correo"],
    "ACC": ["Accesos", "Módulo Almacén", "Módulo Aperturas"],
    "MOD": ["Modificación", "Eliminar", "Baja"],
    "OTR": ["Capacitación del Uso del Sistema", "Apoyo Técnico Manejo ofimática"],
    "MPC": [
        "Mantenimiento Correctivo / Preventivo",
        "Configuración de Equipos Informáticos",
        "Actualización de Antivirus",
    ],
    "BCK": ["Copias de Respaldo / Restauración"],
    "MSV": ["Mantenimiento Correctivo / Preventivo", "Copias de Respaldo / Restauración"],
    "MIM": ["Mantenimiento Correctivo / Preventivo", "Instalación de componente"],
}

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


class Command(BaseCommand):
    help = "Carga catálogos de mesa de ayuda y roles iniciales sobre usuarios existentes."

    def add_arguments(self, parser):
        parser.add_argument("--admin", default="", help="usuario SIGeCom que será admin de mesa")
        parser.add_argument("--tecnico", default="", help="usuario SIGeCom inicial como técnico")

    def _ensure_area_cargo(self):
        area, _ = Area.objects.get_or_create(
            nombre="Administracion",
            defaults={"responsable": "Sistemas", "telefono": "", "correlativo": 1, "activo": 1},
        )
        cargo, _ = Cargo.objects.get_or_create(
            nombre="Analista de Sistemas",
            defaults={"activo": "1", "nivel": 1},
        )
        return area, cargo

    @transaction.atomic
    def handle(self, *args, **options):
        area, cargo = self._ensure_area_cargo()
        self.stdout.write(f"Área base: {area.nombre} (id {area.id_area})")
        for codigo, nombre, color, orden, final in ESTADOS:
            EstadoSolicitud.objects.update_or_create(
                codigo=codigo,
                defaults={"nombre": nombre, "color_hex": color, "orden": orden, "es_final": final},
            )
        cats = {}
        for codigo, nombre, orden, sla in CATEGORIAS:
            cat, _ = Categoria.objects.update_or_create(
                codigo=codigo,
                defaults={"nombre": nombre, "orden": orden, "activo": True, "sla_horas": sla},
            )
            cats[codigo] = cat
        for codigo, nombres in TIPOS.items():
            cat = cats[codigo]
            for i, nombre in enumerate(nombres, start=1):
                slug = f"{codigo}-{i}"
                TipoActividad.objects.update_or_create(
                    categoria=cat,
                    codigo=slug,
                    defaults={"nombre": nombre, "orden": i, "activo": True},
                )

        admin_login = options["admin"]
        tecnico_login = options["tecnico"]
        if admin_login:
            user = Usuario.objects.filter(usuario=admin_login, activo=1).first()
            if user:
                MesaRolUsuario.objects.update_or_create(
                    id_usuario=user.id_usuario, defaults={"rol": MesaRolUsuario.ROL_ADMIN}
                )
                self.stdout.write(self.style.SUCCESS(f"Admin de mesa: {user.usuario}"))
            else:
                self.stdout.write(self.style.WARNING(f"No se encontró usuario activo {admin_login}"))
        if tecnico_login:
            user = Usuario.objects.filter(usuario=tecnico_login, activo=1).first()
            if user:
                MesaRolUsuario.objects.update_or_create(
                    id_usuario=user.id_usuario, defaults={"rol": MesaRolUsuario.ROL_TECNICO}
                )
                self.stdout.write(self.style.SUCCESS(f"Técnico inicial: {user.usuario}"))

        self.stdout.write(self.style.SUCCESS("Catálogos de mesa de ayuda listos."))
