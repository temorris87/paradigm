"""Following up delegated tasks (032_follow_up_logs.sql). The only code that knows the
follow_up_logs table.

A follow-up is a live, delegated task with a follow-up day. Logging one writes the entry, then
either moves the follow-up day ("again") or closes the task as /api/task/done does ("closed",
its follow-up day kept). The day is the browser's, passed in: the server never guesses it."""
import sqlite3
from typing import Callable, Dict, List

from paradigm.db.connection import Database
from paradigm.db.notes_repo import NoteError, NotFound, utc_now
from paradigm.db.tasks_repo import close_task, live_task
from paradigm.notes.follow_ups import BadFollowUp, clean_follow_up

__all__ = ["FollowUpRepository", "NotAFollowUp", "TaskIsDone", "BadFollowUp", "NotFound", "follow_up_logs"]

Clock = Callable[[], str]


class NotAFollowUp(NoteError):
    """The task is not delegated, or has no follow-up day."""


class TaskIsDone(NoteError):
    """The task is done already: a log on it would close it a second time."""

    def __init__(self) -> None:
        super().__init__("task is done")


class FollowUpRepository:
    def __init__(self, db: Database, clock: Clock = utc_now):
        self._db = db
        self._clock = clock

    def log(self, task_id: int, outcome: object, note: object, next_day: object, today: object) -> Dict:
        """Logs a follow-up of a live, open task and applies its outcome. Returns the task, with its
        follow_up_count."""
        outcome, note, next_day, today = clean_follow_up(outcome, note, next_day, today)
        with self._db.transaction() as conn:
            task = live_task(conn, task_id)
            if task["done"]:
                raise TaskIsDone()
            if task["delegate_id"] is None or not task["follow_up"]:
                raise NotAFollowUp("This task is not delegated with a follow-up day")
            conn.execute("INSERT INTO follow_up_logs (task_id, day, note, outcome, next_day, created_at) "
                         "VALUES (?, ?, ?, ?, ?, ?)", (task_id, today, note, outcome, next_day, self._clock()))
            if outcome == "again":
                conn.execute("UPDATE tasks SET follow_up = ? WHERE id = ?", (next_day, task_id))
            else:
                close_task(conn, task_id, today)
            return live_task(conn, task_id)


def follow_up_logs(conn: sqlite3.Connection, task_id: int) -> List[Dict]:
    """A task's logs, oldest first: {id, day, note, outcome, next_day, created_at}."""
    rows = conn.execute("SELECT id, day, note, outcome, next_day, created_at FROM follow_up_logs "
                        "WHERE task_id = ? ORDER BY day, id", (task_id,)).fetchall()
    return [dict(row) for row in rows]
