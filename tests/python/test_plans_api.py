"""The plan, template and file endpoints over HTTP."""
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from helpers import RunningServer


class PlansApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.running = RunningServer()

    def tearDown(self) -> None:
        self.running.close()

    def post(self, path, payload, status=200):
        got, body = self.running.post_json(path, payload)
        self.assertEqual(got, status, body)
        return body

    def hub(self, title, kind):
        note = self.post("/api/note/create", {"parent_id": None, "title": title})
        self.post("/api/note/kind", {"id": note["id"], "kind": kind})
        return note["id"]

    def test_plan_and_templates(self) -> None:
        area = self.hub("Ops", "area")
        project = self.hub("Pilot", "project")
        self.post("/api/note/area", {"id": project, "area_id": area})
        phase = self.post("/api/phase/create", {"project_id": project, "title": "Design", "start": "2026-11-02",
                                                "end": "2026-11-13"})["note"]
        self.assertEqual(phase["kind"], "phase")
        milestone = self.post("/api/milestone/create", {"owner_id": phase["id"], "title": "Sign-off",
                                                        "day": "2026-11-13"})["note"]
        changes = self.post("/api/plan/dates", {"id": phase["id"], "end": "2026-11-20", "reason": "late"})["changes"]
        self.assertEqual(changes[0]["reason"], "late")
        self.post("/api/plan/dates", {"id": phase["id"], "start": "2026-12-01"}, 400)  # after its end
        self.post("/api/milestone/done", {"id": milestone["id"], "done": True})
        _, plan = self.running.get_json("/api/plan")
        self.assertEqual((len(plan["phases"]), len(plan["milestones"]), len(plan["changes"])), (1, 1, 1))
        template = self.post("/api/plan_template/save", {"project_id": project, "title": "Standard"})
        self.assertEqual(len(template["items"]), 2)
        made = self.post("/api/plan_template/apply", {"id": template["id"], "project_id": project, "start": "2027-01-04"})
        self.assertEqual(made["phases"], 1)
        _, templates = self.running.get_json("/api/plan_templates")
        self.assertEqual(templates["templates"][0]["title"], "Standard")
        self.post("/api/plan_template/remove", {"id": template["id"]})
        note = self.post("/api/template/create", {"title": "Site visit", "body": "- [ ] Photos"})["note"]
        self.assertEqual(note["kind"], "template")

    def test_files(self) -> None:
        project = self.hub("Pilot", "project")
        with tempfile.TemporaryDirectory() as folder:
            (Path(folder) / "Plan.xlsx").write_bytes(b"x")
            linked = self.post("/api/folder/link", {"note_id": project, "path": folder})
            self.assertEqual(linked["added"], 1)
            self.post("/api/folder/link", {"note_id": project, "path": folder}, 409)
            self.post("/api/folder/link", {"note_id": project, "path": "relative/path"}, 400)
            _, files = self.running.get_json("/api/files")
            file_id = files["files"][0]["id"]
            self.post("/api/file/attach", {"file_id": file_id, "note_id": project})
            _, files = self.running.get_json("/api/files")
            self.assertEqual(files["links"][0]["note_id"], project)
            self.post("/api/file/detach", {"file_id": file_id, "note_id": project})
            self.post("/api/folder/unlink", {"id": linked["folder"]["id"]})
            # Browse walks this computer's OneDrive, else the whole home folder: on a CI runner
            # with no OneDrive that walk outran the 5 s timeout. A temporary OneDrive keeps it
            # to this folder.
            (Path(folder) / "Contracts").mkdir()
            only = {k: v for k, v in os.environ.items() if not k.startswith("OneDrive")}
            with mock.patch.dict(os.environ, {**only, "OneDrive": folder}, clear=True):
                status, browse = self.running.get_json("/api/folders/browse")
            self.assertEqual(status, 200)
            self.assertEqual(browse["roots"], [folder])
            self.assertIn(str(Path(folder) / "Contracts"), browse["folders"])
            self.assertTrue(all(path.startswith(folder) for path in browse["folders"]))


if __name__ == "__main__":
    unittest.main()
