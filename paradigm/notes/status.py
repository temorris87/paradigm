"""What a status log entry may hold: its health and its text. Pure. (023_status_logs.sql)"""

HEALTHS = ("on_track", "at_risk", "blocked")
MAX_TEXT_LENGTH = 4000


class BadStatus(ValueError):
    """A health or a text a status log can't take."""


def clean_health(value: object) -> str:
    if value not in HEALTHS:
        raise BadStatus("The health must be one of: on track, at risk, blocked")
    return str(value)


def clean_status_text(value: object) -> str:
    if not isinstance(value, str) or not value.strip():
        raise BadStatus("Say where it stands in a few words")
    text = value.strip().replace("\r\n", "\n")
    if len(text) > MAX_TEXT_LENGTH:
        raise BadStatus("A status can be at most {} characters".format(MAX_TEXT_LENGTH))
    return text
