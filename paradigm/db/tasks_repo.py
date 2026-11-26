"""Every read and write of tasks and their blocks of time (017_task_records.sql). The only
code that knows the tasks and task_sessions tables.

A task belongs to one note; a subtask to a task on the same note (one level). A task can be
delegated to a person, with a day to follow it up. Deleting a task that has blocks of time
keeps its row (removed_at), since those blocks are time worked."""
import sqlite3
from typing import Callable, Dict, List, Optional

from paradigm.db.connection import Database
from paradigm.db.notes_repo import NoteError, NotFound, live_note_row, utc_now
from paradigm.db.people_repo import NotAPerson, person_row
from paradigm.notes.days import local_today
from paradigm.notes.meetings import BadWhen
from paradigm.notes.sessions import clean_span
from paradigm.notes.tasks import BadTask, clean_estimate, clean_optional_day, clean_task_notes, clean_task_title

Clock = Callable[[], str]

__all__ = ["TaskRepository", "insert_task", "NotFound", "BadWhen", "BadTask", "NotAPerson", "NoTasksHere"]

# A task is live while it isn't deleted and its note isn't trashed.
_LIVE_TASK = "tasks.removed_at IS NULL AND notes.deleted_at IS NULL"
# The fields update() may change, and how each is cleaned.
_FIELDS = {"title": clean_task_title, "notes": clean_task_notes, "due": clean_optional_day,
           "follow_up": clean_optional_day, "snoozed_until": clean_optional_day, "estimate_min": clean_estimate}


class NoTasksHere(NoteError):
    """A person's note or a template holds no tasks; a subtask has no subtasks."""


class TaskRepository:
    def __init__(self, db: Database, clock: Clock = utc_now, today: Callable[[], str] = local_today):
        self._db = db
        self._clock = clock
        self._today = today

    def list(self) -> List[Dict]:
        """Every live task, by note, then in their order."""
        with self._db.reading() as conn:
            rows = conn.execute(
                "SELECT tasks.*, task_sources.source_id, task_sources.quote FROM tasks "
                "JOIN notes ON notes.id = tasks.note_id LEFT JOIN task_sources ON task_sources.task_id = tasks.id WHERE "
                + _LIVE_TASK + " ORDER BY tasks.note_id, tasks.position, tasks.id"
            ).fetchall()
        return [_task(row) for row in rows]

    def get(self, task_id: int) -> Dict:
        with self._db.reading() as conn:
            return _task(_task_row(conn, task_id))

    def create(self, note_id: int, title: object, parent_id: Optional[int] = None, due: object = "",
               notes: object = "") -> Dict:
        title, due, notes = clean_task_title(title), clean_optional_day(due), clean_task_notes(notes)
        with self._db.transaction() as conn:
            task_id = self.insert(conn, note_id, title, parent_id, due, notes)
            return _task(_task_row(conn, task_id))

    def insert(self, conn: sqlite3.Connection, note_id: int, title: str, parent_id: Optional[int] = None,
               due: str = "", notes: str = "") -> int:
        """Adds a task inside a caller's transaction (a template or plan bringing its tasks);
        the values are clean already. Returns its id."""
        return insert_task(conn, note_id, title, parent_id, due, notes, self._clock())

    def update(self, task_id: int, values: Dict[str, object]) -> Dict:
        """Changes any of title, notes, due, follow_up, snoozed_until, estimate_min."""
        clean = {key: _FIELDS[key](value) for key, value in values.items() if key in _FIELDS}
        with self._db.transaction() as conn:
            _task_row(conn, task_id)
            for key, value in clean.items():
                # key comes from _FIELDS, never from input.
                conn.execute("UPDATE tasks SET {} = ? WHERE id = ?".format(key), (value, task_id))
            return _task(_task_row(conn, task_id))

    def delegate(self, task_id: int, person_id: Optional[int], follow_up: object = "") -> Dict:
        """Hands a task to a person (None: back to me), with a day to follow it up."""
        follow_up = clean_optional_day(follow_up) if person_id is not None else ""
        with self._db.transaction() as conn:
            _task_row(conn, task_id)
            if person_id is not None:
                person_row(conn, person_id)
            conn.execute("UPDATE tasks SET delegate_id = ?, follow_up = ? WHERE id = ?",
                         (person_id, follow_up, task_id))
            return _task(_task_row(conn, task_id))

    def set_for(self, task_id: int, person_id: Optional[int]) -> Dict:
        """A task of mine done for a person ("I owe them"), or for no one (None)."""
        with self._db.transaction() as conn:
            _task_row(conn, task_id)
            if person_id is not None:
                person_row(conn, person_id)
            conn.execute("UPDATE tasks SET for_person_id = ? WHERE id = ?", (person_id, task_id))
            return _task(_task_row(conn, task_id))

    def set_done(self, task_id: int, done: bool) -> Dict:
        with self._db.transaction() as conn:
            row = _task_row(conn, task_id)
            done_day = (row["done_day"] or self._today()) if done else ""
            conn.execute("UPDATE tasks SET done = ?, done_day = ? WHERE id = ?",
                         (int(done), done_day, task_id))
            return _task(_task_row(conn, task_id))

    def move(self, task_id: int, before_id: Optional[int]) -> Dict:
        """Puts a task just before another of its siblings (None: last)."""
        with self._db.transaction() as conn:
            row = _task_row(conn, task_id)
            siblings = [each[0] for each in conn.execute(
                "SELECT id FROM tasks WHERE note_id = ? AND parent_id IS ? AND removed_at IS NULL AND id != ? "
                "ORDER BY position, id", (row["note_id"], row["parent_id"], task_id))]
            index = siblings.index(before_id) if before_id in siblings else len(siblings)
            siblings.insert(index, task_id)
            conn.executemany("UPDATE tasks SET position = ? WHERE id = ?",
                             [(place, each) for place, each in enumerate(siblings, 1)])
            return _task(_task_row(conn, task_id))

    def remove(self, task_id: int) -> List[int]:
        """Deletes a task and its subtasks. One with blocks of time is only marked removed (the
        blocks are time worked). Returns the ids gone."""
        with self._db.transaction() as conn:
            _task_row(conn, task_id)
            ids = [task_id] + [each[0] for each in conn.execute(
                "SELECT id FROM tasks WHERE parent_id = ? AND removed_at IS NULL", (task_id,))]
            now = self._clock()
            for each in ids:
                logged = conn.execute("SELECT 1 FROM task_sessions WHERE task_id = ? LIMIT 1", (each,)).fetchone()
                if logged:
                    conn.execute("UPDATE tasks SET removed_at = ? WHERE id = ?", (now, each))
            # Subtasks first: the parent may still be pointed at.
            for each in reversed(ids):
                if not conn.execute("SELECT 1 FROM task_sessions WHERE task_id = ? LIMIT 1", (each,)).fetchone():
                    conn.execute("UPDATE tasks SET parent_id = NULL WHERE parent_id = ?", (each,))
                    conn.execute("DELETE FROM tasks WHERE id = ?", (each,))
        return ids

    # ---- blocks of time ----

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


