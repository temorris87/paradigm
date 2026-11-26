"""Plan templates kept on an area (019_templates.sql): phases and milestones placed in
working days from the start, each phase with its standard tasks. The only code that knows the
plan_templates, plan_items, plan_item_tasks and project_plans tables.

Applying one makes real phases, milestones and tasks in a project, counting working days
(weekends and the timesheet's holidays skipped) from a start day. Saving one goes the other
way: a project's phases, milestones and their tasks become a template on its area."""
import sqlite3
from datetime import date, timedelta
from typing import Callable, Dict, List, Optional, Set

from paradigm.db.connection import Database
from paradigm.db.notes_repo import NoteError, NotFound, live_note_row, utc_now
from paradigm.db.plan_repo import NotInAProject, insert_milestone, insert_phase
from paradigm.db.tasks_repo import TaskRepository
from paradigm.db.time_repo import holiday_dates
from paradigm.notes.days import add_working_days, working_days_between
from paradigm.notes.meetings import BadWhen, clean_day
from paradigm.notes.tasks import clean_task_title
from paradigm.notes.titles import BadTitle, clean_title

Clock = Callable[[], str]

__all__ = ["PlanTemplateRepository", "NotAnArea", "BadPlan", "NotFound", "BadWhen", "BadTitle", "NotInAProject"]

# The longest a template may run, in working days (about four years).
MAX_OFFSET = 1000


class NotAnArea(NoteError):
    pass


class BadPlan(NoteError):
    pass


