"""The Outlook import (015_import.sql): applies a calendar file's events to the meetings. The
only code that knows meeting_sources, import_pending and import_log.

Each event Outlook exports is one occurrence, named by its uid and the day it was first on. A
known one is kept up to date (time, end, place, link; cancelled or back on); one that moved
day follows; a new one goes straight into its hub when its series already has meetings there,
and waits in the To file list otherwise. A known meeting the file should hold (its time inside
the range exported) but doesn't is cancelled."""
import json
import logging
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Optional, Set

from paradigm.calendar import import_rules as rules
from paradigm.calendar.ics import BadCalendar, Calendar, Event, read_calendar, system_local
from paradigm.db.connection import Database
from paradigm.db.notes_repo import NoteError, NotFound, TitleTaken, check_title_free, live_note_row, utc_now
from paradigm.db.people_repo import NotAHub
from paradigm.notes.days import local_today
from paradigm.notes.hubs import HUB_KINDS
from paradigm.notes.people import full_name
from paradigm.notes.titles import BadTitle, clean_title

log = logging.getLogger("paradigm")

__all__ = ["ImportRepository", "BadCalendar", "NotAHub", "NotFound", "HubArchived"]

# The largest calendar file read (a week of a busy calendar is well under 1 MB).
MAX_FILE_BYTES = 20 * 1024 * 1024


class HubArchived(NoteError):
    pass


def _counts() -> Dict[str, int]:
    return {"new": 0, "to_file": 0, "updated": 0, "moved": 0, "cancelled": 0, "back_on": 0, "skipped": 0,
            "people": 0, "files": 0}


class ImportRepository:
    def __init__(self, db: Database, folder: Path, clock: Callable[[], str] = utc_now,
                 today: Callable[[], str] = local_today, to_local=system_local):
        self._db = db
        self.folder = folder
        self._clock = clock
        self._today = today
        self._to_local = to_local

    # ---- what the calendar shows ----

    def status(self) -> Dict:
        with self._db.reading() as conn:
            last = conn.execute("SELECT max(day) FROM import_log").fetchone()[0]
        return {"imported_today": last == self._today(), "last_day": last or "", "waiting": len(self._waiting()),
                "folder": str(self.folder)}

    def pending(self) -> List[Dict]:
        """The To file list, soonest first, each with the hub its name went to last (or None)."""
        with self._db.reading() as conn:
            rows = conn.execute("SELECT * FROM import_pending WHERE ignored = 0 ORDER BY day, time, id").fetchall()
            return [dict(_pending(row), hub_guess=_hub_guess(conn, row["title"])) for row in rows]

    # ---- importing ----

    def import_folder(self) -> Dict:
        """Imports every .ics waiting in the folder, oldest first, and deletes each once read
        (one that can't be read is renamed *.unreadable, so it isn't tried again)."""
        total = _counts()
        errors = []
        for path in self._waiting():
            try:
                data = path.read_bytes()[:MAX_FILE_BYTES]
                counts = self.import_text(data.decode("utf-8", errors="replace"))
            except BadCalendar as error:
                errors.append("{}: {}".format(path.name, error))
                _rename(path, path.with_name(path.name + ".unreadable"))
                continue
            except OSError as error:
                errors.append("{}: {}".format(path.name, error))
                continue
            for key, value in counts.items():
                total[key] += value
            _remove(path)
        return dict(total, errors=errors)

    def import_text(self, text: str) -> Dict:
        calendar = read_calendar(text, self._to_local)
        counts = _counts()
        with self._db.transaction() as conn:
            _Importer(conn, calendar, counts, self._clock(), self._today()).run()
            conn.execute("INSERT INTO import_log (day, at) VALUES (?, ?) ON CONFLICT (day) DO UPDATE SET at = excluded.at",
                         (self._today(), self._clock()))
        counts["files"] = 1
        return counts

    def file(self, pending_ids: Iterable[int], hub_id: int) -> List[int]:
        """Makes the waiting events meetings in a hub. Returns the meeting ids."""
        made = []
        with self._db.transaction() as conn:
            hub = _hub_row(conn, hub_id)
            counts = _counts()
            for pending_id in pending_ids:
                row = conn.execute("SELECT * FROM import_pending WHERE id = ? AND ignored = 0", (pending_id,)).fetchone()
                if row is None:
                    raise NotFound("No such event to file: {}".format(pending_id))
                made.append(_make_meeting(conn, hub["id"], _pending(row), self._clock(), counts))
                conn.execute("DELETE FROM import_pending WHERE id = ?", (pending_id,))
        return made

    def ignore(self, pending_ids: Iterable[int]) -> None:
        """Don't import: the events leave the list, and later exports don't bring them back."""
        with self._db.transaction() as conn:
            conn.executemany("UPDATE import_pending SET ignored = 1 WHERE id = ?", [(each,) for each in pending_ids])

    def _waiting(self) -> List[Path]:
        if not self.folder.is_dir():
            return []
        found = [path for path in self.folder.iterdir() if path.suffix.lower() == ".ics" and path.is_file()]
        return sorted(found, key=lambda path: (path.stat().st_mtime, path.name))


