"""Endpoints for meetings. The list is a GET; every change is a POST with a JSON body. A
meeting's title is its note's: /api/note/rename renames it, and its text is the minutes.

GET  /api/meetings            -> {meetings: [{id, day, time, end_time, cancelled, location,
                                 join_url, attendees: [person ids]}]}
POST /api/meeting/create      {hub_id, name, day, time?, end_time?}   -> {note, meeting}
                              (the note is called name, directly under the hub; meetings in
                              one hub may share a name)
POST /api/meeting/update      {id, day, time?, end_time?}  -> {note, meeting} ('' or no time: none;
                              no end_time: it keeps its length)
POST /api/meeting/cancel      {id, cancelled}              -> {note, meeting}
POST /api/meeting/agenda      {id, agenda, version, force?, links?, mentions?}
                              -> {id, agenda, version}     409 {error, version} if stale; links
                              and mentions are the whole meeting's (minutes and agenda)
POST /api/meeting/attend      {meeting_id, person_ids}     -> {meeting, added: [person ids]}
POST /api/meeting/unattend    {meeting_id, person_id}      -> meeting
"""
from http.server import BaseHTTPRequestHandler
from typing import Dict

from paradigm.api.answers import answering
from paradigm.db.meetings_repo import (BadTitle, BadWhen, Conflict, HubArchived, MeetingRepository, NotAHub,
                                       NotAMeeting, NotAPerson, NotAttending, NotFound)
from paradigm.db.notes_repo import NoteRepository, TitleTaken
from paradigm.notes.links import BadLinks, clean_links
from paradigm.notes.mentions import BadMentions, clean_mentions
from paradigm.notes.tasks import BadTasks, clean_tasks
from paradigm.web.requests import BadRequest, bool_field, int_field, int_list_field, read_json, str_field
from paradigm.web.responses import send_json
from paradigm.web.router import Router

_STATUS = {NotFound: 404, NotAttending: 404, TitleTaken: 409, NotAMeeting: 400, NotAPerson: 400,
           NotAHub: 400, HubArchived: 400, BadWhen: 400, BadTitle: 400, BadLinks: 400, BadMentions: 400,
           BadTasks: 400, BadRequest: 400}
_answer = answering(_STATUS)


class MeetingsApi:
    def __init__(self, meetings: MeetingRepository, notes: NoteRepository):
        self._meetings = meetings
        self._notes = notes

    def register(self, router: Router) -> None:
        router.add("GET", "/api/meetings", _answer(self.list))
        router.add("POST", "/api/meeting/create", _answer(self.create))
        router.add("POST", "/api/meeting/update", _answer(self.update))
        router.add("POST", "/api/meeting/cancel", _answer(self.cancel))
        router.add("POST", "/api/meeting/agenda", self.agenda)
        router.add("POST", "/api/meeting/attend", _answer(self.attend))
        router.add("POST", "/api/meeting/unattend", _answer(self.unattend))

    def list(self, req: BaseHTTPRequestHandler) -> Dict:
        return {"meetings": self._meetings.list()}

    def create(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        note_id, meeting = self._meetings.create(int_field(payload, "hub_id"), payload.get("name"),
                                                 payload.get("day"), payload.get("time", ""),
                                                 payload.get("end_time", ""))
        return {"note": self._notes.get(note_id), "meeting": meeting}

    def update(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        meeting = self._meetings.update(int_field(payload, "id"), payload.get("day"), payload.get("time", ""),
                                        payload.get("end_time"))
        return {"note": self._notes.get(meeting["id"]), "meeting": meeting}

    def cancel(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        meeting = self._meetings.set_cancelled(int_field(payload, "id"), bool_field(payload, "cancelled"))
        return {"note": self._notes.get(meeting["id"]), "meeting": meeting}

    def agenda(self, req: BaseHTTPRequestHandler) -> None:
        # A conflict answers with the version now saved, as /api/note/save does.
        try:
            _answer(self._save_agenda)(req)
        except Conflict as error:
            send_json(req, 409, {"error": "The agenda was changed in another tab", "version": error.current_version})

    def _save_agenda(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        links = None if payload.get("links") is None else clean_links(payload["links"])
        return self._meetings.save_agenda(int_field(payload, "id"), str_field(payload, "agenda"),
                                          int_field(payload, "version"), bool_field(payload, "force"),
                                          links, clean_mentions(payload.get("mentions")),
                                          None if payload.get("tasks") is None else clean_tasks(payload["tasks"]))

    def attend(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        meeting, added = self._meetings.attend(int_field(payload, "meeting_id"), int_list_field(payload, "person_ids"))
        return {"meeting": meeting, "added": added}

    def unattend(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        return self._meetings.unattend(int_field(payload, "meeting_id"), int_field(payload, "person_id"))
