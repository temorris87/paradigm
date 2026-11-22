"""Endpoints for people. The list is a GET; every change is a POST with a JSON body. A
person's name is their note's title: /api/note/rename renames them.

GET  /api/people              -> {people: [{id, first, last, email, phone, org, job,
                                            hubs: [{hub_id, role}]}]}
POST /api/person/create       {name} or {first, last}       -> {note, person}
POST /api/person/update       {id, field, value}            field: first | last | email | phone |
                                                            org | job ('' clears; a name renames)
POST /api/person/link         {hub_id, person_id, role?}    -> {person, created}
                                                            (again: changes the role)
POST /api/person/unlink       {hub_id, person_id}           -> person
"""
from http.server import BaseHTTPRequestHandler
from typing import Dict

from paradigm.api.answers import answering
from paradigm.db.notes_repo import BadTitle, NoteRepository, TitleTaken
from paradigm.db.people_repo import (BadField, NotAHub, NotAPerson, NotFound, NotLinked,
                                     PeopleRepository)
from paradigm.web.requests import BadRequest, int_field, read_json
from paradigm.web.router import Router

_STATUS = {NotFound: 404, TitleTaken: 409, NotLinked: 404, NotAPerson: 400, NotAHub: 400,
           BadField: 400, BadTitle: 400, BadRequest: 400}
_answer = answering(_STATUS)


class PeopleApi:
    def __init__(self, people: PeopleRepository, notes: NoteRepository):
        self._people = people
        self._notes = notes

    def register(self, router: Router) -> None:
        router.add("GET", "/api/people", _answer(self.list))
        router.add("POST", "/api/person/create", _answer(self.create))
        router.add("POST", "/api/person/update", _answer(self.update))
        router.add("POST", "/api/person/link", _answer(self.link))
        router.add("POST", "/api/person/unlink", _answer(self.unlink))

    def list(self, req: BaseHTTPRequestHandler) -> Dict:
        return {"people": self._people.list()}

    def create(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        note_id, person = self._people.create(payload.get("name"), payload.get("first"), payload.get("last"))
        return {"note": self._notes.get(note_id), "person": person}

    def update(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        return self._people.update(int_field(payload, "id"), payload.get("field"), payload.get("value"))

    def link(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        person, created = self._people.link(int_field(payload, "hub_id"), int_field(payload, "person_id"),
                                            payload.get("role", ""))
        return {"person": person, "created": created}

    def unlink(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        return self._people.unlink(int_field(payload, "hub_id"), int_field(payload, "person_id"))
