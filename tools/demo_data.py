"""Fill a browser-check instance with made-up sample data, for screenshots and UI reviews.

Run after `python tools/browser_drive.py start`; it fills that instance through its API.

  python tools/demo_data.py

The data is invented (Acme, Northwind and people who do not exist). Dates are set from the
week it runs in, so Today and the Week always have something on them, and every run builds the
same set. It only writes to the instance browser_drive started: it refuses unless the temp
folder holds browser_drive's marker file, so it can never reach ~/paradigm-notes.
"""
import datetime
import json
import pathlib
import sys
import urllib.error
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import browser_drive  # noqa: E402  (tools/ is not a package)

PEOPLE = [
    ("Ada Park", "Acme", "Engineering manager"),
    ("Ben Ortiz", "Acme", "Senior engineer"),
    ("Chloe Nakamura", "Acme", "Product manager"),
    ("Dev Patel", "Acme", "Data analyst"),
    ("Elena Rossi", "Northwind", "Account lead"),
    ("Farid Haddad", "Northwind", "Solutions architect"),
    ("Grace Liu", "Acme", "Designer"),
    ("Hugo Brandt", "Acme", "Director"),
]


class Api:
    def __init__(self, port):
        self.base = f"http://127.0.0.1:{port}"

    def get(self, path):
        with urllib.request.urlopen(self.base + path, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def post(self, path, body):
        req = urllib.request.Request(self.base + path, data=json.dumps(body).encode("utf-8"), method="POST",
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            raise SystemExit(f"{path} {body}: HTTP {error.code} {error.read().decode('utf-8', 'replace')}")


class Week:
    """Days counted from this week's Monday, so the data always lands around today."""

    def __init__(self, today):
        self.monday = today - datetime.timedelta(days=today.weekday())

    def day(self, offset):
        return (self.monday + datetime.timedelta(days=offset)).isoformat()


def check_target():
    """The port of browser_drive's instance, or exit: never a folder it did not make."""
    if not browser_drive.STATE.is_file():
        raise SystemExit("no browser check is running: `python tools/browser_drive.py start` first")
    state = browser_drive.load_state()
    if not (pathlib.Path(state["root"]) / browser_drive.MARKER).is_file():
        raise SystemExit("the running instance is not browser_drive's temp folder: refusing")
    return state["app_port"]


def make_people(api):
    ids = {}
    for name, org, job in PEOPLE:
        person = api.post("/api/person/create", {"name": name})["person"]
        api.post("/api/person/update", {"id": person["id"], "field": "org", "value": org})
        api.post("/api/person/update", {"id": person["id"], "field": "job", "value": job})
        api.post("/api/person/update", {"id": person["id"], "field": "email",
                                        "value": name.lower().replace(" ", ".") + "@example.com"})
        ids[name.split()[0]] = person["id"]
    return ids


def make_hub(api, title, kind, body, area_id=None):
    note = api.post("/api/note/create", {"parent_id": None, "title": title, "body": body})
    api.post("/api/note/kind", {"id": note["id"], "kind": kind})
    if area_id is not None:
        api.post("/api/note/area", {"id": note["id"], "area_id": area_id})
    return note["id"]


def make_hubs(api, week):
    team = make_hub(api, "Team", "area", "Running the platform team: 1:1s, hiring, planning.")
    clients = make_hub(api, "Client delivery", "area", "Work for Northwind and other accounts.")
    hubs = {
        "team": team,
        "clients": clients,
        "portal": make_hub(api, "Customer portal v2", "project",
                           "Customers file and track requests without email.", team),
        "migration": make_hub(api, "Data warehouse migration", "project",
                              "Reports run from the new warehouse; the old one is off.", team),
        "rollout": make_hub(api, "Northwind rollout", "project",
                            "Northwind's three sites live on the new release.", clients),
        "pricing": make_hub(api, "Pricing review", "project", "Paused until the budget is set.", clients),
    }
    api.post("/api/note/due", {"id": hubs["portal"], "due": week.day(18)})
    api.post("/api/note/due", {"id": hubs["migration"], "due": week.day(-3)})
    api.post("/api/note/due", {"id": hubs["rollout"], "due": week.day(32)})
    api.post("/api/note/status", {"id": hubs["pricing"], "status": "on_hold"})
    make_hub(api, "Ideas to sort", None, "Quick notes that have no home yet.")
    return hubs


def link_people(api, hubs, people):
    for hub, names in [("portal", ["Ben", "Chloe", "Grace"]), ("migration", ["Dev", "Ben"]),
                       ("rollout", ["Elena", "Farid", "Chloe"]), ("team", ["Ada", "Ben", "Dev", "Grace"])]:
        for name in names:
            api.post("/api/person/link", {"hub_id": hubs[hub], "person_id": people[name]})


def make_plans(api, hubs, week):
    design = api.post("/api/phase/create", {"project_id": hubs["portal"], "title": "Design",
                                            "start": week.day(-14), "end": week.day(-1)})["note"]
    api.post("/api/phase/create", {"project_id": hubs["portal"], "title": "Build",
                                   "start": week.day(0), "end": week.day(13)})
    api.post("/api/phase/create", {"project_id": hubs["portal"], "title": "Pilot",
                                   "start": week.day(14), "end": week.day(18)})
    done = api.post("/api/milestone/create", {"owner_id": design["id"], "title": "Designs signed off",
                                              "day": week.day(-2)})["note"]
    api.post("/api/milestone/done", {"id": done["id"], "done": True})
    api.post("/api/milestone/create", {"owner_id": hubs["portal"], "title": "Pilot go-live", "day": week.day(14)})
    api.post("/api/phase/create", {"project_id": hubs["rollout"], "title": "Site 1",
                                   "start": week.day(3), "end": week.day(16)})
    api.post("/api/milestone/create", {"owner_id": hubs["rollout"], "title": "Site 1 live", "day": week.day(16)})


def make_status(api, hubs, week):
    for hub, day, health, text in [
            ("portal", -4, "on_track", "Build started on time; API contract agreed."),
            ("migration", -1, "at_risk", "Two reports still read the old warehouse."),
            ("rollout", -9, "blocked", "Waiting on Northwind's network change window.")]:
        api.post("/api/status_log/create", {"note_id": hubs[hub], "day": week.day(day), "health": health,
                                            "text": text})


def task(api, note_id, title, due="", estimate=None):
    made = api.post("/api/task/create", {"note_id": note_id, "title": title, "due": due})
    if estimate:
        api.post("/api/task/update", {"id": made["id"], "estimate_min": estimate})
    return made["id"]


def make_tasks(api, hubs, people, week):
    t = {
        "spec": task(api, hubs["portal"], "Write the request-form spec", week.day(1), 120),
        "review": task(api, hubs["portal"], "Review Grace's portal mock-ups", week.day(2), 45),
        "reports": task(api, hubs["migration"], "Move the finance reports", week.day(-2), 180),
        "cutover": task(api, hubs["migration"], "Plan the cut-over weekend", week.day(9)),
        "checklist": task(api, hubs["rollout"], "Send Northwind the site checklist", week.day(3), 30),
        "hiring": task(api, hubs["team"], "Draft the Q1 hiring plan", week.day(11), 90),
        "budget": task(api, hubs["pricing"], "Collect last year's pricing data"),
        "inbox": task(api, hubs["team"], "Book the team offsite venue"),
    }
    sub = api.post("/api/task/create", {"note_id": hubs["portal"], "title": "List the form's fields",
                                        "parent_id": t["spec"]})
    api.post("/api/task/done", {"id": sub["id"], "done": True})
    api.post("/api/task/create", {"note_id": hubs["portal"], "title": "Agree validation rules with Ben",
                                  "parent_id": t["spec"]})
    # Theirs to do: delegated, with a follow-up day.
    for hub, title, who, follow in [("migration", "Check the old warehouse's last jobs", "Dev", 1),
                                    ("rollout", "Confirm the network change window", "Elena", -1),
                                    ("portal", "Load-test the request API", "Ben", 4)]:
        api.post("/api/task/delegate", {"id": task(api, hubs[hub], title), "person_id": people[who],
                                        "follow_up": week.day(follow)})
    # Mine, owed to someone.
    for hub, title, who, due in [("team", "Send Ada the team's capacity numbers", "Ada", 2),
                                 ("rollout", "Share the rollout timeline with Farid", "Farid", 4),
                                 ("team", "Give Grace feedback on her promotion case", "Grace", 7)]:
        api.post("/api/task/for", {"id": task(api, hubs[hub], title, week.day(due)), "person_id": people[who]})
    return t


def make_meetings(api, hubs, people, week):
    for hub, name, day, start, end, who in [
            ("team", "Team stand-up", 0, "09:00", "09:15", ["Ada", "Ben", "Dev", "Grace"]),
            ("team", "Team stand-up", 2, "09:00", "09:15", ["Ada", "Ben", "Dev", "Grace"]),
            ("team", "Team stand-up", 4, "09:00", "09:15", ["Ada", "Ben", "Dev", "Grace"]),
            ("team", "1:1 Ada", 1, "10:00", "10:30", ["Ada"]),
            ("team", "1:1 Grace", 3, "14:00", "14:30", ["Grace"]),
            ("portal", "Portal design review", 2, "13:00", "14:00", ["Chloe", "Grace", "Ben"]),
            ("migration", "Warehouse cut-over check-in", 3, "11:00", "11:45", ["Dev", "Ben"]),
            ("rollout", "Northwind weekly", 1, "15:00", "16:00", ["Elena", "Farid", "Chloe"]),
            ("rollout", "Northwind weekly", 8, "15:00", "16:00", ["Elena", "Farid", "Chloe"]),
            ("team", "Planning with Hugo", 4, "13:30", "14:30", ["Hugo"])]:
        meeting = api.post("/api/meeting/create", {"hub_id": hubs[hub], "name": name, "day": week.day(day),
                                                   "time": start, "end_time": end})["meeting"]
        api.post("/api/meeting/attend", {"meeting_id": meeting["id"], "person_ids": [people[n] for n in who]})


def make_records(api, hubs, week):
    api.post("/api/record/create", {"parent_id": hubs["portal"], "kind": "decision",
                                    "title": "Requests need a sign-in", "day": week.day(-3)})
    api.post("/api/record/create", {"parent_id": hubs["portal"], "kind": "question",
                                    "title": "Do attachments need virus scanning?", "day": week.day(-1)})
    api.post("/api/record/create", {"parent_id": hubs["rollout"], "kind": "question",
                                    "title": "Which site goes first?", "day": week.day(-6)})


def make_topics(api, people):
    for who, text in [("Ada", "Headcount for the new year"), ("Ada", "Conference budget"),
                      ("Grace", "Design system ownership")]:
        api.post("/api/person_topic/create", {"person_id": people[who], "text": text})


def make_blocks(api, tasks, week):
    for name, day, start, end in [("spec", 0, "10:00", "12:00"), ("reports", 1, "13:00", "14:30"),
                                  ("review", 2, "10:30", "11:15"), ("hiring", 3, "09:30", "10:30")]:
        api.post("/api/session/add", {"task_id": tasks[name], "day": week.day(day), "start": start, "end": end})


def clear_holidays(api, week):
    """A holiday in the week shown turns its days Off; screenshots want an ordinary working week."""
    settings = api.get("/api/time/settings")
    names = {h["name"] for h in settings["upcoming"] if week.day(0) <= h["day"] <= week.day(6)}
    for holiday in settings["holidays"]:
        if holiday["name"] in names:
            api.post("/api/time/holiday/remove", {"id": holiday["id"]})


def fill(api, today):
    week = Week(today)
    clear_holidays(api, week)
    people = make_people(api)
    hubs = make_hubs(api, week)
    link_people(api, hubs, people)
    make_plans(api, hubs, week)
    make_status(api, hubs, week)
    tasks = make_tasks(api, hubs, people, week)
    make_meetings(api, hubs, people, week)
    make_records(api, hubs, week)
    make_topics(api, people)
    make_blocks(api, tasks, week)
    api.post("/api/note/time_code", {"id": hubs["portal"], "code": "PRJ-101"})
    api.post("/api/note/time_code", {"id": hubs["rollout"], "code": "NW-220"})
    return {"people": len(people), "hubs": len(hubs), "tasks": len(tasks)}


def main():
    print(json.dumps(fill(Api(check_target()), datetime.date.today())))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
