import tempfile
import unittest
from pathlib import Path

from paradigm.db.connection import Database
from paradigm.db.meetings_repo import MeetingRepository
from paradigm.db.migrate import migrate
from paradigm.db.notes_repo import NoteRepository
from paradigm.db.tasks_repo import BadWhen, TaskMoved, TaskRepository
from paradigm.db.trash_repo import TrashRepository
from paradigm.notes.task_match import follow_lines, match_tasks
from paradigm.notes.tasks import BadTasks, Task, box_state, clean_tasks, set_box


def boxes(text, field="body"):
    """What the page sends: each box's line, the box it is under, its title and state."""
    found, stack = [], []
    for index, line in enumerate(text.split("\n")):
        indent = len(line) - len(line.lstrip())
        while line.strip() and stack and stack[-1][0] >= indent:
            stack.pop()
        state = box_state(line)
        if state is None:
            continue
        found.append(Task(field, index, stack[-1][1] if stack else None, line.split("]", 1)[1].strip(), state))
        stack.append((indent, index))
    return found


class TaskRulesTest(unittest.TestCase):
    def test_boxes(self) -> None:
        self.assertEqual(box_state("- [ ] a"), False)
        self.assertEqual(box_state("  * [x] a"), True)
        self.assertEqual(box_state("> 1. [X] a"), True)
        self.assertIsNone(box_state("- a [ ]"))
        self.assertIsNone(box_state("[ ] a"))
        self.assertEqual(set_box("  - [ ] Draft", True), "  - [x] Draft")
        self.assertEqual(set_box("- [x] Draft [ ]", False), "- [ ] Draft [ ]")

    def test_clean(self) -> None:
        tasks = clean_tasks([{"field": "body", "line": 3, "parent": 1, "title": " A  b ", "done": False},
                             {"field": "body", "line": 1, "parent": None, "title": "P", "done": True}])
        self.assertEqual(tasks, [Task("body", 1, None, "P", True), Task("body", 3, 1, "A b", False)])
        for bad in ("x", [{"field": "x", "line": 1, "title": "", "done": False}],
                    [{"field": "body", "line": 1, "parent": 2, "title": "", "done": False}],
                    [{"field": "body", "line": -1, "title": "", "done": False}]):
            with self.assertRaises(BadTasks):
                clean_tasks(bad)

    def test_lines_are_followed(self) -> None:
        moved = follow_lines("a\n- [ ] one\nb", "new\na\n- [ ] one edited\nb")
        self.assertEqual(moved, {0: 1, 1: 2, 2: 3})
        old = [{"id": 7, "line": 1, "title": "one"}, {"id": 8, "line": 5, "title": "gone"}]
        self.assertEqual(match_tasks(old, [2, 9], ["one edited", "gone"], moved), [7, 8])


class TaskRepositoryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database.in_folder(Path(self.tmp.name))
        migrate(self.db)
        self.notes = NoteRepository(self.db)
        self.tasks = TaskRepository(self.db, today=lambda: "2026-11-23")
        self.hub = self.notes.create(None, "Budget")
        self.notes.set_kind(self.hub["id"], "project")

    def tearDown(self) -> None:
        self.db.close()
        self.tmp.cleanup()

    def save(self, note, text):
        latest = self.notes.get(note["id"])
        return self.notes.save(note["id"], text, latest["version"], links=[], tasks=boxes(text))

    def titles(self):
        return [(task["title"], task["parent_id"] is not None, task["done"]) for task in self.tasks.list()]

    def test_boxes_become_tasks_and_subtasks(self) -> None:
        self.save(self.hub, "Intro\n- [ ] Draft\n  - [ ] Numbers\n  - [x] Ask\n- plain\n  - [ ] Under a bullet")
        self.assertEqual(self.titles(), [("Draft", False, False), ("Numbers", True, False), ("Ask", True, True),
                                         ("Under a bullet", False, False)])
        tasks = self.tasks.list()
        self.assertEqual(tasks[1]["parent_id"], tasks[0]["id"])
        self.assertRegex(tasks[2]["done_day"], r"^\d{4}-\d\d-\d\d$")

    def test_a_task_keeps_its_id_and_sessions_through_edits(self) -> None:
        self.save(self.hub, "- [ ] Draft\n- [ ] Review")
        draft = self.tasks.list()[0]["id"]
        session = self.tasks.add_session(draft, "2026-11-24", "09:00", "10:30")
        self.save(self.hub, "New line\n\n- [ ] Draft the budget\n- [ ] Review")
        self.assertEqual(self.tasks.list()[0]["id"], draft)
        self.assertEqual(self.tasks.list()[0]["title"], "Draft the budget")
        # dd then p: the line moves to the end; same title, same task.
        self.save(self.hub, "New line\n\n- [ ] Review\nmore\n- [ ] Draft the budget")
        self.assertEqual([task["id"] for task in self.tasks.list()][1], draft)
        self.assertEqual(self.tasks.sessions(), [session])

    def test_a_deleted_line_removes_the_task_and_undo_brings_it_back(self) -> None:
        self.save(self.hub, "- [ ] Draft")
        draft = self.tasks.list()[0]["id"]
        self.tasks.add_session(draft, "2026-11-24", "09:00", "10:00")
        self.save(self.hub, "nothing")
        self.assertEqual((self.tasks.list(), self.tasks.sessions()), ([], []))
        self.save(self.hub, "- [ ] Draft")
        self.assertEqual(self.tasks.list()[0]["id"], draft)
        self.assertEqual(len(self.tasks.sessions()), 1)

    def test_ticking_writes_the_box_into_the_text(self) -> None:
        self.save(self.hub, "a\n  - [ ] Draft")
        task = self.tasks.list()[0]
        result = self.tasks.set_done(task["id"], True)
        note = self.notes.get(self.hub["id"])
        self.assertEqual(note["body"], "a\n  - [x] Draft")
        self.assertEqual((result["version"], note["version"]), (3, 3))
        self.assertTrue(self.tasks.get(task["id"])["done"])
        self.tasks.set_done(task["id"], False)
        self.assertEqual(self.notes.get(self.hub["id"])["body"], "a\n  - [ ] Draft")

    def test_ticking_a_line_that_moved_is_refused(self) -> None:
        self.save(self.hub, "- [ ] Draft")
        task = self.tasks.list()[0]
        latest = self.notes.get(self.hub["id"])
        self.notes.save(self.hub["id"], "text\n- [ ] Draft", latest["version"])     # no tasks sent
        with self.assertRaises(TaskMoved):
            self.tasks.set_done(task["id"], True)

    def test_a_meetings_agenda_holds_tasks_too(self) -> None:
        meetings = MeetingRepository(self.db)
        meeting_id, _ = meetings.create(self.hub["id"], "Sync", "2026-11-24", "10:00")
        meetings.save_agenda(meeting_id, "- [ ] Bring numbers", 1, links=[], tasks=boxes("- [ ] Bring numbers", "agenda"))
        task = self.tasks.list()[0]
        self.assertEqual((task["note_id"], task["field"]), (meeting_id, "agenda"))
        self.tasks.set_done(task["id"], True)
        self.assertEqual(meetings.get(meeting_id)["agenda_version"], 3)

    def test_sessions(self) -> None:
        self.save(self.hub, "- [ ] Draft")
        task = self.tasks.list()[0]["id"]
        session = self.tasks.add_session(task, "2026-11-24", "09:00", "24:00")
        moved = self.tasks.move_session(session["id"], "2026-11-25", "13:00", "13:45")
        self.assertEqual(self.tasks.sessions("2026-11-25", "2026-11-25"), [moved])
        self.assertEqual(self.tasks.sessions("2026-11-26"), [])
        for bad in (("2026-11-24", "10:00", "09:00"), ("2026-11-24", "", "09:00"), ("x", "09:00", "10:00")):
            with self.assertRaises(BadWhen):
                self.tasks.add_session(task, *bad)
        self.tasks.remove_session(session["id"])
        self.assertEqual(self.tasks.sessions(), [])

    def test_purging_a_note_takes_its_tasks(self) -> None:
        note = self.notes.create(self.hub["id"], "Old")
        self.save(note, "- [ ] a\n  - [ ] b")
        self.tasks.add_session(self.tasks.list()[0]["id"], "2026-11-24", "09:00", "10:00")
        self.notes.delete(note["id"])
        trash = TrashRepository(self.db, clock=lambda: "2099-01-01T00:00:00.000Z")
        self.assertEqual(trash.purge(), 1)
        with self.db.reading() as conn:
            self.assertEqual(conn.execute("SELECT count(*) FROM tasks").fetchone()[0], 0)

    def test_time_codes(self) -> None:
        area = self.notes.create(None, "Ops")
        self.notes.set_kind(area["id"], "area")
        self.assertEqual(self.notes.set_time_code(area["id"], "  OPS-1 ")["time_code"], "OPS-1")
        self.assertEqual(self.notes.set_time_code(self.hub["id"], "")["time_code"], "")
        with self.assertRaises(Exception):
            self.notes.set_time_code(self.notes.create(None, "Loose")["id"], "X")


if __name__ == "__main__":
    unittest.main()
