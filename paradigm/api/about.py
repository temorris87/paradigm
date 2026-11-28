"""Facts about this running Paradigm, for the Settings page.

GET  /api/about   -> {data_folder: the folder the notes are kept in (absolute), version}
"""
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from typing import Dict

from paradigm import __version__
from paradigm.api.answers import answering
from paradigm.web.router import Router

_answer = answering({})


class AboutApi:
    def __init__(self, data_dir: Path):
        # Absolute, so a relative --data still shows where the notes really are; symlinks
        # are kept, as that is the path the user typed or knows.
        self._data_folder = str(data_dir.absolute())

    def register(self, router: Router) -> None:
        router.add("GET", "/api/about", _answer(self.about))

    def about(self, req: BaseHTTPRequestHandler) -> Dict:
        return {"data_folder": self._data_folder, "version": __version__}
