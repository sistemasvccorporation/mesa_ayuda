from django.db import models

from users.models import Usuario


class Aviso(models.Model):
    destinatario = models.ForeignKey(
        Usuario,
        db_column="id_destinatario",
        related_name="avisos",
        on_delete=models.CASCADE,
    )
    solicitud = models.ForeignKey(
        "mesa_ayuda.Solicitud",
        null=True,
        blank=True,
        related_name="avisos",
        on_delete=models.CASCADE,
    )
    evento = models.CharField(max_length=40)
    titulo = models.CharField(max_length=200)
    cuerpo = models.TextField(blank=True)
    leido = models.BooleanField(default=False)
    fecha = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "mesa_avisos"
        ordering = ["-fecha"]

    def __str__(self):
        return self.titulo