class PlanTemplateRepository:
    def __init__(self, db: Database, tasks: TaskRepository, clock: Clock = utc_now):
        self._db = db
        self._tasks = tasks
        self._clock = clock

    def list(self) -> List[Dict]:
        """Every template on a live area, with its items (in order) and their tasks."""
        with self._db.reading() as conn:
            rows = conn.execute(
                "SELECT plan_templates.* FROM plan_templates JOIN notes ON notes.id = plan_templates.area_id "
                "WHERE notes.deleted_at IS NULL ORDER BY plan_templates.title COLLATE NOCASE, plan_templates.id"
            ).fetchall()
            return [_template(conn, row) for row in rows]

    def applied(self) -> List[Dict]:
        """Which template each project's plan came from."""
        with self._db.reading() as conn:
            return [dict(row) for row in conn.execute("SELECT * FROM project_plans ORDER BY project_id")]

    def get(self, template_id: int) -> Dict:
        with self._db.reading() as conn:
            return _template(conn, _template_row(conn, template_id))

    def create(self, area_id: int, title: object) -> Dict:
        title = clean_title(title)
        with self._db.transaction() as conn:
            _area_row(conn, area_id)
            template_id = conn.execute("INSERT INTO plan_templates (area_id, title, created_at) VALUES (?, ?, ?)",
                                       (area_id, title, self._clock())).lastrowid
            return _template(conn, _template_row(conn, template_id))

    def rename(self, template_id: int, title: object) -> Dict:
        title = clean_title(title)
        with self._db.transaction() as conn:
            _template_row(conn, template_id)
            conn.execute("UPDATE plan_templates SET title = ? WHERE id = ?", (title, template_id))
            return _template(conn, _template_row(conn, template_id))

    def remove(self, template_id: int) -> None:
        with self._db.transaction() as conn:
            _template_row(conn, template_id)
            items = "SELECT id FROM plan_items WHERE template_id = ?"
            conn.execute("UPDATE plan_item_tasks SET parent_id = NULL WHERE item_id IN ({})".format(items), (template_id,))
            conn.execute("DELETE FROM plan_item_tasks WHERE item_id IN ({})".format(items), (template_id,))
            conn.execute("UPDATE plan_items SET phase_id = NULL WHERE template_id = ?", (template_id,))
            conn.execute("DELETE FROM plan_items WHERE template_id = ?", (template_id,))
            conn.execute("UPDATE project_plans SET template_id = NULL WHERE template_id = ?", (template_id,))
            conn.execute("DELETE FROM plan_templates WHERE id = ?", (template_id,))

    # ---- items ----

    def add_item(self, template_id: int, kind: object, title: object, start: object, end: object = None,
                 phase_id: Optional[int] = None) -> Dict:
        kind, title = _clean_kind(kind), clean_title(title)
        start, end = _offsets(start, start if kind == "milestone" or end is None else end)
        with self._db.transaction() as conn:
            _template_row(conn, template_id)
            if phase_id is not None:
                _check_phase_item(conn, template_id, phase_id, kind)
            position = conn.execute("SELECT ifnull(max(position), 0) + 1 FROM plan_items WHERE template_id = ?",
                                    (template_id,)).fetchone()[0]
            conn.execute("INSERT INTO plan_items (template_id, kind, title, start, end, phase_id, position) "
                         "VALUES (?, ?, ?, ?, ?, ?, ?)", (template_id, kind, title, start, end, phase_id, position))
            return _template(conn, _template_row(conn, template_id))

    def update_item(self, item_id: int, values: Dict[str, object]) -> Dict:
        """Changes an item's title, start or end (a milestone has one day: end follows start)."""
        with self._db.transaction() as conn:
            row = _item_row(conn, item_id)
            title = clean_title(values["title"]) if "title" in values else row["title"]
            start = values.get("start", row["start"])
            end = start if row["kind"] == "milestone" else values.get("end", row["end"])
            start, end = _offsets(start, end)
            conn.execute("UPDATE plan_items SET title = ?, start = ?, end = ? WHERE id = ?", (title, start, end, item_id))
            return _template(conn, _template_row(conn, row["template_id"]))

    def remove_item(self, item_id: int) -> Dict:
        with self._db.transaction() as conn:
            row = _item_row(conn, item_id)
            conn.execute("UPDATE plan_items SET phase_id = NULL WHERE phase_id = ?", (item_id,))
            conn.execute("UPDATE plan_item_tasks SET parent_id = NULL WHERE item_id = ?", (item_id,))
            conn.execute("DELETE FROM plan_item_tasks WHERE item_id = ?", (item_id,))
            conn.execute("DELETE FROM plan_items WHERE id = ?", (item_id,))
            return _template(conn, _template_row(conn, row["template_id"]))

    def add_task(self, item_id: int, title: object, parent_id: Optional[int] = None) -> Dict:
        title = clean_task_title(title)
        with self._db.transaction() as conn:
            row = _item_row(conn, item_id)
            if parent_id is not None:
                parent = conn.execute("SELECT * FROM plan_item_tasks WHERE id = ?", (parent_id,)).fetchone()
                if parent is None or parent["item_id"] != item_id or parent["parent_id"] is not None:
                    raise BadPlan("A subtask goes under a task of the same item, one level deep")
            position = conn.execute("SELECT ifnull(max(position), 0) + 1 FROM plan_item_tasks WHERE item_id = ?",
                                    (item_id,)).fetchone()[0]
            conn.execute("INSERT INTO plan_item_tasks (item_id, parent_id, title, position) VALUES (?, ?, ?, ?)",
                         (item_id, parent_id, title, position))
            return _template(conn, _template_row(conn, row["template_id"]))

    def remove_task(self, task_id: int) -> Dict:
        with self._db.transaction() as conn:
            row = conn.execute("SELECT * FROM plan_item_tasks WHERE id = ?", (task_id,)).fetchone()
            if row is None:
                raise NotFound("No such template task: {}".format(task_id))
            conn.execute("DELETE FROM plan_item_tasks WHERE parent_id = ?", (task_id,))
            conn.execute("DELETE FROM plan_item_tasks WHERE id = ?", (task_id,))
            return _template(conn, _template_row(conn, _item_row(conn, row["item_id"])["template_id"]))

    # ---- applying and saving ----

    def apply(self, template_id: int, project_id: int, start: object) -> Dict:
        """Makes the template's phases, milestones and tasks in a project, counting working
        days from start. Returns {phases, milestones, tasks}: how many of each were made."""
        start = date.fromisoformat(clean_day(start))
        now = self._clock()
        with self._db.transaction() as conn:
            template = _template(conn, _template_row(conn, template_id))
            if not template["items"]:
                raise BadPlan('"{}" has nothing in it yet: add a phase or a milestone first'.format(template["title"]))
            last = max(item["end"] for item in template["items"])
            holidays = _holidays(conn, start, last)
            day = lambda offset: add_working_days(start, offset, holidays).isoformat()  # noqa: E731
            made_notes: Dict[int, int] = {}
            counts = {"phases": 0, "milestones": 0, "tasks": 0}
            for item in [each for each in template["items"] if each["kind"] == "phase"]:
                made_notes[item["id"]] = insert_phase(conn, project_id, _free_phase_title(conn, project_id, item["title"]),
                                                      day(item["start"]), day(item["end"]), now)
                counts["phases"] += 1
            for item in [each for each in template["items"] if each["kind"] == "milestone"]:
                owner = made_notes.get(item["phase_id"], project_id)
                made_notes[item["id"]] = insert_milestone(conn, owner, item["title"], day(item["start"]), now)
                counts["milestones"] += 1
            for item in template["items"]:
                made: Dict[int, int] = {}
                for task in item["tasks"]:
                    made[task["id"]] = self._tasks.insert(conn, made_notes[item["id"]], task["title"],
                                                          made.get(task["parent_id"]))
                    counts["tasks"] += 1
            conn.execute("INSERT INTO project_plans (project_id, template_id, title, applied_at) VALUES (?, ?, ?, ?) "
                         "ON CONFLICT (project_id) DO UPDATE SET template_id = excluded.template_id, "
                         "title = excluded.title, applied_at = excluded.applied_at",
                         (project_id, template_id, template["title"], now))
        return counts

    def save_from(self, project_id: int, title: object) -> Dict:
        """A project's phases and milestones (with their tasks) as a new template on its area:
        dates become working days from its first phase or milestone."""
        title = clean_title(title)
        with self._db.transaction() as conn:
            project = live_note_row(conn, project_id)
            if project["kind"] != "project" or project["parent_id"] is not None:
                raise NotInAProject('"{}" is not a project'.format(project["title"]))
            if project["area_id"] is None:
                raise NotAnArea('"{}" is in no area: plan templates are kept on an area'.format(project["title"]))
            phases = conn.execute(
                "SELECT notes.id, notes.title, phases.start, phases.end FROM phases JOIN notes ON notes.id = phases.note_id "
                "WHERE notes.parent_id = ? AND notes.deleted_at IS NULL ORDER BY phases.start, notes.id",
                (project_id,)).fetchall()
            phase_ids = [row["id"] for row in phases]
            marks = ",".join("?" * len(phase_ids))
            milestones = conn.execute(
                "SELECT notes.id, notes.title, notes.parent_id, milestones.day FROM milestones "
                "JOIN notes ON notes.id = milestones.note_id WHERE notes.deleted_at IS NULL AND (notes.parent_id = ? {}) "
                "ORDER BY milestones.day, notes.id".format("OR notes.parent_id IN ({})".format(marks) if marks else ""),
                [project_id] + phase_ids).fetchall()
            days = [row["start"] for row in phases] + [row["day"] for row in milestones]
            if not days:
                raise BadPlan('"{}" has no phases or milestones to save'.format(project["title"]))
            first = date.fromisoformat(min(days))
            last = date.fromisoformat(max([row["end"] for row in phases] + days))
            holidays = _holidays(conn, first, working_days_between(first, last))
            offset = lambda text: working_days_between(first, date.fromisoformat(text), holidays)  # noqa: E731
            template_id = conn.execute("INSERT INTO plan_templates (area_id, title, created_at) VALUES (?, ?, ?)",
                                       (project["area_id"], title, self._clock())).lastrowid
            item_of: Dict[int, int] = {}
            position = 0
            for row in phases:
                position += 1
                item_of[row["id"]] = conn.execute(
                    "INSERT INTO plan_items (template_id, kind, title, start, end, position) VALUES (?, 'phase', ?, ?, ?, ?)",
                    (template_id, row["title"], offset(row["start"]), max(offset(row["start"]), offset(row["end"])),
                     position)).lastrowid
            for row in milestones:
                position += 1
                at = offset(row["day"])
                item_of[row["id"]] = conn.execute(
                    "INSERT INTO plan_items (template_id, kind, title, start, end, phase_id, position) "
                    "VALUES (?, 'milestone', ?, ?, ?, ?, ?)",
                    (template_id, row["title"], at, at, item_of.get(row["parent_id"]), position)).lastrowid
            for note_id, item_id in item_of.items():
                _copy_tasks(conn, note_id, item_id)
            return _template(conn, _template_row(conn, template_id))


