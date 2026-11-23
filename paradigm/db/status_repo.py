"""Every read and write of status logs (023_status_logs.sql): the only code that knows the
status_logs table. An entry belongs to a project or an area, live or archived; a trashed
hub's entries stay with it and go when it is deleted for good."""
import sqlite3
from typing import Callable, Dict, List

from paradigm.db.connection import Database
from paradigm.db.notes_repo import NoteError, NotFound, live_note_row, utc_now
from paradigm.notes.meetings import BadWhen, clean_day
from paradigm.notes.status import BadStatus, clean_health, clean_status_text

Clock = Callable[[], str]

__all__ = ["StatusRepository", "NotFound", "BadWhen", "BadStatus", "NotAHub"]


class NotAHub(NoteError):
    """Only a project or an area keeps a status log."""


class StatusRepository:
    def __init__(self, db: Database, clock: Clock = utc_now):
        self._db = db
        self._clock = clock

    def list(self) -> List[Dict]:
        """Every entry of a live note, newest day first (then newest written)."""
        with self._db.reading() as conn:
            rows = conn.execute(
                "SELECT status_logs.* FROM status_logs JOIN notes ON notes.id = status_logs.note_id "
                "WHERE notes.deleted_at IS NULL ORDER BY status_logs.day DESC, status_logs.id DESC"
            ).fetchall()
        return [_entry(row) for row in rows]

    def create(self, note_id: int, day: object, health: object, text: object) -> Dict:
        day, health, text = clean_day(day), clean_health(health), clean_status_text(text)
        with self._db.transaction() as conn:
            _check_hub(conn, note_id)
            entry_id = conn.execute(
                "INSERT INTO status_logs (note_id, day, health, text, created_at) VALUES (?, ?, ?, ?, ?)",
                (note_id, day, health, text, self._clock())).lastrowid
            return _entry(_row(conn, entry_id))

    def update(self, entry_id: int, day: object, health: object, text: object) -> Dict:
        day, health, text = clean_day(day), clean_health(health), clean_status_text(text)
        with self._db.transaction() as conn:
            _row(conn, entry_id)
            conn.execute("UPDATE status_logs SET day = ?, health = ?, text = ? WHERE id = ?",
                         (day, health, text, entry_id))
            return _entry(_row(conn, entry_id))

    def remove(self, entry_id: int) -> None:
        with self._db.transaction() as conn:
            _row(conn, entry_id)
            conn.execute("DELETE FROM status_logs WHERE id = ?", (entry_id,))


def _entry(row: sqlite3.Row) -> Dict:
    return {"id": row["id"], "note_id": row["note_id"], "day": row["day"], "health": row["health"],
            "text": row["text"], "created_at": row["created_at"]}


def _check_hub(conn: sqlite3.Connection, note_id: int) -> None:
    row = live_note_row(conn, note_id)
    if row["parent_id"] is not None or row["kind"] not in ("project", "area") or row["is_person"] or row["is_template"]:
        raise NotAHub('"{}" is not a project or an area: only those keep a status log'.format(row["title"]))


def _row(conn: sqlite3.Connection, entry_id: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM status_logs WHERE id = ?", (entry_id,)).fetchone()
    if row is None:
        raise NotFound("No such status entry: {}".format(entry_id))
    return row
