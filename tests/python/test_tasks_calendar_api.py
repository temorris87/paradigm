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
        note = self.post("/api/note/create", {"parent_id": None, "title": "Budget", "body": "- [ ] Draft", "links": [],
                                              "tasks": [{"field": "body", "line": 0, "parent": None, "title": "Draft",
                                                         "done": False}]})
        self.post("/api/note/kind", {"id": note["id"], "kind": "project"})
        self.assertEqual(self.post("/api/note/time_code", {"id": note["id"], "code": "BUD"})["time_code"], "BUD")
        _, tasks = self.running.get_json("/api/tasks")
        task = tasks["tasks"][0]
        session = self.post("/api/session/add", {"task_id": task["id"], "day": "2026-11-24", "start": "09:00",
                                                 "end": "10:00"})
        self.post("/api/session/move", {"id": session["id"], "day": "2026-11-25", "start": "09:00", "end": "11:00"})
        self.post("/api/session/add", {"task_id": task["id"], "day": "2026-11-24", "start": "10:00", "end": "09:00"},
                  400)
        _, sessions = self.running.get_json("/api/sessions?from=2026-11-23&to=2026-11-29")
        self.assertEqual(len(sessions["sessions"]), 1)
        done = self.post("/api/task/done", {"id": task["id"], "done": True})
        self.assertEqual(done["version"], 2)
        _, got = self.running.get_json("/api/note?id={}".format(note["id"]))
        self.assertEqual(got["body"], "- [x] Draft")
        _, week = self.running.get_json("/api/time/week?monday=2026-11-23")
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


if __name__ == "__main__":
    unittest.main()
