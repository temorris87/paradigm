"""The native file picker (files/native_pick.py, POST /api/file/pick), attaching a file by its
path (POST /api/file/attach_path) and the folder browser's one-level listing
(GET /api/folders/browse?path=P). No dialog ever opens: the child's runner is a fake."""
import ast
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock
from urllib.parse import quote

from helpers import RunningServer
from paradigm.db.connection import Database
from paradigm.db.files_repo import FileRepository, NotLinked
from paradigm.db.migrate import migrate
from paradigm.db.notes_repo import NoteRepository
from paradigm.files import native_pick
from paradigm.files.folders import BadFolder, clean_file, list_entries, parent_of


def done(returncode: int, stdout: bytes = b"") -> subprocess.CompletedProcess:
    return subprocess.CompletedProcess([], returncode, stdout, b"")


def fake_runner(result: subprocess.CompletedProcess, seen: list):
    def run(args):
        seen.append(args)
        return result
    return run


class NativePickTest(unittest.TestCase):
    def test_child_script_is_python_3_11(self) -> None:
        ast.parse(native_pick.CHILD_SCRIPT, feature_version=(3, 11))

    def test_a_picked_file(self) -> None:
        seen = []
        result = native_pick.pick("/start", "Add a file to Pilot",
                                  fake_runner(done(0, b'{"path": "/start/a.xlsx"}'), seen), environ={})
        self.assertEqual(result, native_pick.PickResult(path=str(Path("/start/a.xlsx"))))
        self.assertEqual(seen[0][-2:], ["/start", "Add a file to Pilot"])
        self.assertIn(native_pick.CHILD_SCRIPT, seen[0])

    def test_a_cancel(self) -> None:
        result = native_pick.pick("/s", "t", fake_runner(done(0, b'{"path": null}'), []), environ={})
        self.assertEqual(result, native_pick.PickResult())

    def test_no_tk_falls_back(self) -> None:
        self.assertTrue(native_pick.pick("/s", "t", fake_runner(done(3), []), environ={}).fallback)

    def test_a_crash_or_garbage_falls_back(self) -> None:
        with self.assertLogs(native_pick.log, "WARNING"):
            self.assertTrue(native_pick.parse_result(1, b"").fallback)
            self.assertTrue(native_pick.parse_result(0, b"not json").fallback)
            self.assertTrue(native_pick.parse_result(0, b'{"path": 4}').fallback)

    def test_a_child_that_cannot_start_falls_back(self) -> None:
        def run(args):
            raise FileNotFoundError("no python")
        with self.assertLogs(native_pick.log, "WARNING"):
            self.assertTrue(native_pick.pick("/s", "t", run, environ={}).fallback)

    def test_a_timeout_is_a_cancel(self) -> None:
        def run(args):
            raise subprocess.TimeoutExpired(args, native_pick.TIMEOUT_SECONDS)
        self.assertEqual(native_pick.pick("/s", "t", run, environ={}), native_pick.PickResult())

    def test_browser_mode_never_runs_the_child(self) -> None:
        seen = []
        result = native_pick.pick("/s", "t", fake_runner(done(0, b'{"path": "/x"}'), seen),
                                  environ={"PARADIGM_FILE_PICKER": "browser"})
        self.assertTrue(result.fallback)
        self.assertEqual(seen, [])


class FolderListingTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name).resolve()

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_one_level_folders_then_files_by_name(self) -> None:
        (self.root / "b folder").mkdir()
        (self.root / "A folder" / "deep").mkdir(parents=True)
        (self.root / "z.txt").write_bytes(b"zz")
        (self.root / "M.docx").write_bytes(b"m")
        (self.root / "~$M.docx").write_bytes(b"lock")
        (self.root / "A folder" / "inner.txt").write_bytes(b"i")
        entries = list_entries(self.root)
        self.assertEqual(entries["folders"], [str(self.root / "A folder"), str(self.root / "b folder")])
        self.assertEqual([f["name"] for f in entries["files"]], ["M.docx", "z.txt"])
        self.assertEqual(entries["files"][1]["size"], 2)

    def test_parent_stops_at_a_root(self) -> None:
        sub = self.root / "Sub"
        sub.mkdir()
        self.assertEqual(parent_of(sub, [self.root]), self.root)
        self.assertIsNone(parent_of(self.root, [self.root]))
        self.assertIsNone(parent_of(Path(self.root.anchor), []))

    def test_clean_file_refuses_dot_dot_and_folders(self) -> None:
        (self.root / "a.txt").write_bytes(b"a")
        (self.root / "Sub").mkdir()
        self.assertEqual(clean_file(str(self.root / "a.txt")), self.root / "a.txt")
        for bad in [str(self.root / "Sub" / ".." / "a.txt"), str(self.root / "Sub"), "a.txt", "", None, 4]:
            with self.assertRaises(BadFolder, msg=repr(bad)):
                clean_file(bad)


class AttachPathRepoTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name).resolve()
        self.db = Database.in_folder(root / "data")
        migrate(self.db)
        self.notes = NoteRepository(self.db)
        ticks = iter("2026-11-{:02d}T09:00:00+00:00".format(day) for day in range(1, 29))
        self.files = FileRepository(self.db, clock=lambda: next(ticks))
        self.pilot = self.hub("Pilot")
        self.other = self.hub("Northwind")
        self.contracts = root / "Contracts"
        (self.contracts / "Sub").mkdir(parents=True)
        (self.contracts / "Sub" / "Lease.pdf").write_bytes(b"x")
        self.photos = root / "Photos"
        self.photos.mkdir()
        (self.photos / "Site.jpg").write_bytes(b"x")
        self.loose = root / "Loose"
        self.loose.mkdir()
        (self.loose / "Note.txt").write_bytes(b"x")

    def tearDown(self) -> None:
        self.db.close()
        self.tmp.cleanup()

    def hub(self, title: str) -> int:
        note = self.notes.create(None, title)
        self.notes.set_kind(note["id"], "project")
        return note["id"]

    def test_start_is_the_oldest_linked_folder(self) -> None:
        self.assertEqual(self.files.pick_start(self.pilot), {"title": "Pilot", "folder": None})
        self.files.link_folder(self.pilot, str(self.photos))
        self.files.link_folder(self.pilot, str(self.contracts))
        self.assertEqual(self.files.pick_start(self.pilot)["folder"], str(self.photos))

    def test_attach_a_file_in_a_subfolder_once(self) -> None:
        self.files.link_folder(self.pilot, str(self.contracts))
        first = self.files.attach_path(self.pilot, str(self.contracts / "Sub" / "Lease.pdf"))
        self.assertEqual(first["file"]["rel_path"], "Sub/Lease.pdf")
        self.assertEqual(first["link"]["note_id"], self.pilot)
        again = self.files.attach_path(self.pilot, str(self.contracts / "Sub" / "Lease.pdf"))
        self.assertEqual(again, first)
        self.assertEqual(len(self.files.all()["links"]), 1)

    def test_a_file_just_added_on_disk_is_found_by_the_scan(self) -> None:
        self.files.link_folder(self.pilot, str(self.contracts))
        (self.contracts / "New.xlsx").write_bytes(b"n")
        self.assertEqual(self.files.attach_path(self.pilot, str(self.contracts / "New.xlsx"))["file"]["name"], "New.xlsx")

    def test_a_folder_on_another_hub_counts(self) -> None:
        self.files.link_folder(self.other, str(self.photos))
        made = self.files.attach_path(self.pilot, str(self.photos / "Site.jpg"))
        self.assertEqual(made["link"]["note_id"], self.pilot)

    def test_outside_every_linked_folder_names_its_own_folder(self) -> None:
        self.files.link_folder(self.pilot, str(self.contracts))
        with self.assertRaises(NotLinked) as caught:
            self.files.attach_path(self.pilot, str(self.loose / "Note.txt"))
        self.assertEqual(caught.exception.folder, str(self.loose))
        self.assertEqual(self.files.all()["links"], [])

    def test_dot_dot_out_of_a_linked_folder_is_refused(self) -> None:
        self.files.link_folder(self.pilot, str(self.contracts))
        with self.assertRaises(BadFolder):
            self.files.attach_path(self.pilot, str(self.contracts / ".." / "Loose" / "Note.txt"))


class FilePickApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.running = RunningServer()
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name).resolve()
        self.folder = self.root / "Pilot files"
        (self.folder / "Specs").mkdir(parents=True)
        (self.folder / "Plan.xlsx").write_bytes(b"x")
        (self.folder / "Specs" / "Spec.docx").write_bytes(b"x")
        (self.root / "Elsewhere").mkdir()
        (self.root / "Elsewhere" / "Other.txt").write_bytes(b"x")
        # Only this temporary OneDrive: never this computer's own folders.
        only = {k: v for k, v in os.environ.items() if not k.startswith("OneDrive") and k != "PARADIGM_FILE_PICKER"}
        patcher = mock.patch.dict(os.environ, {**only, "OneDrive": str(self.root)}, clear=True)
        patcher.start()
        self.addCleanup(patcher.stop)

    def tearDown(self) -> None:
        self.running.close()
        self.tmp.cleanup()

    def post(self, path, payload, status=200):
        got, body = self.running.post_json(path, payload)
        self.assertEqual(got, status, body)
        return body

    def hub(self, title, kind="project"):
        note = self.post("/api/note/create", {"parent_id": None, "title": title})
        self.post("/api/note/kind", {"id": note["id"], "kind": kind})
        return note["id"]

    def test_pick_then_attach_shows_under_files(self) -> None:
        pilot = self.hub("Pilot")
        self.post("/api/folder/link", {"note_id": pilot, "path": str(self.folder)})
        seen = []
        picked = str(self.folder / "Specs" / "Spec.docx")
        answer = done(0, '{{"path": {}}}'.format(json.dumps(picked)).encode("utf-8"))
        with mock.patch.object(native_pick, "run_child", fake_runner(answer, seen)):
            body = self.post("/api/file/pick", {"note_id": pilot, "path": "/etc/passwd"})
        self.assertEqual(body, {"path": picked})
        self.assertEqual(seen[0][-2:], [str(self.folder), "Add a file to Pilot"])
        made = self.post("/api/file/attach_path", {"note_id": pilot, "path": body["path"]})
        self.assertEqual(set(made["file"]), {"id", "folder_id", "rel_path", "name", "size", "modified", "missing"})
        self.assertEqual(set(made["link"]), {"file_id", "note_id", "added_at"})
        self.assertEqual(made["file"]["rel_path"], "Specs/Spec.docx")
        again = self.post("/api/file/attach_path", {"note_id": pilot, "path": body["path"]})
        self.assertEqual(again, made)
        _, files = self.running.get_json("/api/files")
        self.assertEqual([(l["file_id"], l["note_id"]) for l in files["links"]], [(made["file"]["id"], pilot)])

    def test_a_cancel_answers_no_path(self) -> None:
        pilot = self.hub("Pilot")
        with mock.patch.object(native_pick, "run_child", fake_runner(done(0, b'{"path": null}'), [])):
            self.assertEqual(self.post("/api/file/pick", {"note_id": pilot}), {"path": None})

    def test_no_tk_falls_back_to_the_browser(self) -> None:
        pilot = self.hub("Pilot")
        self.post("/api/folder/link", {"note_id": pilot, "path": str(self.folder)})
        with mock.patch.object(native_pick, "run_child", fake_runner(done(3), [])):
            body = self.post("/api/file/pick", {"note_id": pilot})
        self.assertEqual(body, {"path": None, "fallback": "browser", "start": str(self.folder)})

    def test_browser_mode_with_nothing_linked_starts_at_onedrive(self) -> None:
        pilot = self.hub("Pilot")
        with mock.patch.dict(os.environ, {"PARADIGM_FILE_PICKER": "browser"}):
            body = self.post("/api/file/pick", {"note_id": pilot})
        self.assertEqual(body, {"path": None, "fallback": "browser", "start": str(self.root)})

    def test_pick_refuses_trashed_hubs_and_plain_notes(self) -> None:
        gone = self.hub("Old")
        self.post("/api/note/delete", {"id": gone})
        plain = self.post("/api/note/create", {"parent_id": None, "title": "Loose note"})["id"]
        with mock.patch.dict(os.environ, {"PARADIGM_FILE_PICKER": "browser"}):
            self.post("/api/file/pick", {"note_id": gone}, 404)
            self.post("/api/file/pick", {"note_id": plain}, 400)
            self.post("/api/file/pick", {"note_id": 9999}, 404)

    def test_attach_path_outside_and_bad_paths(self) -> None:
        pilot = self.hub("Pilot")
        self.post("/api/folder/link", {"note_id": pilot, "path": str(self.folder)})
        outside = self.post("/api/file/attach_path", {"note_id": pilot, "path": str(self.root / "Elsewhere" / "Other.txt")})
        # A 200, so a pick from a new folder leaves no console error in the browser.
        self.assertEqual(outside, {"file": None, "link": None, "folder": str(self.root / "Elsewhere")})
        sneaky = str(self.folder / "Specs" / ".." / ".." / "Elsewhere" / "Other.txt")
        self.post("/api/file/attach_path", {"note_id": pilot, "path": sneaky}, 400)
        self.post("/api/file/attach_path", {"note_id": pilot, "path": str(self.folder / "Specs")}, 400)
        self.post("/api/file/attach_path", {"note_id": pilot, "path": "Plan.xlsx"}, 400)
        self.post("/api/file/attach_path", {"note_id": 9999, "path": str(self.folder / "Plan.xlsx")}, 404)
        # Link the file's folder, as the page's confirm does, and it attaches.
        self.post("/api/folder/link", {"note_id": pilot, "path": outside["folder"]})
        made = self.post("/api/file/attach_path", {"note_id": pilot, "path": str(self.root / "Elsewhere" / "Other.txt")})
        self.assertEqual(made["file"]["name"], "Other.txt")

    def test_browse_one_level(self) -> None:
        status, body = self.running.get_json("/api/folders/browse?path=" + quote(str(self.folder)))
        self.assertEqual(status, 200, body)
        self.assertEqual(body["path"], str(self.folder))
        self.assertEqual(body["parent"], str(self.root))
        self.assertEqual(body["roots"], [str(self.root)])
        self.assertEqual(body["folders"], [str(self.folder / "Specs")])
        self.assertEqual([f["name"] for f in body["files"]], ["Plan.xlsx"])
        self.assertEqual(set(body["files"][0]), {"name", "size", "modified"})
        _, top = self.running.get_json("/api/folders/browse?path=" + quote(str(self.root)))
        self.assertIsNone(top["parent"])
        for bad in ["", quote(str(self.folder / "Plan.xlsx")), "relative"]:
            status, body = self.running.get_json("/api/folders/browse?path=" + bad)
            self.assertEqual(status, 400, bad)
        status, whole = self.running.get_json("/api/folders/browse")
        self.assertEqual(set(whole), {"roots", "folders"})


if __name__ == "__main__":
    unittest.main()