def insert_task(conn: sqlite3.Connection, note_id: int, title: str, parent_id: Optional[int], due: str, notes: str,
                now: str) -> int:
    """A task (or a subtask) on a note, last among its siblings, inside a caller's transaction;
    the values are clean already. Returns its id."""
    _check_owner(conn, note_id)
    if parent_id is not None:
        parent = _task_row(conn, parent_id)
        if parent["note_id"] != note_id:
            raise NoTasksHere("A subtask goes on the same note as its task")
        if parent["parent_id"] is not None:
            raise NoTasksHere('"{}" is a subtask: subtasks go one level deep'.format(parent["title"]))
    position = conn.execute(
        "SELECT ifnull(max(position), 0) + 1 FROM tasks WHERE note_id = ? AND parent_id IS ?",
        (note_id, parent_id)).fetchone()[0]
    return conn.execute(
        "INSERT INTO tasks (note_id, parent_id, title, notes, due, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (note_id, parent_id, title, notes, due, position, now),
    ).lastrowid


def _task(row: sqlite3.Row) -> Dict:
    return {"id": row["id"], "note_id": row["note_id"], "parent_id": row["parent_id"], "title": row["title"],
            "notes": row["notes"], "due": row["due"], "delegate_id": row["delegate_id"],
            "follow_up": row["follow_up"], "done": bool(row["done"]), "done_day": row["done_day"],
            "position": row["position"],
            "snoozed_until": row["snoozed_until"], "estimate_min": row["estimate_min"],
            "for_person_id": row["for_person_id"], "source_id": row["source_id"], "quote": row["quote"] or ""}


def _session(row: sqlite3.Row) -> Dict:
    return {"id": row["id"], "task_id": row["task_id"], "day": row["day"], "start": row["start"], "end": row["end"]}


def _check_owner(conn: sqlite3.Connection, note_id: int) -> None:
    row = live_note_row(conn, note_id)
    if row["is_person"]:
        raise NoTasksHere('"{}" is a person: put the task on a hub or a note, and delegate it to them'.format(
            row["title"]))
    if row["is_template"]:
        raise NoTasksHere('"{}" is a template: write "- [ ]" lines in it instead'.format(row["title"]))


def _task_row(conn: sqlite3.Connection, task_id: int) -> sqlite3.Row:
    row = conn.execute(
        "SELECT tasks.*, task_sources.source_id, task_sources.quote FROM tasks JOIN notes ON notes.id = tasks.note_id "
        "LEFT JOIN task_sources ON task_sources.task_id = tasks.id WHERE tasks.id = ? AND " + _LIVE_TASK,
        (task_id,),
    ).fetchone()
    if row is None:
        raise NotFound("No such task: {}".format(task_id))
    return row


def _session_row(conn: sqlite3.Connection, session_id: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM task_sessions WHERE id = ?", (session_id,)).fetchone()
    if row is None:
        raise NotFound("No such session: {}".format(session_id))
    return row
