"""Every read and write of a project's plan: phases, milestones and the history of their
dates (018_phases.sql). The only code that knows the phases, milestones and
schedule_changes tables. A phase's or milestone's title and text are its note's
(NoteRepository renames and saves them).

A phase sits directly under its project, and may hold notes. A milestone sits under its
project or one of its phases, and holds none. The first dates set are the baseline; every
change after that is written to schedule_changes with when and why."""
import sqlite3
from typing import Callable, Dict, List, Optional

from paradigm.db.connection import Database
from paradigm.db.notes_repo import (NoteError, NotFound, check_title_free, live_note_row, top_note_row,
                                    utc_now)
from paradigm.notes.days import local_today
from paradigm.notes.meetings import BadWhen, clean_day
from paradigm.notes.plans import clean_reason, clean_span_days
from paradigm.notes.titles import BadTitle, clean_title

Clock = Callable[[], str]

__all__ = ["PlanRepository", "NotInAProject", "NotPlanned", "HasMilestones", "NotFound", "BadWhen", "BadTitle",
           "insert_phase", "insert_milestone"]


class NotInAProject(NoteError):
    """Phases go directly in a project; milestones in a project or a phase."""


class NotPlanned(NoteError):
    """The note is not a phase or a milestone (or already is one)."""


class HasMilestones(NoteError):
    """A phase with milestones in it stays a phase until they move."""


class PlanRepository:
    def __init__(self, db: Database, clock: Clock = utc_now, today: Callable[[], str] = local_today):
        self._db = db
        self._clock = clock
        self._today = today

    def plan(self) -> Dict[str, List[Dict]]:
        """Every live phase and milestone, and the date changes of each."""
        with self._db.reading() as conn:
            live = "JOIN notes ON notes.id = {}.note_id AND notes.deleted_at IS NULL"
            phases = conn.execute("SELECT phases.* FROM phases " + live.format("phases") +
                                  " ORDER BY start, end, note_id").fetchall()
            milestones = conn.execute("SELECT milestones.* FROM milestones " + live.format("milestones") +
                                      " ORDER BY day, note_id").fetchall()
            changes = conn.execute("SELECT schedule_changes.* FROM schedule_changes " +
                                   live.format("schedule_changes") + " ORDER BY schedule_changes.id").fetchall()
        return {"phases": [_phase(row) for row in phases], "milestones": [_milestone(row) for row in milestones],
                "changes": [_change(row) for row in changes]}

    def create_phase(self, project_id: int, title: object, start: object, end: object) -> int:
        title, (start, end) = clean_title(title), clean_span_days(start, end)
        with self._db.transaction() as conn:
            return insert_phase(conn, project_id, title, start, end, self._clock())

    def create_milestone(self, owner_id: int, title: object, day: object) -> int:
        title, day = clean_title(title), clean_day(day)
        with self._db.transaction() as conn:
            return insert_milestone(conn, owner_id, title, day, self._clock())

    def make_phase(self, note_id: int, start: object, end: object) -> None:
        """A plain note directly under a project becomes one of its phases."""
        start, end = clean_span_days(start, end)
        with self._db.transaction() as conn:
            row = live_note_row(conn, note_id)
            if row["is_phase"] or row["is_milestone"] or row["is_meeting"] or row["is_decision"] \
                    or row["is_question"] or row["is_person"] or row["is_template"]:
                raise NotPlanned('"{}" is already something else: only a plain note becomes a phase'.format(row["title"]))
            if row["parent_id"] is None or not _is_project(live_note_row(conn, row["parent_id"])):
                raise NotInAProject('"{}" is not directly in a project: move it there first'.format(row["title"]))
            conn.execute("INSERT INTO phases (note_id, start, end, baseline_start, baseline_end) VALUES (?, ?, ?, ?, ?)",
                         (note_id, start, end, start, end))

    def unmake_phase(self, note_id: int) -> None:
        """A phase goes back to being a plain note (its date history goes with it)."""
        with self._db.transaction() as conn:
            row = _phase_row(conn, note_id)
            inside = conn.execute(
                "SELECT count(*) FROM milestones JOIN notes ON notes.id = milestones.note_id "
                "WHERE notes.parent_id = ? AND notes.deleted_at IS NULL", (row["note_id"],)).fetchone()[0]
            if inside:
                raise HasMilestones("It has {} milestone{} in it: move them to the project first".format(
                    inside, "" if inside == 1 else "s"))
            conn.execute("DELETE FROM schedule_changes WHERE note_id = ?", (note_id,))
            conn.execute("DELETE FROM phases WHERE note_id = ?", (note_id,))

    def set_dates(self, note_id: int, values: Dict[str, object], reason: object = "") -> List[Dict]:
        """Moves a phase's start and/or end, or a milestone's day; each change is logged with
        reason. Returns the changes made."""
        reason = clean_reason(reason)
        now = self._clock()
        with self._db.transaction() as conn:
            note = live_note_row(conn, note_id)
            if note["is_phase"]:
                row = _phase_row(conn, note_id)
                start, end = clean_span_days(values.get("start", row["start"]), values.get("end", row["end"]))
                new = {"start": start, "end": end}
                table = "phases"
            elif note["is_milestone"]:
                row = conn.execute("SELECT * FROM milestones WHERE note_id = ?", (note_id,)).fetchone()
                new = {"day": clean_day(values.get("day", row["day"]))}
                table = "milestones"
            else:
                raise NotPlanned('"{}" is not a phase or a milestone'.format(note["title"]))
            made = []
            for field, value in new.items():
                if value == row[field]:
                    continue
                # table and field come from the fixed choices above, never from input.
                conn.execute("UPDATE {} SET {} = ? WHERE note_id = ?".format(table, field), (value, note_id))
                change_id = conn.execute(
                    "INSERT INTO schedule_changes (note_id, field, old, new, changed_at, reason) VALUES (?, ?, ?, ?, ?, ?)",
                    (note_id, field, row[field], value, now, reason)).lastrowid
                made.append(_change(conn.execute("SELECT * FROM schedule_changes WHERE id = ?", (change_id,)).fetchone()))
        return made

    def set_milestone_done(self, note_id: int, done: bool) -> Dict:
        with self._db.transaction() as conn:
            live_note_row(conn, note_id)
            row = conn.execute("SELECT * FROM milestones WHERE note_id = ?", (note_id,)).fetchone()
            if row is None:
                raise NotPlanned("That note is not a milestone")
            done_day = (row["done_day"] or self._today()) if done else ""
            conn.execute("UPDATE milestones SET done_day = ? WHERE note_id = ?", (done_day, note_id))
            return _milestone(conn.execute("SELECT * FROM milestones WHERE note_id = ?", (note_id,)).fetchone())


