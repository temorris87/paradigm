"""Captures: what a note's lines made. A task, a question or a decision is made from one line
by key, explicitly (CaptureRepository.create, POST /api/capture); a capture is its task_sources
or record_sources row (026_captures.sql), matched to its line by (source, quote). On a note's
save, an "@Name ?" line still becomes a topic to raise at the next 1:1 with that person
(027_person_topics.sql); "T:", "D:" and "Q:" lines are no longer read (old ones stay plain
text, and what they made stays).

    store_captures(conn, note_id, captures, now, today) -> how many topics were made
      captures: [{kind: topic, quote, title, people: [person ids], line?}]   (people[0])
    CaptureRepository.create(source_id, values) -> Capture
      values: {kind, title, quote, hub_id, person_id?, role?, follow_up?, due?}
    CaptureRepository.list(source_id) -> [Capture]   (in the order made)
    CaptureRepository.remove(kind, id)               (a task deleted, a record to Trash)

A capture goes to a hub: a project or an area, or a person for a note under that person.
A task for a person goes on the note it was captured in, since a person's note holds no tasks;
a question or a decision can't go to a person (it sits directly under a project or an area).
"""
import sqlite3
from typing import Callable, Dict, List, Optional, Tuple

from paradigm.db.connection import Database
from paradigm.db.notes_repo import NoteError, NoteRepository, NotFound, live_note_row, top_note_row, utc_now
from paradigm.db.records_repo import insert_record
from paradigm.db.tasks_repo import TaskRepository, insert_task
from paradigm.db.topics_repo import clean_topic, insert_topic
from paradigm.notes.days import local_today
from paradigm.notes.hubs import HUB_KINDS
from paradigm.notes.tasks import BadTask, clean_optional_day, clean_task_title
from paradigm.notes.titles import BadTitle, clean_title

__all__ = ["store_captures", "CaptureRepository", "nearest_hub", "captures_of", "BadCapture", "AlreadyCaptured",
           "NoHub", "NotFound", "MAX_CAPTURES"]

Clock = Callable[[], str]

MAX_CAPTURES = 200
MAX_QUOTE = 2000
KINDS = ("task", "decision", "question")
ROLES = ("delegate", "for", "mine")
# Fixed table names by kind, never user input.
_RECORD_TABLES = {"decision": "decisions", "question": "questions"}


class BadCapture(NoteError):
    """A capture the server can't take."""


class AlreadyCaptured(NoteError):
    """The same line of the same note made one of this kind already, still live."""


class NoHub(NoteError):
    """What a capture was sent to is not a live hub it can go to."""


# ---- on save: topics only ----

def store_captures(conn: sqlite3.Connection, note_id: int, captures: object, now: str, today: str) -> int:
    """Inside the note's save: each "@Name ?" line's topic, once. Anything else is refused, so
    a page still reading T:/Q:/D: lines learns it at once and the save makes nothing."""
    if not captures:
        return 0
    if not isinstance(captures, list) or len(captures) > MAX_CAPTURES:
        raise BadCapture("captures must be a list of at most {}".format(MAX_CAPTURES))
    made = 0
    for capture in [_clean_topic(each) for each in captures]:
        made += _store_topic(conn, note_id, capture, now)
    return made


def _clean_topic(capture: object) -> Dict:
    if isinstance(capture, dict) and capture.get("kind") in KINDS:
        raise BadCapture("T:/Q:/D: lines are no longer captured on save")
    if not isinstance(capture, dict) or capture.get("kind") != "topic":
        raise BadCapture("A capture on save is a topic")
    people = capture.get("people") or []
    if not isinstance(people, list) or not all(_is_id(each) for each in people):
        raise BadCapture("A capture's people are note ids")
    _clean_quote(capture.get("quote"))
    try:
        title = clean_task_title(capture.get("title"))
    except BadTask as error:
        raise BadCapture(str(error)) from None
    return {"title": title, "people": people, "line": _optional_id(capture.get("line"))}


