import json
import unittest

from helpers import RunningServer


class NotesApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.running = RunningServer()

    def tearDown(self) -> None:
        self.running.close()

    def create(self, title, parent_id=None, body=""):
        status, note = self.running.post_json("/api/note/create",
                                              {"parent_id": parent_id, "title": title, "body": body})
        self.assertEqual(status, 200, note)
        return note

    def test_a_new_database_has_the_welcome_note(self) -> None:
        status, payload = self.running.get_json("/api/notes")
        self.assertEqual(status, 200)
        self.assertEqual([note["title"] for note in payload["notes"]], ["Welcome"])

    def test_create_get_save(self) -> None:
        note = self.create("Acme", body="one")
        status, fetched = self.running.get_json("/api/note?id={}".format(note["id"]))
        self.assertEqual((status, fetched["body"]), (200, "one"))
        status, saved = self.running.post_json("/api/note/save",
                                               {"id": note["id"], "body": "two", "version": 1})
        self.assertEqual((status, saved["version"]), (200, 2))

    def test_stale_save_is_a_409_with_the_current_version(self) -> None:
        note = self.create("Acme")
        self.running.post_json("/api/note/save", {"id": note["id"], "body": "a", "version": 1})
        status, payload = self.running.post_json("/api/note/save", {"id": note["id"], "body": "b", "version": 1})
        self.assertEqual(status, 409)
        self.assertEqual(payload["version"], 2)

    def test_rename_move_delete(self) -> None:
        parent = self.create("Projects")
        child = self.create("Northwind")
        status, moved = self.running.post_json("/api/note/move", {"id": child["id"], "parent_id": parent["id"]})
        self.assertEqual((status, moved["parent_id"]), (200, parent["id"]))
        status, renamed = self.running.post_json("/api/note/rename", {"id": child["id"], "title": "Contoso"})
        self.assertEqual((status, renamed["title"]), (200, "Contoso"))
        status, payload = self.running.post_json("/api/note/delete", {"id": parent["id"]})
        self.assertEqual(status, 409)
        status, payload = self.running.post_json("/api/note/delete", {"id": parent["id"], "recursive": True})
        self.assertEqual(sorted(payload["deleted"]), sorted([parent["id"], child["id"]]))

    def test_kind_files_a_note_and_the_tree_shows_it(self) -> None:
        top = self.create("Acme")
        child = self.create("Kickoff", parent_id=top["id"])
        status, filed = self.running.post_json("/api/note/kind", {"id": top["id"], "kind": "project"})
        self.assertEqual((status, filed["kind"]), (200, "project"))
        status, filed = self.running.post_json("/api/note/kind", {"id": child["id"], "kind": "area"})
        self.assertEqual((status, filed["kind"], filed["parent_id"]), (200, "area", None))
        status, payload = self.running.get_json("/api/notes")
        kinds = {note["title"]: note["kind"] for note in payload["notes"]}
        self.assertEqual(kinds, {"Welcome": None, "Acme": "project", "Kickoff": "area"})
        status, filed = self.running.post_json("/api/note/kind", {"id": top["id"], "kind": None})
        self.assertEqual((status, filed["kind"]), (200, None))
        status, payload = self.running.post_json("/api/note/kind", {"id": top["id"], "kind": "archive"})
        self.assertEqual(status, 400)
        self.assertIn("kind", payload["error"])

    def test_archive_and_restore(self) -> None:
        top = self.create("Acme")
        child = self.create("Kickoff", top["id"])
        status, payload = self.running.post_json("/api/note/archive", {"id": top["id"], "archived": True})
        self.assertEqual(status, 200, payload)
        self.assertIsNotNone(payload["note"]["archived_at"])
        self.assertEqual(payload["inside"], 1)
        status, listed = self.running.get_json("/api/notes")
        marks = {note["title"]: note["archived_at"] is not None for note in listed["notes"]}
        self.assertEqual(marks, {"Welcome": False, "Acme": True, "Kickoff": False})
        status, payload = self.running.post_json("/api/note/archive", {"id": child["id"], "archived": True})
        self.assertEqual(status, 400)
        status, payload = self.running.post_json("/api/note/archive", {"id": top["id"], "archived": "yes"})
        self.assertEqual(status, 400)
        status, payload = self.running.post_json("/api/note/archive", {"id": top["id"], "archived": False})
        self.assertEqual((status, payload["note"]["archived_at"]), (200, None))
        status, payload = self.running.post_json("/api/note/archive", {"id": top["id"], "archived": False})
        self.assertEqual(status, 400)
        self.assertIn("not archived", payload["error"])

    def test_area_puts_a_project_in_an_area(self) -> None:
        area = self.create("Operations")
        project = self.create("Acme")
        self.running.post_json("/api/note/kind", {"id": area["id"], "kind": "area"})
        self.running.post_json("/api/note/kind", {"id": project["id"], "kind": "project"})
        status, placed = self.running.post_json("/api/note/area", {"id": project["id"], "area_id": area["id"]})
        self.assertEqual((status, placed["area_id"]), (200, area["id"]))
        status, payload = self.running.post_json("/api/note/area", {"id": area["id"], "area_id": area["id"]})
        self.assertEqual(status, 400)
        self.assertIn("not a project", payload["error"])
        status, placed = self.running.post_json("/api/note/area", {"id": project["id"], "area_id": None})
        self.assertEqual((status, placed["area_id"]), (200, None))

    def test_errors_are_json_with_a_status(self) -> None:
        cases = [
            ("/api/note/create", {"title": "a/b"}, 400),
            ("/api/note/save", {"id": "1", "body": "", "version": 1}, 400),
            ("/api/note/save", {"id": True, "body": "", "version": 1}, 400),
            ("/api/note/save", {"id": 999, "body": "", "version": 1}, 404),
            ("/api/note/create", ["not", "an", "object"], 400),
        ]
        for path, payload, expected in cases:
            with self.subTest(path=path, payload=payload):
                status, body = self.running.post_json(path, payload)
                self.assertEqual(status, expected)
                self.assertIn("error", body)
        status, _, body = self.running.request("POST", "/api/note/create", {}, b"{not json")
        self.assertEqual(status, 400)
        status, body = self.running.get_json("/api/note?id=abc")
        self.assertEqual(status, 400)

    def test_changes_need_post(self) -> None:
        status, _, _ = self.running.request("GET", "/api/note/save")
        self.assertEqual(status, 405)

    def test_a_cross_site_post_is_refused(self) -> None:
        status, _ = self.running.post_json("/api/note/create", {"title": "Evil"},
                                           {"Origin": "http://evil.example"})
        self.assertEqual(status, 403)
        status, payload = self.running.get_json("/api/notes")
        self.assertNotIn("Evil", [note["title"] for note in payload["notes"]])

    def test_an_oversized_body_is_refused_not_cut(self) -> None:
        conn = self.running.connection()
        try:
            conn.putrequest("POST", "/api/note/create")
            conn.putheader("Content-Length", "999999999")
            conn.endheaders()
            response = conn.getresponse()
            self.assertEqual(response.status, 413)
            json.loads(response.read())
        finally:
            conn.close()

    def test_unicode_survives(self) -> None:
        note = self.create("Café ünïcode", body="naïve — ✓ 日本")
        status, fetched = self.running.get_json("/api/note?id={}".format(note["id"]))
        self.assertEqual(fetched["body"], "naïve — ✓ 日本")


if __name__ == "__main__":
    unittest.main()
