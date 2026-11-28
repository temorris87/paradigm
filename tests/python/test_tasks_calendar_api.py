import json
import unittest

from calendar_samples import calendar, event
from helpers import RunningServer


class TasksCalendarTimeApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.running = RunningServer()

    def tearDown(self) -> None:
        self.running.close()

    def post(self, path, payload, status=200):
        got, body = self.running.post_json(path, payload)
        self.assertEqual(got, status, body)
        return body

    def test_tasks_sessions_and_ticking(self) -> None:
        note = self.post("/api/note/create", {"parent_id": None, "title": "Budget"})
        self.post("/api/note/kind", {"id": note["id"], "kind": "project"})
        self.assertEqual(self.post("/api/note/time_code", {"id": note["id"], "code": "BUD"})["time_code"], "BUD")
        task = self.post("/api/task/create", {"note_id": note["id"], "title": "  Draft   it "})
        self.assertEqual((task["title"], task["done"], task["parent_id"]), ("Draft it", False, None))
        sub = self.post("/api/task/create", {"note_id": note["id"], "title": "Outline", "parent_id": task["id"]})
        deeper = self.post("/api/task/create", {"note_id": note["id"], "title": "Deeper", "parent_id": sub["id"]})
        self.post("/api/task/create", {"note_id": note["id"], "title": ""}, 400)
        session = self.post("/api/session/add", {"task_id": task["id"], "day": "2026-11-17", "start": "09:00",
                                                 "end": "10:00"})
        self.post("/api/session/move", {"id": session["id"], "day": "2026-11-18", "start": "09:00", "end": "11:00"})
        self.post("/api/session/add", {"task_id": task["id"], "day": "2026-11-17", "start": "10:00", "end": "09:00"},
                  400)
        _, sessions = self.running.get_json("/api/sessions?from=2026-11-16&to=2026-11-22")
        self.assertEqual(len(sessions["sessions"]), 1)
        done = self.post("/api/task/done", {"id": task["id"], "done": True})
        self.assertTrue(done["done"])
        self.assertTrue(done["done_day"])
        person = self.post("/api/person/create", {"first": "Priya", "last": "Shah"})
        person_id = person["note"]["id"] if "note" in person else person["id"]
        delegated = self.post("/api/task/delegate", {"id": sub["id"], "person_id": person_id, "follow_up": "2026-12-01"})
        self.assertEqual((delegated["delegate_id"], delegated["follow_up"]), (person_id, "2026-12-01"))
        self.post("/api/task/create", {"note_id": person_id, "title": "On a person"}, 400)
        updated = self.post("/api/task/update", {"id": sub["id"], "notes": " the outline ", "due": "2026-12-02"})
        self.assertEqual((updated["notes"], updated["due"]), ("the outline", "2026-12-02"))
        _, week = self.running.get_json("/api/time/week?monday=2026-11-16")
        self.assertIn("BUD", [row["code"] for row in week["rows"]])
        # Deleting the task with logged time keeps its row (and the hours); its subtasks go.
        self.assertEqual(sorted(self.post("/api/task/remove", {"id": task["id"]})["removed"]), sorted([task["id"], sub["id"], deeper["id"]]))
        _, tasks = self.running.get_json("/api/tasks")
        self.assertEqual(tasks["tasks"], [])
        _, week = self.running.get_json("/api/time/week?monday=2026-11-16")
        self.assertIn("BUD", [row["code"] for row in week["rows"]])

    def test_upload_and_file(self) -> None:
        hub = self.post("/api/note/create", {"parent_id": None, "title": "Ops"})
        self.post("/api/note/kind", {"id": hub["id"], "kind": "area"})
        status, _, body = self.running.request(
            "POST", "/api/calendar/upload", {"Content-Type": "text/calendar"},
            calendar([event("a", "Sync", "20991124T100000", "20991124T103000")]).encode("utf-8"))
        self.assertEqual(status, 200, body)
        _, pending = self.running.get_json("/api/calendar/pending")
        ids = [each["id"] for each in pending["pending"]]
        made = self.post("/api/calendar/file", {"ids": ids, "hub_id": hub["id"]})
        self.assertEqual(len(made["meetings"]), 1)
        _, status_body = self.running.get_json("/api/calendar/status")
        self.assertTrue(status_body["imported_today"])
        self.post("/api/calendar/upload", {}, 400)

    def test_status_before_and_after_an_upload(self) -> None:
        _, before = self.running.get_json("/api/calendar/status")
        self.assertEqual(before, {"imported_today": False, "last_day": None, "last_at": None})
        self.running.request("POST", "/api/calendar/upload", {"Content-Type": "text/calendar"},
                             calendar([event("a", "Sync", "20991124T100000", "20991124T103000")]).encode("utf-8"))
        _, after = self.running.get_json("/api/calendar/status")
        self.assertEqual(sorted(after), ["imported_today", "last_at", "last_day"])
        self.assertTrue(after["imported_today"])
        self.assertEqual(len(after["last_at"]), len("2026-11-25T08:12:00"))

    def test_an_upload_that_is_not_a_calendar(self) -> None:
        status, _, body = self.running.request("POST", "/api/calendar/upload", {"Content-Type": "text/calendar"},
                                               b"hello, not a calendar")
        self.assertEqual(status, 400, body)
        self.assertIn("not a calendar file", json.loads(body.decode("utf-8"))["error"])
        _, after = self.running.get_json("/api/calendar/status")
        self.assertFalse(after["imported_today"])

    def test_no_import_folder_and_no_import_route(self) -> None:
        self.assertFalse((self.running.config.data_dir / "import").exists())
        got, _ = self.running.post_json("/api/calendar/import", {})
        self.assertEqual(got, 404)


if __name__ == "__main__":
    unittest.main()
