"""Capture by key: POST /api/capture makes a task, a question or a decision from one line, once;
GET /api/captures lists a note's; POST /api/capture/remove takes one back. A save no longer
reads T:/D:/Q: lines."""
import time
import unittest

from helpers import RunningServer


class CaptureApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.running = RunningServer()
        self.hub = self.make_hub("Team", "area")
        meeting = self.post("/api/meeting/create", {"hub_id": self.hub, "name": "1:1 Ada", "day": "2026-11-23", "time": "11:00"})
        self.meeting = meeting["note"]["id"]
        self.version = meeting["note"]["version"]
        self.grace = self.post("/api/person/create", {"first": "Grace", "last": "Liu"})["note"]["id"]
        self.ben = self.post("/api/person/create", {"first": "Ben", "last": "Ortiz"})["note"]["id"]

    def tearDown(self) -> None:
        self.running.close()

    def post(self, path, payload, status=200):
        got, body = self.running.post_json(path, payload)
        self.assertEqual(got, status, body)
        return body

    def make_hub(self, title, kind):
        hub = self.post("/api/note/create", {"parent_id": None, "title": title})
        self.post("/api/note/kind", {"id": hub["id"], "kind": kind})
        return hub["id"]

    def capture(self, status=200, **fields):
        payload = {"source_id": self.meeting, "kind": "task", "title": "Share the dashboards",
                   "quote": "Grace will share the dashboards with Chloe", "hub_id": self.hub, **fields}
        body = self.post("/api/capture", payload, status)
        return body.get("capture", body)

    def captures(self, source=None):
        status, body = self.running.get_json("/api/captures?source={}".format(source or self.meeting))
        self.assertEqual(status, 200, body)
        return body["captures"]

    def task(self, task_id):
        _, body = self.running.get_json("/api/tasks")
        return next(task for task in body["tasks"] if task["id"] == task_id)

    def test_a_delegated_task_with_a_follow_up(self) -> None:
        made = self.capture(person_id=self.grace, role="delegate", follow_up="2026-11-24", due=None)
        self.assertEqual(made, {"kind": "task", "id": made["id"], "title": "Share the dashboards",
                                "quote": "Grace will share the dashboards with Chloe", "hub_id": self.hub,
                                "hub_title": "Team", "person_id": self.grace, "person_name": "Grace Liu",
                                "role": "delegate", "follow_up": "2026-11-24", "due": None, "open": True})
        task = self.task(made["id"])
        self.assertEqual((task["note_id"], task["delegate_id"], task["for_person_id"], task["follow_up"]),
                         (self.hub, self.grace, None, "2026-11-24"))
        self.assertEqual((task["source_id"], task["quote"]), (self.meeting, "Grace will share the dashboards with Chloe"))
        self.assertEqual(self.captures(), [made])

    def test_i_owe_and_mine_keep_no_follow_up(self) -> None:
        owed = self.capture(quote="send Grace the numbers", person_id=self.grace, role="for",
                            follow_up="2026-11-24", due="2026-12-04")
        self.assertEqual((owed["role"], owed["person_id"], owed["follow_up"], owed["due"]),
                         ("for", self.grace, None, "2026-12-04"))
        task = self.task(owed["id"])
        self.assertEqual((task["delegate_id"], task["for_person_id"], task["follow_up"]), (None, self.grace, ""))
        mine = self.capture(quote="book the room", title="Book the room", role="mine")
        self.assertEqual((mine["role"], mine["person_id"], mine["person_name"], mine["due"]), ("mine", None, None, None))
        no_role = self.capture(quote="tidy up", title="Tidy up")
        self.assertEqual(no_role["role"], "mine")

    def test_question_and_decision_on_the_meeting_day(self) -> None:
        # A record ignores role, follow_up and due, even a bad day.
        question = self.capture(kind="question", title="Ordering across partitions?", quote="Ordering across partitions?",
                                person_id=self.ben, role="delegate", due="not a day")
        self.assertEqual((question["kind"], question["role"], question["person_name"], question["open"], question["due"]),
                         ("question", None, "Ben Ortiz", True, None))
        decision = self.capture(kind="decision", title="Stay at-least-once", quote="Stay at-least-once")
        self.assertEqual((decision["kind"], decision["person_id"], decision["hub_title"], decision["open"]),
                         ("decision", None, "Team", True))
        _, body = self.running.get_json("/api/records")
        records = {record["id"]: record for record in body["records"]}
        self.assertEqual(records[question["id"]]["day"], "2026-11-23", "dated the meeting's day")
        self.assertEqual(records[question["id"]]["people"], [self.ben])
        self.assertEqual(records[decision["id"]]["source_id"], self.meeting)
        self.post("/api/record/answer", {"id": question["id"], "day": "2026-11-25"})
        listed = {each["id"]: each for each in self.captures()}
        self.assertFalse(listed[question["id"]]["open"], "an answered question is not open")

    def test_a_record_outside_a_meeting_is_dated_today(self) -> None:
        plain = self.post("/api/note/create", {"parent_id": self.hub, "title": "Plain"})["id"]
        made = self.capture(source_id=plain, kind="decision", title="Ship it", quote="Ship it")
        _, body = self.running.get_json("/api/records")
        record = next(each for each in body["records"] if each["id"] == made["id"])
        self.assertEqual(record["day"], time.strftime("%Y-%m-%d"))
        self.assertEqual([each["id"] for each in self.captures(plain)], [made["id"]])

    def test_captured_once_per_kind(self) -> None:
        self.capture()
        self.assertEqual(self.capture(status=409)["error"], "already captured")
        self.capture(kind="question", title="Share them?")
        self.capture(kind="question", title="Share them?", status=409)
        self.capture(kind="decision", title="Share them")
        self.capture(kind="decision", title="Share them", status=409)

    def test_listed_in_the_order_made(self) -> None:
        first = self.capture(quote="one", title="One")
        time.sleep(0.01)
        second = self.capture(kind="decision", quote="two", title="Two")
        time.sleep(0.01)
        third = self.capture(quote="three", title="Three")
        self.assertEqual([(each["kind"], each["id"]) for each in self.captures()],
                         [("task", first["id"]), ("decision", second["id"]), ("task", third["id"])])
        other = self.post("/api/note/create", {"parent_id": self.hub, "title": "Other"})["id"]
        self.assertEqual(self.captures(other), [])

    def test_a_done_task_is_not_open(self) -> None:
        made = self.capture(person_id=self.grace, role="delegate", follow_up="2026-11-24")
        self.post("/api/task/done", {"id": made["id"], "done": True})
        self.assertFalse(self.captures()[0]["open"])

    def test_remove_deletes_a_task_and_trashes_a_record(self) -> None:
        task = self.capture()
        decision = self.capture(kind="decision", title="Ship it", quote="Ship it")
        self.post("/api/capture/remove", {"kind": "task", "id": task["id"]})
        self.post("/api/capture/remove", {"kind": "decision", "id": decision["id"]})
        self.assertEqual(self.captures(), [])
        _, trash = self.running.get_json("/api/trash")
        self.assertIn(decision["id"], [entry["id"] for entry in trash["entries"]])
        self.post("/api/capture/remove", {"kind": "task", "id": task["id"]}, 404)
        self.post("/api/capture/remove", {"kind": "question", "id": decision["id"]}, 404)
        self.post("/api/capture/remove", {"kind": "memo", "id": 1}, 404)
        again = self.capture()
        self.assertNotEqual(again["id"], task["id"], "a removed line may be captured again")

    def test_remove_refuses_what_no_line_made(self) -> None:
        made = self.post("/api/task/create", {"note_id": self.hub, "title": "By hand"})
        self.post("/api/capture/remove", {"kind": "task", "id": made["id"]}, 404)
        self.post("/api/capture/remove", {"kind": "decision", "id": self.meeting}, 404)

    def test_another_hub_may_be_chosen(self) -> None:
        bus = self.make_hub("Bus", "project")
        made = self.capture(hub_id=bus)
        self.assertEqual((made["hub_id"], made["hub_title"]), (bus, "Bus"))
        self.assertEqual(self.task(made["id"])["note_id"], bus)

    def test_a_note_under_a_person_captures_tasks_to_them(self) -> None:
        note = self.post("/api/note/create", {"parent_id": self.grace, "title": "Catch-up"})["id"]
        made = self.capture(source_id=note, hub_id=self.grace, person_id=self.grace, role="for")
        self.assertEqual((made["hub_id"], made["hub_title"]), (self.grace, "Grace Liu"))
        self.assertEqual(self.task(made["id"])["note_id"], note, "a person's note holds no tasks: it stays on the note")
        refused = self.capture(source_id=note, hub_id=self.grace, kind="decision", title="X", status=400)
        self.assertIn("pick one", refused["error"], "the refusal says how to go on")
        self.capture(source_id=note, hub_id=self.grace, kind="question", title="Y", status=400)
        asked = self.capture(source_id=note, hub_id=self.hub, kind="question", title="Y")
        self.assertEqual(asked["hub_title"], "Team", "a question from a person's note goes to a hub picked with ▾")
        self.capture(hub_id=self.grace, status=400)  # the meeting is not under Grace
        self.capture(source_id=self.grace, hub_id=self.grace, status=400)  # nor is Grace's own note

    def test_no_hub_and_bad_requests(self) -> None:
        inbox = self.post("/api/note/create", {"parent_id": None, "title": "Loose"})["id"]
        self.capture(hub_id=inbox, status=400)
        self.capture(hub_id=self.meeting, status=400)
        self.capture(hub_id=99999, status=404)
        self.capture(source_id=99999, status=404)
        self.capture(person_id=99999, role="delegate", status=404)
        self.capture(person_id=self.hub, role="delegate", status=404)
        self.capture(kind="topic", status=400)
        self.capture(title="  ", status=400)
        self.capture(quote="", status=400)
        self.capture(due="someday", status=400)
        self.capture(follow_up="2026-13-40", status=400)
        self.capture(role="delegate", status=400)
        self.capture(role="boss", person_id=self.grace, status=400)
        self.capture(hub_id="5", status=400)
        for bad in ("x", "%C2%B2", "-1", ""):  # %C2%B2 is "²": isdigit, yet not an int
            status, _ = self.running.get_json("/api/captures?source=" + bad)
            self.assertEqual(status, 400, bad)
        self.assertEqual(self.captures(), [], "nothing was made")
        self.post("/api/note/archive", {"id": self.hub, "archived": True})
        self.capture(status=400)

    def test_the_save_refuses_task_and_record_captures(self) -> None:
        for kind in ("task", "decision", "question"):
            got = self.post("/api/note/save", {"id": self.meeting, "body": "T: old style", "version": self.version,
                                               "captures": [{"kind": kind, "quote": "old style", "title": "Old style"}]}, 400)
            self.assertEqual(got["error"], "T:/Q:/D: lines are no longer captured on save")
        _, note = self.running.get_json("/api/note?id={}".format(self.meeting))
        self.assertEqual(note["body"], "", "a refused save writes nothing")
        saved = self.post("/api/note/save", {"id": self.meeting, "body": "T: old style", "version": self.version})
        self.assertEqual(saved["captured"], 0)
        self.assertEqual(self.captures(), [], "a T: line stays plain text")
        self.post("/api/note/save", {"id": self.meeting, "body": "x", "version": saved["version"],
                                     "captures": [{"kind": "memo", "quote": "x", "title": "x"}]}, 400)
        self.post("/api/note/save", {"id": self.meeting, "body": "x", "version": saved["version"], "captures": "no"}, 400)


if __name__ == "__main__":
    unittest.main()
