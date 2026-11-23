"""The on-call rota (028): a paste replaces the weeks it covers, keeps the rest; clear."""
import unittest

from helpers import RunningServer


def week(monday, *roles):
    return {"week": monday, "roles": [{"role": role, "name": name} for role, name in roles]}


class OnCallApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.running = RunningServer()

    def tearDown(self) -> None:
        self.running.close()

    def post(self, path, payload, status=200):
        got, body = self.running.post_json(path, payload)
        self.assertEqual(got, status, body)
        return body

    def rows(self):
        _, body = self.running.get_json("/api/oncall")
        return [(row["week"], row["role"], row["name"]) for row in body["rows"]]

    def test_paste_replaces_its_weeks_and_keeps_the_rest(self) -> None:
        self.assertEqual(self.rows(), [])
        self.post("/api/oncall/paste", {"weeks": [
            week("2026-11-23", ("Primary", "Tom Reyes"), ("Secondary", " Ana   Kim ")),
            week("2026-11-30", ("Primary", "Ana Kim"), ("Secondary", "Smith, Joe"))]})
        self.post("/api/oncall/paste", {"weeks": [week("2026-11-30", ("Secondary", "Joe Smith"), ("Primary", ""))]})
        self.assertEqual(self.rows(), [
            ("2026-11-23", "Primary", "Tom Reyes"), ("2026-11-23", "Secondary", "Ana Kim"),
            ("2026-11-30", "Secondary", "Joe Smith"), ("2026-11-30", "Primary", "")],
            "the second week is exactly the new paste, in its order; the first is kept")
        self.assertEqual(self.post("/api/oncall/clear", {}), {"rows": []})
        self.assertEqual(self.rows(), [])

    def test_bad_pastes_change_nothing(self) -> None:
        self.post("/api/oncall/paste", {"weeks": [week("2026-11-23", ("Primary", "Tom"))]})
        for weeks in ([], "x", [week("2026-11-24", ("Primary", "Tom"))], [week("2026-13-01")],
                      [week("2026-11-30", ("", "Tom"))], [week("2026-11-30", ("Primary", "a"), ("primary", "b"))],
                      [week("2026-11-30"), week("2026-11-30")], [week("2026-11-30", ("Primary", "x" * 201))],
                      [week("2026-11-30", ("Primary", 3))], [week("2026-11-30", ("Primary", "Tom")), "x"]):
            self.post("/api/oncall/paste", {"weeks": weeks}, 400)
        self.assertEqual(self.rows(), [("2026-11-23", "Primary", "Tom")])


if __name__ == "__main__":
    unittest.main()
