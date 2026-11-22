"""Reading an iCalendar (.ics) file as Outlook's File > Save Calendar writes it. Pure.

Outlook writes every occurrence of a recurring meeting as its own event (an RRULE on it says
only that it recurs), folds long lines, and names its time zones ("Eastern Standard Time"),
describing each in a VTIMEZONE block. Python's zoneinfo has no zone data on Windows without a
package, so times are worked out from those blocks: wall time in the event's zone, to UTC,
to this computer's local time."""
import re
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, NamedTuple, Optional, Tuple

__all__ = ["Calendar", "Event", "Attendee", "read_calendar", "BadCalendar"]


class BadCalendar(ValueError):
    pass


class Attendee(NamedTuple):
    name: str
    email: str          # lower case, '' if none
    partstat: str       # ACCEPTED, DECLINED, TENTATIVE, NEEDS-ACTION ... upper case
    cutype: str         # INDIVIDUAL, ROOM, RESOURCE, GROUP ... upper case


class Event(NamedTuple):
    uid: str
    summary: str
    start: Optional[datetime]       # local, naive; None without a start
    end: Optional[datetime]         # local, naive; None without an end
    all_day: bool
    recurring: bool                 # an RRULE or a RECURRENCE-ID: part of a series
    recurrence_id: Optional[datetime]   # local: the day Outlook first gave this occurrence
    status: str                     # STATUS, upper case
    busy: str                       # X-MICROSOFT-CDO-BUSYSTATUS, upper case
    location: str
    description: str
    organizer: Optional[Attendee]
    attendees: Tuple[Attendee, ...]


class Calendar(NamedTuple):
    owner_email: str                # X-OWNER's email, lower case ('' if none)
    first: Optional[datetime]       # X-CALSTART, local: the start of the range exported
    last: Optional[datetime]        # X-CALEND, local
    events: Tuple[Event, ...]


# ---- lines and properties ----

def unfold(text: str) -> List[str]:
    """The logical lines: a line starting with a space or tab continues the one before."""
    lines: List[str] = []
    for raw in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if raw[:1] in (" ", "\t") and lines:
            lines[-1] += raw[1:]
        elif raw:
            lines.append(raw)
    return lines


def parse_property(line: str) -> Tuple[str, Dict[str, str], str]:
    """(NAME, {PARAM: value}, value): the value starts at the first ':' outside quotes."""
    quoted = False
    for index, char in enumerate(line):
        if char == '"':
            quoted = not quoted
        elif char == ":" and not quoted:
            head, value = line[:index], line[index + 1:]
            break
    else:
        return line.upper(), {}, ""
    parts = _split_params(head)
    params = {}
    for part in parts[1:]:
        key, _, raw = part.partition("=")
        params[key.upper()] = raw[1:-1] if raw[:1] == '"' and raw[-1:] == '"' else raw
    return parts[0].upper(), params, value


def _split_params(head: str) -> List[str]:
    parts, current, quoted = [], "", False
    for char in head:
        if char == '"':
            quoted = not quoted
        if char == ";" and not quoted:
            parts.append(current)
            current = ""
        else:
            current += char
    parts.append(current)
    return parts


def text_value(value: str) -> str:
    """A TEXT value with its escapes undone: an escaped n is a new line; an escaped comma,
    semicolon or backslash is that character."""
    return re.sub(r"\\([nN,;\\])", lambda match: "\n" if match.group(1) in "nN" else match.group(1), value)


# ---- time zones ----

class _Rule(NamedTuple):
    offset: int         # TZOFFSETTO, minutes east of UTC
    month: int          # 0: no yearly rule
    nth: int            # 1..5, -1 last
    weekday: int        # Monday 0
    minute: int         # the minute of the day it starts (wall time before it)


_DAYS = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}


class Zone:
    """One VTIMEZONE: its standard time and, if it has one, its daylight time."""

    def __init__(self, standard: Optional[_Rule], daylight: Optional[_Rule]):
        self.standard = standard
        self.daylight = daylight

    def offset_at(self, wall: datetime) -> int:
        """Minutes east of UTC at a wall-clock time in this zone."""
        standard = self.standard or self.daylight
        if standard is None:
            return 0
        daylight = self.daylight if self.standard else None
        if daylight is None or not daylight.month or not standard.month:
            return standard.offset
        begins = _transition(wall.year, daylight)
        ends = _transition(wall.year, standard)
        if begins < ends:
            in_daylight = begins <= wall < ends
        else:
            in_daylight = not (ends <= wall < begins)
        return daylight.offset if in_daylight else standard.offset


