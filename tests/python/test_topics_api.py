"""Topics to raise at the next 1:1 (027): by hand, from "@Name ?" lines in any note, raised."""
import unittest

from helpers import RunningServer


class TopicsApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.running = RunningServer()
        self.priya = self.post("/api/person/create", {"first": "Priya", "last": "Shah"})["note"]["id"]

    def tearDown(self) -> None:
        self.running.close()

    def post(self, path, payload, status=200):
        got, body = self.running.post_json(path, payload)
        self.assertEqual(got, status, body)
        return body

    def topics(self):
        _, body = self.running.get_json("/api/person_topics")
        return body["topics"]

    def test_by_hand_raised_and_removed(self) -> None:
        topic = self.post("/api/person_topic/create", {"person_id": self.priya, "text": "  On-call   load "})
        self.assertEqual((topic["text"], topic["raised_at"]), ("On-call load", ""))
        self.assertTrue(self.post("/api/person_topic/raise", {"id": topic["id"], "raised": True})["raised_at"])
        self.assertEqual(self.post("/api/person_topic/raise", {"id": topic["id"], "raised": False})["raised_at"], "")
        self.post("/api/person_topic/create", {"person_id": self.priya, "text": " "}, 400)
        note = self.post("/api/note/create", {"parent_id": None, "title": "Loose"})
        self.post("/api/person_topic/create", {"person_id": note["id"], "text": "x"}, 400)
        self.post("/api/person_topic/remove", {"id": topic["id"]})
        self.assertEqual(self.topics(), [])

    def test_name_question_lines_in_any_note(self) -> None:
        note = self.post("/api/note/create", {"parent_id": None, "title": "ADR draft"})
        capture = {"kind": "topic", "quote": "@Priya ? owning the registry", "title": "Owning the registry",
                   "people": [self.priya], "line": 3}
        saved = self.post("/api/note/save", {"id": note["id"], "body": "x", "version": note["version"], "captures": [capture]})
        self.assertEqual(saved["captured"], 1)
        self.post("/api/note/save", {"id": note["id"], "body": "x y", "version": saved["version"], "captures": [capture]})
        topics = self.topics()
        self.assertEqual([(each["text"], each["source_note_id"], each["source_line"]) for each in topics],
                         [("Owning the registry", note["id"], 3)], "once, with where it was written")


if __name__ == "__main__":
    unittest.main()


class TurnIntoDecisionTest(unittest.TestCase):
    def test_a_question_becomes_a_decision_keeping_its_note(self) -> None:
        running = RunningServer()
        try:
            post = lambda path, payload, status=200: _post(self, running, path, payload, status)
            hub = post("/api/note/create", {"parent_id": None, "title": "Bus"})
            post("/api/note/kind", {"id": hub["id"], "kind": "project"})
            made = post("/api/record/create", {"parent_id": hub["id"], "kind": "question", "title": "Exactly-once?", "day": "2026-11-02"})
            record = post("/api/record/convert", {"id": made["note"]["id"], "day": "2026-11-23"})
            self.assertEqual((record["kind"], record["day"], record["id"]), ("decision", "2026-11-23", made["note"]["id"]))
            post("/api/record/convert", {"id": made["note"]["id"], "day": "2026-11-23"}, 400)
        finally:
            running.close()


def _post(test, running, path, payload, status):
    got, body = running.post_json(path, payload)
    test.assertEqual(got, status, body)
    return body
