"""Endpoints for OneDrive files: folders linked to hubs, their files, and the notes they
are attached to. The synced folder on this computer is the source of truth.

GET  /api/files              -> {folders: [{id, note_id, path, name, scanned_at, trashed}],
                                 files: [{id, folder_id, rel_path, name, size, modified, missing}],
                                 links: [{file_id, note_id, added_at}]}
GET  /api/folders/browse     -> {roots: [paths], folders: [paths]}  the folders under the
                                OneDrive roots (to pick one to link)
POST /api/folder/link        {note_id, path}    -> {folder, added, missing}
POST /api/folder/unlink      {id}               -> {}   its files' attachments go, on every
                                                         note (trashed ones too: folder.trashed)
POST /api/folder/scan        {id}               -> {folder, added, missing}
POST /api/file/attach        {file_id, note_id} -> file
POST /api/file/detach        {file_id, note_id} -> {}
POST /api/file/open          {id}               -> {}   opened with this computer's program for it
"""
from http.server import BaseHTTPRequestHandler
from typing import Callable, Dict, List

from paradigm.api.answers import answering
from paradigm.db.files_repo import BadFolder, FileRepository, FolderLinked, NotAHub, NotFound
from paradigm.files.folders import list_folders, onedrive_roots
from paradigm.web.requests import BadRequest, int_field, read_json
from paradigm.web.router import Router

_answer = answering({NotFound: 404, BadFolder: 400, NotAHub: 400, FolderLinked: 409, BadRequest: 400})


class FilesApi:
    def __init__(self, files: FileRepository, roots: Callable[[], List] = onedrive_roots):
        self._files = files
        self._roots = roots

    def register(self, router: Router) -> None:
        router.add("GET", "/api/files", _answer(self.all))
        router.add("GET", "/api/folders/browse", _answer(self.browse))
        router.add("POST", "/api/folder/link", _answer(self.link))
        router.add("POST", "/api/folder/unlink", _answer(self.unlink))
        router.add("POST", "/api/folder/scan", _answer(self.scan))
        router.add("POST", "/api/file/attach", _answer(self.attach))
        router.add("POST", "/api/file/detach", _answer(self.detach))
        router.add("POST", "/api/file/open", _answer(self.open))

    def all(self, req: BaseHTTPRequestHandler) -> Dict:
        return self._files.all()

    def browse(self, req: BaseHTTPRequestHandler) -> Dict:
        roots = self._roots()
        return {"roots": [str(root) for root in roots], "folders": [path for root in roots for path in list_folders(root)]}

    def link(self, req: BaseHTTPRequestHandler) -> Dict:
        p = read_json(req)
        return self._files.link_folder(int_field(p, "note_id"), p.get("path"))

    def unlink(self, req: BaseHTTPRequestHandler) -> Dict:
        self._files.unlink_folder(int_field(read_json(req), "id"))
        return {}

    def scan(self, req: BaseHTTPRequestHandler) -> Dict:
        return self._files.scan(int_field(read_json(req), "id"))

    def attach(self, req: BaseHTTPRequestHandler) -> Dict:
        p = read_json(req)
        return self._files.attach(int_field(p, "file_id"), int_field(p, "note_id"))

    def detach(self, req: BaseHTTPRequestHandler) -> Dict:
        p = read_json(req)
        self._files.detach(int_field(p, "file_id"), int_field(p, "note_id"))
        return {}

    def open(self, req: BaseHTTPRequestHandler) -> Dict:
        self._files.open(int_field(read_json(req), "id"))
        return {}
