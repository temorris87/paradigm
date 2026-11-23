"""Status logs on projects and areas (023_status_logs.sql)."""
import unittest

from helpers import RunningServer


class StatusApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.running = RunningServer()

    def tearDown(self) -> None:
        self.running.close()

    def post(self, path, payload, status=200):
        got, body = self.running.post_json(path, payload)
        self.assertEqual(got, status, body)
        return body

    def hub(self, title, kind=None):
        note = self.post("/api/note/create", {"parent_id": None, "title": title})
        if kind:
            self.post("/api/note/kind", {"id": note["id"], "kind": kind})
        return note["id"]

    def test_log_list_update_remove(self) -> None:
        project = self.hub("Budget", "project")
        first = self.post("/api/status_log/create", {"note_id": project, "day": "2026-11-13", "health": "on_track",
                                                     "text": " Picked JetStream. "})
        self.assertEqual((first["health"], first["text"]), ("on_track", "Picked JetStream."))
        second = self.post("/api/status_log/create", {"note_id": project, "day": "2026-11-20", "health": "at_risk",
                                                      "text": "Design slipped."})
        _, body = self.running.get_json("/api/status_logs")
        self.assertEqual([entry["id"] for entry in body["logs"]], [second["id"], first["id"]], "newest first")
        self.assertEqual(body["stale_days"], 14)
        updated = self.post("/api/status_log/update", {"id": second["id"], "day": "2026-11-21", "health": "blocked",
                                                       "text": "Waiting on hardware."})
        self.assertEqual((updated["day"], updated["health"]), ("2026-11-21", "blocked"))
        self.post("/api/status_log/remove", {"id": first["id"]})
        _, body = self.running.get_json("/api/status_logs")
        self.assertEqual(len(body["logs"]), 1)

    def test_only_hubs_and_clean_values(self) -> None:
        project = self.hub("Budget", "project")
        area = self.hub("Ops", "area")
        inbox = self.hub("Loose")
        self.post("/api/status_log/create", {"note_id": area, "day": "2026-11-20", "health": "on_track", "text": "Fine"})
        self.post("/api/status_log/create", {"note_id": inbox, "day": "2026-11-20", "health": "on_track", "text": "x"}, 400)
        self.post("/api/status_log/create", {"note_id": project, "day": "2026-11-20", "health": "great", "text": "x"}, 400)
        self.post("/api/status_log/create", {"note_id": project, "day": "soon", "health": "on_track", "text": "x"}, 400)
        self.post("/api/status_log/create", {"note_id": project, "day": "2026-11-20", "health": "on_track", "text": "  "}, 400)
        self.post("/api/status_log/remove", {"id": 999}, 404)

    def test_entries_leave_with_their_hub(self) -> None:
        project = self.hub("Budget", "project")
        self.post("/api/status_log/create", {"note_id": project, "day": "2026-11-20", "health": "on_track", "text": "Fine"})
        self.post("/api/note/delete", {"id": project})
        _, body = self.running.get_json("/api/status_logs")
        self.assertEqual(body["logs"], [], "a trashed hub's log is not listed")


if __name__ == "__main__":
    unittest.main()
