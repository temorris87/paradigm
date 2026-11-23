"""The task fields the redesign added: the next action (022), snoozing (024), estimates (025)."""
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

    def flags(self):
        _, body = self.running.get_json("/api/tasks")
        return {task["title"]: task["is_next"] for task in body["tasks"]}

    def test_one_next_action_per_note(self) -> None:
        first, second = self.task("Draft"), self.task("Review")
        self.assertFalse(first["is_next"])
        self.assertTrue(self.post("/api/task/next", {"id": second["id"], "next": True})["is_next"])
        self.post("/api/task/next", {"id": first["id"], "next": True})
        self.assertEqual(self.flags(), {"Draft": True, "Review": False})
        self.post("/api/task/next", {"id": first["id"], "next": False})
        self.assertEqual(self.flags(), {"Draft": False, "Review": False})

    def test_done_tasks_and_subtasks_are_never_next(self) -> None:
        task = self.task("Draft")
        sub = self.task("Outline", parent_id=task["id"])
        self.post("/api/task/next", {"id": sub["id"], "next": True}, 400)
        self.post("/api/task/next", {"id": task["id"], "next": "yes"}, 400)
        self.post("/api/task/next", {"id": task["id"], "next": True})
        self.assertFalse(self.post("/api/task/done", {"id": task["id"], "done": True})["is_next"])
        self.post("/api/task/next", {"id": task["id"], "next": True}, 400)

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
