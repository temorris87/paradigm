"""Endpoints for the on-call rota (paradigm/db/oncall_repo.py), pasted from the Excel sheet on
the Week page's On call tab. The page reads the sheet; the server keeps what it sends.

GET  /api/oncall          -> {rows: [{week, role, name, position}]}
POST /api/oncall/paste    {weeks: [{week: Monday, roles: [{role, name}]}]}   -> {rows}
                          (those weeks are replaced, all roles; the others are kept)
POST /api/oncall/clear    {}                                                 -> {rows: []}
"""
from http.server import BaseHTTPRequestHandler
from typing import Dict

from paradigm.api.answers import answering
from paradigm.db.oncall_repo import BadRota, BadWhen, OnCallRepository
from paradigm.web.requests import BadRequest, read_json
from paradigm.web.router import Router

_answer = answering({BadRota: 400, BadWhen: 400, BadRequest: 400})


class OnCallApi:
    def __init__(self, rota: OnCallRepository):
        self._rota = rota

    def register(self, router: Router) -> None:
        router.add("GET", "/api/oncall", _answer(self.list))
        router.add("POST", "/api/oncall/paste", _answer(self.paste))
        router.add("POST", "/api/oncall/clear", _answer(self.clear))

    def list(self, req: BaseHTTPRequestHandler) -> Dict:
        return {"rows": self._rota.list()}

    def paste(self, req: BaseHTTPRequestHandler) -> Dict:
        return {"rows": self._rota.replace(read_json(req).get("weeks"))}

    def clear(self, req: BaseHTTPRequestHandler) -> Dict:
        read_json(req)
        return {"rows": self._rota.clear()}
