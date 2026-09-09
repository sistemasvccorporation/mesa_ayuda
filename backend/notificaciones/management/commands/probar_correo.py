from django.core.mail import EmailMessage
from django.core.management.base import BaseCommand

from mesa_ayuda.models import ConfiguracionMesa
from notificaciones.mail import conexion_correo, correo_remitente
from users.models import Usuario


class Command(BaseCommand):
    help = "Envía un correo de prueba usando la configuración SMTP de un administrador."

    def add_arguments(self, parser):
        parser.add_argument("--usuario", default="", help="Login SIGeCom del admin (ej. ronaldo.roman)")

    def handle(self, *args, **options):
        login = (options.get("usuario") or "").strip()
        user = Usuario.objects.filter(usuario=login).first() if login else None
        if not user:
            cfg = ConfiguracionMesa.objects.exclude(smtp_clave="").exclude(smtp_host="").first()
            if not cfg:
                self.stderr.write("Ningún admin tiene SMTP configurado. Pasa --usuario o guarda Configuración.")
                return
            user = Usuario.objects.filter(pk=cfg.id_usuario).first()
        else:
            cfg = ConfiguracionMesa.obtener(user)
        if not cfg.smtp_listo:
            self.stderr.write(
                f"El usuario {user.usuario if user else '?'} no tiene SMTP (host, usuario y clave) en Configuración."
            )
            return
        para = [cfg.correo_destino_efectivo(user)]
        if not para[0]:
            self.stderr.write("Ese admin no tiene correo de destino.")
            return
        self.stdout.write(f"Enviando prueba a: {', '.join(para)}")
        mail = EmailMessage(
            subject="[Mesa de Ayuda] Correo de prueba",
            body="Si lees esto, SMTP de Mesa de Ayuda ya funciona.",
            from_email=correo_remitente(cfg),
            to=para,
            connection=conexion_correo(cfg),
        )
        mail.send(fail_silently=False)
        self.stdout.write(self.style.SUCCESS("Correo enviado. Revisa bandeja de entrada y spam."))
