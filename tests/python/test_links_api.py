import unittest

from helpers import RunningServer


class LinksApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.running = RunningServer()

    def tearDown(self) -> None:
        self.running.close()

    def index(self):
        status, payload = self.running.get_json("/api/links")
        self.assertEqual(status, 200, payload)
        return payload

    def test_the_welcome_note_starts_stale_and_catches_up(self) -> None:
        stale = self.index()["stale"]
        self.assertEqual(len(stale), 1)
        entry = stale[0]
        self.assertIn("body", entry)
        status, payload = self.running.post_json(
            "/api/links/index", {"entries": [{"id": entry["id"], "version": entry["version"], "links": ["A"]}]})
        self.assertEqual((status, payload), (200, {"stored": [entry["id"]]}))
        self.assertEqual(self.index(), {"links": [{"id": entry["id"], "targets": ["A"]}], "stale": []})

    def test_save_and_create_carry_links(self) -> None:
        status, note = self.running.post_json("/api/note/create",
                                              {"parent_id": None, "title": "Rollout", "body": "[[A]]", "links": ["A"]})
        self.assertEqual(status, 200, note)
        status, saved = self.running.post_json("/api/note/save",
                                               {"id": note["id"], "body": "[[B]]", "version": 1, "links": ["B"]})
        self.assertEqual(status, 200, saved)
        links = {entry["id"]: entry["targets"] for entry in self.index()["links"]}
        self.assertEqual(links[note["id"]], ["B"])

    def test_bad_links_are_a_400(self) -> None:
        status, note = self.running.post_json("/api/note/create", {"parent_id": None, "title": "Rollout"})
        status, payload = self.running.post_json("/api/note/save",
                                                 {"id": note["id"], "body": "x", "version": 1, "links": "A"})
        self.assertEqual(status, 400, payload)
        status, payload = self.running.post_json("/api/links/index", {"entries": [{"id": note["id"], "version": 1}]})
        self.assertEqual(status, 400, payload)
        status, payload = self.running.post_json("/api/links/index", {"entries": "x"})
        self.assertEqual(status, 400, payload)


if __name__ == "__main__":
    unittest.main()
