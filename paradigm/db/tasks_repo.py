"""Every read and write of tasks and their sessions, outside a note save (which stores the
tasks read from its text: db/task_index.py). The only code besides task_index that knows the
tasks and task_sessions tables."""
import sqlite3
from typing import Callable, Dict, List, Optional

from paradigm.db.connection import Database
from paradigm.db.notes_repo import NoteError, NotFound, live_note_row, utc_now
from paradigm.db.task_index import field_texts, local_today
from paradigm.notes.meetings import BadWhen
from paradigm.notes.sessions import clean_span
from paradigm.notes.tasks import box_state, set_box

Clock = Callable[[], str]

__all__ = ["TaskRepository", "TaskMoved", "NotFound", "BadWhen"]

# A task is live while its line is in a live note.
_LIVE_TASK = "tasks.removed_at IS NULL AND notes.deleted_at IS NULL"


class TaskMoved(NoteError):
    """The task's line no longer holds its box (the note changed and was not read again yet)."""


class TaskRepository:
    def __init__(self, db: Database, clock: Clock = utc_now, today: Callable[[], str] = local_today):
        self._db = db
        self._clock = clock
        self._today = today

    def list(self) -> List[Dict]:
        """Every live task, in note and line order."""
        with self._db.reading() as conn:
            rows = conn.execute(
                "SELECT tasks.* FROM tasks JOIN notes ON notes.id = tasks.note_id WHERE " + _LIVE_TASK +
                " ORDER BY tasks.note_id, tasks.field, tasks.line"
            ).fetchall()
        return [_task(row) for row in rows]

    def get(self, task_id: int) -> Dict:
        with self._db.reading() as conn:
            return _task(_task_row(conn, task_id))

    def set_done(self, task_id: int, done: bool) -> Dict:
        """Ticks or clears the task's box in its note's text (the note's version goes up).
        Returns {task, note_id, field, version}: the field's new version."""
        with self._db.transaction() as conn:
            row = _task_row(conn, task_id)
            texts = field_texts(conn, row["note_id"])
            lines = texts[row["field"]].split("\n")
            if row["line"] >= len(lines) or box_state(lines[row["line"]]) is None:
                raise TaskMoved('"{}" is no longer where it was: open its note and tick it there'.format(row["title"]))
            lines[row["line"]] = set_box(lines[row["line"]], done)
            text = "\n".join(lines)
            version = self._write_field(conn, row["note_id"], row["field"], text)
            conn.execute("UPDATE task_texts SET text = ? WHERE note_id = ? AND field = ?",
                         (text, row["note_id"], row["field"]))
            done_day = (row["done_day"] or self._today()) if done else ""
            conn.execute("UPDATE tasks SET done = ?, done_day = ? WHERE id = ?", (int(done), done_day, task_id))
            task = _task(_task_row(conn, task_id))
        return {"task": task, "note_id": row["note_id"], "field": row["field"], "version": version}

    def _write_field(self, conn: sqlite3.Connection, note_id: int, field: str, text: str) -> int:
        """Stores a field's text with its version one up; the link index, read from the text
        before (only a box changed), moves up with it."""
        now = self._clock()
        if field == "body":
            old = conn.execute("SELECT version FROM notes WHERE id = ?", (note_id,)).fetchone()[0]
            conn.execute("UPDATE notes SET body = ?, version = version + 1, updated_at = ? WHERE id = ?",
                         (text, now, note_id))
            conn.execute("UPDATE link_index SET version = ? WHERE note_id = ? AND version = ?",
                         (old + 1, note_id, old))
            return old + 1
        conn.execute("UPDATE meetings SET agenda = ?, agenda_version = agenda_version + 1 WHERE note_id = ?",
                     (text, note_id))
        conn.execute("UPDATE notes SET updated_at = ? WHERE id = ?", (now, note_id))
        return conn.execute("SELECT agenda_version FROM meetings WHERE note_id = ?", (note_id,)).fetchone()[0]

    def sessions(self, first: Optional[str] = None, last: Optional[str] = None) -> List[Dict]:
        """The sessions of live tasks, between two days (inclusive) when given."""
        with self._db.reading() as conn:
            rows = conn.execute(
                "SELECT task_sessions.* FROM task_sessions JOIN tasks ON tasks.id = task_sessions.task_id "
                "JOIN notes ON notes.id = tasks.note_id WHERE " + _LIVE_TASK +
                " AND (? IS NULL OR day >= ?) AND (? IS NULL OR day <= ?) ORDER BY day, start, task_sessions.id",
                (first, first, last, last),
            ).fetchall()
        return [_session(row) for row in rows]

    def add_session(self, task_id: int, day: object, start: object, end: object) -> Dict:
        day, start, end = clean_span(day, start, end)
        with self._db.transaction() as conn:
            _task_row(conn, task_id)
            session_id = conn.execute("INSERT INTO task_sessions (task_id, day, start, end) VALUES (?, ?, ?, ?)",
                                      (task_id, day, start, end)).lastrowid
            return _session(_session_row(conn, session_id))

    def move_session(self, session_id: int, day: object, start: object, end: object) -> Dict:
        day, start, end = clean_span(day, start, end)
        with self._db.transaction() as conn:
            _session_row(conn, session_id)
            conn.execute("UPDATE task_sessions SET day = ?, start = ?, end = ? WHERE id = ?",
                         (day, start, end, session_id))
            return _session(_session_row(conn, session_id))

    def remove_session(self, session_id: int) -> None:
        with self._db.transaction() as conn:
            _session_row(conn, session_id)
            conn.execute("DELETE FROM task_sessions WHERE id = ?", (session_id,))


def _task(row: sqlite3.Row) -> Dict:
    return {"id": row["id"], "note_id": row["note_id"], "field": row["field"], "line": row["line"],
            "parent_id": row["parent_id"], "title": row["title"], "done": bool(row["done"]),
            "done_day": row["done_day"]}


def _session(row: sqlite3.Row) -> Dict:
    return {"id": row["id"], "task_id": row["task_id"], "day": row["day"], "start": row["start"], "end": row["end"]}


def _task_row(conn: sqlite3.Connection, task_id: int) -> sqlite3.Row:
    row = conn.execute(
        "SELECT tasks.* FROM tasks JOIN notes ON notes.id = tasks.note_id WHERE tasks.id = ? AND " + _LIVE_TASK,
        (task_id,),
    ).fetchone()
    if row is None:
        raise NotFound("No such task: {}".format(task_id))
    live_note_row(conn, row["note_id"])
    return row


def _session_row(conn: sqlite3.Connection, session_id: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM task_sessions WHERE id = ?", (session_id,)).fetchone()
    if row is None:
        raise NotFound("No such session: {}".format(session_id))
    return row
