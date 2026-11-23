"""Endpoints for what to raise with a person at the next 1:1 (027_person_topics.sql).

GET  /api/person_topics           -> {topics: [{id, person_id, text, source_note_id, source_line,
                                     created_at, raised_at}]}   ("@Name ?" lines add them too,
                                     with a note's save: paradigm/db/capture_repo.py)
POST /api/person_topic/create     {person_id, text}     -> topic
POST /api/person_topic/raise      {id, raised}          -> topic   (raised: true | false)
POST /api/person_topic/remove     {id}                  -> {}
"""
from http.server import BaseHTTPRequestHandler
from typing import Dict

from paradigm.api.answers import answering
from paradigm.db.topics_repo import BadTopic, NotAPerson, NotFound, TopicRepository
from paradigm.web.requests import BadRequest, int_field, read_json
from paradigm.web.router import Router

_answer = answering({NotFound: 404, BadTopic: 400, NotAPerson: 400, BadRequest: 400})


class TopicsApi:
    def __init__(self, topics: TopicRepository):
        self._topics = topics

    def register(self, router: Router) -> None:
        router.add("GET", "/api/person_topics", _answer(self.list))
        router.add("POST", "/api/person_topic/create", _answer(self.create))
        router.add("POST", "/api/person_topic/raise", _answer(self.raise_))
        router.add("POST", "/api/person_topic/remove", _answer(self.remove))

    def list(self, req: BaseHTTPRequestHandler) -> Dict:
        return {"topics": self._topics.list()}

    def create(self, req: BaseHTTPRequestHandler) -> Dict:
        p = read_json(req)
        return self._topics.create(int_field(p, "person_id"), p.get("text"))

    def raise_(self, req: BaseHTTPRequestHandler) -> Dict:
        p = read_json(req)
        raised = p.get("raised")
        if not isinstance(raised, bool):
            raise BadRequest("raised must be true or false")
        return self._topics.raise_(int_field(p, "id"), raised)

    def remove(self, req: BaseHTTPRequestHandler) -> Dict:
        self._topics.remove(int_field(read_json(req), "id"))
        return {}
