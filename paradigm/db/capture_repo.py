"""Capture on save. A meeting's "T:", "D:" and "Q:" lines become a task, a decision or a
question on its hub (026_captures.sql); in any note, an "@Name ?" line becomes a topic to
raise at the next 1:1 with that person (027_person_topics.sql). The page reads
the lines (static/js/notes/capture.js) and sends them with the save; this runs inside the
save's transaction. A line is captured once: a record or task with the same source and quote
already exists, nothing is made. Editing a captured line later makes a new one; deleting it
deletes nothing.

    store_captures(conn, note_id, captures, now, today) -> how many were made
      captures: [{kind: task | decision | question | topic, quote, title, people?: [person ids],
                  delegate_id?, for_person_id?, due?, line?}]   (a topic: people[0], title)
"""
import sqlite3
from typing import Dict, Optional

from paradigm.db.notes_repo import NoteError
from paradigm.db.records_repo import insert_record
from paradigm.db.tasks_repo import insert_task
from paradigm.db.topics_repo import clean_topic, insert_topic
from paradigm.notes.records import clean_record_kind
from paradigm.notes.tasks import BadTask, clean_optional_day, clean_task_title
from paradigm.notes.titles import clean_title

__all__ = ["store_captures", "BadCapture", "MAX_CAPTURES"]

MAX_CAPTURES = 200
MAX_QUOTE = 2000
KINDS = ("task", "decision", "question", "topic")


class BadCapture(NoteError):
    """A capture line the server can't take."""


def store_captures(conn: sqlite3.Connection, note_id: int, captures: object, now: str, today: str) -> int:
    if not captures:
        return 0
    if not isinstance(captures, list) or len(captures) > MAX_CAPTURES:
        raise BadCapture("captures must be a list of at most {}".format(MAX_CAPTURES))
    meeting = conn.execute("SELECT notes.parent_id, meetings.day FROM notes JOIN meetings ON meetings.note_id = notes.id "
                           "WHERE notes.id = ?", (note_id,)).fetchone()
    made = 0
    for capture in [_clean(each) for each in captures]:
        if capture["kind"] == "topic":
            made += _store_topic(conn, note_id, capture, now)
        # Only a meeting's notes make tasks and records; its hub is its parent.
        elif meeting is not None and meeting["parent_id"] is not None:
            made += _store(conn, note_id, meeting["parent_id"], meeting["day"] or today, capture, now)
    return made


def _store_topic(conn: sqlite3.Connection, note_id: int, capture: Dict, now: str) -> int:
    person = next((each for each in capture["people"] if _is_person(conn, each)), None)
    if person is None:
        return 0
    return int(insert_topic(conn, person, clean_topic(capture["title"]), note_id, capture["line"], now) is not None)


def _clean(capture: object) -> Dict:
    if not isinstance(capture, dict) or capture.get("kind") not in KINDS:
        raise BadCapture("A capture is a task, a decision or a question")
    quote = capture.get("quote")
    if not isinstance(quote, str) or not quote.strip() or len(quote) > MAX_QUOTE:
        raise BadCapture("A capture's line must be text of at most {} characters".format(MAX_QUOTE))
    people = capture.get("people") or []
    if not isinstance(people, list) or not all(_is_id(each) for each in people):
        raise BadCapture("A capture's people are note ids")
    try:
        title = clean_task_title(capture.get("title")) if capture["kind"] in ("task", "topic") else clean_title(capture.get("title"))
        due = clean_optional_day(capture.get("due", ""))
    except (BadTask, ValueError) as error:
        raise BadCapture(str(error)) from None
    return {"kind": capture["kind"], "quote": quote.strip(), "title": title, "people": people, "due": due,
            "delegate_id": _optional_id(capture.get("delegate_id")), "for_person_id": _optional_id(capture.get("for_person_id")),
            "line": _optional_id(capture.get("line"))}


def _store(conn: sqlite3.Connection, note_id: int, hub_id: int, day: str, capture: Dict, now: str) -> int:
    people = [person for person in capture["people"] if _is_person(conn, person)]
    if capture["kind"] == "task":
        if conn.execute("SELECT 1 FROM task_sources JOIN tasks ON tasks.id = task_sources.task_id "
                        "WHERE task_sources.source_id = ? AND task_sources.quote = ?", (note_id, capture["quote"])).fetchone():
            return 0
        task_id = insert_task(conn, hub_id, capture["title"], None, capture["due"], "", now)
        conn.execute("INSERT INTO task_sources (task_id, source_id, quote) VALUES (?, ?, ?)", (task_id, note_id, capture["quote"]))
        delegate = capture["delegate_id"] if _is_person(conn, capture["delegate_id"]) else None
        mine_for = capture["for_person_id"] if delegate is None and _is_person(conn, capture["for_person_id"]) else None
        conn.execute("UPDATE tasks SET delegate_id = ?, for_person_id = ? WHERE id = ?", (delegate, mine_for, task_id))
        return 1
    kind = clean_record_kind(capture["kind"])
    if conn.execute("SELECT 1 FROM record_sources JOIN notes ON notes.id = record_sources.note_id "
                    "WHERE record_sources.source_id = ? AND record_sources.quote = ? AND notes.deleted_at IS NULL",
                    (note_id, capture["quote"])).fetchone():
        return 0
    insert_record(conn, hub_id, kind, capture["title"], day, note_id, capture["quote"], now, people)
    return 1


def _is_id(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _optional_id(value: object) -> Optional[int]:
    return value if _is_id(value) else None


def _is_person(conn: sqlite3.Connection, person_id: Optional[int]) -> bool:
    if person_id is None:
        return False
    return conn.execute("SELECT 1 FROM people JOIN notes ON notes.id = people.note_id "
                        "WHERE people.note_id = ? AND notes.deleted_at IS NULL", (person_id,)).fetchone() is not None
