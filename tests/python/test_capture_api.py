"""Meeting capture: T:/D:/Q: lines sent with a meeting's save become tasks and records once."""
import unittest

from helpers import RunningServer


class CaptureApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.running = RunningServer()
        hub = self.post("/api/note/create", {"parent_id": None, "title": "Bus"})
        self.post("/api/note/kind", {"id": hub["id"], "kind": "project"})
        self.hub = hub["id"]
        meeting = self.post("/api/meeting/create", {"hub_id": self.hub, "name": "Review", "day": "2026-11-23", "time": "11:00"})
        self.meeting = meeting["note"]["id"]
        self.tom = self.post("/api/person/create", {"first": "Tom", "last": "Okafor"})["note"]["id"]
        self.version = meeting["note"]["version"]

    def tearDown(self) -> None:
        self.running.close()

    def post(self, path, payload, status=200):
        got, body = self.running.post_json(path, payload)
        self.assertEqual(got, status, body)
        return body

    def save(self, body, captures, note=None, status=200):
        saved = self.post("/api/note/save", {"id": note or self.meeting, "body": body, "version": self.version, "force": True,
                                             "captures": captures}, status)
        if status == 200:
            self.version = saved["version"]
        return saved

    def test_lines_become_tasks_and_records_once(self) -> None:
        captures = [
            {"kind": "task", "quote": "@Tom book the room !fri", "title": "Book the room", "delegate_id": self.tom, "due": "2026-11-27"},
            {"kind": "task", "quote": "send @Tom the numbers", "title": "Send Tom the numbers", "for_person_id": self.tom},
            {"kind": "decision", "quote": "Stay at-least-once", "title": "Stay at-least-once", "people": [self.tom]},
            {"kind": "question", "quote": "Ordering across partitions?", "title": "Ordering across partitions?"},
        ]
        self.assertEqual(self.save("T: ...", captures)["captured"], 4)
        self.assertEqual(self.save("T: ... again", captures)["captured"], 0, "saved again, nothing twice")
        _, tasks = self.running.get_json("/api/tasks")
        by_title = {task["title"]: task for task in tasks["tasks"]}
        self.assertEqual(by_title["Book the room"]["delegate_id"], self.tom)
        self.assertEqual(by_title["Book the room"]["due"], "2026-11-27")
        self.assertEqual(by_title["Book the room"]["note_id"], self.hub, "on the meeting's hub")
        self.assertEqual((by_title["Send Tom the numbers"]["delegate_id"], by_title["Send Tom the numbers"]["for_person_id"]),
                         (None, self.tom))
        _, records = self.running.get_json("/api/records")
        made = {record["quote"]: record for record in records["records"]}
        self.assertEqual(made["Stay at-least-once"]["kind"], "decision")
        self.assertEqual(made["Stay at-least-once"]["people"], [self.tom])
        self.assertEqual(made["Stay at-least-once"]["day"], "2026-11-23", "dated the meeting's day")
        self.assertEqual(made["Ordering across partitions?"]["source_id"], self.meeting)

    def test_only_meetings_capture_and_bad_lines_are_refused(self) -> None:
        plain = self.post("/api/note/create", {"parent_id": self.hub, "title": "Plain"})
        saved = self.post("/api/note/save", {"id": plain["id"], "body": "x", "version": plain["version"],
                                             "captures": [{"kind": "task", "quote": "x", "title": "x"}]})
        self.assertEqual(saved["captured"], 0)
        self.save("x", [{"kind": "memo", "quote": "x", "title": "x"}], status=400)
        self.save("x", [{"kind": "task", "quote": "", "title": "x"}], status=400)
        self.save("x", "not a list", status=400)


if __name__ == "__main__":
    unittest.main()
