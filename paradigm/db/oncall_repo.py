"""Every read and write of the on-call rota (028_on_call.sql): the only code that knows the
on_call table. A paste replaces the weeks it covers and keeps the rest."""
from datetime import date
from typing import Dict, List

from paradigm.db.connection import Database
from paradigm.notes.meetings import BadWhen, clean_day

__all__ = ["OnCallRepository", "BadRota", "BadWhen", "MAX_ROLES", "MAX_WEEKS", "MAX_TEXT"]

# A rota is a handful of roles over a few months; past these it is not a rota but a slip.
MAX_ROLES = 100
MAX_WEEKS = 104
MAX_TEXT = 200


class BadRota(ValueError):
    pass


class OnCallRepository:
    def __init__(self, db: Database):
        self._db = db

    def list(self) -> List[Dict]:
        """Every row: by week, then the role's order in its paste."""
        with self._db.reading() as conn:
            rows = conn.execute("SELECT week, role, name, position FROM on_call ORDER BY week, position, role").fetchall()
        return [dict(row) for row in rows]

    def replace(self, weeks: object) -> List[Dict]:
        """weeks: [{week, roles: [{role, name}]}]. Those weeks become exactly what was sent."""
        cleaned = _clean_weeks(weeks)
        with self._db.transaction() as conn:
            for week, roles in cleaned:
                conn.execute("DELETE FROM on_call WHERE week = ?", (week,))
                conn.executemany("INSERT INTO on_call (week, role, name, position) VALUES (?, ?, ?, ?)",
                                 [(week, role, name, position) for position, (role, name) in enumerate(roles)])
        return self.list()

    def clear(self) -> List[Dict]:
        with self._db.transaction() as conn:
            conn.execute("DELETE FROM on_call")
        return []


def _clean_weeks(weeks: object):
    if not isinstance(weeks, list) or not weeks:
        raise BadRota("Nothing to save: the paste needs at least one week")
    if len(weeks) > MAX_WEEKS:
        raise BadRota("A paste can hold at most {} weeks".format(MAX_WEEKS))
    cleaned, seen = [], set()
    for entry in weeks:
        if not isinstance(entry, dict):
            raise BadRota("Each week must be an object")
        week = clean_day(entry.get("week"))
        if date.fromisoformat(week).weekday() != 0:
            raise BadRota("{} is not a Monday".format(week))
        if week in seen:
            raise BadRota("The week of {} is in the paste twice".format(week))
        seen.add(week)
        cleaned.append((week, _clean_roles(entry.get("roles"))))
    return cleaned


def _clean_roles(roles: object):
    if not isinstance(roles, list) or len(roles) > MAX_ROLES:
        raise BadRota("A week holds a list of at most {} roles".format(MAX_ROLES))
    cleaned, seen = [], set()
    for entry in roles:
        if not isinstance(entry, dict):
            raise BadRota("Each role must be an object")
        role, name = _clean_text(entry.get("role"), "role"), _clean_text(entry.get("name", ""), "name")
        if not role:
            raise BadRota("A role needs a name")
        if role.lower() in seen:
            raise BadRota('The role "{}" is in a week twice'.format(role))
        seen.add(role.lower())
        cleaned.append((role, name))
    return cleaned


def _clean_text(value: object, what: str) -> str:
    if not isinstance(value, str):
        raise BadRota("The {} must be text".format(what))
    value = " ".join(value.split())
    if len(value) > MAX_TEXT:
        raise BadRota("A {} can be at most {} characters".format(what, MAX_TEXT))
    return value
