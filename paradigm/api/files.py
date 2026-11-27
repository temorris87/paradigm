"""Endpoints for OneDrive files: folders linked to hubs, their files, and the notes they
are attached to. The synced folder on this computer is the source of truth.

GET  /api/files              -> {folders: [{id, note_id, path, name, scanned_at, trashed}],
                                 files: [{id, folder_id, rel_path, name, size, modified, missing}],
                                 links: [{file_id, note_id, added_at}]}
GET  /api/folders/browse     -> {roots: [paths], folders: [paths]}  the folders under the
                                OneDrive roots (to pick one to link)
GET  /api/folders/browse?path=P -> {roots, folders: [paths one level down], path, parent
                                (None at a root), files: [{name, size, modified}]}  one level,
                                for the folder browser
POST /api/folder/link        {note_id, path}    -> {folder, added, missing}
POST /api/folder/unlink      {id}               -> {}   its files' attachments go, on every
                                                         note (trashed ones too: folder.trashed)
POST /api/folder/scan        {id}               -> {folder, added, missing}
POST /api/file/attach        {file_id, note_id} -> file
POST /api/file/detach        {file_id, note_id} -> {}
POST /api/file/open          {id}               -> {}   opened with this computer's program for it
POST /api/file/pick          {note_id}          -> {path} (None: cancelled), or {path: None,
                                fallback: "browser", start}  the native file dialog
POST /api/file/attach_path   {note_id, path}    -> {file, link}; {file: None, link: None, folder}
                                when no linked folder holds it (200: an expected answer)
"""
from http.server import BaseHTTPRequestHandler
from typing import Callable, Dict, List, Optional
from urllib.parse import parse_qs, urlsplit

from paradigm.api.answers import answering
from paradigm.db.files_repo import BadFolder, FileRepository, FolderLinked, NotAHub, NotFound, NotLinked
from paradigm.files import native_pick
from paradigm.files.folders import clean_folder, list_entries, list_folders, onedrive_roots, parent_of
from paradigm.web.requests import BadRequest, int_field, read_json
from paradigm.web.router import Router

_answer = answering({NotFound: 404, BadFolder: 400, NotAHub: 400, FolderLinked: 409, BadRequest: 400})


class FilesApi:
    def __init__(self, files: FileRepository, roots: Callable[[], List] = onedrive_roots,
                 picker: Optional[Callable[[str, str], native_pick.PickResult]] = None):
        self._files = files
        self._roots = roots
        self._picker = picker

    def register(self, router: Router) -> None:
        router.add("GET", "/api/files", _answer(self.all))
        router.add("GET", "/api/folders/browse", _answer(self.browse))
        router.add("POST", "/api/folder/link", _answer(self.link))
        router.add("POST", "/api/folder/unlink", _answer(self.unlink))
        router.add("POST", "/api/folder/scan", _answer(self.scan))
        router.add("POST", "/api/file/attach", _answer(self.attach))
        router.add("POST", "/api/file/detach", _answer(self.detach))
        router.add("POST", "/api/file/open", _answer(self.open))
        router.add("POST", "/api/file/pick", _answer(self.pick))
        router.add("POST", "/api/file/attach_path", _answer(self.attach_path))

    def all(self, req: BaseHTTPRequestHandler) -> Dict:
        return self._files.all()

    def browse(self, req: BaseHTTPRequestHandler) -> Dict:
        roots = self._roots()
        if not _asks_for_path(req):
            return {"roots": [str(root) for root in roots], "folders": [path for root in roots for path in list_folders(root)]}
        folder = clean_folder(req.query.get("path", ""))
        parent = parent_of(folder, roots)
        entries = list_entries(folder)
        return {"roots": [str(root) for root in roots], "folders": entries["folders"], "path": str(folder),
                "parent": None if parent is None else str(parent), "files": entries["files"]}

    def pick(self, req: BaseHTTPRequestHandler) -> Dict:
        # Never a path from the request: only the dialog's child process supplies one.
        hub = self._files.pick_start(int_field(read_json(req), "note_id"))
        start = hub["folder"] or str(self._roots()[0])
        # Looked up when used, so a test can stand in for the dialog.
        result = (self._picker or native_pick.pick)(start, "Add a file to {}".format(hub["title"]))
        if result.fallback:
            return {"path": None, "fallback": "browser", "start": start}
        return {"path": result.path}

    def attach_path(self, req: BaseHTTPRequestHandler) -> Dict:
        p = read_json(req)
        try:
            return self._files.attach_path(int_field(p, "note_id"), p.get("path"))
        except NotLinked as error:
            # The file's own folder, so the page can offer to link it. A 200, not a 409: it is
            # the usual answer for a pick from a new folder, and a 4xx logs a console error.
            return {"file": None, "link": None, "folder": error.folder}

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


def _asks_for_path(req: BaseHTTPRequestHandler) -> bool:
    # req.query drops a blank value, and "?path=" must be refused, not listed as everything.
    return "path" in parse_qs(urlsplit(req.path).query, keep_blank_values=True)
