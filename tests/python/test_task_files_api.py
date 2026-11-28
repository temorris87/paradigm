"""OneDrive files linked to a task (031_task_files.sql, /api/task/files and /api/task/file/...):
attaching by id and by path, the list's shape and order, unlinking, and the links going with a
removed task, an unlinked folder and a purged hub. The files on disk are never touched."""
import tempfile
import unittest
from pathlib import Path

from helpers import RunningServer
from paradigm.db.connection import Database
from paradigm.db.files_repo import FileRepository, NotFound, NotLinked
from paradigm.db.migrate import migrate
from paradigm.db.notes_repo import NoteRepository
from paradigm.db.tasks_repo import TaskRepository
from paradigm.db.trash_repo import TrashRepository

FIELDS = {"id", "name", "rel_path", "folder_id", "folder_name", "hub_id", "hub_title", "missing", "added_at"}


def sample_folder(path: Path, names) -> Path:
    for name in names:
        (path / name).parent.mkdir(parents=True, exist_ok=True)
        (path / name).write_bytes(b"sample")
    return path


class Ticks:
    """A clock that moves a second on each call, so added_at orders the links."""

    def __init__(self) -> None:
        self.n = 0

    def __call__(self) -> str:
        self.n += 1
        return "2026-11-25T10:00:{:02d}.000Z".format(self.n)


class TaskFilesRepoTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.db = Database.in_folder(root / "data")
        migrate(self.db)
        self.notes = NoteRepository(self.db)
        self.files = FileRepository(self.db, clock=Ticks())
        self.tasks = TaskRepository(self.db)
        self.portal = sample_folder(root / "Customer portal", ["Specs/Request form fields v3.xlsx", "Notes.docx"])
        self.photos = sample_folder(root / "Photos", ["Site.jpg"])
        self.project = self.hub("Customer portal v2")
        self.folder_id = self.files.link_folder(self.project, str(self.portal))["folder"]["id"]
        self.task = self.tasks.create(self.project, "Agree the request form")["id"]

    def tearDown(self) -> None:
        self.db.close()
        self.tmp.cleanup()

    def hub(self, title: str, kind: str = "project") -> int:
        note = self.notes.create(None, title)
        self.notes.set_kind(note["id"], kind)
        return note["id"]

    def file_id(self, rel_path: str) -> int:
        return next(f["id"] for f in self.files.all()["files"] if f["rel_path"] == rel_path)

    def links(self):
        with self.db.reading() as conn:
            return [tuple(row) for row in conn.execute("SELECT task_id, file_id FROM task_files ORDER BY task_id, file_id")]

    def test_attach_lists_the_file_with_its_folder_and_hub(self) -> None:
        spec = self.file_id("Specs/Request form fields v3.xlsx")
        made = self.files.attach_to_task(self.task, spec)
        self.assertEqual(set(made), FIELDS)
        self.assertEqual((made["name"], made["rel_path"], made["folder_id"], made["folder_name"], made["hub_id"],
                          made["hub_title"], made["missing"]),
                         ("Request form fields v3.xlsx", "Specs/Request form fields v3.xlsx", self.folder_id,
                          "Customer portal", self.project, "Customer portal v2", False))
        self.assertEqual(self.files.task_files(self.task), [made])

    def test_the_list_is_oldest_added_first_and_attaching_twice_keeps_one(self) -> None:
        notes_doc = self.file_id("Notes.docx")
        spec = self.file_id("Specs/Request form fields v3.xlsx")
        first = self.files.attach_to_task(self.task, notes_doc)
        self.files.attach_to_task(self.task, spec)
        again = self.files.attach_to_task(self.task, notes_doc)
        self.assertEqual(again["added_at"], first["added_at"])
        self.assertEqual([f["id"] for f in self.files.task_files(self.task)], [notes_doc, spec])

    def test_a_task_file_is_not_a_note_attachment(self) -> None:
        self.files.attach_to_task(self.task, self.file_id("Notes.docx"))
        self.assertEqual(self.files.all()["links"], [])

    def test_attach_path_prefers_the_tasks_hub_and_offers_an_unlinked_folder(self) -> None:
        # A subtask's note is the same hub; a task on a page under the hub uses the hub too.
        page = self.notes.create(self.project, "Design")["id"]
        on_page = self.tasks.create(page, "Mock the form")["id"]
        made = self.files.attach_path_to_task(on_page, str(self.portal / "Specs" / "Request form fields v3.xlsx"))
        self.assertEqual(made["hub_id"], self.project)
        with self.assertRaises(NotLinked) as caught:
            self.files.attach_path_to_task(self.task, str(self.photos / "Site.jpg"))
        self.assertEqual(Path(caught.exception.folder), self.photos.resolve())

    def test_a_file_from_another_hubs_folder_names_that_hub(self) -> None:
        other = self.hub("Field visits", "area")
        self.files.link_folder(other, str(self.photos))
        made = self.files.attach_path_to_task(self.task, str(self.photos / "Site.jpg"))
        self.assertEqual((made["hub_id"], made["hub_title"], made["folder_name"]), (other, "Field visits", "Photos"))

    def test_missing_tasks_and_files_are_not_found(self) -> None:
        with self.assertRaises(NotFound):
            self.files.task_files(999)
        with self.assertRaises(NotFound):
            self.files.attach_to_task(999, self.file_id("Notes.docx"))
        with self.assertRaises(NotFound):
            self.files.attach_to_task(self.task, 999)
        with self.assertRaises(NotFound):
            self.files.detach_from_task(999, 1)

    def test_detach_unlinks_and_leaves_the_file_on_disk(self) -> None:
        spec = self.file_id("Specs/Request form fields v3.xlsx")
        self.files.attach_to_task(self.task, spec)
        self.files.detach_from_task(self.task, spec)
        self.files.detach_from_task(self.task, spec)  # not there: nothing to do
        self.assertEqual(self.files.task_files(self.task), [])
        self.assertTrue((self.portal / "Specs" / "Request form fields v3.xlsx").is_file())
        self.assertIn(spec, [f["id"] for f in self.files.all()["files"]])

    def test_a_missing_file_stays_while_a_task_has_it(self) -> None:
        notes_doc = self.file_id("Notes.docx")
        self.files.attach_to_task(self.task, notes_doc)
        (self.portal / "Notes.docx").unlink()
        self.assertEqual(self.files.scan(self.folder_id)["missing"], 1)
        self.assertTrue(self.files.task_files(self.task)[0]["missing"])
        self.files.detach_from_task(self.task, notes_doc)
        self.assertNotIn(notes_doc, [f["id"] for f in self.files.all()["files"]])

    def test_removing_a_task_deletes_its_links_with_its_subtasks(self) -> None:
        sub = self.tasks.create(self.project, "Check the fields", parent_id=self.task)["id"]
        keep = self.tasks.create(self.project, "Another")["id"]
        spec, notes_doc = self.file_id("Specs/Request form fields v3.xlsx"), self.file_id("Notes.docx")
        self.files.attach_to_task(self.task, spec)
        self.files.attach_to_task(sub, notes_doc)
        self.files.attach_to_task(keep, spec)
        self.tasks.remove(self.task)
        self.assertEqual(self.links(), [(keep, spec)])
        self.assertEqual(sorted(p.name for p in self.portal.iterdir()), ["Notes.docx", "Specs"])

    def test_unlinking_the_folder_drops_its_task_links(self) -> None:
        self.files.attach_to_task(self.task, self.file_id("Notes.docx"))
        self.files.unlink_folder(self.folder_id)
        self.assertEqual(self.links(), [])
        self.assertEqual(self.files.task_files(self.task), [])
        self.assertTrue((self.portal / "Notes.docx").is_file())

    def test_purging_the_hub_drops_its_tasks_links(self) -> None:
        other = self.hub("Field visits", "area")
        self.files.link_folder(other, str(self.photos))
        site = self.file_id("Site.jpg")
        elsewhere = self.tasks.create(other, "Visit the site")["id"]
        self.files.attach_to_task(self.task, site)
        self.files.attach_to_task(elsewhere, self.file_id("Notes.docx"))
        self.notes.delete(self.project)
        TrashRepository(self.db, keep_days=0).purge()
        # The project's task went, and the project's folder with the link to its file.
        self.assertEqual(self.links(), [])
        self.assertTrue((self.photos / "Site.jpg").is_file())

    def test_a_trashed_tasks_note_hides_the_task(self) -> None:
        page = self.notes.create(self.project, "Design")["id"]
        on_page = self.tasks.create(page, "Mock the form")["id"]
        self.notes.delete(page)
        with self.assertRaises(NotFound):
            self.files.task_files(on_page)


class TaskFilesApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.running = RunningServer()
        self.tmp = tempfile.TemporaryDirectory()
        self.folder = sample_folder(Path(self.tmp.name) / "Customer portal", ["Specs/Request form fields v3.xlsx"])
        self.stray = sample_folder(Path(self.tmp.name) / "Elsewhere", ["Loose.pdf"])
        note = self.post("/api/note/create", {"parent_id": None, "title": "Customer portal v2"})
        self.post("/api/note/kind", {"id": note["id"], "kind": "project"})
        self.hub = note["id"]
        self.post("/api/folder/link", {"note_id": self.hub, "path": str(self.folder)})
        self.task = self.post("/api/task/create", {"note_id": self.hub, "title": "Agree the request form"})["id"]

    def tearDown(self) -> None:
        self.running.close()
        self.tmp.cleanup()

    def post(self, path, payload, status=200):
        got, body = self.running.post_json(path, payload)
        self.assertEqual(got, status, body)
        return body

    def test_attach_list_and_detach(self) -> None:
        spec = str(self.folder / "Specs" / "Request form fields v3.xlsx")
        made = self.post("/api/task/file/attach_path", {"task_id": self.task, "path": spec})
        self.assertEqual(set(made), {"file"})
        self.assertEqual(set(made["file"]), FIELDS)
        self.assertEqual((made["file"]["hub_id"], made["file"]["folder_name"]), (self.hub, "Customer portal"))
        status, listed = self.running.get_json("/api/task/files?task={}".format(self.task))
        self.assertEqual((status, listed), (200, {"files": [made["file"]]}))
        again = self.post("/api/task/file/attach", {"task_id": self.task, "file_id": made["file"]["id"]})
        self.assertEqual(again, made)
        self.assertEqual(self.post("/api/task/file/detach", {"task_id": self.task, "file_id": made["file"]["id"]}), {})
        self.assertEqual(self.running.get_json("/api/task/files?task={}".format(self.task))[1], {"files": []})
        self.assertTrue(Path(spec).is_file())

    def test_a_file_from_an_unlinked_folder_offers_the_folder(self) -> None:
        body = self.post("/api/task/file/attach_path", {"task_id": self.task, "path": str(self.stray / "Loose.pdf")})
        self.assertEqual(set(body), {"file", "folder"})
        self.assertIsNone(body["file"])
        self.assertEqual(Path(body["folder"]), self.stray.resolve())
        # Linking the folder to the hub, then asking again, links it to the task.
        self.post("/api/folder/link", {"note_id": self.hub, "path": body["folder"]})
        made = self.post("/api/task/file/attach_path", {"task_id": self.task, "path": str(self.stray / "Loose.pdf")})
        self.assertEqual(made["file"]["name"], "Loose.pdf")

    def test_errors(self) -> None:
        self.assertEqual(self.running.get_json("/api/task/files?task=x")[0], 400)
        self.assertEqual(self.running.get_json("/api/task/files")[0], 400)
        self.assertEqual(self.running.get_json("/api/task/files?task=999")[0], 404)
        self.post("/api/task/file/attach", {"task_id": 999, "file_id": 1}, 404)
        self.post("/api/task/file/attach", {"task_id": self.task, "file_id": 999}, 404)
        self.post("/api/task/file/attach_path", {"task_id": self.task, "path": "relative/x.pdf"}, 400)
        self.post("/api/task/file/attach_path", {"task_id": self.task, "path": "/a/../b.pdf"}, 400)
        self.post("/api/task/file/attach_path", {"task_id": 999, "path": str(self.stray / "Loose.pdf")}, 404)
        self.post("/api/task/file/detach", {"task_id": 999, "file_id": 1}, 404)

    def test_removing_the_task_through_the_api_drops_its_links(self) -> None:
        spec = str(self.folder / "Specs" / "Request form fields v3.xlsx")
        self.post("/api/task/file/attach_path", {"task_id": self.task, "path": spec})
        self.post("/api/task/remove", {"id": self.task})
        self.assertEqual(self.running.get_json("/api/task/files?task={}".format(self.task))[0], 404)
        self.assertTrue(Path(spec).is_file())


if __name__ == "__main__":
    unittest.main()