def _store_topic(conn: sqlite3.Connection, note_id: int, capture: Dict, now: str) -> int:
    person = next((each for each in capture["people"] if _is_person(conn, each)), None)
    if person is None:
        return 0
    return int(insert_topic(conn, person, clean_topic(capture["title"]), note_id, capture["line"], now) is not None)


# ---- by key ----

class CaptureRepository:
    def __init__(self, db: Database, tasks: TaskRepository, notes: NoteRepository, clock: Clock = utc_now,
                 today: Callable[[], str] = local_today):
        """tasks, notes: removing a capture takes the same path as removing the task, or
        trashing the record, anywhere else."""
        self._db = db
        self._tasks = tasks
        self._notes = notes
        self._clock = clock
        self._today = today

    def create(self, source_id: int, values: Dict) -> Dict:
        capture = _clean(values)
        with self._db.transaction() as conn:
            source = live_note_row(conn, source_id)
            hub = _target_hub(conn, source, capture)
            if capture["person_id"] is not None and not _is_person(conn, capture["person_id"]):
                raise NotFound("No such person: {}".format(capture["person_id"]))
            kind, item_id = _store(conn, source, hub, capture, self._clock(), self._today())
            return _captures_by_id(conn, kind, item_id)[0]

    def list(self, source_id: int) -> List[Dict]:
        with self._db.reading() as conn:
            return captures_of(conn, source_id)

    def remove(self, kind: object, item_id: int) -> None:
        with self._db.reading() as conn:
            if kind not in KINDS or not _captures_by_id(conn, kind, item_id):
                raise NotFound("No such capture: {} {}".format(kind, item_id))
        if kind == "task":
            self._tasks.remove(item_id)
        else:
            self._notes.delete(item_id)


def nearest_hub(conn: sqlite3.Connection, note_id: int) -> Optional[sqlite3.Row]:
    """Where a note's captures go: its project or area (a meeting's or a record's is its
    parent), or the person it sits under. None for a note in the Inbox or Resources, a person's
    own note, a template, or a note in an archived hub."""
    hub = _hub_of(conn, note_id)
    if hub is None or hub["archived_at"] is not None:
        return None
    return hub


def captures_of(conn: sqlite3.Connection, source_id: int) -> List[Dict]:
    """Every live task and record made from a note's lines, in the order made."""
    tasks = conn.execute(_TASKS + " AND task_sources.source_id = ?", (source_id,)).fetchall()
    records = conn.execute(_RECORDS + " AND source_id = ?", (source_id,)).fetchall()
    made = [(row["created_at"], 0, row["id"], _task_capture(conn, row)) for row in tasks]
    made += [(row["created_at"], 1, row["id"], _record_capture(conn, row)) for row in records]
    return [each[3] for each in sorted(made, key=lambda each: each[:3])]


def _clean(values: Dict) -> Dict:
    kind = values.get("kind")
    if kind not in KINDS:
        raise BadCapture("kind must be task, question or decision")
    hub_id, person_id, role = values.get("hub_id"), values.get("person_id"), values.get("role")
    if not _is_id(hub_id):
        raise BadCapture("hub_id must be a whole number")
    if person_id is not None and not _is_id(person_id):
        raise BadCapture("person_id must be a whole number or null")
    try:
        title = clean_task_title(values.get("title")) if kind == "task" else clean_title(values.get("title"))
        # A record has no role or days: they are ignored, not checked.
        follow_up = clean_optional_day(values.get("follow_up")) if kind == "task" else ""
        due = clean_optional_day(values.get("due")) if kind == "task" else ""
    except (BadTask, BadTitle) as error:
        raise BadCapture(str(error)) from None
    if kind != "task":
        role = None
    elif role is not None and role not in ROLES:
        raise BadCapture("role must be delegate, for or mine")
    elif role in ("delegate", "for") and person_id is None:
        raise BadCapture("A task's role needs a person")
    return {"kind": kind, "title": title, "quote": _clean_quote(values.get("quote")), "hub_id": hub_id,
            "person_id": person_id, "role": role, "follow_up": follow_up, "due": due}


