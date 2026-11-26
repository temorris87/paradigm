"""The task fields the redesign added: snoozing (024), estimates (025); the next action (022) is gone (029)."""
import unittest

from helpers import RunningServer


class TaskPlanningApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.running = RunningServer()
        hub = self.post("/api/note/create", {"parent_id": None, "title": "Budget"})
        self.post("/api/note/kind", {"id": hub["id"], "kind": "project"})
        self.hub = hub["id"]

    def tearDown(self) -> None:
        self.running.close()

    def post(self, path, payload, status=200):
        got, body = self.running.post_json(path, payload)
        self.assertEqual(got, status, body)
        return body

    def task(self, title, **extra):
        return self.post("/api/task/create", dict({"note_id": self.hub, "title": title}, **extra))

    def test_the_next_action_is_gone(self) -> None:
        task = self.task("Draft")
        self.assertNotIn("is_next", task)
        self.post("/api/task/next", {"id": task["id"], "next": True}, 404)
        self.assertNotIn("is_next", self.post("/api/task/done", {"id": task["id"], "done": True}))
        _, body = self.running.get_json("/api/tasks")
        self.assertTrue(body["tasks"])
        for listed in body["tasks"]:
            self.assertNotIn("is_next", listed)

    def test_snooze_until_a_day(self) -> None:
        task = self.task("Draft")
        self.assertEqual(task["snoozed_until"], "")
        snoozed = self.post("/api/task/update", {"id": task["id"], "snoozed_until": "2026-11-24"})
        self.assertEqual(snoozed["snoozed_until"], "2026-11-24")
        self.post("/api/task/update", {"id": task["id"], "snoozed_until": "Tuesday"}, 400)
        self.assertEqual(self.post("/api/task/update", {"id": task["id"], "snoozed_until": ""})["snoozed_until"], "")

    def test_estimate_in_minutes(self) -> None:
        task = self.task("Draft")
        self.assertIsNone(task["estimate_min"])
        self.assertEqual(self.post("/api/task/update", {"id": task["id"], "estimate_min": 90})["estimate_min"], 90)
        for bad in (0, -5, 1.5, "90", True, 40 * 60 + 1):
            self.post("/api/task/update", {"id": task["id"], "estimate_min": bad}, 400)
        self.assertIsNone(self.post("/api/task/update", {"id": task["id"], "estimate_min": None})["estimate_min"])


if __name__ == "__main__":
    unittest.main()
