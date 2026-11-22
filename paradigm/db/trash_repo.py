"""The Trash: notes deleted in the last week can be restored; older ones are deleted for good.

A note is trashed by NoteRepository.delete, which stamps it and every note under it with the
same deleted_at. That stamp ties them together here: one Trash entry is one note and the
notes trashed with it, and restoring it brings them all back. Notes under it trashed earlier,
on their own, stay entries of their own.
"""
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from paradigm.db.connection import Database
from paradigm.db.notes_repo import (Clock, NoteError, NotFound, StaysInAHub, TitleTaken,
                                    check_title_free, utc_now)

__all__ = ["TrashRepository", "NotFound", "StaysInAHub"]

_ROWS = ("SELECT notes.id, notes.parent_id, notes.title, notes.kind, notes.deleted_at, "
         "people.note_id IS NOT NULL AS is_person, "
         "meetings.note_id IS NOT NULL AS is_meeting, "
         "decisions.note_id IS NOT NULL AS is_decision, "
         "questions.note_id IS NOT NULL AS is_question FROM notes "
         "LEFT JOIN people ON people.note_id = notes.id "
         "LEFT JOIN meetings ON meetings.note_id = notes.id "
         "LEFT JOIN decisions ON decisions.note_id = notes.id "
         "LEFT JOIN questions ON questions.note_id = notes.id ")
_RECORD_KINDS = ("meeting", "decision", "question")

# The tables holding a note's own rows, deleted with it for good: (table, column).
_OWN_ROWS = [("hub_people", "hub_id"), ("hub_people", "person_id"), ("meeting_people", "meeting_id"),
             ("meeting_people", "person_id"), ("record_people", "note_id"), ("record_people", "person_id"),
             ("meetings", "note_id"), ("decisions", "note_id"), ("questions", "note_id"), ("people", "note_id"),
             ("note_links", "note_id"), ("link_index", "note_id")]


