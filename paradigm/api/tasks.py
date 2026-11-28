"""Endpoints for tasks and the blocks of time they are scheduled in (017_task_records.sql).

GET  /api/tasks                -> {tasks: [{id, note_id, parent_id, title, notes, due, delegate_id,
                                  follow_up, done, done_day, position,
                                  snoozed_until, estimate_min, for_person_id, source_id, quote,
                                  follow_up_count}]}
                                  source_id, quote: the meeting and line it was captured from   live tasks only
                                  follow_up_count: its logged follow-ups (every task answer has it)
POST /api/task/create          {note_id, title, parent_id?, due?, notes?}  -> task
                               (parent_id: any task on that note above the 5th level;
                               deeper: 400 "Subtasks go 4 levels deep")
POST /api/task/update          {id, title?, notes?, due?, follow_up?, snoozed_until?, estimate_min?}
                               -> task (estimate_min: minutes, null for none)
                               (snoozed_until: off Today's Up next until that day; '' none)
POST /api/task/delegate        {id, person_id|null, follow_up?}            -> task
POST /api/task/for             {id, person_id|null}                        -> task (I owe them)
POST /api/task/done            {id, done}                                  -> task
                               (done: every open task under it is done too; reopen: it alone)
POST /api/task/move            {id, before_id|null}                        -> task
POST /api/task/remove          {id}                                        -> {removed: [ids]}
                               (the task and all its descendants; its follow-up logs go too)
POST /api/task/followed_up     {id, note?, outcome: again|closed, next?, today} -> task
                               (logs a follow-up of a delegated task with a follow-up day, else
                               409; today: the browser's day; again: follow_up = next, after
                               today; closed: done as /api/task/done, follow_up kept)
GET  /api/task/history?task=N  -> {events: [{day, time, kind, text, note_id}]}  newest first;
                               kind: created, captured, placed, delegated, followed_up, done;
                               followed_up also has key "followup:N", next (YYYY-MM-DD or null)
                               and closed (bool); time and
                               note_id may be null (derived from what is stored, task_history.py);
                               delegated has no day (null, listed first) and a follow_up
                               (YYYY-MM-DD or null)
GET  /api/sessions?from=D&to=D -> {sessions: [{id, task_id, day, start, end}]}
POST /api/session/add          {task_id, day, start, end}  -> session
POST /api/session/move         {id, day, start, end}       -> session
POST /api/session/remove       {id}                        -> {}
"""
from http.server import BaseHTTPRequestHandler
from typing import Dict, Optional

from paradigm.api.answers import answering
from paradigm.api.task_files import task_param
from paradigm.db.follow_ups_repo import BadFollowUp, FollowUpRepository, NotAFollowUp
from paradigm.db.task_history import TaskHistory
from paradigm.db.tasks_repo import BadTask, BadWhen, NoTasksHere, NotAPerson, NotFound, TaskRepository
from paradigm.notes.meetings import clean_day
from paradigm.web.requests import BadRequest, int_field, optional_int_field, read_json
from paradigm.web.router import Router

_answer = answering({NotFound: 404, BadWhen: 400, BadTask: 400, NoTasksHere: 400, NotAPerson: 400, BadRequest: 400,
                     BadFollowUp: 400, NotAFollowUp: 409})


class TasksApi:
    def __init__(self, tasks: TaskRepository, history: TaskHistory, follow_ups: FollowUpRepository):
        self._tasks = tasks
        self._history = history
        self._follow_ups = follow_ups

    def register(self, router: Router) -> None:
        router.add("GET", "/api/tasks", _answer(self.list))
        router.add("POST", "/api/task/create", _answer(self.create))
        router.add("POST", "/api/task/update", _answer(self.update))
        router.add("POST", "/api/task/delegate", _answer(self.delegate))
        router.add("POST", "/api/task/for", _answer(self.for_person))
        router.add("POST", "/api/task/done", _answer(self.done))
        router.add("POST", "/api/task/move", _answer(self.move))
        router.add("POST", "/api/task/remove", _answer(self.remove))
        router.add("POST", "/api/task/followed_up", _answer(self.followed_up))
        router.add("GET", "/api/task/history", _answer(self.history))
        router.add("GET", "/api/sessions", _answer(self.sessions))
        router.add("POST", "/api/session/add", _answer(self.add_session))
        router.add("POST", "/api/session/move", _answer(self.move_session))
        router.add("POST", "/api/session/remove", _answer(self.remove_session))

    def list(self, req: BaseHTTPRequestHandler) -> Dict:
        return {"tasks": self._tasks.list()}

    def create(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        return self._tasks.create(int_field(payload, "note_id"), payload.get("title"),
                                  optional_int_field(payload, "parent_id"), payload.get("due", ""),
                                  payload.get("notes", ""))

    def update(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        return self._tasks.update(int_field(payload, "id"), payload)

    def delegate(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        return self._tasks.delegate(int_field(payload, "id"), optional_int_field(payload, "person_id"),
                                    payload.get("follow_up", ""))

    def for_person(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        return self._tasks.set_for(int_field(payload, "id"), optional_int_field(payload, "person_id"))

    def done(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        done = payload.get("done")
        if not isinstance(done, bool):
            raise BadRequest("done must be true or false")
        return self._tasks.set_done(int_field(payload, "id"), done)

    def move(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        return self._tasks.move(int_field(payload, "id"), optional_int_field(payload, "before_id"))

    def remove(self, req: BaseHTTPRequestHandler) -> Dict:
        return {"removed": self._tasks.remove(int_field(read_json(req), "id"))}

    def followed_up(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        return self._follow_ups.log(int_field(payload, "id"), payload.get("outcome"), payload.get("note", ""),
                                    payload.get("next", ""), payload.get("today"))

    def history(self, req: BaseHTTPRequestHandler) -> Dict:
        return {"events": self._history.events(task_param(req))}

    def sessions(self, req: BaseHTTPRequestHandler) -> Dict:
        return {"sessions": self._tasks.sessions(_day_param(req, "from"), _day_param(req, "to"))}

    def add_session(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        return self._tasks.add_session(int_field(payload, "task_id"), payload.get("day"), payload.get("start"),
                                       payload.get("end"))

    def move_session(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        return self._tasks.move_session(int_field(payload, "id"), payload.get("day"), payload.get("start"),
                                        payload.get("end"))

    def remove_session(self, req: BaseHTTPRequestHandler) -> Dict:
        self._tasks.remove_session(int_field(read_json(req), "id"))
        return {}


def _day_param(req: BaseHTTPRequestHandler, name: str) -> Optional[str]:
    raw = req.query.get(name, "")
    return clean_day(raw) if raw else None
