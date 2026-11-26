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


# Invite descriptions with Teams' joining text, as Outlook writes them (made-up IDs and numbers).
TEAMS_JOIN = "https://teams.microsoft.com/l/meetup-join/19%3ameeting_ACME123%40thread.v2/0"
LONG_RULE = "_" * 80
SHORT_RULE = "_" * 32

TEAMS_BLOCK = [
    LONG_RULE,
    "Microsoft Teams Need help?<https://aka.ms/JoinTeamsMeeting>",
    "Join the meeting now<" + TEAMS_JOIN + ">",
    "Meeting ID: 111 222 333 444",
    "Passcode: Ab12Cd",
    SHORT_RULE,
    "Dial in by phone",
    "+1 323-555-0100,,123456789# United States, Los Angeles",
    "Find a local number<https://dialin.example/acme>",
    "Phone conference ID: 123 456 789#",
    "Join on a video conferencing device",
    "Tenant key: acme@m.example.com   Video ID: 999 888 777 6   More info<https://help.example/vtc>",
    "For organizers: Meeting options<https://options.example/acme> | Reset dial-in PIN<https://pin.example>",
    LONG_RULE,
]

OLD_TEAMS_BLOCK = [
    LONG_RULE,
    "Microsoft Teams meeting",
    "Join on your computer, mobile app or room device",
    "Click here to join the meeting<" + TEAMS_JOIN + ">",
    "Meeting ID: 555 666 777 888",
    "Passcode: Zz99Yy",
    "Download Teams<https://download.example> | Join on the web<https://web.example>",
    "Learn More<https://aka.ms/JoinTeamsMeeting> | Meeting options<https://options.example/acme>",
    LONG_RULE,
]


def description(lines: List[str]) -> str:
    """lines as an ICS DESCRIPTION property's value (newlines escaped, commas escaped)."""
    return "DESCRIPTION:" + "\\n".join(lines).replace(",", "\\,")
