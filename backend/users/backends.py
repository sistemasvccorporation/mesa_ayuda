import hmac

from django.contrib.auth.backends import ModelBackend

from .models import Usuario

HASH_PREFIXES = ("pbkdf2_", "argon2", "bcrypt", "scrypt")


def _plain_match(stored, raw):
    stored = (stored or "").strip()
    raw = (raw or "").strip()
    if not stored or not raw:
        return False
    a = stored.encode("utf-8")
    b = raw.encode("utf-8")
    if len(a) != len(b):
        return False
    return hmac.compare_digest(a, b)


class SigecomBackend(ModelBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        login = (username or kwargs.get("usuario") or "").strip()
        if not login or password is None:
            return None
        user = Usuario.objects.filter(usuario__iexact=login).first()
        if user is None:
            return None
        if user.activo != 1:
            return None

        stored = user.password or ""
        if stored.startswith(HASH_PREFIXES):
            ok = user.check_password(password)
        else:
            ok = _plain_match(stored, password)

        if ok:
            return user
        return None

    def get_user(self, user_id):
        try:
            return Usuario.objects.get(pk=user_id)
        except Usuario.DoesNotExist:
            return None
