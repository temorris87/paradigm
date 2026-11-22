"""Days on this computer's calendar, and counting working days over them. Pure, apart from
local_today."""
from datetime import date, timedelta
from typing import Collection

__all__ = ["local_today", "is_working_day", "add_working_days", "working_days_between"]


def local_today() -> str:
    return date.today().isoformat()


def is_working_day(day: date, holidays: Collection[date] = ()) -> bool:
    return day.weekday() < 5 and day not in holidays


def first_working_day(day: date, holidays: Collection[date] = ()) -> date:
    """day, or the next working day after it."""
    while not is_working_day(day, holidays):
        day += timedelta(days=1)
    return day


def add_working_days(start: date, count: int, holidays: Collection[date] = ()) -> date:
    """The working day count working days after start (start itself moved onto a working
    day first): 0 is start's own working day."""
    day = first_working_day(start, holidays)
    step = 1 if count >= 0 else -1
    for _ in range(abs(count)):
        day += timedelta(days=step)
        while not is_working_day(day, holidays):
            day += timedelta(days=step)
    return day


def working_days_between(first: date, last: date, holidays: Collection[date] = ()) -> int:
    """How many working days after first's working day last is (0 when they share one;
    negative when last is earlier)."""
    if last < first:
        return -working_days_between(last, first, holidays)
    day, count = first_working_day(first, holidays), 0
    target = first_working_day(last, holidays)
    while day < target:
        day += timedelta(days=1)
        if is_working_day(day, holidays):
            count += 1
    return count
