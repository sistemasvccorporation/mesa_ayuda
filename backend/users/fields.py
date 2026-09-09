from django.db import models


class SafeDateField(models.DateField):
    """Legacy SIGeCom stores 0000-00-00 in DATE columns."""

    def from_db_value(self, value, expression, connection):
        if value in (None, "", "0000-00-00"):
            return None
        text = str(value)
        if text.startswith("0000"):
            return None
        return value

    def to_python(self, value):
        if value in (None, "", "0000-00-00"):
            return None
        text = str(value)
        if text.startswith("0000"):
            return None
        return super().to_python(value)
