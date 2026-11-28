"""Logging a follow-up of a delegated task (032_follow_up_logs.sql, db/follow_ups_repo.py,
POST /api/task/followed_up), its count on every task, and its events in the task's History."""
import tempfile
import unittest
from datetime import timezone
from pathlib import Path

from helpers import RunningServer
from paradigm.db.connection import Database
from paradigm.db.follow_ups_repo import BadFollowUp, FollowUpRepository, NotAFollowUp, NotFound
from paradigm.db.migrate import migrate
from paradigm.db.notes_repo import NoteRepository
from paradigm.db.people_repo import PeopleRepository
from paradigm.db.task_history import TaskHistory, build_events
from paradigm.db.tasks_repo import TaskRepository
from paradigm.db.trash_repo import TrashRepository
from paradigm.notes.follow_ups import MAX_FOLLOW_UP_NOTE, clean_follow_up

TODAY = "2026-11-27"


class Clock:
    def __init__(self) -> None:
        self.now = "2026-11-27T10:00:00.000Z"

    def __call__(self) -> str:
        return self.now


class CleanFollowUpTest(unittest.TestCase):
    def test_again_needs_a_day_after_today(self) -> None:
        self.assertEqual(clean_follow_up("again", "  Pinged\non Teams ", "2026-12-01", TODAY),
                         ("again", "Pinged on Teams", "2026-12-01", TODAY))
        for bad in ("", None, "2026-11-27", "2026-11-20", "tomorrow", "2026-02-30"):
            with self.assertRaises(BadFollowUp, msg=bad):
                clean_follow_up("again", "", bad, TODAY)

    def test_closed_ignores_next(self) -> None:
        self.assertEqual(clean_follow_up("closed", None, "nonsense", TODAY), ("closed", "", "", TODAY))

    def test_refusals(self) -> None:
        with self.assertRaises(BadFollowUp):
            clean_follow_up("later", "", "2026-12-01", TODAY)
        with self.assertRaises(BadFollowUp):
            clean_follow_up("closed", "", "", None)
        with self.assertRaises(BadFollowUp):
            clean_follow_up("closed", "x" * (MAX_FOLLOW_UP_NOTE + 1), "", TODAY)
        with self.assertRaises(BadFollowUp):
            clean_follow_up("closed", 5, "", TODAY)
        self.assertEqual(clean_follow_up("closed", "x" * MAX_FOLLOW_UP_NOTE, "", TODAY)[1], "x" * MAX_FOLLOW_UP_NOTE)


class FollowUpRepositoryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database.in_folder(Path(self.tmp.name) / "data")
        migrate(self.db)
        self.clock = Clock()
        self.notes = NoteRepository(self.db, clock=self.clock)
        self.hub = self.notes.create(None, "Northwind rollout")["id"]
        self.notes.set_kind(self.hub, "project")
        self.tasks = TaskRepository(self.db, clock=self.clock, today=lambda: "2026-11-20")
        self.follow_ups = FollowUpRepository(self.db, clock=self.clock)
        self.history = TaskHistory(self.db, zone=timezone.utc)
        self.person, _ = PeopleRepository(self.db).create("Ana Lee")
        self.task = self.tasks.create(self.hub, "Send the access list")["id"]
        self.tasks.delegate(self.task, self.person, "2026-11-25")

    def tearDown(self) -> None:
        self.db.close()
        self.tmp.cleanup()

    def count(self, task_id: int) -> int:
        return next(task for task in self.tasks.list() if task["id"] == task_id)["follow_up_count"]

    def test_again_moves_the_follow_up_day(self) -> None:
        task = self.follow_ups.log(self.task, "again", "Pinged on Teams", "2026-12-01", TODAY)
        self.assertEqual(task["follow_up"], "2026-12-01")
        self.assertFalse(task["done"])
        self.assertEqual(task["follow_up_count"], 1)
        self.assertEqual(self.count(self.task), 1)

    def test_closed_closes_the_task_on_the_browser_day_and_keeps_the_follow_up(self) -> None:
        sub = self.tasks.create(self.hub, "Check the list", parent_id=self.task)["id"]
        task = self.follow_ups.log(self.task, "closed", "", "", TODAY)
        self.assertTrue(task["done"])
        self.assertEqual(task["done_day"], TODAY)
        self.assertEqual(task["follow_up"], "2026-11-25")
        self.assertEqual(self.tasks.get(sub)["done_day"], TODAY)

    def test_the_count_counts_every_log(self) -> None:
        self.follow_ups.log(self.task, "again", "", "2026-11-30", TODAY)
        self.follow_ups.log(self.task, "again", "", "2026-12-02", "2026-11-30")
        self.assertEqual(self.follow_ups.log(self.task, "closed", "", "", "2026-12-02")["follow_up_count"], 3)
        other = self.tasks.create(self.hub, "Other")["id"]
        self.assertEqual(self.count(other), 0)

    def test_only_a_delegated_task_with_a_follow_up_day(self) -> None:
        mine = self.tasks.create(self.hub, "Mine")["id"]
        with self.assertRaises(NotAFollowUp):
            self.follow_ups.log(mine, "closed", "", "", TODAY)
        undated = self.tasks.create(self.hub, "Undated")["id"]
        self.tasks.delegate(undated, self.person, "")
        with self.assertRaises(NotAFollowUp):
            self.follow_ups.log(undated, "again", "", "2026-12-01", TODAY)
        with self.assertRaises(NotFound):
            self.follow_ups.log(999, "closed", "", "", TODAY)
        self.assertEqual(self.count(mine), 0)

    def test_history_lists_the_logs_newest_first(self) -> None:
        self.follow_ups.log(self.task, "again", "Pinged on Teams", "2026-12-01", TODAY)
        self.clock.now = "2026-12-01T09:00:00.000Z"
        self.follow_ups.log(self.task, "closed", "", "", "2026-12-01")
        events = [e for e in self.history.events(self.task) if e["kind"] in ("followed_up", "done")]
        self.assertEqual([(e["day"], e["kind"], e["text"]) for e in events], [
            ("2026-12-01", "done", "Done"),
            ("2026-12-01", "followed_up", "Followed up"),
            (TODAY, "followed_up", "Followed up: Pinged on Teams"),
        ])
        self.assertEqual((events[1]["next"], events[1]["closed"]), (None, True))
        self.assertEqual((events[2]["next"], events[2]["closed"]), ("2026-12-01", False))
        self.assertTrue(events[2]["key"].startswith("followup:"))

    def test_remove_takes_the_logs(self) -> None:
        self.follow_ups.log(self.task, "again", "", "2026-12-01", TODAY)
        self.tasks.remove(self.task)
        with self.db.reading() as conn:
            self.assertEqual(conn.execute("SELECT count(*) FROM follow_up_logs").fetchone()[0], 0)

    def test_trash_and_restore_keep_the_logs_and_purge_takes_them(self) -> None:
        self.follow_ups.log(self.task, "again", "", "2026-12-01", TODAY)
        trash = TrashRepository(self.db, clock=self.clock, keep_days=7)
        self.notes.delete(self.hub, recursive=True)
        trash.restore(self.hub)
        self.assertEqual(self.count(self.task), 1)
        self.notes.delete(self.hub, recursive=True)
        self.clock.now = "2026-12-20T10:00:00.000Z"
        trash.purge()
        with self.db.reading() as conn:
            self.assertEqual(conn.execute("SELECT count(*) FROM follow_up_logs").fetchone()[0], 0)