def _clean_quote(quote: object) -> str:
    if not isinstance(quote, str) or not quote.strip() or len(quote) > MAX_QUOTE:
        raise BadCapture("A capture's line must be text of at most {} characters".format(MAX_QUOTE))
    return quote.strip()


def _target_hub(conn: sqlite3.Connection, source: sqlite3.Row, capture: Dict) -> sqlite3.Row:
    """The hub asked for, if a capture from this note may go there: any live project or area,
    or the person this note is under (for a task only)."""
    hub = live_note_row(conn, capture["hub_id"])
    if hub["is_person"]:
        own = nearest_hub(conn, source["id"])
        if own is None or own["id"] != hub["id"]:
            raise NoHub('"{}" is a person: only a note under them captures to them'.format(hub["title"]))
        if capture["kind"] != "task":
            # A record is a note directly under a project or an area, so a person can't hold one.
            raise NoHub('"{}" is a person: a question or a decision goes in a project or an area '
                        '(pick one with ▾)'.format(hub["title"]))
        return hub
    if hub["parent_id"] is not None or hub["is_template"] or hub["kind"] not in HUB_KINDS:
        raise NoHub('"{}" is not a hub: captures go to a project or an area'.format(hub["title"]))
    if hub["archived_at"] is not None:
        raise NoHub('"{}" is archived (:restore it first)'.format(hub["title"]))
    return hub


def _store(conn: sqlite3.Connection, source: sqlite3.Row, hub: sqlite3.Row, capture: Dict, now: str,
           today: str) -> Tuple[str, int]:
    """Makes the task or the record, and its source row. Returns (kind, its id)."""
    _refuse_twice(conn, source["id"], capture)
    if capture["kind"] == "task":
        # A person's note holds no tasks: one for a person stays on the note it came from.
        owner = source["id"] if hub["is_person"] else hub["id"]
        task_id = insert_task(conn, owner, capture["title"], None, capture["due"], "", now)
        conn.execute("INSERT INTO task_sources (task_id, source_id, quote) VALUES (?, ?, ?)",
                     (task_id, source["id"], capture["quote"]))
        role, person = capture["role"], capture["person_id"]
        delegate = person if role == "delegate" else None
        conn.execute("UPDATE tasks SET delegate_id = ?, for_person_id = ?, follow_up = ? WHERE id = ?",
                     (delegate, person if role == "for" else None, capture["follow_up"] if delegate else "", task_id))
        return "task", task_id
    meeting = conn.execute("SELECT day FROM meetings WHERE note_id = ?", (source["id"],)).fetchone()
    day = meeting["day"] if meeting is not None and meeting["day"] else today
    people = [capture["person_id"]] if capture["person_id"] is not None else []
    record_id = insert_record(conn, hub["id"], capture["kind"], capture["title"], day, source["id"],
                              capture["quote"], now, people)
    return capture["kind"], record_id


def _refuse_twice(conn: sqlite3.Connection, source_id: int, capture: Dict) -> None:
    if capture["kind"] == "task":
        found = conn.execute(_TASKS + " AND task_sources.source_id = ? AND task_sources.quote = ?",
                             (source_id, capture["quote"])).fetchone()
    else:
        found = conn.execute(_RECORDS + " AND source_id = ? AND quote = ? AND kind = ?",
                             (source_id, capture["quote"], capture["kind"])).fetchone()
    if found:
        raise AlreadyCaptured("already captured")


def _captures_by_id(conn: sqlite3.Connection, kind: str, item_id: int) -> List[Dict]:
    """The live capture of this kind with this id: one, or none."""
    if kind == "task":
        rows = conn.execute(_TASKS + " AND tasks.id = ?", (item_id,)).fetchall()
        return [_task_capture(conn, row) for row in rows]
    rows = conn.execute(_RECORDS + " AND id = ? AND kind = ?", (item_id, kind)).fetchall()
    return [_record_capture(conn, row) for row in rows]


