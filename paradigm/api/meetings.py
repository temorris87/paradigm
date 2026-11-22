"""Endpoints for meetings. The list is a GET; every change is a POST with a JSON body. A
meeting's title is its note's: /api/note/rename renames it, and its text is the minutes.

GET  /api/meetings            -> {meetings: [{id, day, time, attendees: [person ids]}]}
POST /api/meeting/create      {hub_id, name, day, time?}   -> {note, meeting}
                              (the note is "{day} {name}", directly under the hub)
POST /api/meeting/update      {id, day, time?}             -> {note, meeting} ('' or no time: none;
                              a title starting with the old date gets the new one)
POST /api/meeting/attend      {meeting_id, person_ids}     -> {meeting, added: [person ids]}
POST /api/meeting/unattend    {meeting_id, person_id}      -> meeting
"""
from http.server import BaseHTTPRequestHandler
from typing import Dict

from paradigm.api.answers import answering
from paradigm.db.meetings_repo import (BadTitle, BadWhen, HubArchived, MeetingRepository, NotAHub,
                                       NotAMeeting, NotAPerson, NotAttending, NotFound)
from paradigm.db.notes_repo import NoteRepository, TitleTaken
from paradigm.web.requests import BadRequest, int_field, int_list_field, read_json
from paradigm.web.router import Router

_STATUS = {NotFound: 404, NotAttending: 404, TitleTaken: 409, NotAMeeting: 400, NotAPerson: 400,
           NotAHub: 400, HubArchived: 400, BadWhen: 400, BadTitle: 400, BadRequest: 400}
_answer = answering(_STATUS)


class MeetingsApi:
    def __init__(self, meetings: MeetingRepository, notes: NoteRepository):
        self._meetings = meetings
        self._notes = notes

    def register(self, router: Router) -> None:
        router.add("GET", "/api/meetings", _answer(self.list))
        router.add("POST", "/api/meeting/create", _answer(self.create))
        router.add("POST", "/api/meeting/update", _answer(self.update))
        router.add("POST", "/api/meeting/attend", _answer(self.attend))
        router.add("POST", "/api/meeting/unattend", _answer(self.unattend))

    def list(self, req: BaseHTTPRequestHandler) -> Dict:
        return {"meetings": self._meetings.list()}

    def create(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        note_id, meeting = self._meetings.create(int_field(payload, "hub_id"), payload.get("name"),
                                                 payload.get("day"), payload.get("time", ""))
        return {"note": self._notes.get(note_id), "meeting": meeting}

    def update(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        meeting = self._meetings.update(int_field(payload, "id"), payload.get("day"), payload.get("time", ""))
        return {"note": self._notes.get(meeting["id"]), "meeting": meeting}

    def attend(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        meeting, added = self._meetings.attend(int_field(payload, "meeting_id"), int_list_field(payload, "person_ids"))
        return {"meeting": meeting, "added": added}

    def unattend(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        return self._meetings.unattend(int_field(payload, "meeting_id"), int_field(payload, "person_id"))