class BuildFollowUpEventsTest(unittest.TestCase):
    def test_two_logs_in_one_minute_are_by_the_order_logged(self) -> None:
        logs = [{"id": 1, "day": TODAY, "time": "10:00", "note": "first", "outcome": "again", "next_day": "2026-11-30"},
                {"id": 2, "day": TODAY, "time": "10:00", "note": "", "outcome": "closed", "next_day": ""}]
        events = build_events(("2026-11-20", "08:00"), None, None, [], "", follow_ups=logs)
        self.assertEqual([e.get("key") for e in events], ["followup:2", "followup:1", None])
        self.assertEqual(events[0]["text"], "Followed up")
        self.assertEqual(events[1]["text"], "Followed up: first")


class FollowedUpApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.running = RunningServer()
        _, payload = self.running.get_json("/api/notes")
        note = payload["notes"][0]["id"]
        _, task = self.running.post_json("/api/task/create", {"note_id": note, "title": "Send the access list"})
        self.task = task["id"]
        _, mine = self.running.post_json("/api/task/create", {"note_id": note, "title": "Mine"})
        self.mine = mine["id"]
        status, person = self.running.post_json("/api/person/create", {"name": "Ana Lee"})
        self.assertEqual(status, 200, person)
        person_id = person["note"]["id"]
        status, body = self.running.post_json("/api/task/delegate",
                                              {"id": self.task, "person_id": person_id, "follow_up": "2026-11-25"})
        self.assertEqual(status, 200, body)

    def tearDown(self) -> None:
        self.running.close()

    def post(self, **payload):
        return self.running.post_json("/api/task/followed_up", payload)

    def test_again_then_closed(self) -> None:
        status, task = self.post(id=self.task, note="Pinged on Teams", outcome="again", next="2026-12-01", today=TODAY)
        self.assertEqual(status, 200, task)
        self.assertEqual((task["follow_up"], task["follow_up_count"]), ("2026-12-01", 1))
        _, listing = self.running.get_json("/api/tasks")
        listed = next(each for each in listing["tasks"] if each["id"] == self.task)
        self.assertEqual((listed["follow_up"], listed["follow_up_count"]), ("2026-12-01", 1))
        status, task = self.post(id=self.task, outcome="closed", today="2026-12-01")
        self.assertEqual(status, 200, task)
        self.assertEqual((task["done"], task["done_day"], task["follow_up_count"]), (True, "2026-12-01", 2))
        _, history = self.running.get_json("/api/task/history?task={}".format(self.task))
        logged = [e for e in history["events"] if e["kind"] == "followed_up"]
        self.assertEqual([(e["text"], e["next"], e["closed"]) for e in logged],
                         [("Followed up", None, True), ("Followed up: Pinged on Teams", "2026-12-01", False)])

    def test_errors(self) -> None:
        self.assertEqual(self.post(id=self.task, outcome="later", today=TODAY)[0], 400)
        self.assertEqual(self.post(id=self.task, outcome="again", today=TODAY)[0], 400)
        self.assertEqual(self.post(id=self.task, outcome="again", next="soon", today=TODAY)[0], 400)
        self.assertEqual(self.post(id=self.task, outcome="again", next=TODAY, today=TODAY)[0], 400)
        self.assertEqual(self.post(id=self.task, outcome="closed")[0], 400)
        self.assertEqual(self.post(id=self.task, outcome="closed", note="x" * 501, today=TODAY)[0], 400)
        self.assertEqual(self.post(id=999, outcome="closed", today=TODAY)[0], 404)
        self.assertEqual(self.post(id=self.mine, outcome="closed", today=TODAY)[0], 409)
        _, listing = self.running.get_json("/api/tasks")
        self.assertEqual({each["follow_up_count"] for each in listing["tasks"]}, {0})


if __name__ == "__main__":
    unittest.main()
