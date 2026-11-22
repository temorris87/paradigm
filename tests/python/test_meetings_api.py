import unittest

from helpers import RunningServer


class MeetingsApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.running = RunningServer()

    def tearDown(self) -> None:
        self.running.close()

    def post(self, path, payload, status=200):
        got, body = self.running.post_json(path, payload)
        self.assertEqual(got, status, body)
        return body

    def test_create_update_attend_list(self) -> None:
        hub = self.post("/api/note/create", {"parent_id": None, "title": "Rollout"})
        self.post("/api/note/kind", {"id": hub["id"], "kind": "project"})
        made = self.post("/api/meeting/create", {"hub_id": hub["id"], "name": "Kickoff", "day": "2026-11-24"})
        meeting = made["meeting"]["id"]
        self.assertEqual((made["note"]["title"], made["note"]["kind"]), ("Kickoff", "meeting"))
        updated = self.post("/api/meeting/update", {"id": meeting, "day": "2026-11-25", "time": "10:00"})
        self.assertEqual((updated["meeting"]["time"], updated["note"]["title"]), ("10:00", "Kickoff"))
        jane = self.post("/api/person/create", {"name": "Jane Doe"})["person"]["id"]
        attended = self.post("/api/meeting/attend", {"meeting_id": meeting, "person_ids": [jane]})
        self.assertEqual(attended["added"], [jane])
        status, payload = self.running.get_json("/api/meetings")
        self.assertEqual(status, 200)
        self.assertEqual(payload["meetings"], [{"id": meeting, "day": "2026-11-25", "time": "10:00", "end_time": "",
                                                "cancelled": False, "location": "", "join_url": "",
                                                "attendees": [jane], "agenda_version": 1}])
        saved = self.post("/api/meeting/agenda", {"id": meeting, "agenda": "1. Dates", "version": 1, "links": []})
        self.assertEqual(saved["version"], 2)
        self.post("/api/meeting/agenda", {"id": meeting, "agenda": "old", "version": 1}, 409)
        self.assertEqual(self.post("/api/meeting/unattend", {"meeting_id": meeting, "person_id": jane})["attendees"], [])

    def test_errors(self) -> None:
        loose = self.post("/api/note/create", {"parent_id": None, "title": "Loose"})
        self.post("/api/meeting/create", {"hub_id": loose["id"], "name": "X", "day": "2026-11-24"}, 400)
        self.post("/api/meeting/create", {"hub_id": 999, "name": "X", "day": "2026-11-24"}, 404)
        self.post("/api/meeting/update", {"id": loose["id"], "day": "2026-11-24"}, 400)
        self.post("/api/meeting/attend", {"meeting_id": loose["id"], "person_ids": []}, 400)
        self.post("/api/meeting/attend", {"meeting_id": loose["id"], "person_ids": [True]}, 400)


if __name__ == "__main__":
    unittest.main()
