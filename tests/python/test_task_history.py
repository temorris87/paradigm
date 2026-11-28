"""A task's History (db/task_history.py, GET /api/task/history): derived from the task's
creation, its source, its blocks of time, its delegate and its done day, newest first."""
import tempfile
import unittest
from datetime import timezone
from pathlib import Path

from helpers import RunningServer
from paradigm.db.connection import Database
from paradigm.db.migrate import migrate
from paradigm.db.notes_repo import NoteRepository
from paradigm.db.people_repo import PeopleRepository
from paradigm.db.task_history import NotFound, TaskHistory, build_events, minutes_text
from paradigm.db.tasks_repo import TaskRepository


def at(stamp: str):
    return lambda: stamp


class BuildEventsTest(unittest.TestCase):
    def test_a_plain_task_was_created(self) -> None:
        self.assertEqual(build_events(("2026-11-23", "09:15"), None, None, [], ""),
                         [{"day": "2026-11-23", "time": "09:15", "kind": "created", "text": "Created", "note_id": None}])

    def test_a_full_life_newest_first(self) -> None:
        events = build_events(
            ("2026-11-23", "10:05"), {"id": 12, "title": "Portal design review"},
            {"id": 30, "name": "Ben Ortiz", "follow_up": "2026-11-30"},
            [("2026-11-24", "10:00", "12:00"), ("2026-11-26", "14:00", "14:30")], "2026-11-26")
        self.assertEqual([(e["day"], e["kind"], e["text"]) for e in events], [
            (None, "delegated", "Delegated to Ben Ortiz"),
            ("2026-11-26", "done", "Done"),
            ("2026-11-26", "placed", "Placed 14:00–14:30 (30 min)"),
            ("2026-11-24", "placed", "Placed 10:00–12:00 (2 h)"),
            ("2026-11-23", "captured", "Captured in Portal design review"),
        ])
        self.assertEqual(events[0]["follow_up"], "2026-11-30")
        self.assertEqual([e["note_id"] for e in events], [30, None, None, None, 12])
        self.assertEqual([e["time"] for e in events], [None, None, "14:00", "10:00", "10:05"])

    def test_a_delegation_made_after_a_block_is_not_dated_before_it(self) -> None:
        events = build_events(("2026-11-02", "09:00"), None, {"id": 4, "name": "Ben Ortiz", "follow_up": "2027-01-04"},
                              [("2026-11-20", "10:00", "11:00")], "")
        self.assertEqual([(e["day"], e["kind"]) for e in events],
                         [(None, "delegated"), ("2026-11-20", "placed"), ("2026-11-02", "created")])
        self.assertEqual(events[0]["follow_up"], "2027-01-04")

    def test_two_blocks_on_one_day_are_by_time(self) -> None:
        events = build_events(("2026-11-20", "08:00"), None, None,
                              [("2026-11-24", "09:00", "10:00"), ("2026-11-24", "13:00", "14:30")], "")
        self.assertEqual([e["time"] for e in events if e["kind"] == "placed"], ["13:00", "09:00"])
        self.assertEqual(events[0]["text"], "Placed 13:00–14:30 (1 h 30 min)")

    def test_a_delegate_with_no_follow_up(self) -> None:
        events = build_events(("2026-11-20", "08:00"), None, {"id": 3, "name": "Ana Lee", "follow_up": ""}, [], "")
        self.assertEqual(events[0]["text"], "Delegated to Ana Lee")
        self.assertIsNone(events[0]["follow_up"])

    def test_texts(self) -> None:
        self.assertEqual([minutes_text(m) for m in (30, 60, 90, 120)], ["30 min", "1 h", "1 h 30 min", "2 h"])


class TaskHistoryRepoTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database.in_folder(Path(self.tmp.name) / "data")
        migrate(self.db)
        self.notes = NoteRepository(self.db)
        self.hub = self.notes.create(None, "Customer portal v2")["id"]
        self.notes.set_kind(self.hub, "project")
        self.tasks = TaskRepository(self.db, clock=at("2026-11-23T10:05:00.000Z"), today=lambda: "2026-11-26")
        self.history = TaskHistory(self.db, zone=timezone.utc)

    def tearDown(self) -> None:
        self.db.close()
        self.tmp.cleanup()

    def test_the_stored_facts_become_events(self) -> None:
        meeting = self.notes.create(self.hub, "Portal design review")["id"]
        task = self.tasks.create(self.hub, "Agree the request form")["id"]
        with self.db.transaction() as conn:
            conn.execute("INSERT INTO task_sources (task_id, source_id, quote) VALUES (?, ?, ?)",
                         (task, meeting, "T: agree the request form"))
        person, _ = PeopleRepository(self.db).create("Ben Ortiz")
        self.tasks.delegate(task, person, "2026-11-30")
        self.tasks.add_session(task, "2026-11-24", "10:00", "12:00")
        self.tasks.set_done(task, True)
        events = self.history.events(task)
        self.assertEqual([e["kind"] for e in events], ["delegated", "done", "placed", "captured"])
        self.assertEqual(events[-1], {"day": "2026-11-23", "time": "10:05", "kind": "captured",
                                      "text": "Captured in Portal design review", "note_id": meeting})
        self.assertEqual(events[1]["day"], "2026-11-26")
        self.assertEqual(events[0]["note_id"], person)
        self.assertEqual(events[0]["follow_up"], "2026-11-30")

    def test_a_trashed_source_is_named_but_not_linked(self) -> None:
        meeting = self.notes.create(self.hub, "Portal design review")["id"]
        task = self.tasks.create(self.hub, "Agree the request form")["id"]
        with self.db.transaction() as conn:
            conn.execute("INSERT INTO task_sources (task_id, source_id, quote) VALUES (?, ?, ?)", (task, meeting, "T: x"))
        self.notes.delete(meeting)
        self.assertEqual(self.history.events(task)[0]["note_id"], None)

    def test_a_reopened_task_has_no_done(self) -> None:
        task = self.tasks.create(self.hub, "Agree the request form")["id"]
        self.tasks.set_done(task, True)
        self.tasks.set_done(task, False)
        self.assertEqual([e["kind"] for e in self.history.events(task)], ["created"])

    def test_a_removed_task_is_not_found(self) -> None:
        task = self.tasks.create(self.hub, "Agree the request form")["id"]
        self.tasks.remove(task)
        with self.assertRaises(NotFound):
            self.history.events(task)


class TaskHistoryApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.running = RunningServer()
        _, payload = self.running.get_json("/api/notes")
        status, task = self.running.post_json("/api/task/create",
                                              {"note_id": payload["notes"][0]["id"], "title": "Agree the form"})
        self.assertEqual(status, 200, task)
        self.task = task["id"]

    def tearDown(self) -> None:
        self.running.close()

    def test_the_route(self) -> None:
        self.running.post_json("/api/session/add", {"task_id": self.task, "day": "2026-11-24", "start": "10:00",
                                                    "end": "11:00"})
        status, body = self.running.get_json("/api/task/history?task={}".format(self.task))
        self.assertEqual(status, 200, body)
        self.assertEqual(sorted(e["kind"] for e in body["events"]), ["created", "placed"])
        self.assertIn({"day": "2026-11-24", "time": "10:00", "kind": "placed", "text": "Placed 10:00–11:00 (1 h)",
                       "note_id": None}, body["events"])
        for event in body["events"]:
            self.assertEqual(set(event), {"day", "time", "kind", "text", "note_id"})

    def test_errors(self) -> None:
        self.assertEqual(self.running.get_json("/api/task/history?task=999")[0], 404)
        self.assertEqual(self.running.get_json("/api/task/history?task=abc")[0], 400)


if __name__ == "__main__":
    unittest.main()
