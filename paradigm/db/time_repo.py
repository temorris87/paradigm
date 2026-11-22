"""The timesheet's data (016_time_off.sql): its settings, holidays and days off, and the week
gathered for paradigm/timesheet/report.py. The only code that knows time_settings, holidays
and time_off."""
import sqlite3
from datetime import date, timedelta
from typing import Dict, List, Optional, Tuple

from paradigm.db.connection import Database
from paradigm.notes.hubs import clean_time_code
from paradigm.notes.meetings import BadWhen, clean_day, clean_time
from paradigm.notes.sessions import minutes
from paradigm.timesheet.holidays import US_HOLIDAYS, BadRule, holiday_days, parse_rule
from paradigm.timesheet.report import Item, Off, Settings, week_report, working_spans

__all__ = ["TimeRepository", "BadSetting", "BadRule", "BadWhen", "NoSuchEntry", "monday_of"]

# A meeting with no end time lasts this long (as on the calendar).
DEFAULT_MEETING_MINUTES = 30
DEFAULTS = {"default_code": "", "holiday_code": "", "time_off_code": "", "sick_code": "", "day_start": "08:00",
            "day_end": "17:00", "lunch_start": "12:00", "lunch_end": "13:00", "observed": "1"}
_CODES = ("default_code", "holiday_code", "time_off_code", "sick_code")
_TIMES = ("day_start", "day_end", "lunch_start", "lunch_end")
MAX_NAME_LENGTH = 100
# Days off are entered a day or a range at a time; a range longer than this is a slip.
MAX_RANGE_DAYS = 366


class BadSetting(ValueError):
    pass


class NoSuchEntry(LookupError):
    pass


def monday_of(day: date) -> date:
    return day - timedelta(days=day.weekday())


class TimeRepository:
    def __init__(self, db: Database):
        self._db = db

    # ---- settings ----

    def settings(self) -> Dict:
        with self._db.transaction() as conn:
            _seed(conn)
            stored = dict(conn.execute("SELECT key, value FROM time_settings").fetchall())
            holidays = [dict(row) for row in conn.execute("SELECT id, name, rule FROM holidays ORDER BY id")]
            off = [_off(row) for row in conn.execute("SELECT * FROM time_off ORDER BY first DESC, id DESC")]
        values = {key: stored.get(key, default) for key, default in DEFAULTS.items()}
        for holiday in holidays:
            try:
                parse_rule(holiday["rule"])
                holiday["ok"] = True
            except BadRule:
                holiday["ok"] = False
        upcoming, _ = holiday_days([(each["name"], each["rule"]) for each in holidays], date.today(),
                                   date.today() + timedelta(days=365), values["observed"] == "1")
        return {"settings": values, "holidays": holidays, "time_off": off,
                "upcoming": [{"day": day.isoformat(), "name": name} for day, name in sorted(upcoming.items())]}

    def set_settings(self, values: Dict[str, object]) -> Dict:
        cleaned = {key: _clean_setting(key, value) for key, value in values.items()}
        merged = dict(DEFAULTS)
        with self._db.transaction() as conn:
            merged.update(dict(conn.execute("SELECT key, value FROM time_settings").fetchall()))
            merged.update(cleaned)
            if not merged["day_start"] < merged["day_end"]:
                raise BadSetting("The working day must end after it starts")
            if (merged["lunch_start"] or merged["lunch_end"]) and not (
                    merged["day_start"] <= merged["lunch_start"] < merged["lunch_end"] <= merged["day_end"]):
                raise BadSetting("Lunch must start and end inside the working day (or leave both empty)")
            conn.executemany("INSERT INTO time_settings (key, value) VALUES (?, ?) "
                             "ON CONFLICT (key) DO UPDATE SET value = excluded.value", list(cleaned.items()))
        return self.settings()

    def add_holiday(self, name: object, rule: object) -> Dict:
        name, rule = _clean_name(name), _clean_rule(rule)
        with self._db.transaction() as conn:
            _seed(conn)
            conn.execute("INSERT INTO holidays (name, rule) VALUES (?, ?)", (name, rule))
        return self.settings()

    def update_holiday(self, holiday_id: int, name: object, rule: object) -> Dict:
        name, rule = _clean_name(name), _clean_rule(rule)
        with self._db.transaction() as conn:
            if not conn.execute("UPDATE holidays SET name = ?, rule = ? WHERE id = ?", (name, rule, holiday_id)).rowcount:
                raise NoSuchEntry("No such holiday: {}".format(holiday_id))
        return self.settings()

    def remove_holiday(self, holiday_id: int) -> Dict:
        with self._db.transaction() as conn:
            if not conn.execute("DELETE FROM holidays WHERE id = ?", (holiday_id,)).rowcount:
                raise NoSuchEntry("No such holiday: {}".format(holiday_id))
        return self.settings()

    def add_time_off(self, kind: object, first: object, last: object, hours: object = 0, note: object = "") -> Dict:
        if kind not in ("time_off", "sick"):
            raise BadSetting("kind must be time_off or sick")
        first = clean_day(first)
        last = clean_day(last) if last else first
        if last < first:
            raise BadSetting("The last day can't be before the first")
        if (date.fromisoformat(last) - date.fromisoformat(first)).days > MAX_RANGE_DAYS:
            raise BadSetting("A range can be at most a year")
        if hours in (None, ""):
            hours = 0
        if isinstance(hours, bool) or not isinstance(hours, (int, float)) or not 0 <= hours <= 24:
            raise BadSetting("Hours must be a number from 0 (the whole day) to 24")
        with self._db.transaction() as conn:
            conn.execute("INSERT INTO time_off (kind, first, last, minutes, note) VALUES (?, ?, ?, ?, ?)",
                         (kind, first, last, round(hours * 60), _clean_note(note)))
        return self.settings()

    def remove_time_off(self, entry_id: int) -> Dict:
        with self._db.transaction() as conn:
            if not conn.execute("DELETE FROM time_off WHERE id = ?", (entry_id,)).rowcount:
                raise NoSuchEntry("No such day off: {}".format(entry_id))
        return self.settings()

    # ---- the week ----

    def week(self, monday: date) -> Dict:
        monday = monday_of(monday)
        sunday = monday + timedelta(days=6)
        with self._db.transaction() as conn:
            _seed(conn)
            values = dict(DEFAULTS, **dict(conn.execute("SELECT key, value FROM time_settings").fetchall()))
            notes = {row["id"]: row for row in conn.execute(
                "SELECT id, parent_id, title, kind, area_id, time_code, deleted_at FROM notes")}
            items, untimed = _items(conn, notes, monday.isoformat(), sunday.isoformat())
            off = _days_off(conn, monday, sunday, values["observed"] == "1")
        settings = Settings(values["default_code"],
                            {"holiday": values["holiday_code"], "time_off": values["time_off_code"],
                             "sick": values["sick_code"]},
                            working_spans(minutes(values["day_start"]), minutes(values["day_end"]),
                                          minutes(values["lunch_start"]) if values["lunch_start"] else None,
                                          minutes(values["lunch_end"]) if values["lunch_end"] else None))
        return week_report(monday, items, untimed, off, settings)


