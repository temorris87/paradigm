"""What a plan's dates may be: a phase's start and end, a milestone's day, the reason a date
moved. Pure. (018_phases.sql)"""
from typing import Tuple

from paradigm.notes.meetings import BadWhen, clean_day

MAX_REASON_LENGTH = 300


def clean_span_days(start: object, end: object) -> Tuple[str, str]:
    start, end = clean_day(start), clean_day(end)
    if end < start:
        raise BadWhen("A phase must end on or after the day it starts")
    return start, end


def clean_reason(reason: object) -> str:
    if reason is None:
        return ""
    if not isinstance(reason, str):
        raise BadWhen("A reason must be text")
    reason = " ".join(reason.split())
    if len(reason) > MAX_REASON_LENGTH:
        raise BadWhen("A reason can be at most {} characters".format(MAX_REASON_LENGTH))
    return reason