class TrashRepository:
    def __init__(self, db: Database, clock: Clock = utc_now, keep_days: int = 7):
        self._db = db
        self._clock = clock
        self.keep_days = keep_days

    def entries(self) -> List[Dict]:
        """What the Trash shows, newest first: one entry per note trashed (with the notes
        trashed together with it), still inside its week."""
        cutoff = self._cutoff()
        with self._db.reading() as conn:
            rows = conn.execute(_ROWS + "WHERE notes.deleted_at IS NOT NULL AND notes.deleted_at > ?",
                                (cutoff,)).fetchall()
            by_id = {row["id"]: row for row in rows}
            found = []
            for row in rows:
                parent = by_id.get(row["parent_id"])
                if parent is not None and parent["deleted_at"] == row["deleted_at"]:
                    continue
                found.append(self._entry(conn, row, by_id))
        found.sort(key=lambda entry: (entry["deleted_at"], entry["id"]), reverse=True)
        return found

    def restore(self, note_id: int) -> Dict:
        """Brings a trashed note back with the notes trashed with it. It goes back under its
        old parent; if that is gone, to the top level (a meeting, decision or question can't
        stand there: StaysInAHub). A title taken there meanwhile gets " (restored)". Returns
        {id, title, renamed}."""
        with self._db.transaction() as conn:
            row = conn.execute(_ROWS + "WHERE notes.id = ? AND notes.deleted_at IS NOT NULL",
                               (note_id,)).fetchone()
            if row is None:
                raise NotFound("No such note in the Trash: {}".format(note_id))
            parent = _live_parent(conn, row["parent_id"])
            if parent is None and _kind(row) in _RECORD_KINDS:
                raise StaysInAHub('"{}" is a {}: restore the hub it was in first'.format(row["title"], _kind(row)))
            title = _free_title(conn, parent, row["title"], note_id)
            batch = _batch(conn, note_id, row["deleted_at"])
            now = self._clock()
            conn.execute("UPDATE notes SET parent_id = ?, title = ?, deleted_at = NULL, updated_at = ? WHERE id = ?",
                         (parent, title, now, note_id))
            conn.executemany("UPDATE notes SET deleted_at = NULL WHERE id = ?",
                             [(each,) for each in batch if each != note_id])
        return {"id": note_id, "title": title, "renamed": title != row["title"]}

    def purge(self) -> int:
        """Deletes for good every note trashed more than keep_days ago, with its own rows
        (person, meeting, record, links). Images it holds stay for the image sweep, which
        keeps those another note still links to. Returns how many notes went."""
        with self._db.transaction() as conn:
            ids = [(row[0],) for row in conn.execute(
                "SELECT id FROM notes WHERE deleted_at IS NOT NULL AND deleted_at <= ?", (self._cutoff(),))]
            if not ids:
                return 0
            for table, column in _OWN_ROWS:
                # table and column come from the fixed list above, never from input.
                conn.executemany("DELETE FROM {} WHERE {} = ?".format(table, column), ids)
            conn.executemany("UPDATE images SET note_id = NULL WHERE note_id = ?", ids)
            conn.executemany("UPDATE notes SET area_id = NULL WHERE area_id = ?", ids)
            conn.executemany("UPDATE notes SET parent_id = NULL WHERE parent_id = ?", ids)
            conn.executemany("DELETE FROM notes WHERE id = ?", ids)
        return len(ids)

    def _cutoff(self) -> str:
        now = datetime.fromisoformat(self._clock().replace("Z", "+00:00"))
        then = (now - timedelta(days=self.keep_days)).astimezone(timezone.utc)
        return then.isoformat(timespec="milliseconds").replace("+00:00", "Z")

    def _entry(self, conn: sqlite3.Connection, row: sqlite3.Row, trashed: Dict[int, sqlite3.Row]) -> Dict:
        parent_row = None if row["parent_id"] is None else conn.execute(
            "SELECT id, title, deleted_at FROM notes WHERE id = ?", (row["parent_id"],)).fetchone()
        when = datetime.fromisoformat(row["deleted_at"].replace("Z", "+00:00"))
        gone = (when + timedelta(days=self.keep_days)).astimezone(timezone.utc)
        return {
            "id": row["id"],
            "title": row["title"],
            "kind": _kind(row),
            "deleted_at": row["deleted_at"],
            "purge_at": gone.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "inside": len(_batch(conn, row["id"], row["deleted_at"])) - 1,
            "parent_id": row["parent_id"],
            "parent_title": parent_row["title"] if parent_row else None,
            # live: it goes back there; trashed: it goes to the top (or waits, for a record).
            "parent_state": None if parent_row is None else "trashed" if parent_row["deleted_at"] else "live",
        }


def _kind(row: sqlite3.Row) -> Optional[str]:
    if row["is_person"]:
        return "person"
    return next((kind for kind in _RECORD_KINDS if row["is_" + kind]), row["kind"])


def _live_parent(conn: sqlite3.Connection, parent_id: Optional[int]) -> Optional[int]:
    if parent_id is None:
        return None
    row = conn.execute("SELECT id FROM notes WHERE id = ? AND deleted_at IS NULL", (parent_id,)).fetchone()
    return None if row is None else row["id"]


def _batch(conn: sqlite3.Connection, note_id: int, deleted_at: str) -> List[int]:
    """The note and the notes under it trashed at the same moment."""
    rows = conn.execute(
        "WITH RECURSIVE down(id) AS (SELECT ? UNION SELECT notes.id FROM notes JOIN down "
        "ON notes.parent_id = down.id WHERE notes.deleted_at = ?) SELECT id FROM down",
        (note_id, deleted_at),
    ).fetchall()
    return [row[0] for row in rows]


def _free_title(conn: sqlite3.Connection, parent_id: Optional[int], title: str, note_id: int) -> str:
    for n in range(1, 100):
        candidate = title if n == 1 else "{} (restored)".format(title) if n == 2 else "{} (restored {})".format(title, n - 1)
        try:
            check_title_free(conn, parent_id, candidate, note_id)
            return candidate
        except TitleTaken:
            continue
    raise NoteError('Too many notes called "{}" there: rename one first'.format(title))
