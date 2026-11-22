"""Endpoints for tasks and the blocks of time they are scheduled in. A task is a box in a
note's text (it is read with each save: /api/note/save's tasks); these read them and tick them.

GET  /api/tasks                       -> {tasks: [{id, note_id, field, line, parent_id, title,
                                          done, done_day}]}       live tasks only
POST /api/task/done                   {id, done} -> {task, note_id, field, version}: the box in
                                      the note's text is ticked or cleared (its version goes up);
                                      409 if its line no longer holds it
GET  /api/sessions?from=D&to=D        -> {sessions: [{id, task_id, day, start, end}]}
POST /api/session/add                 {task_id, day, start, end}  -> session
POST /api/session/move                {id, day, start, end}       -> session
POST /api/session/remove              {id}                        -> {}
"""
from http.server import BaseHTTPRequestHandler
from typing import Dict, Optional

from paradigm.api.answers import answering
from paradigm.db.tasks_repo import BadWhen, NotFound, TaskMoved, TaskRepository
from paradigm.notes.meetings import clean_day
from paradigm.web.requests import BadRequest, int_field, read_json
from paradigm.web.router import Router

_answer = answering({NotFound: 404, TaskMoved: 409, BadWhen: 400, BadRequest: 400})


class TasksApi:
    def __init__(self, tasks: TaskRepository):
        self._tasks = tasks

    def register(self, router: Router) -> None:
        router.add("GET", "/api/tasks", _answer(self.list))
        router.add("POST", "/api/task/done", _answer(self.done))
        router.add("GET", "/api/sessions", _answer(self.sessions))
        router.add("POST", "/api/session/add", _answer(self.add_session))
        router.add("POST", "/api/session/move", _answer(self.move_session))
        router.add("POST", "/api/session/remove", _answer(self.remove_session))

    def list(self, req: BaseHTTPRequestHandler) -> Dict:
        return {"tasks": self._tasks.list()}

    def done(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        done = payload.get("done")
        if not isinstance(done, bool):
            raise BadRequest("done must be true or false")
        return self._tasks.set_done(int_field(payload, "id"), done)

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