class _Importer:
    """One calendar file applied inside one transaction."""

    def __init__(self, conn: sqlite3.Connection, calendar: Calendar, counts: Dict[str, int], now: str, today: str):
        self.conn = conn
        self.calendar = calendar
        self.counts = counts
        self.now = now
        self.today = today
        self.owner = calendar.owner_email
        # {uid: {day: meeting row}} of the meetings made from earlier imports. A trashed one is
        # left alone (it was thrown away on purpose: the import doesn't make it again).
        self.known: Dict[str, Dict[str, sqlite3.Row]] = {}
        for row in conn.execute(
                "SELECT meeting_sources.*, meetings.day AS meeting_day, meetings.time, meetings.end_time, "
                "meetings.cancelled, meetings.location, meetings.join_url, notes.parent_id AS hub_id, "
                "notes.deleted_at FROM meeting_sources JOIN meetings ON meetings.note_id = meeting_sources.meeting_id "
                "JOIN notes ON notes.id = meeting_sources.meeting_id"):
            self.known.setdefault(row["uid"], {})[row["day"]] = row
        self.events = [event for event in calendar.events if event.uid and event.start is not None]
        self.seen: Dict[str, Set[str]] = {}
        for event in self.events:
            self.seen.setdefault(event.uid, set()).add(event.start.date().isoformat())

    def run(self) -> None:
        for event in self.events:
            self.event(event)
        self.removed()

    def event(self, event: Event) -> None:
        day = event.start.date().isoformat()
        known = self.known.get(event.uid, {})
        if day in known and known[day]["deleted_at"] is not None:
            return
        if rules.is_cancelled(event, self.owner):
            if day in known:
                self.cancel(known[day])
            self.conn.execute("DELETE FROM import_pending WHERE uid = ? AND day = ? AND ignored = 0", (event.uid, day))
            return
        if rules.skipped(event, self.owner):
            self.counts["skipped"] += 1
            return
        fields = _fields(event, self.owner)
        if day in known:
            self.update(known[day], fields)
            return
        live = [known_day for known_day, row in known.items() if row["deleted_at"] is None]
        old = rules.moved_from(event, day, live, list(self.seen.get(event.uid, ())), self.today)
        if old is not None:
            self.conn.execute("UPDATE meeting_sources SET day = ? WHERE uid = ? AND day = ?", (day, event.uid, old))
            self.update(known[old], fields, moved=True)
            known[day] = known.pop(old)
            return
        waiting = self.conn.execute("SELECT id FROM import_pending WHERE uid = ? AND day = ?", (event.uid, day)).fetchone()
        if waiting is not None:
            self.conn.execute(
                "UPDATE import_pending SET time = ?, end_time = ?, title = ?, location = ?, join_url = ?, agenda = ?, "
                "attendees = ? WHERE id = ?",
                (fields["time"], fields["end_time"], fields["title"], fields["location"], fields["join_url"],
                 fields["agenda"], json.dumps(fields["attendees"]), waiting["id"]))
            return
        hub_id = self.series_hub(event, known)
        if hub_id is not None:
            meeting_id = _make_meeting(self.conn, hub_id, fields, self.now, self.counts)
            row = self.conn.execute(
                "SELECT meeting_sources.*, meetings.day AS meeting_day, meetings.time, meetings.end_time, "
                "meetings.cancelled, meetings.location, meetings.join_url, ? AS hub_id, NULL AS deleted_at "
                "FROM meeting_sources "
                "JOIN meetings ON meetings.note_id = meeting_id WHERE meeting_id = ?", (hub_id, meeting_id)).fetchone()
            self.known.setdefault(event.uid, {})[day] = row
            self.counts["new"] += 1
            return
        self.conn.execute(
            "INSERT INTO import_pending (uid, day, time, end_time, title, recurring, location, join_url, agenda, attendees) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (event.uid, day, fields["time"], fields["end_time"], fields["title"], int(event.recurring),
             fields["location"], fields["join_url"], fields["agenda"], json.dumps(fields["attendees"])))
        self.counts["to_file"] += 1

    def series_hub(self, event: Event, known: Dict[str, sqlite3.Row]) -> Optional[int]:
        """The hub this series' meetings are in (the latest one's), if it is live and not archived."""
        live = [row for row in known.values() if row["deleted_at"] is None]
        if not event.recurring or not live:
            return None
        latest = max(live, key=lambda row: row["meeting_day"])
        hub = self.conn.execute("SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL",
                                (latest["hub_id"],)).fetchone()
        return None if hub is None else hub["id"]

    def update(self, row: sqlite3.Row, fields: Dict, moved: bool = False) -> None:
        new = (fields["day"], fields["time"], fields["end_time"], fields["location"] or row["location"],
               fields["join_url"] or row["join_url"])
        old = (row["meeting_day"], row["time"], row["end_time"], row["location"], row["join_url"])
        if new != old:
            self.conn.execute(
                "UPDATE meetings SET day = ?, time = ?, end_time = ?, location = ?, join_url = ? WHERE note_id = ?",
                new + (row["meeting_id"],))
            self.counts["moved" if moved else "updated"] += 1
        if row["cancelled"] and row["cancelled_by_import"]:
            self.conn.execute("UPDATE meetings SET cancelled = 0 WHERE note_id = ?", (row["meeting_id"],))
            self.conn.execute("UPDATE meeting_sources SET cancelled_by_import = 0 WHERE meeting_id = ?",
                              (row["meeting_id"],))
            self.counts["back_on"] += 1

    def cancel(self, row: sqlite3.Row) -> None:
        if row["cancelled"]:
            return
        self.conn.execute("UPDATE meetings SET cancelled = 1 WHERE note_id = ?", (row["meeting_id"],))
        self.conn.execute("UPDATE meeting_sources SET cancelled_by_import = 1 WHERE meeting_id = ?", (row["meeting_id"],))
        self.counts["cancelled"] += 1

    def removed(self) -> None:
        """Known meetings from today on, inside the range the file covers, that it no longer
        holds: cancelled in Outlook (or deleted there). Waiting ones just leave the list."""
        first, last = self.calendar.first, self.calendar.last
        if first is None or last is None:
            return
        for uid, days in self.known.items():
            for day, row in days.items():
                if day < self.today or day in self.seen.get(uid, ()) or row["deleted_at"] is not None:
                    continue
                if _inside(row["meeting_day"], row["time"], first, last):
                    self.cancel(row)
        for row in self.conn.execute("SELECT id, uid, day, time FROM import_pending WHERE ignored = 0").fetchall():
            if row["day"] not in self.seen.get(row["uid"], ()) and _inside(row["day"], row["time"], first, last):
                self.conn.execute("DELETE FROM import_pending WHERE id = ?", (row["id"],))


