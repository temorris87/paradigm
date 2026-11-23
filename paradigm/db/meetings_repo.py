"""Every read and write of meetings, their agendas and their attendees. The only code that
knows the meetings and meeting_people tables. A meeting's title is its note's
(NoteRepository renames it), and its minutes are the note's text; it sits directly under its
hub. Meetings in one hub may share a title (a weekly one keeps its name)."""
import sqlite3
from typing import Callable, Dict, Iterable, List, Optional, Tuple

from paradigm.db.connection import Database
from paradigm.db.links_repo import store_links
from paradigm.db.notes_repo import Conflict, NoteError, NotFound, live_note_row, utc_now
from paradigm.db.people_repo import NotAHub, NotAPerson, person_row
from paradigm.notes.hubs import HUB_KINDS
from paradigm.notes.meetings import BadWhen, clean_day, clean_time
from paradigm.notes.sessions import DAY_END, clean_end, minutes
from paradigm.notes.mentions import Mention
from paradigm.notes.titles import BadTitle, clean_title

Clock = Callable[[], str]

__all__ = ["MeetingRepository", "NotAMeeting", "HubArchived", "NotAttending", "NotAHub",
           "NotAPerson", "BadWhen", "BadTitle", "NotFound", "Conflict"]


class NotAMeeting(NoteError):
    pass


class HubArchived(NoteError):
    """No new meeting goes into an archived hub."""


class NotAttending(NoteError):
    pass


class MeetingRepository:
    def __init__(self, db: Database, clock: Clock = utc_now):
        self._db = db
        self._clock = clock

    def list(self) -> List[Dict]:
        """Every meeting whose note is live, with its live attendees."""
        with self._db.reading() as conn:
            rows = conn.execute(
                "SELECT meetings.* FROM meetings JOIN notes ON notes.id = meetings.note_id "
                "WHERE notes.deleted_at IS NULL ORDER BY meetings.note_id"
            ).fetchall()
            attendees = _attendees(conn)
        return [_meeting(row, attendees.get(row["note_id"], [])) for row in rows]

    def get(self, meeting_id: int) -> Dict:
        with self._db.reading() as conn:
            row = _meeting_row(conn, meeting_id)
            return _meeting(row, _attendees(conn, meeting_id).get(meeting_id, []))

    def create(self, hub_id: int, name: object, day: object, time: object = "",
               end_time: object = "") -> Tuple[int, Dict]:
        """A new meeting: a note called name directly under the hub, and its row. Returns
        (note id, meeting)."""
        day, time = clean_day(day), clean_time(time)
        end_time = clean_end(end_time, time)
        title = clean_title(name)
        now = self._clock()
        with self._db.transaction() as conn:
            hub = _hub_row(conn, hub_id)
            if hub["archived_at"] is not None:
                raise HubArchived('"{}" is archived (:restore it first)'.format(hub["title"]))
            note_id = conn.execute(
                "INSERT INTO notes (parent_id, title, body, created_at, updated_at, title_shared) "
                "VALUES (?, ?, '', ?, ?, 1)",
                (hub_id, title, now, now),
            ).lastrowid
            conn.execute("INSERT INTO meetings (note_id, day, time, end_time) VALUES (?, ?, ?, ?)",
                         (note_id, day, time, end_time))
        return note_id, self.get(note_id)

    def update(self, meeting_id: int, day: object, time: object = "", end_time: object = None) -> Dict:
        """Sets the date and time, and the end time (None: it keeps its length)."""
        day, time = clean_day(day), clean_time(time)
        with self._db.transaction() as conn:
            row = _meeting_row(conn, meeting_id)
            end_time = _kept_length(row, time) if end_time is None else clean_end(end_time, time)
            conn.execute("UPDATE meetings SET day = ?, time = ?, end_time = ? WHERE note_id = ?",
                         (day, time, end_time, meeting_id))
        return self.get(meeting_id)

    def set_cancelled(self, meeting_id: int, cancelled: bool) -> Dict:
        """A cancelled meeting stays (struck through) but is never counted as time worked."""
        with self._db.transaction() as conn:
            _meeting_row(conn, meeting_id)
            conn.execute("UPDATE meetings SET cancelled = ? WHERE note_id = ?", (int(cancelled), meeting_id))
            # Cancelled or back on by hand: the next import leaves that alone.
            conn.execute("UPDATE meeting_sources SET cancelled_by_import = 0 WHERE meeting_id = ?", (meeting_id,))
        return self.get(meeting_id)

    def save_agenda(self, meeting_id: int, agenda: str, base_version: int, force: bool = False,
                    links: Optional[List[str]] = None, mentions: Optional[List[Mention]] = None) -> Dict:
        """Saves the agenda, as NoteRepository.save does a body (its own version, Conflict if
        another tab saved it meanwhile). links and mentions are the whole meeting's (minutes
        and agenda), stored with the note's version. Returns {id, agenda, agenda_version}."""
        with self._db.transaction() as conn:
            row = _meeting_row(conn, meeting_id)
            if row["agenda_version"] != base_version and not force:
                raise Conflict(row["agenda_version"])
            version = row["agenda_version"]
            if row["agenda"] != agenda:
                version += 1
                conn.execute("UPDATE meetings SET agenda = ?, agenda_version = ? WHERE note_id = ?",
                             (agenda, version, meeting_id))
                conn.execute("UPDATE notes SET updated_at = ? WHERE id = ?", (self._clock(), meeting_id))
            if links is not None:
                note = live_note_row(conn, meeting_id)
                store_links(conn, meeting_id, note["version"], links, mentions or [])
        return {"id": meeting_id, "agenda": agenda, "version": version}

    def attend(self, meeting_id: int, person_ids: Iterable[int]) -> Tuple[Dict, List[int]]:
        """Makes people attend. Returns (meeting, the ids that were not attending before)."""
        with self._db.transaction() as conn:
            _meeting_row(conn, meeting_id)
            added = []
            for person_id in person_ids:
                person_row(conn, person_id)
                done = conn.execute(
                    "INSERT OR IGNORE INTO meeting_people (meeting_id, person_id) VALUES (?, ?)",
                    (meeting_id, person_id),
                ).rowcount
                if done:
                    added.append(person_id)
        return self.get(meeting_id), added

    def unattend(self, meeting_id: int, person_id: int) -> Dict:
        with self._db.transaction() as conn:
            meeting = live_note_row(conn, meeting_id)
            _meeting_row(conn, meeting_id)
            person = live_note_row(conn, person_id)
            gone = conn.execute("DELETE FROM meeting_people WHERE meeting_id = ? AND person_id = ?",
                                (meeting_id, person_id)).rowcount
            if not gone:
                raise NotAttending('"{}" is not at "{}"'.format(person["title"], meeting["title"]))
        return self.get(meeting_id)


