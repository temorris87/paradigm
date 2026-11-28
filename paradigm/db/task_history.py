"""A task's life for the Task page's History card, derived from what is stored: there is no
event log (Tyson, 2026-11-27). Created or captured (the task's created_at, and its source in
task_sources), one Placed per block of time, Delegated (the delegate and follow-up it has now:
undated, as the delegation's day is not stored), one Followed up per logged follow-up
(follow_up_logs), Done (done_day).

The events are built by build_events, which is pure; TaskHistory only reads the facts."""
import sqlite3
from datetime import datetime, timezone, tzinfo
from typing import Dict, List, Optional, Sequence, Tuple

from paradigm.db.connection import Database
from paradigm.db.follow_ups_repo import follow_up_logs
from paradigm.db.notes_repo import NotFound

__all__ = ["TaskHistory", "build_events", "NotFound"]

# Among events on one day, the order they happen in a task's life (newest is last).
_RANK = {"created": 0, "captured": 0, "delegated": 1, "placed": 2, "followed_up": 3, "done": 4}


class TaskHistory:
    def __init__(self, db: Database, zone: Optional[tzinfo] = None):
        self._db = db
        # None: this computer's zone, where created_at's UTC time is shown.
        self._zone = zone

    def events(self, task_id: int) -> List[Dict]:
        """A live task's events, newest first. NotFound for no such task."""
        with self._db.reading() as conn:
            task = _task_row(conn, task_id)
            source = conn.execute(
                "SELECT notes.id, notes.title, notes.deleted_at FROM task_sources "
                "JOIN notes ON notes.id = task_sources.source_id WHERE task_sources.task_id = ?", (task_id,)).fetchone()
            delegate = None if task["delegate_id"] is None else conn.execute(
                "SELECT id, title FROM notes WHERE id = ?", (task["delegate_id"],)).fetchone()
            sessions = conn.execute("SELECT day, start, end FROM task_sessions WHERE task_id = ? ORDER BY day, start, id",
                                    (task_id,)).fetchall()
            logs = follow_up_logs(conn, task_id)
        created = _local(task["created_at"], self._zone)
        return build_events(
            created=created,
            source=None if source is None else {"id": None if source["deleted_at"] else source["id"],
                                                "title": source["title"]},
            delegate=None if delegate is None else {"id": delegate["id"], "name": delegate["title"],
                                                    "follow_up": task["follow_up"]},
            sessions=[(row["day"], row["start"], row["end"]) for row in sessions],
            done_day=task["done_day"] if task["done"] else "",
            follow_ups=[{"id": log["id"], "day": log["day"], "time": _local(log["created_at"], self._zone)[1],
                         "note": log["note"], "outcome": log["outcome"], "next_day": log["next_day"]}
                        for log in logs])


def build_events(created: Tuple[str, str], source: Optional[Dict], delegate: Optional[Dict],
                 sessions: List[Tuple[str, str, str]], done_day: str,
                 follow_ups: Sequence[Dict] = ()) -> List[Dict]:
    """The events, newest first. created: (day, time) local; source: {id (None: not to link),
    title}; delegate: {id, name, follow_up}; sessions: (day, start, end); done_day: '' if open;
    follow_ups: the logs, {id, day, time (local, when it was logged), note, outcome, next_day}.

    The delegation's day is not stored, so its event has no day (None) and comes first: it is
    how the task stands now. Its follow-up day goes out as YYYY-MM-DD in follow_up (None if
    unset), for the front end to word through ui/dates.js like every date on screen."""
    day, time = created
    events = []
    if source is None:
        events.append(_event(day, time, "created", "Created", None))
    else:
        events.append(_event(day, time, "captured", "Captured in {}".format(source["title"]), source["id"]))
    for session_day, start, end in sessions:
        text = "Placed {}–{} ({})".format(start, end, minutes_text(_minutes(end) - _minutes(start)))
        events.append(_event(session_day, start, "placed", text, None))
    if delegate is not None:
        event = _event(None, None, "delegated", "Delegated to {}".format(delegate["name"]), delegate["id"])
        event["follow_up"] = delegate["follow_up"] or None
        events.append(event)
    order = {}
    for log in follow_ups:
        event = _event(log["day"], log["time"], "followed_up",
                       "Followed up: {}".format(log["note"]) if log["note"] else "Followed up", None)
        event.update(key="followup:{}".format(log["id"]), next=log["next_day"] or None,
                     closed=log["outcome"] == "closed")
        order[event["key"]] = log["id"]
        events.append(event)
    if done_day:
        events.append(_event(done_day, None, "done", "Done", None))
    # An undated event sorts as the newest ("~" is after every digit); two logs in one minute
    # by the order they were logged in.
    return sorted(events, key=lambda each: (each["day"] or "~", _RANK[each["kind"]], each["time"] or "",
                                            order.get(each.get("key"), 0)), reverse=True)


def minutes_text(minutes: int) -> str:
    """'2 h', '30 min', '1 h 30 min'."""
    hours, rest = divmod(max(minutes, 0), 60)
    if not hours:
        return "{} min".format(rest)
    return "{} h".format(hours) if not rest else "{} h {} min".format(hours, rest)


def _event(day: Optional[str], time: Optional[str], kind: str, text: str, note_id: Optional[int]) -> Dict:
    return {"day": day, "time": time, "kind": kind, "text": text, "note_id": note_id}


def _minutes(clock: str) -> int:
    hours, minutes = clock.split(":")
    return int(hours) * 60 + int(minutes)


def _local(stamp: str, zone: Optional[tzinfo]) -> Tuple[str, str]:
    """A stored UTC time ('...Z') as (day, 'HH:MM') in zone."""
    when = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    when = when.astimezone(zone)
    return when.date().isoformat(), when.strftime("%H:%M")


def _task_row(conn: sqlite3.Connection, task_id: int) -> sqlite3.Row:
    row = conn.execute(
        "SELECT tasks.* FROM tasks JOIN notes ON notes.id = tasks.note_id "
        "WHERE tasks.id = ? AND tasks.removed_at IS NULL AND notes.deleted_at IS NULL", (task_id,)).fetchone()
    if row is None:
        raise NotFound("No such task: {}".format(task_id))
    return row