def _seed(conn: sqlite3.Connection) -> None:
    """The first time: the US holidays (to change in Settings)."""
    if conn.execute("SELECT 1 FROM time_settings WHERE key = 'holidays_seeded'").fetchone():
        return
    conn.executemany("INSERT INTO holidays (name, rule) VALUES (?, ?)", US_HOLIDAYS)
    conn.execute("INSERT INTO time_settings (key, value) VALUES ('holidays_seeded', '1')")


def _hub(notes: Dict[int, sqlite3.Row], note_id: int) -> Optional[sqlite3.Row]:
    row = notes.get(note_id)
    for _ in range(1000):
        if row is None or row["parent_id"] is None:
            return row
        row = notes.get(row["parent_id"])
    return None


def _code(notes: Dict[int, sqlite3.Row], hub: Optional[sqlite3.Row]) -> str:
    """A project's or area's own code, else a project's area's."""
    if hub is None or hub["kind"] not in ("project", "area"):
        return ""
    if hub["time_code"]:
        return hub["time_code"]
    area = notes.get(hub["area_id"]) if hub["kind"] == "project" and hub["area_id"] else None
    return area["time_code"] if area is not None else ""


def _items(conn: sqlite3.Connection, notes: Dict[int, sqlite3.Row], first: str,
           last: str) -> Tuple[List[Item], List[Tuple[date, str, str]]]:
    items: List[Item] = []
    untimed: List[Tuple[date, str, str]] = []
    # A task's blocks count until the day its line was deleted or its note trashed.
    for row in conn.execute(
            "SELECT task_sessions.*, tasks.title, tasks.note_id, tasks.removed_at, notes.deleted_at "
            "FROM task_sessions JOIN tasks ON tasks.id = task_sessions.task_id JOIN notes ON notes.id = tasks.note_id "
            "WHERE day BETWEEN ? AND ?", (first, last)):
        gone = min(stamp[:10] for stamp in (row["removed_at"], row["deleted_at"], "9999-12-31") if stamp)
        if row["day"] > gone:
            continue
        hub = _hub(notes, row["note_id"])
        items.append(Item(date.fromisoformat(row["day"]), minutes(row["start"]), minutes(row["end"]),
                          _code(notes, hub), row["title"], hub["title"] if hub is not None else "", "task"))
    for row in conn.execute(
            "SELECT meetings.*, notes.title, notes.parent_id FROM meetings JOIN notes ON notes.id = meetings.note_id "
            "WHERE notes.deleted_at IS NULL AND meetings.cancelled = 0 AND day BETWEEN ? AND ?", (first, last)):
        hub = _hub(notes, row["note_id"])
        hub_title = hub["title"] if hub is not None else ""
        if not row["time"]:
            untimed.append((date.fromisoformat(row["day"]), row["title"], hub_title))
            continue
        start = minutes(row["time"])
        end = minutes(row["end_time"]) if row["end_time"] else min(start + DEFAULT_MEETING_MINUTES, 24 * 60)
        items.append(Item(date.fromisoformat(row["day"]), start, end, _code(notes, hub), row["title"], hub_title,
                          "meeting"))
    return items, untimed


