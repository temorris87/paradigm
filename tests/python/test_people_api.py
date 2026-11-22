import unittest

from helpers import RunningServer


class PeopleApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.running = RunningServer()

    def tearDown(self) -> None:
        self.running.close()

    def post(self, path, payload, status=200):
        got, body = self.running.post_json(path, payload)
        self.assertEqual(got, status, body)
        return body

    def hub(self, title="Rollout"):
        note = self.post("/api/note/create", {"parent_id": None, "title": title})
        return self.post("/api/note/kind", {"id": note["id"], "kind": "project"})

    def test_create_update_link_list(self) -> None:
        made = self.post("/api/person/create", {"name": "Jane Doe"})
        jane = made["person"]["id"]
        self.assertEqual((made["note"]["title"], made["note"]["kind"]), ("Jane Doe", "person"))
        self.assertEqual(self.post("/api/person/update", {"id": jane, "field": "org", "value": "Northwind"})["org"],
                         "Northwind")
        hub = self.hub()
        linked = self.post("/api/person/link", {"hub_id": hub["id"], "person_id": jane, "role": "Sponsor"})
        self.assertTrue(linked["created"])
        status, payload = self.running.get_json("/api/people")
        self.assertEqual(status, 200)
        self.assertEqual(payload["people"], [{"id": jane, "first": "Jane", "last": "Doe", "email": "", "phone": "",
                                              "org": "Northwind", "job": "",
                                              "hubs": [{"hub_id": hub["id"], "role": "Sponsor"}]}])
        status, tree = self.running.get_json("/api/notes")
        self.assertIn(("Jane Doe", "person"), [(note["title"], note["kind"]) for note in tree["notes"]])
        self.assertEqual(self.post("/api/person/unlink", {"hub_id": hub["id"], "person_id": jane})["hubs"], [])

    def test_errors(self) -> None:
        jane = self.post("/api/person/create", {"name": "Jane Doe"})["person"]["id"]
        self.post("/api/person/create", {"name": "jane doe"}, 409)
        self.post("/api/person/create", {"name": ""}, 400)
        self.post("/api/person/update", {"id": jane, "field": "email", "value": "nope"}, 400)
        self.post("/api/person/update", {"id": 999, "field": "org", "value": "x"}, 404)
        self.post("/api/person/link", {"hub_id": jane, "person_id": jane}, 400)
        self.post("/api/person/link", {"hub_id": "1", "person_id": jane}, 400)
        self.post("/api/person/unlink", {"hub_id": self.hub()["id"], "person_id": jane}, 404)
        self.post("/api/note/kind", {"id": jane, "kind": "area"}, 400)

    def test_changes_need_post_and_the_same_site(self) -> None:
        status, _, _ = self.running.request("GET", "/api/person/create")
        self.assertEqual(status, 405)
        status, _ = self.running.post_json("/api/person/create", {"name": "Evil"}, {"Origin": "http://evil.example"})
        self.assertEqual(status, 403)
        self.assertEqual(self.running.get_json("/api/people")[1]["people"], [])


if __name__ == "__main__":
    unittest.main()