# Live captured tasks, and live captured records with their kind; callers add " AND ...".
_TASKS = ("SELECT tasks.*, task_sources.quote FROM task_sources JOIN tasks ON tasks.id = task_sources.task_id "
          "JOIN notes ON notes.id = tasks.note_id WHERE tasks.removed_at IS NULL AND notes.deleted_at IS NULL "
          "AND task_sources.source_id IS NOT NULL")
_RECORDS = ("SELECT * FROM (SELECT notes.id, notes.title, notes.created_at, notes.deleted_at, record_sources.source_id, "
            "record_sources.quote, CASE WHEN decisions.note_id IS NOT NULL THEN 'decision' ELSE 'question' END AS kind, "
            "ifnull(questions.answered, '') AS answered FROM record_sources "
            "JOIN notes ON notes.id = record_sources.note_id "
            "LEFT JOIN decisions ON decisions.note_id = notes.id LEFT JOIN questions ON questions.note_id = notes.id "
            "WHERE decisions.note_id IS NOT NULL OR questions.note_id IS NOT NULL) AS made "
            "WHERE deleted_at IS NULL AND source_id IS NOT NULL")


def _task_capture(conn: sqlite3.Connection, row: sqlite3.Row) -> Dict:
    if row["delegate_id"] is not None:
        role, person_id = "delegate", row["delegate_id"]
    elif row["for_person_id"] is not None:
        role, person_id = "for", row["for_person_id"]
    else:
        role, person_id = "mine", None
    return _capture("task", row["id"], row["title"], row["quote"], _hub_of(conn, row["note_id"]),
                    _person(conn, person_id), role, row["follow_up"] if role == "delegate" else "", row["due"],
                    not row["done"])


def _record_capture(conn: sqlite3.Connection, row: sqlite3.Row) -> Dict:
    first = conn.execute(
        "SELECT person_id FROM record_people JOIN notes ON notes.id = record_people.person_id "
        "WHERE record_people.note_id = ? AND notes.deleted_at IS NULL ORDER BY record_people.rowid LIMIT 1",
        (row["id"],)).fetchone()
    return _capture(row["kind"], row["id"], row["title"], row["quote"], _hub_of(conn, row["id"]),
                    _person(conn, first[0] if first else None), None, "", "", not row["answered"])


def _capture(kind: str, item_id: int, title: str, quote: str, hub: Optional[sqlite3.Row],
             person: Optional[sqlite3.Row], role: Optional[str], follow_up: str, due: str, is_open: bool) -> Dict:
    return {"kind": kind, "id": item_id, "title": title, "quote": quote,
            "hub_id": hub["id"] if hub is not None else None, "hub_title": hub["title"] if hub is not None else None,
            "person_id": person["id"] if person is not None else None,
            "person_name": person["title"] if person is not None else None,
            "role": role, "follow_up": follow_up or None, "due": due or None, "open": bool(is_open)}


def _hub_of(conn: sqlite3.Connection, note_id: int) -> Optional[sqlite3.Row]:
    """The note's project, area or person, archived or not."""
    try:
        top = top_note_row(conn, note_id)
    except NotFound:
        return None
    if top["is_person"]:
        return top if top["id"] != note_id else None
    if top["is_template"] or top["kind"] not in HUB_KINDS:
        return None
    return top


def _person(conn: sqlite3.Connection, person_id: Optional[int]) -> Optional[sqlite3.Row]:
    if person_id is None:
        return None
    return conn.execute("SELECT notes.id, notes.title FROM people JOIN notes ON notes.id = people.note_id "
                        "WHERE people.note_id = ? AND notes.deleted_at IS NULL", (person_id,)).fetchone()


def _is_id(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _optional_id(value: object) -> Optional[int]:
    return value if _is_id(value) else None


def _is_person(conn: sqlite3.Connection, person_id: Optional[int]) -> bool:
    return _person(conn, person_id) is not None
