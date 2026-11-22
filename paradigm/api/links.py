"""Endpoints for the wiki-link index (paradigm/db/links_repo.py). The page reads the links out
of a body with the Markdown renderer and sends them with each save (/api/note/save); these
two let it catch up on notes whose links were never read, or were read from an older text.

GET  /api/links           -> {links: [{id, targets: [link texts]}],
                              stale: [{id, version, body}]}      live notes only
POST /api/links/index     {entries: [{id, version, links}]}  -> {stored: [ids]}
                          an entry whose note has moved past that version is skipped
"""
from http.server import BaseHTTPRequestHandler
from typing import Dict, List, Tuple

from paradigm.api.answers import answering
from paradigm.db.links_repo import LinkRepository
from paradigm.notes.links import BadLinks, clean_links
from paradigm.web.requests import BadRequest, int_field, read_json
from paradigm.web.router import Router

# More than any one catch-up sends: the page sends stale notes in batches of this size.
MAX_ENTRIES = 200

_answer = answering({BadLinks: 400, BadRequest: 400})


class LinksApi:
    def __init__(self, links: LinkRepository):
        self._links = links

    def register(self, router: Router) -> None:
        router.add("GET", "/api/links", _answer(self.index))
        router.add("POST", "/api/links/index", _answer(self.catch_up))

    def index(self, req: BaseHTTPRequestHandler) -> Dict:
        return self._links.index()

    def catch_up(self, req: BaseHTTPRequestHandler) -> Dict:
        entries = read_json(req).get("entries")
        if not isinstance(entries, list) or len(entries) > MAX_ENTRIES:
            raise BadRequest("entries must be a list of at most {}".format(MAX_ENTRIES))
        return {"stored": self._links.catch_up([_entry(entry) for entry in entries])}


def _entry(entry: object) -> Tuple[int, int, List[str]]:
    if not isinstance(entry, dict):
        raise BadRequest("each entry must be an object")
    return int_field(entry, "id"), int_field(entry, "version"), clean_links(entry.get("links"))
