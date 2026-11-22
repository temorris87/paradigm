"""Every read and write of meetings and their attendees. The only code that knows the
meetings and meeting_people tables. A meeting's title is its note's (NoteRepository renames
it); its hub is its top-level note."""
import sqlite3
from typing import Callable, Dict, Iterable, List, Tuple

from paradigm.db.connection import Database
from paradigm.db.notes_repo import NoteError, NotFound, check_title_free, live_note_row, utc_now
from paradigm.db.people_repo import NotAHub, NotAPerson, person_row
from paradigm.notes.hubs import HUB_KINDS
from paradigm.notes.meetings import BadWhen, clean_day, clean_time, meeting_title, retitle
from paradigm.notes.titles import BadTitle, clean_title

Clock = Callable[[], str]

__all__ = ["MeetingRepository", "NotAMeeting", "HubArchived", "NotAttending", "NotAHub",
           "NotAPerson", "BadWhen", "BadTitle", "NotFound"]


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

    def create(self, hub_id: int, name: object, day: object, time: object = "") -> Tuple[int, Dict]:
        """A new meeting: a note called '{day} {name}' directly under the hub, and its row.
        Returns (note id, meeting)."""
        day, time = clean_day(day), clean_time(time)
        title = clean_title(meeting_title(day, clean_title(name)))
        now = self._clock()
        with self._db.transaction() as conn:
            hub = _hub_row(conn, hub_id)
            if hub["archived_at"] is not None:
                raise HubArchived('"{}" is archived (:restore it first)'.format(hub["title"]))
            check_title_free(conn, hub_id, title, None)
            note_id = conn.execute(
                "INSERT INTO notes (parent_id, title, body, created_at, updated_at) VALUES (?, ?, '', ?, ?)",
                (hub_id, title, now, now),
            ).lastrowid
            conn.execute("INSERT INTO meetings (note_id, day, time) VALUES (?, ?, ?)", (note_id, day, time))
        return note_id, self.get(note_id)

    def update(self, meeting_id: int, day: object, time: object = "") -> Dict:
        """Sets the date and time. A title starting with the old date gets the new one."""
        day, time = clean_day(day), clean_time(time)
        with self._db.transaction() as conn:
            row = _meeting_row(conn, meeting_id)
            note = live_note_row(conn, meeting_id)
            title = retitle(note["title"], row["day"], day)
            if title != note["title"]:
                check_title_free(conn, note["parent_id"], title, meeting_id)
                conn.execute("UPDATE notes SET title = ?, updated_at = ? WHERE id = ?",
                             (title, self._clock(), meeting_id))
            conn.execute("UPDATE meetings SET day = ?, time = ? WHERE note_id = ?", (day, time, meeting_id))
        return self.get(meeting_id)

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
    return {"id": row["note_id"], "day": row["day"], "time": row["time"], "attendees": attendees}


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
        raise NotAHub('"{}" is not a hub: meetings go in a project, an area or a resource'.format(hub["title"]))
    return hub