def _meeting(row: sqlite3.Row, attendees: List[int]) -> Dict:
    return {"id": row["note_id"], "day": row["day"], "time": row["time"], "end_time": row["end_time"],
            "cancelled": bool(row["cancelled"]), "location": row["location"], "join_url": row["join_url"],
            "attendees": attendees, "agenda_version": row["agenda_version"],
            "agenda": row["agenda"] if "agenda" in row.keys() else ""}


def _kept_length(row: sqlite3.Row, time: str) -> str:
    """The end time that keeps a meeting as long as it was, starting at time ('' if it had none)."""
    if not time or not row["time"] or not row["end_time"]:
        return ""
    end = minutes(time) + minutes(row["end_time"]) - minutes(row["time"])
    return DAY_END if end >= 24 * 60 else "{:02d}:{:02d}".format(end // 60, end % 60)


def _attendees(conn: sqlite3.Connection, meeting_id=None) -> Dict[int, List[int]]:
    """{meeting id: [person ids]}, only people whose note is live."""
    rows = conn.execute(
        "SELECT meeting_people.* FROM meeting_people JOIN notes ON notes.id = meeting_people.person_id "
        "WHERE notes.deleted_at IS NULL AND (? IS NULL OR meeting_id = ?) ORDER BY person_id",
        (meeting_id, meeting_id),
    ).fetchall()
    found: Dict[int, List[int]] = {}
    for row in rows:
        found.setdefault(row["meeting_id"], []).append(row["person_id"])
    return found


def _meeting_row(conn: sqlite3.Connection, meeting_id: int) -> sqlite3.Row:
    note = live_note_row(conn, meeting_id)
    row = conn.execute("SELECT * FROM meetings WHERE note_id = ?", (meeting_id,)).fetchone()
    if row is None:
        raise NotAMeeting('"{}" is not a meeting'.format(note["title"]))
    return row


def _hub_row(conn: sqlite3.Connection, hub_id: int) -> sqlite3.Row:
    hub = live_note_row(conn, hub_id)
    if hub["is_person"] or hub["parent_id"] is not None or hub["kind"] not in HUB_KINDS:
        raise NotAHub('"{}" is not a hub: meetings go in a project or an area'.format(hub["title"]))
    return hub
