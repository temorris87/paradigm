"""Endpoints for capture by key: a line of a note made into a task, a question or a decision
(paradigm/db/capture_repo.py).

Capture = {kind: task | question | decision, id (the task's, or the record's note id), title,
           quote, hub_id, hub_title, person_id, person_name, role: delegate | for | mine | null
           (null for a record), follow_up, due ('YYYY-MM-DD' or null), open}

POST /api/capture          {source_id, kind, title, quote, hub_id, person_id?, role?, follow_up?,
                            due?}   -> {capture}     409 "already captured"
GET  /api/captures?source=N                          -> {captures: [Capture]}   (in the order made)
POST /api/capture/remove   {kind, id}                -> {}   (a task deleted, a record to Trash)
"""
from http.server import BaseHTTPRequestHandler
from typing import Dict

from paradigm.api.answers import answering
from paradigm.db.capture_repo import AlreadyCaptured, BadCapture, CaptureRepository, NoHub, NotFound
from paradigm.db.notes_repo import LastNote
from paradigm.db.tasks_repo import NoTasksHere
from paradigm.web.requests import BadRequest, int_field, read_json
from paradigm.web.router import Router

_answer = answering({NotFound: 404, AlreadyCaptured: 409, LastNote: 409, BadCapture: 400, NoHub: 400,
                     NoTasksHere: 400, BadRequest: 400})


class CaptureApi:
    def __init__(self, captures: CaptureRepository):
        self._captures = captures

    def register(self, router: Router) -> None:
        router.add("POST", "/api/capture", _answer(self.create))
        router.add("GET", "/api/captures", _answer(self.list))
        router.add("POST", "/api/capture/remove", _answer(self.remove))

    def create(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        return {"capture": self._captures.create(int_field(payload, "source_id"), payload)}

    def list(self, req: BaseHTTPRequestHandler) -> Dict:
        raw = req.query.get("source", "")
        # isdigit alone passes Unicode digits such as "²" that int() refuses.
        if not (raw.isascii() and raw.isdigit()):
            raise BadRequest("source must be a whole number")
        return {"captures": self._captures.list(int(raw))}

    def remove(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        self._captures.remove(payload.get("kind"), int_field(payload, "id"))
        return {}