def _days_off(conn: sqlite3.Connection, monday: date, sunday: date, observed: bool) -> Dict[date, Off]:
    """{weekday: Off}: a holiday first, then sick time, then time off."""
    holidays, _ = holiday_days([(row["name"], row["rule"]) for row in conn.execute("SELECT name, rule FROM holidays")],
                               monday, sunday, observed)
    found = {day: Off("holiday", 0, name) for day, name in holidays.items()}
    rows = conn.execute("SELECT * FROM time_off WHERE first <= ? AND last >= ? ORDER BY kind = 'time_off', id",
                        (sunday.isoformat(), monday.isoformat())).fetchall()
    for row in rows:
        day = max(monday, date.fromisoformat(row["first"]))
        while day <= min(sunday, date.fromisoformat(row["last"])):
            if day.weekday() < 5 and day not in found:
                found[day] = Off(row["kind"], row["minutes"], row["note"] or ("Sick" if row["kind"] == "sick" else "Time off"))
            day += timedelta(days=1)
    return found


def _off(row: sqlite3.Row) -> Dict:
    return {"id": row["id"], "kind": row["kind"], "first": row["first"], "last": row["last"],
            "hours": row["minutes"] / 60, "note": row["note"]}


def _clean_setting(key: str, value: object) -> str:
    if key in _CODES:
        try:
            return clean_time_code(value)
        except ValueError as error:
            raise BadSetting(str(error)) from None
    if key in _TIMES:
        try:
            return clean_time(value)
        except BadWhen as error:
            raise BadSetting(str(error)) from None
    if key == "observed":
        if not isinstance(value, bool):
            raise BadSetting("observed must be true or false")
        return "1" if value else "0"
    raise BadSetting("No such setting: {}".format(key))


def _clean_name(name: object) -> str:
    if not isinstance(name, str) or not name.strip():
        raise BadSetting("A holiday needs a name")
    name = " ".join(name.split())
    if len(name) > MAX_NAME_LENGTH or any(ord(char) < 32 for char in name):
        raise BadSetting("A holiday's name must be one line of at most {} characters".format(MAX_NAME_LENGTH))
    return name


def _clean_rule(rule: object) -> str:
    if not isinstance(rule, str):
        raise BadRule("A rule must be text")
    rule = " ".join(rule.split())
    parse_rule(rule)
    return rule


def _clean_note(note: object) -> str:
    if note in (None, ""):
        return ""
    if not isinstance(note, str) or len(note) > MAX_NAME_LENGTH:
        raise BadSetting("A note must be text of at most {} characters".format(MAX_NAME_LENGTH))
    return " ".join(note.split())


def holiday_dates(conn: sqlite3.Connection, first: date, last: date) -> Dict[date, str]:
    """{day: name} of the holidays between first and last, as the timesheet counts them (the
    plan templates skip them too). Seeds the US list the first time, as Settings does."""
    _seed(conn)
    observed = conn.execute("SELECT value FROM time_settings WHERE key = 'observed'").fetchone()
    days, _ = holiday_days([(row["name"], row["rule"]) for row in conn.execute("SELECT name, rule FROM holidays")],
                           first, last, (observed[0] if observed else DEFAULTS["observed"]) == "1")
    return days
