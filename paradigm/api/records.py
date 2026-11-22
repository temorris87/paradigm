"""Endpoints for decisions and questions. The list is a GET; every change is a POST with a
JSON body. A record's title and text are its note's (/api/note/rename, /api/note/save).

GET  /api/records             -> {records: [{id, kind, day, people: [person ids],
                                 answered (questions only: 'YYYY-MM-DD' or '' while open)}]}
                                 source_id, quote, quote_found}]}
POST /api/record/create       {parent_id, kind, title, day, source_id?, quote?}  -> {note, record}
                              (kind: decision | question; parent: a hub, or a note or meeting
                              in one; the record goes directly under the hub, and comes from
                              source_id (default: the parent, unless that is the hub), made
                              from the text quote there)
POST /api/record/date         {id, day}                      -> record
POST /api/record/answer       {id, day, text?}               -> record (questions only; text is
                                                                added to the question's note)
POST /api/record/reopen       {id}                           -> record (questions only)
POST /api/record/with         {id, person_ids}               -> {record, added: [person ids]}
POST /api/record/unwith       {id, person_id}                -> record
"""
from http.server import BaseHTTPRequestHandler
from typing import Dict

from paradigm.api.answers import answering
from paradigm.db.notes_repo import NoteRepository, TitleTaken
from paradigm.db.records_repo import (BadKind, BadTitle, BadWhen, HubArchived, NotAHub,
                                      NotAPerson, NotAQuestion, NotARecord, NotAnswered, NotFound,
                                      NotInvolved, RecordRepository)
from paradigm.web.requests import BadRequest, int_field, int_list_field, optional_int_field, read_json
from paradigm.web.router import Router

_STATUS = {NotFound: 404, NotInvolved: 404, TitleTaken: 409, NotARecord: 400, NotAQuestion: 400,
           NotAnswered: 400, NotAPerson: 400, NotAHub: 400, HubArchived: 400,
           BadKind: 400, BadWhen: 400, BadTitle: 400, BadRequest: 400}
_answer = answering(_STATUS)


class RecordsApi:
    def __init__(self, records: RecordRepository, notes: NoteRepository):
        self._records = records
        self._notes = notes

    def register(self, router: Router) -> None:
        router.add("GET", "/api/records", _answer(self.list))
        router.add("POST", "/api/record/create", _answer(self.create))
        router.add("POST", "/api/record/date", _answer(self.date))
        router.add("POST", "/api/record/answer", _answer(self.answer))
        router.add("POST", "/api/record/reopen", _answer(self.reopen))
        router.add("POST", "/api/record/with", _answer(self.involve))
        router.add("POST", "/api/record/unwith", _answer(self.uninvolve))

    def list(self, req: BaseHTTPRequestHandler) -> Dict:
        return {"records": self._records.list()}

    def create(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        note_id, record = self._records.create(int_field(payload, "parent_id"), payload.get("kind"),
                                               payload.get("title"), payload.get("day"),
                                               optional_int_field(payload, "source_id"), payload.get("quote", ""))
        return {"note": self._notes.get(note_id), "record": record}

    def date(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        return self._records.set_day(int_field(payload, "id"), payload.get("day"))

    def answer(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        return self._records.answer(int_field(payload, "id"), payload.get("day"), payload.get("text", ""))

    def reopen(self, req: BaseHTTPRequestHandler) -> Dict:
        return self._records.reopen(int_field(read_json(req), "id"))

    def involve(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        record, added = self._records.involve(int_field(payload, "id"), int_list_field(payload, "person_ids"))
        return {"record": record, "added": added}

    def uninvolve(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        return self._records.uninvolve(int_field(payload, "id"), int_field(payload, "person_id"))
