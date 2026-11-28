"""Endpoints for the Outlook import (paradigm/db/import_repo.py).

GET  /api/calendar/status         -> {imported_today, last_day, last_at} (last_day and last_at
                                  null when never; last_at in local time)
POST /api/calendar/upload         the .ics file's bytes as the body -> {new, to_file, updated, moved,
                                  cancelled, back_on, skipped, people, files, errors}; 400 when
                                  empty, too large or not a calendar file
GET  /api/calendar/pending        -> {pending: [{id, uid, day, time, end_time, title, recurring,
                                  location, join_url, agenda, attendees, hub_guess}]}
POST /api/calendar/file           {ids, hub_id} -> {meetings: [ids]}
POST /api/calendar/ignore         {ids} -> {}
"""
from http.server import BaseHTTPRequestHandler
from typing import Dict

from paradigm.api.answers import answering
from paradigm.db.import_repo import BadCalendar, HubArchived, ImportRepository, MAX_FILE_BYTES, NotAHub, NotFound
from paradigm.web.requests import BadRequest, int_field, int_list_field, read_json
from paradigm.web.router import Router

_answer = answering({NotFound: 404, NotAHub: 400, HubArchived: 400, BadCalendar: 400, BadRequest: 400})


class CalendarApi:
    def __init__(self, imports: ImportRepository):
        self._imports = imports

    def register(self, router: Router) -> None:
        router.add("GET", "/api/calendar/status", _answer(self.status))
        router.add("POST", "/api/calendar/upload", _answer(self.upload))
        router.add("GET", "/api/calendar/pending", _answer(self.pending))
        router.add("POST", "/api/calendar/file", _answer(self.file))
        router.add("POST", "/api/calendar/ignore", _answer(self.ignore))

    def status(self, req: BaseHTTPRequestHandler) -> Dict:
        return self._imports.status()

    def upload(self, req: BaseHTTPRequestHandler) -> Dict:
        if not req.body:
            raise BadRequest("the body must be the calendar file")
        if len(req.body) > MAX_FILE_BYTES:
            raise BadRequest("the calendar file is too large")
        return dict(self._imports.import_text(req.body.decode("utf-8", errors="replace")), errors=[])

    def pending(self, req: BaseHTTPRequestHandler) -> Dict:
        return {"pending": self._imports.pending()}

    def file(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        return {"meetings": self._imports.file(int_list_field(payload, "ids"), int_field(payload, "hub_id"))}

    def ignore(self, req: BaseHTTPRequestHandler) -> Dict:
        self._imports.ignore(int_list_field(read_json(req), "ids"))
        return {}
