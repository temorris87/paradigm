"""What a logged follow-up may be (032_follow_up_logs.sql). Pure."""
import unicodedata
from typing import Tuple

from paradigm.notes.meetings import BadWhen, clean_day

__all__ = ["BadFollowUp", "OUTCOMES", "MAX_FOLLOW_UP_NOTE", "clean_follow_up"]

OUTCOMES = ("again", "closed")
MAX_FOLLOW_UP_NOTE = 500


class BadFollowUp(ValueError):
    pass


def clean_follow_up(outcome: object, note: object, next_day: object, today: object) -> Tuple[str, str, str, str]:
    """(outcome, note, next_day, today), cleaned. today is the browser's day: the server never
    guesses the user's. next_day must come after it for "again"; for "closed" it is ''."""
    if outcome not in OUTCOMES:
        raise BadFollowUp("outcome must be again or closed")
    today = _day(today, "today")
    note = clean_note(note)
    if outcome == "closed":
        return outcome, note, "", today
    if next_day is None or next_day == "":
        raise BadFollowUp("Follow up again needs a day")
    next_day = _day(next_day, "next")
    if next_day <= today:
        raise BadFollowUp("The next follow-up must be after today")
    return outcome, note, next_day, today


def clean_note(raw: object) -> str:
    """One line of at most MAX_FOLLOW_UP_NOTE characters ('' for none)."""
    if raw is None:
        return ""
    if not isinstance(raw, str):
        raise BadFollowUp("note must be text")
    note = " ".join(raw.split())
    if len(note) > MAX_FOLLOW_UP_NOTE:
        raise BadFollowUp("A note can be at most {} characters".format(MAX_FOLLOW_UP_NOTE))
    if any(unicodedata.category(char) == "Cc" for char in note):
        raise BadFollowUp("A note cannot contain control characters")
    return note


def _day(raw: object, name: str) -> str:
    try:
        return clean_day(raw)
    except BadWhen as error:
        raise BadFollowUp("{}: {}".format(name, error)) from None
