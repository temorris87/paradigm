"""PARA hub kinds: what a top-level note can be filed as. None means the Inbox."""
from typing import Optional

from paradigm.notes.meetings import BadWhen, clean_day

# Keep in step with the CHECK in db/migrations/003_hub_kind.sql and static/js/notes/hub-groups.js.
HUB_KINDS = ("project", "area", "resource")


class BadKind(ValueError):
    pass


def clean_kind(kind: object) -> Optional[str]:
    if kind is None or kind in HUB_KINDS:
        return kind
    raise BadKind("kind must be one of {} or null".format(", ".join(HUB_KINDS)))


# A project's state (011_pages.sql); keep in step with static/js/hubs/project-facts.js.
PROJECT_STATUSES = ("active", "on_hold")


class BadProjectField(ValueError):
    pass


def clean_status(status: object) -> str:
    if status in PROJECT_STATUSES:
        return status
    raise BadProjectField("status must be one of {}".format(", ".join(PROJECT_STATUSES)))


def clean_due(due: object) -> str:
    """A due date 'YYYY-MM-DD', or '' for none."""
    if due is None or due == "":
        return ""
    try:
        return clean_day(due)
    except BadWhen as error:
        raise BadProjectField(str(error)) from None


MAX_TIME_CODE_LENGTH = 50


def clean_time_code(code: object) -> str:
    """A timesheet code: one line of text, outer spaces removed ('' for none)."""
    if code is None:
        return ""
    if not isinstance(code, str):
        raise BadProjectField("A time code must be text")
    code = " ".join(code.split())
    if len(code) > MAX_TIME_CODE_LENGTH:
        raise BadProjectField("A time code can be at most {} characters".format(MAX_TIME_CODE_LENGTH))
    if any(ord(char) < 32 for char in code):
        raise BadProjectField("A time code cannot contain control characters")
    return code
