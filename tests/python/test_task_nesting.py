"""Subtasks at any depth up to MAX_TASK_DEPTH: creating, closing a subtree, deleting one,
moving among nested siblings, the Trash, and plan templates staying one level."""
import tempfile
import unittest
from pathlib import Path

from paradigm.db.connection import Database
from paradigm.db.migrate import migrate
from paradigm.db.notes_repo import NoteRepository
from paradigm.db.people_repo import PeopleRepository
from paradigm.db.plan_repo import PlanRepository
from paradigm.db.plan_templates_repo import PlanTemplateRepository
from paradigm.db.tasks_repo import MAX_TASK_DEPTH, NoTasksHere, NotFound, TaskRepository
from paradigm.db.trash_repo import TrashRepository
from helpers import RunningServer


class Clock:
    def __init__(self) -> None:
        self.now = "2026-11-21T12:00:00.000Z"

    def __call__(self) -> str:
        return self.now


class TaskNestingTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database.in_folder(Path(self.tmp.name) / "data")
        migrate(self.db)
        self.clock = Clock()
        self.today = "2026-11-26"
        self.notes = NoteRepository(self.db, clock=self.clock)
        self.notes.create(None, "Keep")
        self.tasks = TaskRepository(self.db, clock=self.clock, today=lambda: self.today)
        project = self.notes.create(None, "Move office")
        self.notes.set_kind(project["id"], "project")
        self.note_id = project["id"]

    def tearDown(self) -> None:
        self.db.close()
        self.tmp.cleanup()

    def add(self, title, parent=None):
        return self.tasks.create(self.note_id, title, None if parent is None else parent["id"])

    def chain(self, levels):
        """A task with a subtask under it, and so on: levels tasks in all, top first."""
        made = [self.add("Level 1")]
        for level in range(2, levels + 1):
            made.append(self.add("Level {}".format(level), made[-1]))
        return made

    def by_id(self):
        return {task["id"]: task for task in self.tasks.list()}

    def test_a_grandchild_is_allowed(self) -> None:
        van = self.add("Book van")
        quotes = self.add("Get quotes", van)
        call = self.add("Call Northwind", quotes)
        self.assertEqual(call["parent_id"], quotes["id"])
        self.assertEqual(call["note_id"], self.note_id)

    def test_five_levels_go_and_the_sixth_is_refused(self) -> None:
        self.assertEqual(MAX_TASK_DEPTH, 5)
        made = self.chain(5)
        with self.assertRaises(NoTasksHere) as caught:
            self.add("Level 6", made[-1])
        self.assertEqual(str(caught.exception), "Subtasks go 4 levels deep")
        # Any level above the fifth still takes subtasks.
        self.add("Another level 5", made[3])

    def test_a_subtask_stays_on_its_tasks_note(self) -> None:
        van = self.add("Book van")
        other = self.notes.create(None, "Elsewhere")
        with self.assertRaises(NoTasksHere):
            self.tasks.create(other["id"], "Wrong note", van["id"])

    def test_closing_a_task_closes_its_whole_subtree(self) -> None:
        van = self.add("Book van")
        quotes = self.add("Get quotes", van)
        call = self.add("Call Northwind", quotes)
        delegated = self.add("Ask Acme", quotes)
        earlier = self.add("Measure boxes", van)
        self.tasks.delegate(delegated["id"], None)
        self.today = "2026-11-19"
        self.tasks.set_done(earlier["id"], True)
        self.today = "2026-11-26"
        done = self.tasks.set_done(van["id"], True)
        self.assertEqual((done["done"], done["done_day"]), (True, "2026-11-26"))
        tasks = self.by_id()
        for each in (quotes, call, delegated):
            self.assertEqual((tasks[each["id"]]["done"], tasks[each["id"]]["done_day"]), (True, "2026-11-26"))
        self.assertEqual(tasks[earlier["id"]]["done_day"], "2026-11-19")
        # Reopening the parent reopens it alone.
        self.tasks.set_done(van["id"], False)
        tasks = self.by_id()
        self.assertFalse(tasks[van["id"]]["done"])
        self.assertTrue(all(tasks[each["id"]]["done"] for each in (quotes, call, delegated, earlier)))

    def test_closing_a_middle_task_closes_only_below_it(self) -> None:
        van = self.add("Book van")
        quotes = self.add("Get quotes", van)
        call = self.add("Call Northwind", quotes)
        sibling = self.add("Pick a day", van)
        self.tasks.set_done(quotes["id"], True)
        tasks = self.by_id()
        self.assertTrue(tasks[call["id"]]["done"])
        self.assertFalse(tasks[van["id"]]["done"])
        self.assertFalse(tasks[sibling["id"]]["done"])

    def test_ticking_the_last_subtask_leaves_the_parent_open(self) -> None:
        van = self.add("Book van")
        quotes = self.add("Get quotes", van)
        self.tasks.set_done(quotes["id"], True)
        self.assertFalse(self.by_id()[van["id"]]["done"])

    def test_delete_takes_the_subtree_and_keeps_its_rows_and_logged_time(self) -> None:
        van = self.add("Book van")
        quotes = self.add("Get quotes", van)
        call = self.add("Call Northwind", quotes)
        email = self.add("Email Acme", call)
        other = self.add("Other task")
        self.tasks.add_session(call["id"], "2026-11-23", "09:00", "10:00")
        removed = self.tasks.remove(van["id"])
        self.assertEqual(removed[0], van["id"])
        self.assertEqual(sorted(removed), sorted([van["id"], quotes["id"], call["id"], email["id"]]))
        self.assertEqual(list(self.by_id()), [other["id"]])
        with self.db.reading() as conn:
            kept = conn.execute("SELECT id, removed_at FROM tasks WHERE id != ? ORDER BY id", (other["id"],)).fetchall()
            self.assertEqual([(row["id"], row["removed_at"]) for row in kept],
                             [(each["id"], self.clock.now) for each in sorted((van, quotes, call, email), key=lambda t: t["id"])])
            self.assertEqual(conn.execute("SELECT count(*) FROM task_sessions").fetchone()[0], 1)
        with self.assertRaises(NotFound):
            self.tasks.remove(van["id"])

    def test_a_deleted_newest_task_keeps_its_id_from_the_next_task(self) -> None:
        # An old ?task= link must find the task gone, not a new task that took its id.
        self.add("Book van")
        newest = self.add("Wrap mugs")
        self.tasks.remove(newest["id"])
        again = self.add("Return keys")
        self.assertNotEqual(again["id"], newest["id"])
        with self.assertRaises(NotFound):
            self.tasks.remove(newest["id"])

    def test_purging_a_person_clears_deleted_tasks_that_name_them(self) -> None:
        trash = TrashRepository(self.db, clock=self.clock, keep_days=7)
        person_id, _ = PeopleRepository(self.db).create("Ada Example")
        task = self.add("Send the slides")
        self.tasks.set_for(task["id"], person_id)
        self.tasks.remove(task["id"])
        self.notes.delete(person_id)
        self.clock.now = "2026-11-28T12:00:00.000Z"
        self.assertEqual(trash.purge(), 1)

    def test_deleting_a_middle_task_leaves_its_parent(self) -> None:
        van = self.add("Book van")
        quotes = self.add("Get quotes", van)
        call = self.add("Call Northwind", quotes)
        self.assertEqual(sorted(self.tasks.remove(quotes["id"])), sorted([quotes["id"], call["id"]]))
        self.assertEqual(list(self.by_id()), [van["id"]])

    def test_move_among_nested_siblings(self) -> None:
        van = self.add("Book van")
        quotes = self.add("Get quotes", van)
        first = self.add("Call Northwind", quotes)
        second = self.add("Email Acme", quotes)
        third = self.add("Ask Globex", quotes)
        cousin = self.add("Pick a day", van)
        self.tasks.move(third["id"], first["id"])
        tasks = self.by_id()
        order = sorted((first, second, third), key=lambda each: tasks[each["id"]]["position"])
        self.assertEqual([each["id"] for each in order], [third["id"], first["id"], second["id"]])
        # A move among one parent's children leaves the others where they were.
        self.assertEqual(tasks[cousin["id"]]["position"], 2)
        self.assertEqual(tasks[quotes["id"]]["position"], 1)
        self.tasks.move(third["id"], None)
        self.assertEqual(self.by_id()[third["id"]]["position"], 3)

    def test_trash_restore_and_purge_of_a_nested_tree(self) -> None:
        trash = TrashRepository(self.db, clock=self.clock, keep_days=7)
        made = self.chain(5)
        self.tasks.add_session(made[2]["id"], "2026-11-23", "09:00", "10:00")
        self.notes.delete(self.note_id, recursive=True)
        self.assertEqual(self.tasks.list(), [])
        trash.restore(self.note_id)
        self.assertEqual(sorted(self.by_id()), sorted(each["id"] for each in made))
        self.notes.delete(self.note_id, recursive=True)
        self.clock.now = "2026-11-28T12:00:00.000Z"
        self.assertEqual(trash.purge(), 1)
        with self.db.reading() as conn:
            self.assertEqual(conn.execute("SELECT count(*) FROM tasks").fetchone()[0], 0)
            self.assertEqual(conn.execute("SELECT count(*) FROM task_sessions").fetchone()[0], 0)

    def test_a_saved_plan_template_keeps_one_level(self) -> None:
        area = self.notes.create(None, "Facilities")
        self.notes.set_kind(area["id"], "area")
        self.notes.set_area(self.note_id, area["id"])
        plan = PlanRepository(self.db, clock=self.clock, today=lambda: self.today)
        phase_id = plan.create_phase(self.note_id, "Pack", "2026-11-23", "2026-11-27")
        top = self.tasks.create(phase_id, "Boxes")
        sub = self.tasks.create(phase_id, "Buy tape", top["id"])
        self.tasks.create(phase_id, "Pick a colour", sub["id"])
        templates = PlanTemplateRepository(self.db, self.tasks, clock=self.clock)
        saved = templates.save_from(self.note_id, "Office move")
        titles = [task["title"] for item in saved["items"] for task in item["tasks"]]
        self.assertEqual(titles, ["Boxes", "Buy tape"])


class TaskNestingApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.running = RunningServer()

    def tearDown(self) -> None:
        self.running.close()

    def post(self, path, payload, status=200):
        got, body = self.running.post_json(path, payload)
        self.assertEqual(got, status, body)
        return body

    def test_create_done_and_remove_at_depth(self) -> None:
        note = self.post("/api/note/create", {"parent_id": None, "title": "Move office"})
        parent = None
        made = []
        for level in range(1, 6):
            payload = {"note_id": note["id"], "title": "Level {}".format(level)}
            if parent is not None:
                payload["parent_id"] = parent["id"]
            parent = self.post("/api/task/create", payload)
            made.append(parent)
        refused = self.post("/api/task/create", {"note_id": note["id"], "title": "Level 6", "parent_id": parent["id"]},
                            400)
        self.assertEqual(refused["error"], "Subtasks go 4 levels deep")
        self.post("/api/task/create", {"note_id": note["id"], "title": "Orphan", "parent_id": 9999}, 404)
        done = self.post("/api/task/done", {"id": made[0]["id"], "done": True})
        self.assertTrue(done["done"])
        _, tasks = self.running.get_json("/api/tasks")
        self.assertTrue(all(task["done"] for task in tasks["tasks"]))
        removed = self.post("/api/task/remove", {"id": made[1]["id"]})["removed"]
        self.assertEqual(sorted(removed), sorted(each["id"] for each in made[1:]))
        _, tasks = self.running.get_json("/api/tasks")
        self.assertEqual([task["id"] for task in tasks["tasks"]], [made[0]["id"]])


if __name__ == "__main__":
    unittest.main()
