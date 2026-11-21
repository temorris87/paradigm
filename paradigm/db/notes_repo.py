"""Every read and write of notes. The only code that knows the notes table."""
import sqlite3
from datetime import datetime, timezone
from typing import Callable, Dict, List, Optional

from paradigm.db.connection import Database
from paradigm.notes.titles import BadTitle, clean_title

Clock = Callable[[], str]

__all__ = ["NoteRepository", "NoteError", "NotFound", "Conflict", "TitleTaken", "BadTitle",
           "HasChildren", "WouldCycle", "LastNote"]


class NoteError(Exception):
    pass


class NotFound(NoteError):
    pass


class Conflict(NoteError):
    """The note changed since the version a save started from (another tab saved it)."""

    def __init__(self, current_version: int):
        super().__init__("The note was changed in another tab")
        self.current_version = current_version


class TitleTaken(NoteError):
    pass


class HasChildren(NoteError):
    pass


class WouldCycle(NoteError):
    pass


class LastNote(NoteError):
    """The tree is never left empty."""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


_LIVE = "deleted_at IS NULL"
_SUMMARY = "id, parent_id, title, version, updated_at"


class NoteRepository:
    def __init__(self, db: Database, clock: Clock = utc_now):
        self._db = db
        self._clock = clock

    def tree(self) -> List[Dict]:
        """Every live note without its body: enough to draw the tree and resolve links."""
        with self._db.reading() as conn:
            rows = conn.execute(
                "SELECT {} FROM notes WHERE {} ORDER BY title COLLATE NOCASE, id".format(_SUMMARY, _LIVE)
            ).fetchall()
        return [_summary(row) for row in rows]

    def count(self) -> int:
        with self._db.reading() as conn:
            return conn.execute("SELECT count(*) FROM notes WHERE " + _LIVE).fetchone()[0]

    def get(self, note_id: int) -> Dict:
        with self._db.reading() as conn:
            row = _live_row(conn, note_id)
        return dict(_summary(row), body=row["body"], created_at=row["created_at"])

    def create(self, parent_id: Optional[int], title: object, body: str = "") -> Dict:
        title = clean_title(title)
        now = self._clock()
        with self._db.transaction() as conn:
            if parent_id is not None:
                _live_row(conn, parent_id)
            _check_free(conn, parent_id, title, None)
            cursor = conn.execute(
                "INSERT INTO notes (parent_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (parent_id, title, body, now, now),
            )
            note_id = cursor.lastrowid
        return self.get(note_id)

    def save(self, note_id: int, body: str, base_version: int, force: bool = False) -> Dict:
        with self._db.transaction() as conn:
            row = _live_row(conn, note_id)
            if row["version"] != base_version and not force:
                raise Conflict(row["version"])
            if row["body"] != body:
                self._change(conn, note_id, "body = ?, version = version + 1", (body,))
        return self.get(note_id)

    def rename(self, note_id: int, title: object) -> Dict:
        title = clean_title(title)
        with self._db.transaction() as conn:
            row = _live_row(conn, note_id)
            _check_free(conn, row["parent_id"], title, note_id)
            self._change(conn, note_id, "title = ?", (title,))
        return self.get(note_id)

    def move(self, note_id: int, parent_id: Optional[int]) -> Dict:
        with self._db.transaction() as conn:
            row = _live_row(conn, note_id)
            if parent_id is not None:
                _live_row(conn, parent_id)
                if parent_id == note_id or note_id in _ancestors(conn, parent_id):
                    raise WouldCycle("A note cannot go under itself or under a note inside it")
            _check_free(conn, parent_id, row["title"], note_id)
            self._change(conn, note_id, "parent_id = ?", (parent_id,))
        return self.get(note_id)

    def delete(self, note_id: int, recursive: bool = False) -> List[int]:
        """Marks the note (and, if recursive, everything under it) deleted. Returns the ids."""
        now = self._clock()
        with self._db.transaction() as conn:
            _live_row(conn, note_id)
            ids = _subtree(conn, note_id)
            if len(ids) > 1 and not recursive:
                raise HasChildren("The note has notes under it: :trash! deletes them too")
            live = conn.execute("SELECT count(*) FROM notes WHERE " + _LIVE).fetchone()[0]
            if live <= len(ids):
                raise LastNote("The last note cannot be deleted")
            conn.executemany(
                "UPDATE notes SET deleted_at = ?, updated_at = ? WHERE id = ?",
                [(now, now, each) for each in ids],
            )
        return ids

    def _change(self, conn: sqlite3.Connection, note_id: int, assignment: str, values: tuple) -> None:
        # assignment is one of the fixed snippets above, never user input.
        conn.execute(
            "UPDATE notes SET {}, updated_at = ? WHERE id = ?".format(assignment),
            values + (self._clock(), note_id),
        )


def _summary(row: sqlite3.Row) -> Dict:
    return {"id": row["id"], "parent_id": row["parent_id"], "title": row["title"],
            "version": row["version"], "updated_at": row["updated_at"]}


def _live_row(conn: sqlite3.Connection, note_id: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM notes WHERE id = ? AND " + _LIVE, (note_id,)).fetchone()
    if row is None:
        raise NotFound("No such note: {}".format(note_id))
    return row


def _check_free(conn: sqlite3.Connection, parent_id: Optional[int], title: str,
                except_id: Optional[int]) -> None:
    row = conn.execute(
        "SELECT id FROM notes WHERE ifnull(parent_id, 0) = ifnull(?, 0) AND title = ? COLLATE NOCASE "
        "AND id IS NOT ? AND " + _LIVE,
        (parent_id, title, except_id),
    ).fetchone()
    if row is not None:
        raise TitleTaken("There is already a note called {!r} there".format(title))


def _ancestors(conn: sqlite3.Connection, note_id: int) -> List[int]:
    rows = conn.execute(
        "WITH RECURSIVE up(id) AS (SELECT parent_id FROM notes WHERE id = ? "
        "UNION SELECT notes.parent_id FROM notes JOIN up ON notes.id = up.id) "
        "SELECT id FROM up WHERE id IS NOT NULL",
        (note_id,),
    ).fetchall()
    return [row[0] for row in rows]


def _subtree(conn: sqlite3.Connection, note_id: int) -> List[int]:
    rows = conn.execute(
        "WITH RECURSIVE down(id) AS (SELECT ? UNION SELECT notes.id FROM notes JOIN down "
        "ON notes.parent_id = down.id WHERE notes." + _LIVE + ") SELECT id FROM down",
        (note_id,),
    ).fetchall()
    return [row[0] for row in rows]