def _inside(day: str, time: str, first: datetime, last: datetime) -> bool:
    start = datetime.fromisoformat(day + "T" + (time or "00:00"))
    if time:
        return first <= start < last
    return first <= start and start + timedelta(days=1) <= last


def _fields(event: Event, owner: str) -> Dict:
    span = rules.span(event)
    return {"day": span.day, "time": span.time, "end_time": span.end_time, "title": rules.meeting_title(event.summary),
            "location": rules.location(event), "join_url": rules.join_url(event),
            "agenda": rules.agenda(event.description), "uid": event.uid,
            "attendees": [list(person) for person in rules.attendees(event, owner)]}


def _pending(row: sqlite3.Row) -> Dict:
    return {"id": row["id"], "uid": row["uid"], "day": row["day"], "time": row["time"], "end_time": row["end_time"],
            "title": row["title"], "recurring": bool(row["recurring"]), "location": row["location"],
            "join_url": row["join_url"], "agenda": row["agenda"], "attendees": json.loads(row["attendees"])}


def _hub_guess(conn: sqlite3.Connection, title: str) -> Optional[int]:
    """The hub of the newest meeting called title, if that hub is live and not archived."""
    row = conn.execute(
        "SELECT hub.id FROM meetings JOIN notes ON notes.id = meetings.note_id "
        "JOIN notes AS hub ON hub.id = notes.parent_id WHERE notes.title = ? COLLATE NOCASE "
        "AND notes.deleted_at IS NULL AND hub.deleted_at IS NULL AND hub.archived_at IS NULL "
        "ORDER BY meetings.day DESC, meetings.time DESC LIMIT 1", (title,)).fetchone()
    return None if row is None else row[0]