def insert_phase(conn: sqlite3.Connection, project_id: int, title: str, start: str, end: str, now: str) -> int:
    """A new phase note directly under a project, with its dates as the baseline (inside a
    caller's transaction; the values are clean). Returns its id."""
    project = live_note_row(conn, project_id)
    if not _is_project(project):
        raise NotInAProject('"{}" is not a project: phases go in a project'.format(project["title"]))
    _check_live(project)
    check_title_free(conn, project_id, title, None)
    note_id = conn.execute(
        "INSERT INTO notes (parent_id, title, body, created_at, updated_at) VALUES (?, ?, '', ?, ?)",
        (project_id, title, now, now)).lastrowid
    conn.execute("INSERT INTO phases (note_id, start, end, baseline_start, baseline_end) VALUES (?, ?, ?, ?, ?)",
                 (note_id, start, end, start, end))
    return note_id


def insert_milestone(conn: sqlite3.Connection, owner_id: int, title: str, day: str, now: str) -> int:
    """A new milestone note in a project or one of its phases (milestones may share titles)."""
    owner = live_note_row(conn, owner_id)
    if not (_is_project(owner) or owner["is_phase"]):
        raise NotInAProject('"{}" is not a project or a phase: milestones go in one'.format(owner["title"]))
    _check_live(top_note_row(conn, owner_id))
    note_id = conn.execute(
        "INSERT INTO notes (parent_id, title, body, created_at, updated_at, title_shared) VALUES (?, ?, '', ?, ?, 1)",
        (owner_id, title, now, now)).lastrowid
    conn.execute("INSERT INTO milestones (note_id, day, baseline_day) VALUES (?, ?, ?)", (note_id, day, day))
    return note_id


def _check_live(project: sqlite3.Row) -> None:
    if project["archived_at"] is not None:
        raise NotInAProject('"{}" is archived (restore it first)'.format(project["title"]))


def _is_project(row: sqlite3.Row) -> bool:
    return row["parent_id"] is None and row["kind"] == "project" and not row["is_person"] and not row["is_template"]


def _phase_row(conn: sqlite3.Connection, note_id: int) -> sqlite3.Row:
    live_note_row(conn, note_id)
    row = conn.execute("SELECT * FROM phases WHERE note_id = ?", (note_id,)).fetchone()
    if row is None:
        raise NotPlanned("That note is not a phase")
    return row


def _phase(row: sqlite3.Row) -> Dict:
    return {"id": row["note_id"], "start": row["start"], "end": row["end"],
            "baseline_start": row["baseline_start"], "baseline_end": row["baseline_end"]}


def _milestone(row: sqlite3.Row) -> Dict:
    return {"id": row["note_id"], "day": row["day"], "baseline_day": row["baseline_day"], "done_day": row["done_day"]}


def _change(row: sqlite3.Row) -> Dict:
    return {"id": row["id"], "note_id": row["note_id"], "field": row["field"], "old": row["old"], "new": row["new"],
            "changed_at": row["changed_at"], "reason": row["reason"]}
