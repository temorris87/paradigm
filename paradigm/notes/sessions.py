"""What a block of time on the calendar may be. Pure."""
from typing import Tuple

from paradigm.notes.meetings import BadWhen, clean_day, clean_time

# The end of the day: a block may run up to midnight.
DAY_END = "24:00"


def clean_span(day: object, start: object, end: object) -> Tuple[str, str, str]:
    """(day, start, end): a real date and two times of that day, end after start."""
    day = clean_day(day)
    start = clean_time(start)
    end = DAY_END if end == DAY_END else clean_time(end)
    if not start or not end:
        raise BadWhen("A block needs a start and an end time")
    if end <= start:
        raise BadWhen("A block must end after it starts")
    return day, start, end


def clean_end(end: object, start: str) -> str:
    """A meeting's end time: '' (none: it lasts the default), or after its start."""
    if end is None or end == "":
        return ""
    end = DAY_END if end == DAY_END else clean_time(end)
    if not start:
        raise BadWhen("A meeting needs a start time before an end time")
    if end <= start:
        raise BadWhen("A meeting must end after it starts")
    return end


def minutes(time: str) -> int:
    return int(time[:2]) * 60 + int(time[3:])
