"""Endpoints for notes. Reads are GET; every change is a POST with a JSON body.

GET  /api/notes            the tree: every note without its body
GET  /api/note?id=N        one note with its body
POST /api/note/create      {parent_id|null, title, body?}
POST /api/note/save        {id, body, version, force?}   409 {error, version} if stale
POST /api/note/rename      {id, title}
POST /api/note/move        {id, parent_id|null}           a hub moved under a note stops being one
POST /api/note/kind        {id, kind}   kind: project | area | resource | null (the Inbox);
                                        a nested note moves to the top level first
POST /api/note/area        {id, area_id|null}   put a project in an area (null: in none)
POST /api/note/archive     {id, archived}   archive a hub with everything under it, or restore it
                                            -> {note, inside: number of notes under it}
POST /api/note/delete      {id, recursive?}              -> {deleted: [ids]}
"""
from http.server import BaseHTTPRequestHandler
from typing import Callable, Dict

from paradigm.db.notes_repo import (AreaArchived, BadKind, BadTitle, Conflict, HasChildren, LastNote,
                                    NoteError, NoteRepository, NotAnArea, NotAProject, NotArchived,
                                    NotFound, NotTopLevel, TitleTaken, WouldCycle)
from paradigm.web.requests import (BadRequest, bool_field, int_field, optional_int_field,
                                   read_json, str_field)
from paradigm.web.responses import send_error_json, send_json
from paradigm.web.router import Router

_STATUS = {NotFound: 404, Conflict: 409, TitleTaken: 409, HasChildren: 409, LastNote: 409,
           WouldCycle: 400, NotAProject: 400, NotAnArea: 400, AreaArchived: 400, NotTopLevel: 400,
           NotArchived: 400, BadTitle: 400, BadKind: 400, BadRequest: 400}


class NotesApi:
    def __init__(self, notes: NoteRepository):
        self._notes = notes

    def register(self, router: Router) -> None:
        router.add("GET", "/api/notes", self._answer(self.tree))
        router.add("GET", "/api/note", self._answer(self.get))
        router.add("POST", "/api/note/create", self._answer(self.create))
        router.add("POST", "/api/note/save", self._answer(self.save))
        router.add("POST", "/api/note/rename", self._answer(self.rename))
        router.add("POST", "/api/note/move", self._answer(self.move))
        router.add("POST", "/api/note/kind", self._answer(self.kind))
        router.add("POST", "/api/note/area", self._answer(self.area))
        router.add("POST", "/api/note/archive", self._answer(self.archive))
        router.add("POST", "/api/note/delete", self._answer(self.delete))

    def tree(self, req: BaseHTTPRequestHandler) -> Dict:
        return {"notes": self._notes.tree()}

    def get(self, req: BaseHTTPRequestHandler) -> Dict:
        raw = req.query.get("id", "")
        if not raw.isdigit():
            raise BadRequest("id must be a whole number")
        return self._notes.get(int(raw))

    def create(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        body = payload.get("body", "")
        if not isinstance(body, str):
            raise BadRequest("body must be text")
        return self._notes.create(optional_int_field(payload, "parent_id"), payload.get("title"), body)

    def save(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        return self._notes.save(int_field(payload, "id"), str_field(payload, "body"),
                                int_field(payload, "version"), bool_field(payload, "force"))

    def rename(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        return self._notes.rename(int_field(payload, "id"), payload.get("title"))

    def move(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        return self._notes.move(int_field(payload, "id"), optional_int_field(payload, "parent_id"))

    def kind(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        return self._notes.set_kind(int_field(payload, "id"), payload.get("kind"))

    def area(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        return self._notes.set_area(int_field(payload, "id"), optional_int_field(payload, "area_id"))

    def archive(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        archived = payload.get("archived")
        if not isinstance(archived, bool):
            raise BadRequest("archived must be true or false")
        note, inside = self._notes.set_archived(int_field(payload, "id"), archived)
        return {"note": note, "inside": inside}

    def delete(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        ids = self._notes.delete(int_field(payload, "id"), bool_field(payload, "recursive"))
        return {"deleted": ids}

    @staticmethod
    def _answer(handler: Callable[[BaseHTTPRequestHandler], Dict]) -> Callable[[BaseHTTPRequestHandler], None]:
        """Runs a handler and turns its result, or its expected error, into the response."""
        def route(req: BaseHTTPRequestHandler) -> None:
            try:
                result = handler(req)
            except (NoteError, BadTitle, BadKind, BadRequest) as error:
                _send_failure(req, error)
                return
            send_json(req, 200, result)
        return route


def _send_failure(req: BaseHTTPRequestHandler, error: Exception) -> None:
    status = next((code for kind, code in _STATUS.items() if isinstance(error, kind)), 400)
    if isinstance(error, Conflict):
        send_json(req, status, {"error": str(error), "version": error.current_version})
    else:
        send_error_json(req, status, str(error))
