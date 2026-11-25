"""Unlinking a OneDrive folder from a hub (files_repo.unlink_folder, POST /api/folder/unlink):
its files come off every note they were on, other folders are untouched, nothing on disk
changes, and the hub can then be filed as a resource."""
import tempfile
import unittest
from pathlib import Path

from helpers import RunningServer
from paradigm.db.connection import Database
from paradigm.db.files_repo import FileRepository, NotFound
from paradigm.db.migrate import migrate
from paradigm.db.notes_repo import HoldsHubThings, NoteRepository
from paradigm.db.trash_repo import TrashRepository


class UnlinkFolderTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.db = Database.in_folder(root / "data")
        migrate(self.db)
        self.notes = NoteRepository(self.db)
        self.files = FileRepository(self.db)
        self.contracts = self.sample_folder(root / "Contracts", ["Lease.pdf", "Quote.xlsx"])
        self.photos = self.sample_folder(root / "Photos", ["Site.jpg"])
        self.area = self.notes.create(None, "Northwind rollout")
        self.notes.set_kind(self.area["id"], "area")
        self.kickoff = self.notes.create(self.area["id"], "Kickoff")
        self.phase1 = self.notes.create(self.area["id"], "Phase 1")

    def tearDown(self) -> None:
        self.db.close()
        self.tmp.cleanup()

    def sample_folder(self, path: Path, names) -> Path:
        path.mkdir(parents=True)
        for name in names:
            (path / name).write_bytes(b"sample")
        return path

    def link(self, path: Path) -> int:
        return self.files.link_folder(self.area["id"], str(path))["folder"]["id"]

    def file_ids(self, folder_id: int):
        return [f["id"] for f in self.files.all()["files"] if f["folder_id"] == folder_id]

    def test_unlink_drops_the_files_from_every_note(self) -> None:
        folder_id = self.link(self.contracts)
        lease, quote = self.file_ids(folder_id)
        self.files.attach(lease, self.kickoff["id"])
        self.files.attach(quote, self.phase1["id"])
        self.files.attach(lease, self.area["id"])
        self.files.unlink_folder(folder_id)
        everything = self.files.all()
        self.assertEqual(everything, {"folders": [], "files": [], "links": []})
        # Nothing on disk changes.
        self.assertEqual(sorted(p.name for p in self.contracts.iterdir()), ["Lease.pdf", "Quote.xlsx"])

    def test_attachments_on_trashed_notes_are_counted_then_dropped(self) -> None:
        folder_id = self.link(self.contracts)
        lease = self.file_ids(folder_id)[0]
        self.files.attach(lease, self.kickoff["id"])
        self.assertEqual(self.files.all()["folders"][0]["trashed"], 0)
        self.notes.delete(self.kickoff["id"])
        everything = self.files.all()
        self.assertEqual(everything["links"], [])
        self.assertEqual(everything["folders"][0]["trashed"], 1)
        self.files.unlink_folder(folder_id)
        TrashRepository(self.db).restore(self.kickoff["id"])
        self.assertEqual(self.files.all(), {"folders": [], "files": [], "links": []})

    def test_unlink_leaves_other_folders_alone(self) -> None:
        contracts = self.link(self.contracts)
        photos = self.link(self.photos)
        site = self.file_ids(photos)[0]
        self.files.attach(site, self.kickoff["id"])
        self.files.attach(self.file_ids(contracts)[0], self.kickoff["id"])
        self.files.unlink_folder(contracts)
        everything = self.files.all()
        self.assertEqual([f["id"] for f in everything["folders"]], [photos])
        self.assertEqual([f["id"] for f in everything["files"]], [site])
        self.assertEqual([(l["file_id"], l["note_id"]) for l in everything["links"]], [(site, self.kickoff["id"])])

    def test_a_gone_folder_is_not_found(self) -> None:
        folder_id = self.link(self.contracts)
        self.files.unlink_folder(folder_id)
        with self.assertRaises(NotFound):
            self.files.unlink_folder(folder_id)

    def test_the_hub_can_become_a_resource_after_it(self) -> None:
        folder_id = self.link(self.contracts)
        with self.assertRaises(HoldsHubThings):
            self.notes.set_kind(self.area["id"], "resource")
        self.files.unlink_folder(folder_id)
        self.assertEqual(self.notes.set_kind(self.area["id"], "resource")["kind"], "resource")

    def test_relinking_finds_the_files_but_not_their_attachments(self) -> None:
        folder_id = self.link(self.contracts)
        self.files.attach(self.file_ids(folder_id)[0], self.kickoff["id"])
        self.files.unlink_folder(folder_id)
        again = self.link(self.contracts)
        self.assertEqual(len(self.file_ids(again)), 2)
        self.assertEqual(self.files.all()["links"], [])


class UnlinkFolderApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.running = RunningServer()

    def tearDown(self) -> None:
        self.running.close()

    def post(self, path, payload, status=200):
        got, body = self.running.post_json(path, payload)
        self.assertEqual(got, status, body)
        return body

    def test_unlink_over_http(self) -> None:
        note = self.post("/api/note/create", {"parent_id": None, "title": "Acme pilot"})
        self.post("/api/note/kind", {"id": note["id"], "kind": "project"})
        with tempfile.TemporaryDirectory() as folder:
            (Path(folder) / "Plan.xlsx").write_bytes(b"x")
            folder_id = self.post("/api/folder/link", {"note_id": note["id"], "path": folder})["folder"]["id"]
            _, files = self.running.get_json("/api/files")
            self.post("/api/file/attach", {"file_id": files["files"][0]["id"], "note_id": note["id"]})
            self.assertEqual(self.post("/api/folder/unlink", {"id": folder_id}), {})
            _, files = self.running.get_json("/api/files")
            self.assertEqual(files, {"folders": [], "files": [], "links": []})
            self.post("/api/folder/unlink", {"id": folder_id}, 404)
            self.post("/api/folder/unlink", {"id": "three"}, 400)
            self.post("/api/folder/unlink", {}, 400)
        self.assertEqual(self.post("/api/note/kind", {"id": note["id"], "kind": "resource"})["kind"], "resource")


if __name__ == "__main__":
    unittest.main()
