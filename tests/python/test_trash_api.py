import unittest

from helpers import RunningServer


class TrashApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.running = RunningServer()

    def tearDown(self) -> None:
        self.running.close()

    def make(self, title, parent_id=None):
        status, note = self.running.post_json("/api/note/create", {"parent_id": parent_id, "title": title})
        self.assertEqual(status, 200, note)
        return note

    def test_trash_lists_and_restores(self) -> None:
        acme = self.make("Acme")
        budget = self.make("Budget", acme["id"])
        self.running.post_json("/api/note/delete", {"id": acme["id"], "recursive": True})
        status, payload = self.running.get_json("/api/trash")
        self.assertEqual(status, 200, payload)
        self.assertEqual(payload["days"], 7)
        self.assertEqual([(e["id"], e["inside"]) for e in payload["entries"]], [(acme["id"], 1)])
        status, payload = self.running.post_json("/api/trash/restore", {"id": acme["id"]})
        self.assertEqual(status, 200, payload)
        self.assertEqual((payload["note"]["title"], payload["renamed"]), ("Acme", False))
        status, note = self.running.get_json("/api/note?id={}".format(budget["id"]))
        self.assertEqual(status, 200, note)

    def test_restoring_what_is_not_trashed_is_a_404(self) -> None:
        note = self.make("Acme")
        status, payload = self.running.post_json("/api/trash/restore", {"id": note["id"]})
        self.assertEqual(status, 404, payload)
        status, payload = self.running.post_json("/api/trash/restore", {"id": "x"})
        self.assertEqual(status, 400, payload)


if __name__ == "__main__":
    unittest.main()