def _copy_tasks(conn: sqlite3.Connection, note_id: int, item_id: int) -> None:
    rows = conn.execute("SELECT * FROM tasks WHERE note_id = ? AND removed_at IS NULL ORDER BY parent_id IS NOT NULL, "
                        "position, id", (note_id,)).fetchall()
    made: Dict[int, int] = {}
    for position, row in enumerate(rows, 1):
        parent = made.get(row["parent_id"]) if row["parent_id"] is not None else None
        if row["parent_id"] is not None and parent is None:
            continue
        made_id = conn.execute(
            "INSERT INTO plan_item_tasks (item_id, parent_id, title, position) VALUES (?, ?, ?, ?)",
            (item_id, parent, row["title"], position)).lastrowid
        # Templates hold one level of subtasks: a subtask's own subtasks are left out.
        if row["parent_id"] is None:
            made[row["id"]] = made_id


def _holidays(conn: sqlite3.Connection, start: date, working_days: int) -> Set[date]:
    """The holidays over as many calendar days as working_days could take from start."""
    span = timedelta(days=working_days * 2 + 60)
    return set(holiday_dates(conn, start - timedelta(days=7), start + span))


def _free_phase_title(conn: sqlite3.Connection, project_id: int, title: str) -> str:
    """title, or "title (2)"... when the project has a note of that name already."""
    for n in range(1, 100):
        candidate = title if n == 1 else "{} ({})".format(title, n)
        taken = conn.execute(
            "SELECT 1 FROM notes WHERE parent_id = ? AND title = ? COLLATE NOCASE AND title_shared = 0 "
            "AND deleted_at IS NULL", (project_id, candidate)).fetchone()
        if not taken:
            return candidate
    raise BadPlan('Too many notes called "{}" in the project'.format(title))


