"""Endpoints for note templates (the Templates group). A template's title and text are its
note's (/api/note/rename, /api/note/save); the tree lists them with kind "template".

POST /api/template/create    {title, body?}   -> {note}
"""
from http.server import BaseHTTPRequestHandler
from typing import Dict

from paradigm.api.answers import answering
from paradigm.db.notes_repo import NoteRepository, TitleTaken
from paradigm.db.templates_repo import TemplateRepository
from paradigm.notes.titles import BadTitle
from paradigm.web.requests import BadRequest, read_json
from paradigm.web.router import Router

_answer = answering({TitleTaken: 409, BadTitle: 400, BadRequest: 400})


class TemplatesApi:
    def __init__(self, templates: TemplateRepository, notes: NoteRepository):
        self._templates = templates
        self._notes = notes

    def register(self, router: Router) -> None:
        router.add("POST", "/api/template/create", _answer(self.create))

    def create(self, req: BaseHTTPRequestHandler) -> Dict:
        p = read_json(req)
        return {"note": self._notes.get(self._templates.create(p.get("title"), p.get("body", "")))}
