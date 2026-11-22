"""Generated Outlook-style calendar files for tests (made-up people only)."""
from typing import List, Optional

ZONE = """BEGIN:VTIMEZONE
TZID:Eastern Standard Time
BEGIN:STANDARD
DTSTART:16011104T020000
RRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=11
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:16010311T020000
RRULE:FREQ=YEARLY;BYDAY=2SU;BYMONTH=3
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
END:DAYLIGHT
END:VTIMEZONE"""

OWNER = "me@acme.example"


def event(uid: str, summary: str, start: str, end: str, extra: Optional[List[str]] = None,
          attendees: bool = True) -> str:
    """start/end: 'YYYYMMDDTHHMMSS' in Eastern time."""
    lines = ["BEGIN:VEVENT", "UID:" + uid, "SUMMARY:" + summary,
             "DTSTART;TZID=Eastern Standard Time:" + start, "DTEND;TZID=Eastern Standard Time:" + end]
    if attendees:
        lines += ['ORGANIZER;CN="Shah, Priya":mailto:priya.shah@acme.example',
                  'ATTENDEE;CN="Shah, Priya";PARTSTAT=ACCEPTED:mailto:priya.shah@acme.example',
                  'ATTENDEE;CN=Me Myself;PARTSTAT=ACCEPTED:mailto:' + OWNER,
                  'ATTENDEE;CN=Board Room 4;CUTYPE=ROOM:mailto:room4@acme.example',
                  'ATTENDEE;CN=Dana Lee;PARTSTAT=NEEDS-ACTION:mailto:dana.lee@northwind.example']
    lines += extra or []
    lines.append("END:VEVENT")
    return "\n".join(lines)


def calendar(events: List[str], first: str = "20261123T050000Z", last: str = "20261130T050000Z") -> str:
    text = "\n".join(["BEGIN:VCALENDAR", "VERSION:2.0", "X-OWNER;CN=Me:mailto:" + OWNER,
                      "X-CALSTART:" + first, "X-CALEND:" + last, ZONE] + events + ["END:VCALENDAR"])
    return text.replace("\n", "\r\n")
