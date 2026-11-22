"""Endpoints for the Trash (paradigm/db/trash_repo.py).

GET  /api/trash            -> {entries: [{id, title, kind, deleted_at, purge_at, inside,
                               parent_id, parent_title, parent_state}], days}
POST /api/trash/restore    {id} -> {note, renamed}   the note and the notes trashed with it
                           come back (409 when it is a meeting, decision or question whose
                           hub is still in the Trash)
"""
from http.server import BaseHTTPRequestHandler
from typing import Dict

from paradigm.api.answers import answering
from paradigm.db.notes_repo import NoteError, NoteRepository, NotFound, StaysInAHub
from paradigm.db.trash_repo import TrashRepository
from paradigm.web.requests import BadRequest, int_field, read_json
from paradigm.web.router import Router

_answer = answering({NotFound: 404, StaysInAHub: 409, NoteError: 409, BadRequest: 400})


class TrashApi:
    def __init__(self, trash: TrashRepository, notes: NoteRepository):
        self._trash = trash
        self._notes = notes

    def register(self, router: Router) -> None:
        router.add("GET", "/api/trash", _answer(self.list))
        router.add("POST", "/api/trash/restore", _answer(self.restore))

    def list(self, req: BaseHTTPRequestHandler) -> Dict:
        return {"entries": self._trash.entries(), "days": self._trash.keep_days}

    def restore(self, req: BaseHTTPRequestHandler) -> Dict:
        restored = self._trash.restore(int_field(read_json(req), "id"))
        return {"note": self._notes.get(restored["id"]), "renamed": restored["renamed"]}
