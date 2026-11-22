"""What a task's fields may be. Pure. (017_task_records.sql)"""
import unicodedata

from paradigm.notes.meetings import BadWhen, clean_day

MAX_TASK_TITLE = 500
MAX_TASK_NOTES = 5000


class BadTask(ValueError):
    pass


def clean_task_title(raw: object) -> str:
    if not isinstance(raw, str):
        raise BadTask("A task must be text")
    title = " ".join(raw.split())
    if not title:
        raise BadTask("A task needs some text")
    if len(title) > MAX_TASK_TITLE:
        raise BadTask("A task can be at most {} characters".format(MAX_TASK_TITLE))
    if any(unicodedata.category(char) == "Cc" for char in title):
        raise BadTask("A task cannot contain control characters")
    return title


def clean_task_notes(raw: object) -> str:
    if raw is None:
        return ""
    if not isinstance(raw, str) or len(raw) > MAX_TASK_NOTES:
        raise BadTask("A task's notes must be text of at most {} characters".format(MAX_TASK_NOTES))
    return raw.replace("\r\n", "\n").strip()


def clean_optional_day(raw: object) -> str:
    """'YYYY-MM-DD', or '' for none."""
    if raw is None or raw == "":
        return ""
    try:
        return clean_day(raw)
    except BadWhen as error:
        raise BadTask(str(error)) from None
