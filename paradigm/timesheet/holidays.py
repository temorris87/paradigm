"""Holiday rules and the days they fall on. Pure.

A rule is one of:
  "Jul 4", "July 4th"                 a fixed date
  "4th Thu of Nov", "last Mon of May" the nth (1st..5th, first..fifth, last) weekday of a month
  either of them then "+ N" or "- N"  that many days later or earlier ("4th Thu of Nov + 1")
  "2026-12-24"                        one day only
With observed on, a fixed date (no + or -) that falls on a Saturday is taken on the Friday
before, and on a Sunday on the Monday after."""
import re
from datetime import date, timedelta
from typing import Callable, Dict, Iterable, List, NamedTuple, Optional, Tuple

from paradigm.calendar.ics import nth_weekday

__all__ = ["BadRule", "parse_rule", "holiday_days", "US_HOLIDAYS"]

_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
_ORDINALS = {"1st": 1, "first": 1, "2nd": 2, "second": 2, "3rd": 3, "third": 3, "4th": 4, "fourth": 4,
             "5th": 5, "fifth": 5, "last": -1}
_SHIFT = re.compile(r"^(.*?)\s*([+-])\s*(\d{1,3})$")
_FIXED = re.compile(r"^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?$")
_NTH = re.compile(r"^(\w+)\s+([a-z]{3,9})\.?\s+of\s+([a-z]{3,9})\.?$")
_ONE_DAY = re.compile(r"^(\d{4})-(\d\d)-(\d\d)$")

# The holidays seeded on first use: US federal holidays and the day after Thanksgiving. They are
# rules in the Settings tab, to change or remove.
US_HOLIDAYS = [
    ("New Year's Day", "Jan 1"),
    ("Martin Luther King Jr. Day", "3rd Mon of Jan"),
    ("Presidents' Day", "3rd Mon of Feb"),
    ("Memorial Day", "last Mon of May"),
    ("Juneteenth", "Jun 19"),
    ("Independence Day", "Jul 4"),
    ("Labor Day", "1st Mon of Sep"),
    ("Columbus Day", "2nd Mon of Oct"),
    ("Veterans Day", "Nov 11"),
    ("Thanksgiving", "4th Thu of Nov"),
    ("Day after Thanksgiving", "4th Thu of Nov + 1"),
    ("Christmas Day", "Dec 25"),
]


class BadRule(ValueError):
    pass


class Rule(NamedTuple):
    on: Callable[[int], Optional[date]]     # the day in a year (None: not that year)
    fixed: bool                             # a fixed date with no shift: moves off weekends


def _month(word: str) -> int:
    for index, name in enumerate(_MONTHS):
        if word.startswith(name):
            return index + 1
    raise BadRule('"{}" is not a month'.format(word))


def _weekday(word: str) -> int:
    for index, name in enumerate(_DAYS):
        if word.startswith(name):
            return index
    raise BadRule('"{}" is not a day of the week'.format(word))


def parse_rule(text: str) -> Rule:
    rule = " ".join(str(text).lower().split())
    if not rule:
        raise BadRule("A holiday needs a date rule, like Jul 4 or 4th Thu of Nov")
    one = _ONE_DAY.match(rule)
    if one:
        try:
            only = date(int(one.group(1)), int(one.group(2)), int(one.group(3)))
        except ValueError:
            raise BadRule('"{}" is not a date'.format(text)) from None
        return Rule(lambda year: only if year == only.year else None, False)
    shift = 0
    shifted = _SHIFT.match(rule)
    if shifted:
        rule, shift = shifted.group(1), int(shifted.group(3)) * (-1 if shifted.group(2) == "-" else 1)
    fixed = _FIXED.match(rule)
    if fixed:
        month, day = _month(fixed.group(1)), int(fixed.group(2))
        try:
            date(2024, month, day)
        except ValueError:
            raise BadRule('"{}" is not a date'.format(text)) from None

        def on_fixed(year: int) -> Optional[date]:
            try:
                return date(year, month, day) + timedelta(days=shift)
            except ValueError:
                return None     # Feb 29 in a year without one
        return Rule(on_fixed, shift == 0)
    nth = _NTH.match(rule)
    if nth and nth.group(1) in _ORDINALS:
        ordinal, weekday, month = _ORDINALS[nth.group(1)], _weekday(nth.group(2)), _month(nth.group(3))
        return Rule(lambda year: nth_weekday(year, month, ordinal, weekday) + timedelta(days=shift), False)
    raise BadRule('"{}" is not a rule like Jul 4, 4th Thu of Nov, last Mon of May + 1 or 2026-12-24'.format(text))


def holiday_days(holidays: Iterable[Tuple[str, str]], first: date, last: date,
                 observed: bool = True) -> Tuple[Dict[date, str], List[str]]:
    """({day: name} of the holidays between first and last, [rules that can't be read])."""
    found: Dict[date, str] = {}
    bad: List[str] = []
    for name, text in holidays:
        try:
            rule = parse_rule(text)
        except BadRule:
            bad.append("{}: {}".format(name, text))
            continue
        for year in range(first.year - 1, last.year + 2):
            day = rule.on(year)
            if day is None:
                continue
            if observed and rule.fixed:
                if day.weekday() == 5:
                    day -= timedelta(days=1)
                elif day.weekday() == 6:
                    day += timedelta(days=1)
            if first <= day <= last:
                found.setdefault(day, name)
    return found, bad
