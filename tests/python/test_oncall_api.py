"""The on-call rota (028, 033): a paste replaces the weeks it covers, keeps the rest; a cell's
name changed by hand keeps the sheet's name; clear."""
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

    def cells(self, body=None):
        if body is None:
            _, body = self.running.get_json("/api/oncall")
        return [(row["week"], row["role"], row["name"], row["sheet_name"]) for row in body["rows"]]

    def paste_sample(self):
        self.post("/api/oncall/paste", {"weeks": [
            week("2026-11-30", ("Primary", "Ana Kim"), ("Secondary", "Tom Reyes")),
            week("2026-12-07", ("Primary", "Joe Smith"))]})

    def test_set_changes_one_cell_and_keeps_the_sheets_name(self) -> None:
        self.paste_sample()
        self.assertEqual(self.cells()[0], ("2026-11-30", "Primary", "Ana Kim", ""), "a pasted cell is as the sheet says")
        body = self.post("/api/oncall/set", {"week": "2026-11-30", "role": "Primary", "name": "  Farid   Haddad "})
        self.assertEqual(self.cells(body), [
            ("2026-11-30", "Primary", "Farid Haddad", "Ana Kim"), ("2026-11-30", "Secondary", "Tom Reyes", ""),
            ("2026-12-07", "Primary", "Joe Smith", "")], "the answer is the whole rota, only that cell changed")
        self.assertEqual(set(body["rows"][0]), {"week", "role", "name", "sheet_name", "changed", "position"})
        self.assertEqual([row["changed"] for row in body["rows"]], [True, False, False])
        body = self.post("/api/oncall/set", {"week": "2026-11-30", "role": "Primary", "name": "Hugo Martin"})
        self.assertEqual(self.cells(body)[0], ("2026-11-30", "Primary", "Hugo Martin", "Ana Kim"),
                         "a second change keeps the sheet's original name")

    def test_empty_or_the_sheets_name_puts_it_back(self) -> None:
        self.paste_sample()
        for back in ("", "  ", "Ana Kim"):
            self.post("/api/oncall/set", {"week": "2026-11-30", "role": "Primary", "name": "Farid Haddad"})
            body = self.post("/api/oncall/set", {"week": "2026-11-30", "role": "Primary", "name": back})
            self.assertEqual(self.cells(body)[0], ("2026-11-30", "Primary", "Ana Kim", ""), repr(back))
        body = self.post("/api/oncall/set", {"week": "2026-11-30", "role": "Primary", "name": "Ana Kim"})
        self.assertEqual(self.cells(body)[0], ("2026-11-30", "Primary", "Ana Kim", ""), "the sheet's name is no change")

    def test_paste_clears_the_changes_in_its_weeks_only(self) -> None:
        self.paste_sample()
        self.post("/api/oncall/set", {"week": "2026-11-30", "role": "Secondary", "name": "Farid Haddad"})
        self.post("/api/oncall/set", {"week": "2026-12-07", "role": "Primary", "name": "Hugo Martin"})
        self.post("/api/oncall/paste", {"weeks": [week("2026-11-30", ("Primary", "Ana Kim"), ("Secondary", "Tom Reyes"))]})
        self.assertEqual(self.cells(), [
            ("2026-11-30", "Primary", "Ana Kim", ""), ("2026-11-30", "Secondary", "Tom Reyes", ""),
            ("2026-12-07", "Primary", "Hugo Martin", "Joe Smith")])
        self.post("/api/oncall/clear", {})
        self.assertEqual(self.cells(), [])

    def flagged(self, body):
        return [(row["role"], row["name"], row["sheet_name"], row["changed"]) for row in body["rows"]]

    def test_a_blank_sheet_cell_can_change_and_go_back(self) -> None:
        self.post("/api/oncall/paste", {"weeks": [week("2026-12-07", ("Primary", "Ana Kim"), ("Secondary", ""))]})
        body = self.post("/api/oncall/set", {"week": "2026-12-07", "role": "Secondary", "name": "Farid Haddad"})
        self.assertEqual(self.flagged(body)[1], ("Secondary", "Farid Haddad", "", True),
                         "changed although the sheet had no one")
        body = self.post("/api/oncall/set", {"week": "2026-12-07", "role": "Secondary", "name": "Hugo Martin"})
        self.assertEqual(self.flagged(body)[1], ("Secondary", "Hugo Martin", "", True), "the sheet's blank is kept")
        body = self.post("/api/oncall/set", {"week": "2026-12-07", "role": "Secondary", "name": ""})
        self.assertEqual(self.flagged(body)[1], ("Secondary", "", "", False), "empty puts the sheet's blank back")
        self.post("/api/oncall/set", {"week": "2026-12-07", "role": "Secondary", "name": "Farid Haddad"})
        self.post("/api/oncall/paste", {"weeks": [week("2026-12-07", ("Primary", "Ana Kim"), ("Secondary", ""))]})
        _, body = self.running.get_json("/api/oncall")
        self.assertEqual(self.flagged(body)[1], ("Secondary", "", "", False), "a paste clears the flag")

    def test_set_matches_the_role_whatever_its_case(self) -> None:
        self.post("/api/oncall/paste", {"weeks": [week("2026-11-30", ("primary", "Ana Kim")),
                                                  week("2026-12-07", ("Primary", "Joe Smith"))]})
        body = self.post("/api/oncall/set", {"week": "2026-11-30", "role": "Primary", "name": "Farid Haddad"})
        self.assertEqual(self.flagged(body), [("primary", "Farid Haddad", "Ana Kim", True),
                                              ("Primary", "Joe Smith", "", False)], "the stored spelling stays")

    def test_bad_sets_change_nothing(self) -> None:
        self.paste_sample()
        before = self.cells()
        for payload in ({"week": "2026-12-01", "role": "Primary", "name": "X"},
                        {"week": "2026-13-01", "role": "Primary", "name": "X"},
                        {"week": 3, "role": "Primary", "name": "X"},
                        {"week": "2026-11-30", "role": "Primary", "name": "x" * 201},
                        {"week": "2026-11-30", "role": "Primary", "name": 3}):
            self.post("/api/oncall/set", payload, 400)
        for payload in ({"week": "2026-12-14", "role": "Primary", "name": "X"},
                        {"week": "2026-11-30", "role": "Tertiary", "name": "X"},
                        {"week": "2026-12-07", "role": "Secondary", "name": "X"}):
            self.post("/api/oncall/set", payload, 404)
        self.assertEqual(self.cells(), before)


if __name__ == "__main__":
    unittest.main()
