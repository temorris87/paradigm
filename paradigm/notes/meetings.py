"""What a meeting's date and time may be. Pure. (Its title is any note title: meetings in
one hub may share one, 011_pages.sql.)"""
from datetime import date

# Keep in step with db/migrations/007_meetings.sql and static/js/meetings/.


class BadWhen(ValueError):
    pass


def clean_day(value: object) -> str:
    """A real calendar date as 'YYYY-MM-DD', or BadWhen."""
    if not isinstance(value, str) or len(value) != 10:
        raise BadWhen("The date must look like 2026-11-24")
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError:
        raise BadWhen('"{}" is not a date like 2026-11-24'.format(value))


def clean_time(value: object) -> str:
    """'HH:MM' on a 24-hour clock, or '' for no time; else BadWhen."""
    if value is None or value == "":
        return ""
    if not isinstance(value, str) or len(value) != 5 or value[2] != ":" \
            or not (value[:2] + value[3:]).isdigit():
        raise BadWhen("The time must look like 14:30")
    if int(value[:2]) > 23 or int(value[3:]) > 59:
        raise BadWhen('"{}" is not a time of day'.format(value))
    return value
