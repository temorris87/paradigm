"""Endpoints for the folders in Resources (paradigm/db/folders_repo.py), and for putting a
resource note in one.

GET  /api/folders             -> {folders: [{id, parent_id, title}]}
POST /api/folder/create       {parent_id|null, title}  -> folder
POST /api/folder/rename       {id, title}              -> folder
POST /api/folder/move         {id, parent_id|null}     -> folder (never into itself)
POST /api/folder/trash        {id}                     -> {folders: [ids], notes: [ids]}: it, the
                              folders inside it and their notes go to the Trash
POST /api/note/folder         {id, folder_id|null}     -> note: a resource into a folder (null:
                              the top of Resources)
"""
from http.server import BaseHTTPRequestHandler
from typing import Dict

from paradigm.api.answers import answering
from paradigm.db.folders_repo import FolderRepository
from paradigm.db.notes_repo import NoteError, NoteRepository, NotFound, TitleTaken
from paradigm.notes.titles import BadTitle
from paradigm.web.requests import BadRequest, int_field, optional_int_field, read_json
from paradigm.web.router import Router

_answer = answering({NotFound: 404, TitleTaken: 409, NoteError: 400, BadTitle: 400, BadRequest: 400})


class FoldersApi:
    def __init__(self, folders: FolderRepository, notes: NoteRepository):
        self._folders = folders
        self._notes = notes

    def register(self, router: Router) -> None:
        router.add("GET", "/api/folders", _answer(self.list))
        router.add("POST", "/api/folder/create", _answer(self.create))
        router.add("POST", "/api/folder/rename", _answer(self.rename))
        router.add("POST", "/api/folder/move", _answer(self.move))
        router.add("POST", "/api/folder/trash", _answer(self.trash))
        router.add("POST", "/api/note/folder", _answer(self.put_note))

    def list(self, req: BaseHTTPRequestHandler) -> Dict:
        return {"folders": self._folders.list()}

    def create(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        return self._folders.create(optional_int_field(payload, "parent_id"), payload.get("title"))

    def rename(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        return self._folders.rename(int_field(payload, "id"), payload.get("title"))

    def move(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        return self._folders.move(int_field(payload, "id"), optional_int_field(payload, "parent_id"))

    def trash(self, req: BaseHTTPRequestHandler) -> Dict:
        return self._folders.trash(int_field(read_json(req), "id"))

    def put_note(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        return self._notes.set_folder(int_field(payload, "id"), optional_int_field(payload, "folder_id"))
