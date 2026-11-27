"""Emails on tasks: uploading a .msg, the list, the reply state, opening and removing one, the
upload's own body cap, and the saved files going with their task."""
import http.client
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

from helpers import RunningServer
from msg_fixture import sample_msg
from paradigm.db.connection import Database
from paradigm.db.emails_repo import EmailRepository, NotFound
from paradigm.db.migrate import migrate
from paradigm.db.notes_repo import NoteRepository
from paradigm.db.tasks_repo import TaskRepository
from paradigm.db.trash_repo import TrashRepository
from paradigm.files.msg_reader import read_msg
from paradigm.notes.days import local_today

UTC = timezone.utc
FIELDS = {"id", "task_id", "subject", "sender", "sender_email", "sent_at", "reply", "replied_on", "file_name",
          "added_at"}


def sent(day: int, hour: int = 9) -> datetime:
    return datetime(2026, 11, day, hour, 0, tzinfo=UTC)


class EmailsApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.running = RunningServer()
        self.emails_dir = self.running.config.data_dir / "emails"
        _, payload = self.running.get_json("/api/notes")
        self.note_id = payload["notes"][0]["id"]
        self.task_id = self.make_task("Answer Acme")

    def tearDown(self) -> None:
        self.running.close()

    def make_task(self, title: str) -> int:
        status, task = self.running.post_json("/api/task/create", {"note_id": self.note_id, "title": title})
        self.assertEqual(status, 200, task)
        return task["id"]

    def upload(self, data: bytes, task_id=None, name: str = "Acme%20rollout.msg"):
        path = "/api/task/email/upload?task={}&name={}".format(self.task_id if task_id is None else task_id, name)
        status, _, body = self.running.request("POST", path, {"Content-Type": "application/octet-stream"}, data)
        return status, json.loads(body.decode("utf-8"))

    def saved(self, email) -> Path:
        return self.emails_dir / str(email["task_id"]) / "{}.msg".format(email["id"])

    def test_an_upload_reads_the_message_and_saves_it(self) -> None:
        data = sample_msg(subject="Northwind contract", sender="Lee Acme", sender_email="lee@acme.example",
                          sent=sent(20, 14))
        status, payload = self.upload(data)
        self.assertEqual(status, 200, payload)
        email = payload["email"]
        self.assertEqual(set(email), FIELDS)
        self.assertEqual((email["task_id"], email["subject"], email["sender"], email["sender_email"]),
                         (self.task_id, "Northwind contract", "Lee Acme", "lee@acme.example"))
        self.assertEqual(email["sent_at"], read_msg(data).sent_at)
        self.assertEqual((email["reply"], email["replied_on"]), ("needed", None))
        self.assertEqual(email["file_name"], "Acme rollout.msg")
        self.assertTrue(email["added_at"])
        self.assertEqual(self.saved(email).read_bytes(), data)

    def test_the_name_keeps_no_folder(self) -> None:
        _, payload = self.upload(sample_msg(sent=sent(20)), name="..%2F..%2Fevil.msg")
        self.assertEqual(payload["email"]["file_name"], "evil.msg")
        _, payload = self.upload(sample_msg(subject="Other", sent=sent(20)), name="")
        self.assertEqual(payload["email"]["file_name"], "email.msg")

    def test_what_is_not_a_message_is_refused_and_saves_nothing(self) -> None:
        for data in (b"", b"\x89PNG\r\n\x1a\n" + b"\x00" * 100, sample_msg(with_subject=False)):
            with self.subTest(data=data[:8]):
                status, payload = self.upload(data, name="photo.png")
                self.assertEqual((status, payload), (400, {"error": "not an Outlook message (.msg)"}))
        self.assertFalse(self.emails_dir.exists() and any(self.emails_dir.rglob("*.msg")))
        self.assertEqual(self.running.get_json("/api/task/emails?task={}".format(self.task_id))[1], {"emails": []})

    def test_a_missing_task_is_404_and_saves_nothing(self) -> None:
        status, payload = self.upload(sample_msg(), task_id=9999)
        self.assertEqual(status, 404, payload)
        self.assertFalse((self.emails_dir / "9999").exists())
        self.assertEqual(self.upload(sample_msg(), task_id="x")[0], 400)
        self.assertEqual(self.running.get_json("/api/task/emails?task=9999")[0], 404)
        self.assertEqual(self.running.get_json("/api/task/emails")[0], 400)

    def test_the_same_message_twice_is_refused(self) -> None:
        data = sample_msg(sent=sent(20))
        self.assertEqual(self.upload(data)[0], 200)
        self.assertEqual(self.upload(data), (409, {"error": "already on this task"}))
        # On another task it is fine.
        self.assertEqual(self.upload(data, task_id=self.make_task("Other"))[0], 200)
        # A different sent time is a different message.
        self.assertEqual(self.upload(sample_msg(sent=sent(21)))[0], 200)

    def test_the_list_is_newest_sent_first(self) -> None:
        for subject, when in (("Old", sent(18)), ("No time", None), ("New", sent(22)), ("Mid", sent(20))):
            self.assertEqual(self.upload(sample_msg(subject=subject, sent=when))[0], 200)
        status, payload = self.running.get_json("/api/task/emails?task={}".format(self.task_id))
        self.assertEqual(status, 200)
        self.assertEqual([email["subject"] for email in payload["emails"]], ["New", "Mid", "Old", "No time"])

    def test_the_reply_state_cycles_and_stays(self) -> None:
        email = self.upload(sample_msg(sent=sent(20)))[1]["email"]
        status, payload = self.running.post_json("/api/task/email/reply", {"id": email["id"], "reply": "replied"})
        self.assertEqual(status, 200, payload)
        self.assertEqual((payload["email"]["reply"], payload["email"]["replied_on"]), ("replied", local_today()))
        for state in ("none", "needed"):
            status, payload = self.running.post_json("/api/task/email/reply", {"id": email["id"], "reply": state})
            self.assertEqual((status, payload["email"]["reply"], payload["email"]["replied_on"]), (200, state, None))
        self.running.post_json("/api/task/email/reply", {"id": email["id"], "reply": "none"})
        listed = self.running.get_json("/api/task/emails?task={}".format(self.task_id))[1]["emails"]
        self.assertEqual(listed[0]["reply"], "none")
        self.assertEqual(self.running.post_json("/api/task/email/reply", {"id": email["id"], "reply": "maybe"})[0], 400)
        self.assertEqual(self.running.post_json("/api/task/email/reply", {"id": 999, "reply": "none"})[0], 404)

    def test_open_hands_the_saved_file_to_outlook(self) -> None:
        email = self.upload(sample_msg(sent=sent(20)))[1]["email"]
        with mock.patch("paradigm.files.folders.open_file") as opener:
            status, payload = self.running.post_json("/api/task/email/open", {"id": email["id"]})
        self.assertEqual((status, payload), (200, {"ok": True}))
        opener.assert_called_once_with(self.saved(email))
        self.saved(email).unlink()
        with mock.patch("paradigm.files.folders.open_file") as opener:
            status, payload = self.running.post_json("/api/task/email/open", {"id": email["id"]})
        self.assertEqual((status, payload), (410, {"error": "the saved email is missing"}))
        opener.assert_not_called()
        self.assertEqual(self.running.post_json("/api/task/email/open", {"id": 999})[0], 404)

    def test_remove_takes_the_row_and_the_saved_copy(self) -> None:
        keep = self.upload(sample_msg(subject="Keep", sent=sent(19)))[1]["email"]
        gone = self.upload(sample_msg(subject="Gone", sent=sent(20)))[1]["email"]
        self.assertEqual(self.running.post_json("/api/task/email/remove", {"id": gone["id"]}), (200, {"ok": True}))
        self.assertFalse(self.saved(gone).exists())
        self.assertTrue(self.saved(keep).exists())
        listed = self.running.get_json("/api/task/emails?task={}".format(self.task_id))[1]["emails"]
        self.assertEqual([email["id"] for email in listed], [keep["id"]])
        self.assertEqual(self.running.post_json("/api/task/email/remove", {"id": gone["id"]})[0], 404)

    def test_removing_the_task_takes_its_emails(self) -> None:
        sub = self.running.post_json("/api/task/create", {"note_id": self.note_id, "title": "Sub",
                                                           "parent_id": self.task_id})[1]
        top = self.upload(sample_msg(subject="Top", sent=sent(20)))[1]["email"]
        under = self.upload(sample_msg(subject="Under", sent=sent(20)), task_id=sub["id"])[1]["email"]
        self.assertEqual(self.running.post_json("/api/task/remove", {"id": self.task_id})[0], 200)
        for email in (top, under):
            self.assertFalse(self.saved(email).parent.exists())
            self.assertEqual(self.running.post_json("/api/task/email/open", {"id": email["id"]})[0], 404)

    def test_the_upload_takes_up_to_30_mb(self) -> None:
        self.assertEqual(self.send_length("/api/task/email/upload?task={}".format(self.task_id), 30_000_001), 413)
        self.assertEqual(self.send_length("/api/task/email/reply", 8_000_001), 413)
        self.assertEqual(self.send_length("/api/note/save", 8_000_001), 413)
        # Over 8 MB but under 30: read and judged on its content.
        status, payload = self.upload(sample_msg(subject="Big") + b"\x00" * 9_000_000)
        self.assertEqual(status, 200, payload)

    def send_length(self, path: str, length: int) -> int:
        """Claims a body of length bytes and sends none: the cap is checked before reading."""
        conn = http.client.HTTPConnection("127.0.0.1", self.running.port, timeout=5)
        try:
            conn.putrequest("POST", path)
            conn.putheader("Content-Type", "application/octet-stream")
            conn.putheader("Content-Length", str(length))
            conn.endheaders()
            return conn.getresponse().status
        finally:
            conn.close()


