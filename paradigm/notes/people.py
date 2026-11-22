"""What a person's fields and a hub role may be. Pure."""
import re
import unicodedata

# Keep in step with the people table (db/migrations/006_people.sql) and static/js/people/.
PERSON_FIELDS = ("org", "job", "email")
_LABELS = {"org": "The organisation", "job": "The job title", "email": "The email"}
MAX_FIELD_LENGTH = 200
MAX_ROLE_LENGTH = 100
# Loose on purpose: only catches a slip such as a name typed into the email field.
_EMAIL = re.compile(r"[^@\s]+@[^@\s]+")


class BadField(ValueError):
    pass


def clean_field(field: object, value: object) -> str:
    """The value on one line with outer spaces removed ('' clears it), or BadField."""
    if field not in PERSON_FIELDS:
        raise BadField("field must be one of {}".format(", ".join(PERSON_FIELDS)))
    text = _one_line(value, _LABELS[field], MAX_FIELD_LENGTH)
    if field == "email" and text and not _EMAIL.fullmatch(text):
        raise BadField('"{}" does not look like an email address'.format(text))
    return text


def clean_role(value: object) -> str:
    return _one_line("" if value is None else value, "A role", MAX_ROLE_LENGTH)


def _one_line(value: object, what: str, limit: int) -> str:
    if not isinstance(value, str):
        raise BadField("{} must be text".format(what))
    text = " ".join(value.split())
    if len(text) > limit:
        raise BadField("{} can be at most {} characters".format(what, limit))
    if any(unicodedata.category(char) == "Cc" for char in text):
        raise BadField("{} cannot contain control characters".format(what))
    return text
