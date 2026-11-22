"""Endpoints for the wiki-link index (paradigm/db/links_repo.py). The page reads the links out
of a body with the Markdown renderer and sends them with each save (/api/note/save); these
two let it catch up on notes whose links were never read, or were read from an older text.

GET  /api/links           -> {links: [{id, targets: [link texts]}],
                              mentions: [{id, field, line, name, context}],
                              stale: [{id, version, body, agenda?}]}      live notes only
POST /api/links/index     {entries: [{id, version, links, mentions?, tasks?}]}  -> {stored: [ids]}
                          an entry whose note has moved past that version is skipped
"""
from http.server import BaseHTTPRequestHandler
from typing import Dict, List, Optional, Tuple

from paradigm.api.answers import answering
from paradigm.db.links_repo import LinkRepository
from paradigm.notes.links import BadLinks, clean_links
from paradigm.notes.mentions import BadMentions, Mention, clean_mentions
from paradigm.notes.tasks import BadTasks, Task, clean_tasks
from paradigm.web.requests import BadRequest, int_field, read_json
from paradigm.web.router import Router

# More than any one catch-up sends: the page sends stale notes in batches of this size.
MAX_ENTRIES = 200

_answer = answering({BadLinks: 400, BadMentions: 400, BadTasks: 400, BadRequest: 400})


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


def _entry(entry: object) -> Tuple[int, int, List[str], List[Mention], Optional[List[Task]]]:
    if not isinstance(entry, dict):
        raise BadRequest("each entry must be an object")
    return (int_field(entry, "id"), int_field(entry, "version"), clean_links(entry.get("links")),
            clean_mentions(entry.get("mentions")), _tasks(entry))


def _tasks(payload: Dict) -> Optional[List[Task]]:
    """The tasks a page read (None: an older page sent none, and the tasks stay as they are)."""
    return None if payload.get("tasks") is None else clean_tasks(payload["tasks"])