def _transition(year: int, rule: _Rule) -> datetime:
    day = nth_weekday(year, rule.month, rule.nth, rule.weekday)
    return datetime(year, rule.month, day.day) + timedelta(minutes=rule.minute)


def nth_weekday(year: int, month: int, nth: int, weekday: int) -> date:
    """The nth weekday (Monday 0) of a month; nth -1 is the last, 5 the last too if no fifth."""
    first = date(year, month, 1)
    following = date(year + month // 12, month % 12 + 1, 1)
    if nth > 0:
        day = first + timedelta(days=(weekday - first.weekday()) % 7 + 7 * (nth - 1))
        if day < following:
            return day
    last = following - timedelta(days=1)
    return last - timedelta(days=(last.weekday() - weekday) % 7)


def _offset(value: str) -> int:
    match = re.fullmatch(r"([+-])(\d\d)(\d\d)(\d\d)?", value.strip())
    if not match:
        return 0
    minutes = int(match.group(2)) * 60 + int(match.group(3))
    return -minutes if match.group(1) == "-" else minutes


def _rule(props: Dict[str, str]) -> _Rule:
    offset = _offset(props.get("TZOFFSETTO", "+0000"))
    start = props.get("DTSTART", "")
    minute = int(start[9:11]) * 60 + int(start[11:13]) if re.fullmatch(r"\d{8}T\d{6}", start) else 0
    month, nth, weekday = 0, 0, 0
    rrule = _rrule(props.get("RRULE", ""))
    if rrule.get("FREQ") == "YEARLY" and rrule.get("BYMONTH", "").isdigit():
        match = re.fullmatch(r"([+-]?\d)?(MO|TU|WE|TH|FR|SA|SU)", rrule.get("BYDAY", ""))
        if match:
            month = int(rrule["BYMONTH"])
            nth = int(match.group(1) or 1)
            weekday = _DAYS[match.group(2)]
    return _Rule(offset, month, nth, weekday, minute)


def _rrule(value: str) -> Dict[str, str]:
    return {key.upper(): raw for key, _, raw in (part.partition("=") for part in value.split(";")) if key}


# ---- dates and times ----

_WHEN = re.compile(r"(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)?(Z)?)?")


class _When(NamedTuple):
    local: Optional[datetime]
    all_day: bool


def _when(value: str, params: Dict[str, str], zones: Dict[str, Zone], to_local) -> _When:
    match = _WHEN.fullmatch(value.strip())
    if not match:
        return _When(None, False)
    year, month, day = int(match.group(1)), int(match.group(2)), int(match.group(3))
    try:
        if match.group(4) is None or params.get("VALUE", "").upper() == "DATE":
            return _When(datetime(year, month, day), True)
        wall = datetime(year, month, day, int(match.group(4)), int(match.group(5)), int(match.group(6) or 0))
    except ValueError:
        return _When(None, False)
    if match.group(7):
        return _When(to_local(wall.replace(tzinfo=timezone.utc)), False)
    zone = zones.get(params.get("TZID", ""))
    if zone is None:
        # A floating time, or a zone the file doesn't describe: taken as written.
        return _When(wall, False)
    utc = wall - timedelta(minutes=zone.offset_at(wall))
    return _When(to_local(utc.replace(tzinfo=timezone.utc)), False)


def system_local(moment: datetime) -> datetime:
    """An aware time as this computer's local wall-clock time (naive)."""
    return moment.astimezone().replace(tzinfo=None)


_DURATION = re.compile(r"([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?")


def _duration(value: str) -> Optional[timedelta]:
    match = _DURATION.fullmatch(value.strip())
    if not match or value.strip() in ("P", "PT"):
        return None
    weeks, days, hours, minutes, seconds = (int(part or 0) for part in match.groups()[1:])
    span = timedelta(weeks=weeks, days=days, hours=hours, minutes=minutes, seconds=seconds)
    return -span if match.group(1) == "-" else span


def _person(value: str, params: Dict[str, str]) -> Attendee:
    email = value[7:] if value.lower().startswith("mailto:") else ""
    return Attendee(" ".join(params.get("CN", "").split()), email.strip().lower(),
                    params.get("PARTSTAT", "").upper(), params.get("CUTYPE", "INDIVIDUAL").upper())


# ---- the file ----

def read_calendar(text: str, to_local=system_local) -> Calendar:
    """The calendar in an .ics file's text. to_local turns an aware time into local naive time."""
    lines = unfold(text)
    head = parse_property(lines[0].lstrip("\ufeff")) if lines else ("", {}, "")
    if head[0] != "BEGIN" or head[2].strip().upper() != "VCALENDAR":
        raise BadCalendar("This is not a calendar file (.ics)")
    zones = _zones(lines)
    owner, first, last = "", None, None
    events: List[Event] = []
    stack: List[str] = []
    props: List[Tuple[str, Dict[str, str], str]] = []
    for line in lines:
        name, params, value = parse_property(line)
        if name == "BEGIN":
            stack.append(value.upper())
            if stack[-1] == "VEVENT":
                props = []
            continue
        if name == "END":
            if stack and stack[-1] == "VEVENT" and value.upper() == "VEVENT":
                events.append(_event(props, zones, to_local))
            if stack:
                stack.pop()
            continue
        if stack == ["VCALENDAR"]:
            if name == "X-OWNER":
                owner = _person(value, params).email
            elif name == "X-CALSTART":
                first = _when(value, params, zones, to_local).local
            elif name == "X-CALEND":
                last = _when(value, params, zones, to_local).local
        elif stack and stack[-1] == "VEVENT":
            props.append((name, params, value))
    return Calendar(owner, first, last, tuple(events))


def _zones(lines: List[str]) -> Dict[str, Zone]:
    zones: Dict[str, Zone] = {}
    tzid, part, rules, props = "", "", {}, {}
    for line in lines:
        name, _, value = parse_property(line)
        if name == "BEGIN" and value.upper() == "VTIMEZONE":
            tzid, rules = "", {}
        elif name == "BEGIN" and value.upper() in ("STANDARD", "DAYLIGHT"):
            part, props = value.upper(), {}
        elif name == "END" and value.upper() in ("STANDARD", "DAYLIGHT"):
            # Of several blocks of one kind (history), the one starting last is the rule now.
            if part not in rules or props.get("DTSTART", "") >= rules[part][1]:
                rules[part] = (_rule(props), props.get("DTSTART", ""))
            part = ""
        elif name == "END" and value.upper() == "VTIMEZONE":
            if tzid:
                zones[tzid] = Zone(rules.get("STANDARD", (None,))[0], rules.get("DAYLIGHT", (None,))[0])
        elif name == "TZID" and not part:
            tzid = value
        elif part:
            props[name] = value
    return zones


def _event(props: List[Tuple[str, Dict[str, str], str]], zones: Dict[str, Zone], to_local) -> Event:
    found: Dict[str, Tuple[Dict[str, str], str]] = {}
    attendees: List[Attendee] = []
    for name, params, value in props:
        if name == "ATTENDEE":
            attendees.append(_person(value, params))
        else:
            found.setdefault(name, (params, value))

    def text(name: str) -> str:
        return text_value(found[name][1]) if name in found else ""

    def when(name: str) -> _When:
        return _when(found[name][1], found[name][0], zones, to_local) if name in found else _When(None, False)

    start = when("DTSTART")
    end = when("DTEND").local
    if end is None and "DURATION" in found and start.local is not None:
        span = _duration(found["DURATION"][1])
        end = start.local + span if span else None
    organizer = _person(found["ORGANIZER"][1], found["ORGANIZER"][0]) if "ORGANIZER" in found else None
    return Event(
        uid=found.get("UID", ({}, ""))[1].strip(),
        summary=" ".join(text("SUMMARY").split()),
        start=start.local,
        end=end,
        all_day=start.all_day,
        recurring="RRULE" in found or "RECURRENCE-ID" in found,
        recurrence_id=when("RECURRENCE-ID").local,
        status=found.get("STATUS", ({}, ""))[1].strip().upper(),
        busy=found.get("X-MICROSOFT-CDO-BUSYSTATUS", ({}, ""))[1].strip().upper(),
        location=" ".join(text("LOCATION").split()),
        description=text("DESCRIPTION"),
        organizer=organizer,
        attendees=tuple(attendees),
    )
