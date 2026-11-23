"""Endpoints for status logs: where a project or an area stands (023_status_logs.sql).

GET  /api/status_logs          -> {logs: [{id, note_id, day, health, text, created_at}],
                                  stale_days}   newest first; stale_days: past this many days
                                  without an entry, a hub's status is stale (Config)
POST /api/status_log/create    {note_id, day, health, text}  -> entry
                               health: on_track | at_risk | blocked
POST /api/status_log/update    {id, day, health, text}       -> entry
POST /api/status_log/remove    {id}                          -> {}
"""
from http.server import BaseHTTPRequestHandler
from typing import Dict

from paradigm.api.answers import answering
from paradigm.db.status_repo import BadStatus, BadWhen, NotAHub, NotFound, StatusRepository
from paradigm.web.requests import BadRequest, int_field, read_json
from paradigm.web.router import Router

_answer = answering({NotFound: 404, BadWhen: 400, BadStatus: 400, NotAHub: 400, BadRequest: 400})


class StatusApi:
    def __init__(self, logs: StatusRepository, stale_days: int):
        self._logs = logs
        self._stale_days = stale_days

    def register(self, router: Router) -> None:
        router.add("GET", "/api/status_logs", _answer(self.list))
        router.add("POST", "/api/status_log/create", _answer(self.create))
        router.add("POST", "/api/status_log/update", _answer(self.update))
        router.add("POST", "/api/status_log/remove", _answer(self.remove))

    def list(self, req: BaseHTTPRequestHandler) -> Dict:
        return {"logs": self._logs.list(), "stale_days": self._stale_days}

    def create(self, req: BaseHTTPRequestHandler) -> Dict:
        p = read_json(req)
        return self._logs.create(int_field(p, "note_id"), p.get("day"), p.get("health"), p.get("text"))

    def update(self, req: BaseHTTPRequestHandler) -> Dict:
        p = read_json(req)
        return self._logs.update(int_field(p, "id"), p.get("day"), p.get("health"), p.get("text"))

    def remove(self, req: BaseHTTPRequestHandler) -> Dict:
        self._logs.remove(int_field(read_json(req), "id"))
        return {}
