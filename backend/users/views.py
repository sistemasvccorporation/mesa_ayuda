from django.conf import settings
from django.contrib.auth import authenticate
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from mesa_ayuda.models import MesaRolUsuario
from .serializers import MeSerializer


def asegurar_bootstrap_admin(user):
    bootstrap = (getattr(settings, "MESA_BOOTSTRAP_ADMIN", "") or "ronaldo.roman").strip().lower()
    if not user or (user.usuario or "").strip().lower() != bootstrap:
        return
    MesaRolUsuario.objects.update_or_create(
        id_usuario=user.id_usuario,
        defaults={"rol": MesaRolUsuario.ROL_ADMIN},
    )


class LoginView(APIView):
    permission_classes = (permissions.AllowAny,)

    def post(self, request):
        usuario = (request.data.get("usuario") or request.data.get("username") or "").strip()
        password = request.data.get("password") or request.data.get("contrasena") or ""
        user = authenticate(request, usuario=usuario, password=password)
        if not user:
            return Response({"detail": "Credenciales inválidas"}, status=status.HTTP_401_UNAUTHORIZED)
        asegurar_bootstrap_admin(user)
        refresh = RefreshToken.for_user(user)
        refresh["usuario"] = user.usuario
        refresh["nombre"] = user.nombre_completo
        refresh["rol"] = user.rol_mesa
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": MeSerializer(user).data,
            }
        )


class LogoutView(APIView):
    def post(self, request):
        refresh = request.data.get("refresh")
        if not refresh:
            return Response({"detail": "Falta refresh token."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            token = RefreshToken(refresh)
            token.blacklist()
        except Exception:
            return Response({"detail": "Token inválido."}, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    def get(self, request):
        asegurar_bootstrap_admin(request.user)
        return Response(MeSerializer(request.user).data)
