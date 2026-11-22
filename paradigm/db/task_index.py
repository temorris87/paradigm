"""Storing the tasks the page read out of a note's text (012_tasks.sql). store_tasks runs
inside the save that changed the text (as store_links does), so a task follows its line."""
import sqlite3
from datetime import date
from typing import Callable, Dict, List, Optional

from paradigm.notes.mentions import FIELDS
from paradigm.notes.task_match import follow_lines, match_tasks
from paradigm.notes.tasks import Task, box_state

__all__ = ["store_tasks", "field_texts"]

Today = Callable[[], str]


def local_today() -> str:
    return date.today().isoformat()


def field_texts(conn: sqlite3.Connection, note_id: int) -> Dict[str, str]:
    """The note's text fields as stored now: its body, and a meeting's agenda."""
    texts = {"body": conn.execute("SELECT body FROM notes WHERE id = ?", (note_id,)).fetchone()[0]}
    agenda = conn.execute("SELECT agenda FROM meetings WHERE note_id = ?", (note_id,)).fetchone()
    if agenda is not None:
        texts["agenda"] = agenda[0]
    return texts


def store_tasks(conn: sqlite3.Connection, note_id: int, tasks: List[Task], removed_at: str,
                today: Today = local_today) -> None:
    """Makes the note's task rows those of tasks (read from its text as it is stored now).
    A box on a line that isn't one is ignored; a task whose box is gone is marked removed."""
    texts = field_texts(conn, note_id)
    old_texts = dict(conn.execute("SELECT field, text FROM task_texts WHERE note_id = ?", (note_id,)).fetchall())
    rows = [dict(row) for row in conn.execute("SELECT * FROM tasks WHERE note_id = ? ORDER BY id", (note_id,))]
    live = [row for row in rows if row["removed_at"] is None]
    spare = [row for row in rows if row["removed_at"] is not None]
    by_id = {row["id"]: row for row in rows}
    kept = set()
    for field in FIELDS:
        text = texts.get(field)
        if text is None:
            continue
        lines = text.split("\n")
        boxes = [task for task in tasks if task.field == field and task.line < len(lines)
                 and box_state(lines[task.line]) is not None]
        old = [row for row in live if row["field"] == field]
        moved = follow_lines(old_texts[field], text, {row["line"] for row in old}) if field in old_texts else {}
        ids = match_tasks(old, [task.line for task in boxes], [task.title for task in boxes], moved,
                          [row for row in spare if row["id"] not in kept])
        at_line: Dict[int, int] = {}
        for task, task_id in zip(boxes, ids):
            parent = at_line.get(task.parent_line) if task.parent_line is not None else None
            task_id = _put(conn, note_id, task, task_id, parent, by_id, today)
            at_line[task.line] = task_id
            kept.add(task_id)
        if boxes:
            conn.execute("INSERT INTO task_texts (note_id, field, text) VALUES (?, ?, ?) "
                         "ON CONFLICT (note_id, field) DO UPDATE SET text = excluded.text", (note_id, field, text))
        else:
            conn.execute("DELETE FROM task_texts WHERE note_id = ? AND field = ?", (note_id, field))
    gone = [(removed_at, row["id"]) for row in live if row["id"] not in kept]
    conn.executemany("UPDATE tasks SET removed_at = ? WHERE id = ?", gone)


def _put(conn: sqlite3.Connection, note_id: int, task: Task, task_id: Optional[int], parent: Optional[int],
         by_id: Dict[int, Dict], today: Today) -> int:
    if task_id is None:
        return conn.execute(
            "INSERT INTO tasks (note_id, field, line, parent_id, title, done, done_day) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (note_id, task.field, task.line, parent, task.title, int(task.done), today() if task.done else ""),
        ).lastrowid
    old = by_id[task_id]
    done_day = (old["done_day"] or today()) if task.done else ""
    conn.execute(
        "UPDATE tasks SET field = ?, line = ?, parent_id = ?, title = ?, done = ?, done_day = ?, removed_at = NULL "
        "WHERE id = ?",
        (task.field, task.line, parent, task.title, int(task.done), done_day, task_id),
    )
    return task_id
