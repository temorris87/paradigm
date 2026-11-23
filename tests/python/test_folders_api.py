import unittest

from helpers import RunningServer


class FoldersApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.running = RunningServer()

    def tearDown(self) -> None:
        self.running.close()

    def post(self, path, payload, expect=200):
        status, answer = self.running.post_json(path, payload)
        self.assertEqual(status, expect, answer)
        return answer

    def test_folders_hold_resources_and_trash_with_them(self) -> None:
        top = self.post("/api/folder/create", {"parent_id": None, "title": "Standards"})
        inner = self.post("/api/folder/create", {"parent_id": top["id"], "title": "Electrical"})
        self.post("/api/folder/create", {"parent_id": None, "title": "standards"}, expect=409)
        note = self.post("/api/note/create", {"parent_id": None, "title": "Cable sizing"})
        self.post("/api/note/folder", {"id": note["id"], "folder_id": inner["id"]}, expect=400)
        self.post("/api/note/kind", {"id": note["id"], "kind": "resource"})
        placed = self.post("/api/note/folder", {"id": note["id"], "folder_id": inner["id"]})
        self.assertEqual(placed["folder_id"], inner["id"])
        status, listed = self.running.get_json("/api/folders")
        self.assertEqual(status, 200, listed)
        self.assertEqual([f["title"] for f in listed["folders"]], ["Electrical", "Standards"])
        self.post("/api/folder/rename", {"id": inner["id"], "title": "Power"})
        self.post("/api/folder/move", {"id": top["id"], "parent_id": inner["id"]}, expect=400)
        trashed = self.post("/api/folder/trash", {"id": top["id"]})
        self.assertEqual(trashed["notes"], [note["id"]])
        self.post("/api/trash/restore", {"id": note["id"]})
        status, listed = self.running.get_json("/api/folders")
        self.assertEqual([f["title"] for f in listed["folders"]], ["Power", "Standards"])

    def test_a_resource_takes_no_meeting(self) -> None:
        note = self.post("/api/note/create", {"parent_id": None, "title": "Manuals"})
        self.post("/api/note/kind", {"id": note["id"], "kind": "resource"})
        status, answer = self.running.post_json("/api/meeting/create", {"hub_id": note["id"], "name": "Sync", "day": "2026-11-23"})
        self.assertGreaterEqual(status, 400, answer)


if __name__ == "__main__":
    unittest.main()
