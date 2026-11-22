import unittest

from helpers import RunningServer


class RecordsApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.running = RunningServer()

    def tearDown(self) -> None:
        self.running.close()

    def post(self, path, payload, status=200):
        got, body = self.running.post_json(path, payload)
        self.assertEqual(got, status, body)
        return body

    def hub(self) -> int:
        hub = self.post("/api/note/create", {"parent_id": None, "title": "Rollout"})
        self.post("/api/note/kind", {"id": hub["id"], "kind": "project"})
        return hub["id"]

    def test_create_answer_people_list(self) -> None:
        hub = self.hub()
        made = self.post("/api/record/create", {"parent_id": hub, "kind": "question", "title": "Why?", "day": "2026-11-24"})
        question = made["record"]["id"]
        self.assertEqual((made["note"]["title"], made["note"]["kind"]), ("Why?", "question"))
        self.assertEqual(self.post("/api/record/date", {"id": question, "day": "2026-11-23"})["day"], "2026-11-23")
        self.assertEqual(self.post("/api/record/answer", {"id": question, "day": "2026-11-25"})["answered"], "2026-11-25")
        jane = self.post("/api/person/create", {"name": "Jane Doe"})["person"]["id"]
        self.assertEqual(self.post("/api/record/with", {"id": question, "person_ids": [jane]})["added"], [jane])
        status, payload = self.running.get_json("/api/records")
        self.assertEqual(status, 200)
        self.assertEqual(payload["records"], [{"id": question, "kind": "question", "day": "2026-11-23",
                                               "answered": "2026-11-25", "people": [jane]}])
        self.assertEqual(self.post("/api/record/unwith", {"id": question, "person_id": jane})["people"], [])
        self.assertEqual(self.post("/api/record/reopen", {"id": question})["answered"], "")

    def test_errors(self) -> None:
        hub = self.hub()
        loose = self.post("/api/note/create", {"parent_id": None, "title": "Loose"})["id"]
        self.post("/api/record/create", {"parent_id": loose, "kind": "decision", "title": "X", "day": "2026-11-24"}, 400)
        self.post("/api/record/create", {"parent_id": 999, "kind": "decision", "title": "X", "day": "2026-11-24"}, 404)
        self.post("/api/record/create", {"parent_id": hub, "kind": "task", "title": "X", "day": "2026-11-24"}, 400)
        self.post("/api/record/date", {"id": loose, "day": "2026-11-24"}, 400)
        self.post("/api/record/with", {"id": loose, "person_ids": []}, 400)
        decision = self.post("/api/record/create", {"parent_id": hub, "kind": "decision", "title": "X", "day": "2026-11-24"})
        self.post("/api/record/answer", {"id": decision["record"]["id"], "day": "2026-11-24"}, 400)


if __name__ == "__main__":
    unittest.main()
