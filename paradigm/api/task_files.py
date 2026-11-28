"""Endpoints for OneDrive files linked to a task (031_task_files.sql), for the Task page's Files
card. Picking (/api/file/pick), opening (/api/file/open) and linking a folder
(/api/folder/link) are the hub file routes in files.py.

file = {id, name, rel_path, folder_id, folder_name, hub_id, hub_title, missing, added_at}
       hub_id, hub_title: the hub the file's folder is linked on

GET  /api/task/files?task=N        -> {files: [file]}  oldest added first (400 bad id, 404 no task)
POST /api/task/file/attach         {task_id, file_id} -> {file}  (404 task or file)
POST /api/task/file/attach_path    {task_id, path}    -> {file}; {file: None, folder} when no
                                   linked folder holds it (200: an expected answer, as in files.py)
POST /api/task/file/detach         {task_id, file_id} -> {}  the file on disk is left alone
"""
from http.server import BaseHTTPRequestHandler
from typing import Dict

from paradigm.api.answers import answering
from paradigm.db.files_repo import BadFolder, FileRepository, NotFound, NotLinked
from paradigm.web.requests import BadRequest, int_field, read_json
from paradigm.web.router import Router

_answer = answering({NotFound: 404, BadFolder: 400, BadRequest: 400})


class TaskFilesApi:
    def __init__(self, files: FileRepository):
        self._files = files

    def register(self, router: Router) -> None:
        router.add("GET", "/api/task/files", _answer(self.list))
        router.add("POST", "/api/task/file/attach", _answer(self.attach))
        router.add("POST", "/api/task/file/attach_path", _answer(self.attach_path))
        router.add("POST", "/api/task/file/detach", _answer(self.detach))

    def list(self, req: BaseHTTPRequestHandler) -> Dict:
        return {"files": self._files.task_files(task_param(req))}

    def attach(self, req: BaseHTTPRequestHandler) -> Dict:
        p = read_json(req)
        return {"file": self._files.attach_to_task(int_field(p, "task_id"), int_field(p, "file_id"))}

    def attach_path(self, req: BaseHTTPRequestHandler) -> Dict:
        p = read_json(req)
        try:
            return {"file": self._files.attach_path_to_task(int_field(p, "task_id"), p.get("path"))}
        except NotLinked as error:
            # The file's own folder, so the page can offer to link it to the task's hub.
            return {"file": None, "folder": error.folder}

    def detach(self, req: BaseHTTPRequestHandler) -> Dict:
        p = read_json(req)
        self._files.detach_from_task(int_field(p, "task_id"), int_field(p, "file_id"))
        return {}


def task_param(req: BaseHTTPRequestHandler) -> int:
    """The ?task=N of a GET: a whole number, else 400."""
    raw = req.query.get("task", "")
    if not raw.isdigit():
        raise BadRequest("task must be a whole number")
    return int(raw)