class Clock:
    def __init__(self) -> None:
        self.now = "2026-11-21T12:00:00.000Z"

    def __call__(self) -> str:
        return self.now


class EmailStorageTest(unittest.TestCase):
    """The repositories: the trash, purging a hub, and a failed write."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        data = Path(self.tmp.name) / "data"
        self.db = Database.in_folder(data)
        migrate(self.db)
        self.folder = data / "emails"
        self.clock = Clock()
        self.notes = NoteRepository(self.db, clock=self.clock)
        self.notes.create(None, "Keep")
        self.tasks = TaskRepository(self.db, clock=self.clock, emails_dir=self.folder)
        self.trash = TrashRepository(self.db, clock=self.clock, keep_days=7, emails_dir=self.folder)
        self.emails = EmailRepository(self.db, self.folder, clock=self.clock, today=lambda: "2026-11-21")
        self.hub = self.notes.create(None, "Move office")
        self.notes.set_kind(self.hub["id"], "project")
        self.page = self.notes.create(self.hub["id"], "Kickoff")
        self.task = self.tasks.create(self.page["id"], "Reply to Northwind")

    def tearDown(self) -> None:
        self.db.close()
        self.tmp.cleanup()

    def count(self) -> int:
        with self.db.reading() as conn:
            return conn.execute("SELECT count(*) FROM task_emails").fetchone()[0]

    def test_a_trashed_task_keeps_its_emails_and_a_purge_takes_them(self) -> None:
        email = self.emails.add(self.task["id"], "a.msg", sample_msg(sent=sent(20)))
        saved = self.emails.path_of(self.task["id"], email["id"])
        self.notes.delete(self.hub["id"], recursive=True)
        with self.assertRaises(NotFound):
            self.emails.list(self.task["id"])
        self.trash.restore(self.hub["id"])
        self.assertEqual([each["id"] for each in self.emails.list(self.task["id"])], [email["id"]])
        self.assertTrue(saved.exists())
        self.notes.delete(self.hub["id"], recursive=True)
        self.clock.now = "2026-11-29T12:00:00.000Z"
        self.assertEqual(self.trash.purge(), 2)
        self.assertEqual(self.count(), 0)
        self.assertFalse(saved.parent.exists())

    def test_a_failed_write_rolls_the_row_back(self) -> None:
        self.folder.parent.mkdir(parents=True, exist_ok=True)
        self.folder.write_text("in the way", encoding="utf-8")
        with self.assertRaises(OSError):
            self.emails.add(self.task["id"], "a.msg", sample_msg(sent=sent(20)))
        self.assertEqual(self.count(), 0)

    def test_a_folder_that_will_not_go_is_logged_not_raised(self) -> None:
        self.emails.add(self.task["id"], "a.msg", sample_msg(sent=sent(20)))
        with mock.patch("paradigm.db.emails_repo.shutil.rmtree", side_effect=PermissionError("locked")), \
                self.assertLogs("paradigm", level="WARNING"):
            self.tasks.remove(self.task["id"])
        self.assertEqual(self.count(), 0)

    def test_opening_uses_the_opener(self) -> None:
        opened = []
        emails = EmailRepository(self.db, self.folder, opener=opened.append)
        email = emails.add(self.task["id"], "a.msg", sample_msg(sent=sent(20)))
        emails.open(email["id"])
        self.assertEqual(opened, [emails.path_of(self.task["id"], email["id"])])


if __name__ == "__main__":
    unittest.main()