def _clean_kind(kind: object) -> str:
    if kind not in ("phase", "milestone"):
        raise BadPlan("An item is a phase or a milestone")
    return kind


def _offsets(start: object, end: object):
    for value in (start, end):
        if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= MAX_OFFSET:
            raise BadPlan("Days from the start must be whole numbers from 0 to {}".format(MAX_OFFSET))
    if end < start:
        raise BadPlan("A phase must end on or after the day it starts")
    return start, end


def _check_phase_item(conn: sqlite3.Connection, template_id: int, phase_id: int, kind: str) -> None:
    phase = _item_row(conn, phase_id)
    if kind != "milestone" or phase["kind"] != "phase" or phase["template_id"] != template_id:
        raise BadPlan("Only a milestone goes in a phase of the same template")


def _area_row(conn: sqlite3.Connection, area_id: int) -> sqlite3.Row:
    row = live_note_row(conn, area_id)
    if row["kind"] != "area" or row["parent_id"] is not None or row["is_person"] or row["is_template"]:
        raise NotAnArea('"{}" is not an area: plan templates are kept on an area'.format(row["title"]))
    return row


def _template_row(conn: sqlite3.Connection, template_id: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM plan_templates WHERE id = ?", (template_id,)).fetchone()
    if row is None:
        raise NotFound("No such plan template: {}".format(template_id))
    return row


def _item_row(conn: sqlite3.Connection, item_id: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM plan_items WHERE id = ?", (item_id,)).fetchone()
    if row is None:
        raise NotFound("No such template item: {}".format(item_id))
    return row


def _template(conn: sqlite3.Connection, row: sqlite3.Row) -> Dict:
    items = conn.execute("SELECT * FROM plan_items WHERE template_id = ? ORDER BY start, position, id",
                         (row["id"],)).fetchall()
    tasks: Dict[int, List[Dict]] = {}
    for task in conn.execute("SELECT plan_item_tasks.* FROM plan_item_tasks JOIN plan_items ON plan_items.id = item_id "
                             "WHERE template_id = ? ORDER BY plan_item_tasks.parent_id IS NOT NULL, "
                             "plan_item_tasks.position, plan_item_tasks.id", (row["id"],)):
        tasks.setdefault(task["item_id"], []).append(
            {"id": task["id"], "parent_id": task["parent_id"], "title": task["title"]})
    return {"id": row["id"], "area_id": row["area_id"], "title": row["title"],
            "items": [{"id": item["id"], "kind": item["kind"], "title": item["title"], "start": item["start"],
                       "end": item["end"], "phase_id": item["phase_id"], "tasks": tasks.get(item["id"], [])}
                      for item in items]}
