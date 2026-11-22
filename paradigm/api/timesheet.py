"""Endpoints for the weekly timesheet (paradigm/db/time_repo.py, paradigm/timesheet/).

GET  /api/time/week?monday=D      -> the week's report (any day: its week)
GET  /api/time/settings           -> {settings, holidays: [{id, name, rule, ok}], time_off:
                                     [{id, kind, first, last, hours, note}], upcoming: [{day, name}]}
POST /api/time/settings           {default_code?, holiday_code?, time_off_code?, sick_code?,
                                   day_start?, day_end?, lunch_start?, lunch_end?, observed?}
POST /api/time/holiday/add        {name, rule}
POST /api/time/holiday/update     {id, name, rule}
POST /api/time/holiday/remove     {id}
POST /api/time/off/add            {kind: time_off|sick, first, last?, hours?, note?}
POST /api/time/off/remove         {id}
Every change answers with the settings, as GET /api/time/settings does.
"""
from datetime import date
from http.server import BaseHTTPRequestHandler
from typing import Dict

from paradigm.api.answers import answering
from paradigm.db.time_repo import BadRule, BadSetting, BadWhen, NoSuchEntry, TimeRepository
from paradigm.notes.meetings import clean_day
from paradigm.web.requests import BadRequest, int_field, read_json
from paradigm.web.router import Router

_answer = answering({NoSuchEntry: 404, BadSetting: 400, BadRule: 400, BadWhen: 400, BadRequest: 400})


class TimesheetApi:
    def __init__(self, time: TimeRepository):
        self._time = time

    def register(self, router: Router) -> None:
        router.add("GET", "/api/time/week", _answer(self.week))
        router.add("GET", "/api/time/settings", _answer(self.settings))
        router.add("POST", "/api/time/settings", _answer(self.set_settings))
        router.add("POST", "/api/time/holiday/add", _answer(self.add_holiday))
        router.add("POST", "/api/time/holiday/update", _answer(self.update_holiday))
        router.add("POST", "/api/time/holiday/remove", _answer(self.remove_holiday))
        router.add("POST", "/api/time/off/add", _answer(self.add_time_off))
        router.add("POST", "/api/time/off/remove", _answer(self.remove_time_off))

    def week(self, req: BaseHTTPRequestHandler) -> Dict:
        raw = req.query.get("monday", "")
        return self._time.week(date.fromisoformat(clean_day(raw)) if raw else date.today())

    def settings(self, req: BaseHTTPRequestHandler) -> Dict:
        return self._time.settings()

    def set_settings(self, req: BaseHTTPRequestHandler) -> Dict:
        return self._time.set_settings(read_json(req))

    def add_holiday(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        return self._time.add_holiday(payload.get("name"), payload.get("rule"))

    def update_holiday(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        return self._time.update_holiday(int_field(payload, "id"), payload.get("name"), payload.get("rule"))

    def remove_holiday(self, req: BaseHTTPRequestHandler) -> Dict:
        return self._time.remove_holiday(int_field(read_json(req), "id"))

    def add_time_off(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        return self._time.add_time_off(payload.get("kind"), payload.get("first"), payload.get("last"),
                                       payload.get("hours", 0), payload.get("note", ""))

    def remove_time_off(self, req: BaseHTTPRequestHandler) -> Dict:
        return self._time.remove_time_off(int_field(read_json(req), "id"))
