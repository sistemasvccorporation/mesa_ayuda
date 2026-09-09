from rest_framework import permissions


def rol_de(user):
    return getattr(user, "rol_mesa", "solicitante") or "solicitante"


class IsAdminMesa(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and rol_de(request.user) == "admin")


class IsTecnicoOrAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and rol_de(request.user) in ("tecnico", "admin")
        )