def _hub_row(conn: sqlite3.Connection, hub_id: int) -> sqlite3.Row:
    hub = live_note_row(conn, hub_id)
    if hub["is_person"] or hub["parent_id"] is not None or hub["kind"] not in HUB_KINDS:
        raise NotAHub('"{}" is not a hub: meetings go in a project, an area or a resource'.format(hub["title"]))
    if hub["archived_at"] is not None:
        raise HubArchived('"{}" is archived: restore it first'.format(hub["title"]))
    return hub


def _make_meeting(conn: sqlite3.Connection, hub_id: int, fields: Dict, now: str, counts: Dict[str, int]) -> int:
    """A meeting from an imported event: its note under the hub, its row, its source, its people."""
    note_id = conn.execute(
        "INSERT INTO notes (parent_id, title, body, created_at, updated_at, title_shared) VALUES (?, ?, '', ?, ?, 1)",
        (hub_id, fields["title"], now, now)).lastrowid
    conn.execute(
        "INSERT INTO meetings (note_id, day, time, end_time, location, join_url, agenda) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (note_id, fields["day"], fields["time"], fields["end_time"], fields["location"], fields["join_url"],
         fields["agenda"]))
    conn.execute("INSERT INTO meeting_sources (uid, day, meeting_id) VALUES (?, ?, ?) "
                 "ON CONFLICT (uid, day) DO UPDATE SET meeting_id = excluded.meeting_id",
                 (fields["uid"], fields["day"], note_id))
    for name, email in fields["attendees"]:
        person_id = _person_for(conn, rules.Person(name, email), now, counts)
        if person_id is not None:
            conn.execute("INSERT OR IGNORE INTO meeting_people (meeting_id, person_id) VALUES (?, ?)",
                         (note_id, person_id))
    return note_id


def _person_for(conn: sqlite3.Connection, person: rules.Person, now: str, counts: Dict[str, int]) -> Optional[int]:
    """The person an attendee is: by email, else by name (then their email is filled in), else a
    new person. None when no name can be made or it is taken by a note that isn't a person."""
    live = "notes.deleted_at IS NULL"
    if person.email:
        row = conn.execute("SELECT people.note_id FROM people JOIN notes ON notes.id = people.note_id "
                           "WHERE lower(people.email) = ? AND " + live, (person.email,)).fetchone()
        if row is not None:
            return row[0]
    first, last = rules.split_person_name(person)
    try:
        title = clean_title(full_name(first, last))
    except BadTitle:
        return None
    row = conn.execute("SELECT people.note_id, people.email FROM people JOIN notes ON notes.id = people.note_id "
                       "WHERE notes.title = ? COLLATE NOCASE AND notes.parent_id IS NULL AND " + live,
                       (title,)).fetchone()
    if row is not None:
        if person.email and not row["email"]:
            conn.execute("UPDATE people SET email = ? WHERE note_id = ?", (person.email, row["note_id"]))
        return row["note_id"]
    try:
        check_title_free(conn, None, title, None)
    except TitleTaken:
        return None
    note_id = conn.execute(
        "INSERT INTO notes (parent_id, title, body, created_at, updated_at) VALUES (NULL, ?, '', ?, ?)",
        (title, now, now)).lastrowid
    conn.execute("INSERT INTO people (note_id, first, last, email) VALUES (?, ?, ?, ?)",
                 (note_id, first, last, person.email))
    counts["people"] += 1
    return note_id


def _remove(path: Path) -> None:
    try:
        path.unlink()
    except OSError as error:
        log.warning("could not delete the imported calendar file %s: %s", path, error)


def _rename(path: Path, target: Path) -> None:
    try:
        path.replace(target)
    except OSError as error:
        log.warning("could not set aside the unreadable calendar file %s: %s", path, error)
