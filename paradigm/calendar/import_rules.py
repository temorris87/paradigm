"""What the Outlook import makes of each event: whether it is skipped or cancelled, its
meeting's title, times, agenda and join link, and who attends. Pure. (The rules are those of
worknotes' import, which Tyson used for a year.)"""
import re
from datetime import datetime, timedelta
from typing import List, NamedTuple, Optional, Tuple

from paradigm.calendar.ics import Attendee, Event
from paradigm.notes.titles import FORBIDDEN, MAX_TITLE_LENGTH

# More invitees than this is a broadcast: nobody is added.
MAX_ATTENDEES = 20
MAX_AGENDA_LENGTH = 20000
_CANCELLED_PREFIX = re.compile(r"^\s*(?:canceled|cancelled)\s*:\s*", re.IGNORECASE)
_SKIPPED_BUSY = ("FREE", "TENTATIVE", "OOF", "WORKINGELSEWHERE")
_JOIN = re.compile(
    r"https://(?:[\w-]+\.)*(?:teams\.microsoft\.com/l/meetup-join|teams\.live\.com/meet|meet\.google\.com|"
    r"(?:[\w-]+\.)?zoom(?:gov)?\.us/[jw]|[\w-]+\.webex\.com/)[^\s<>\"]*", re.IGNORECASE)
_URL = re.compile(r"<?https?://[^\s<>\"]+>?", re.IGNORECASE)


class Span(NamedTuple):
    day: str        # 'YYYY-MM-DD'
    time: str       # 'HH:MM'
    end_time: str   # 'HH:MM', '24:00', or '' when it ends on another day or has no end


class Person(NamedTuple):
    name: str       # as Outlook gives it: "Shah, Priya" or "Priya Shah"
    email: str


def owner_answer(event: Event, owner: str) -> str:
    """How the calendar's owner answered the invite (upper case, '' if not listed)."""
    if not owner:
        return ""
    return next((each.partstat for each in event.attendees if each.email == owner), "")


def is_cancelled(event: Event, owner: str) -> bool:
    """Cancelled by its organiser, or declined by the owner."""
    return (event.status == "CANCELLED" or bool(_CANCELLED_PREFIX.match(event.summary))
            or owner_answer(event, owner) == "DECLINED")


def skipped(event: Event, owner: str) -> bool:
    """Never imported: all-day entries, time shown as free, tentative, out of office or working
    elsewhere, invites the owner hasn't accepted for sure, and events with no start or title."""
    return (event.all_day or event.start is None or event.busy in _SKIPPED_BUSY
            or owner_answer(event, owner) == "TENTATIVE" or not meeting_title(event.summary)
            or not event.uid)


def meeting_title(summary: str) -> str:
    """The meeting's title: the summary without a "Canceled:" prefix and the characters a title
    can't hold ('' if nothing is left)."""
    title = _CANCELLED_PREFIX.sub("", summary)
    title = title.replace("/", "-").replace("#", "")
    title = "".join(char for char in title if char not in FORBIDDEN and ord(char) >= 32)
    return " ".join(title.split())[:MAX_TITLE_LENGTH].strip()


def span(event: Event) -> Span:
    start = event.start
    end = event.end
    end_time = ""
    if end is not None and end > start:
        if end.date() == start.date():
            end_time = end.strftime("%H:%M")
        elif end == datetime.combine(start.date() + timedelta(days=1), datetime.min.time()):
            end_time = "24:00"
    return Span(start.date().isoformat(), start.strftime("%H:%M"), end_time)


def join_url(event: Event) -> str:
    """The online meeting's link (Teams, Zoom, Meet, Webex): from the location, else the text."""
    for text in (event.location, event.description):
        match = _JOIN.search(text or "")
        if match:
            return match.group(0).rstrip(">).,;")
    return ""


def location(event: Event) -> str:
    """The location without links (a Teams meeting's is one)."""
    return " ".join(_URL.sub("", event.location).replace(";", " ").split()).strip(" ,")


def agenda(description: str) -> str:
    """The invite's text as an agenda: Teams' joining block and caution banners dropped, blank
    runs closed up."""
    lines: List[str] = []
    skipping = False
    for line in description.replace("\r\n", "\n").split("\n"):
        rule = re.fullmatch(r"\s*_{8,}\s*", line) is not None
        if rule:
            skipping = not skipping
            continue
        if skipping or re.search(r"\*{2,}\s*CAUTION", line, re.IGNORECASE):
            continue
        line = re.sub(r"<(https?://[^>\s]+)>", r"\1", line.rstrip())
        lines.append(re.sub(r"^(\s*)\* ", r"\1- ", line))
    text = re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()
    return text[:MAX_AGENDA_LENGTH]


def attendees(event: Event, owner: str) -> List[Person]:
    """Who attends: the invitees and the organiser, without the owner, rooms, resources and
    groups, each once; nobody when more than MAX_ATTENDEES are invited."""
    found: List[Person] = []
    seen = set()
    everyone = list(event.attendees) + ([event.organizer] if event.organizer else [])
    for each in everyone:
        if each.cutype in ("ROOM", "RESOURCE", "GROUP") or each.name.upper().startswith("RSRC"):
            continue
        key = each.email or each.name.casefold()
        if not key or key == owner or key in seen:
            continue
        seen.add(key)
        found.append(Person(each.name, each.email))
    return [] if len(found) > MAX_ATTENDEES else found


def split_person_name(person: Person) -> Tuple[str, str]:
    """(first, last) from "Last, First", "First Last", or the email's "first.last"."""
    name = re.sub(r"\(.*?\)|\[.*?\]", " ", person.name)
    name = "".join(char for char in name if char not in FORBIDDEN)
    if "," in name:
        last, _, first = name.partition(",")
        first, last = " ".join(first.split()), " ".join(last.split())
        if first and last:
            return first.split()[0], last
    words = name.split()
    if not words and person.email:
        local = person.email.split("@")[0]
        words = [part.capitalize() for part in re.split(r"[._]+", local) if part and not part.isdigit()]
    if not words:
        return "", ""
    if len(words) == 1:
        return words[0], ""
    return words[0], " ".join(words[1:])


def moved_from(event: Event, day: str, known_days: List[str], seen_days: List[str], today: str) -> Optional[str]:
    """The day this event's meeting was on before it moved, or None (not moved). An occurrence
    of a series names its old day (RECURRENCE-ID); a one-off moves from the nearest day it is
    known on, today or later, that the file no longer has."""
    candidates = [known for known in known_days if known >= today and known != day and known not in seen_days]
    if event.recurrence_id is not None:
        old = event.recurrence_id.date().isoformat()
        return old if old in candidates else None
    if event.recurring or not candidates:
        return None
    target = datetime.fromisoformat(day)
    return min(candidates, key=lambda known: abs((datetime.fromisoformat(known) - target).days))
