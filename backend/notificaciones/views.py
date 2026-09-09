from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Aviso


class AvisoSerializer(serializers.ModelSerializer):
    solicitud_codigo = serializers.CharField(source="solicitud.codigo", read_only=True)

    class Meta:
        model = Aviso
        fields = (
            "id",
            "evento",
            "titulo",
            "cuerpo",
            "leido",
            "fecha",
            "solicitud",
            "solicitud_codigo",
        )


class AvisoViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AvisoSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return Aviso.objects.filter(destinatario=self.request.user).select_related("solicitud")

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()[:40]
        return Response(AvisoSerializer(qs, many=True).data)

    @action(detail=False, methods=["get"])
    def resumen(self, request):
        qs = Aviso.objects.filter(destinatario=request.user)
        return Response({"no_leidos": qs.filter(leido=False).count()})

    @action(detail=True, methods=["post"])
    def leer(self, request, pk=None):
        aviso = self.get_object()
        aviso.leido = True
        aviso.save(update_fields=["leido"])
        return Response(AvisoSerializer(aviso).data)

    @action(detail=False, methods=["post"], url_path="leer-todas")
    def leer_todas(self, request):
        Aviso.objects.filter(destinatario=request.user, leido=False).update(leido=True)
        return Response({"ok": True})
