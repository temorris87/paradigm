"""Endpoints for tasks and the blocks of time they are scheduled in (017_task_records.sql).

GET  /api/tasks                -> {tasks: [{id, note_id, parent_id, title, notes, due, delegate_id,
                                  follow_up, done, done_day, position}]}   live tasks only
POST /api/task/create          {note_id, title, parent_id?, due?, notes?}  -> task
POST /api/task/update          {id, title?, notes?, due?, follow_up?}      -> task
POST /api/task/delegate        {id, person_id|null, follow_up?}            -> task
POST /api/task/done            {id, done}                                  -> task
POST /api/task/move            {id, before_id|null}                        -> task
POST /api/task/remove          {id}                                        -> {removed: [ids]}
GET  /api/sessions?from=D&to=D -> {sessions: [{id, task_id, day, start, end}]}
POST /api/session/add          {task_id, day, start, end}  -> session
POST /api/session/move         {id, day, start, end}       -> session
POST /api/session/remove       {id}                        -> {}
"""
from http.server import BaseHTTPRequestHandler
from typing import Dict, Optional

from paradigm.api.answers import answering
from paradigm.db.tasks_repo import BadTask, BadWhen, NoTasksHere, NotAPerson, NotFound, TaskRepository
from paradigm.notes.meetings import clean_day
from paradigm.web.requests import BadRequest, int_field, optional_int_field, read_json
from paradigm.web.router import Router

_answer = answering({NotFound: 404, BadWhen: 400, BadTask: 400, NoTasksHere: 400, NotAPerson: 400, BadRequest: 400})


class TasksApi:
    def __init__(self, tasks: TaskRepository):
        self._tasks = tasks

    def register(self, router: Router) -> None:
        router.add("GET", "/api/tasks", _answer(self.list))
        router.add("POST", "/api/task/create", _answer(self.create))
        router.add("POST", "/api/task/update", _answer(self.update))
        router.add("POST", "/api/task/delegate", _answer(self.delegate))
        router.add("POST", "/api/task/done", _answer(self.done))
        router.add("POST", "/api/task/move", _answer(self.move))
        router.add("POST", "/api/task/remove", _answer(self.remove))
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
