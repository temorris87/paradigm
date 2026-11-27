"""Endpoints for Outlook emails (.msg) attached to tasks (030_task_emails.sql).

email = {id, task_id, subject, sender, sender_email, sent_at, reply, replied_on, file_name, added_at}

POST /api/task/email/upload?task=N&name=F  the raw .msg bytes as the body (up to 30 MB)
                                           -> {email}   (400 not a .msg, 409 already on this task)
GET  /api/task/emails?task=N               -> {emails: [email]}  newest sent first
POST /api/task/email/reply  {id, reply}    -> {email}   reply: needed | replied (today) | none
POST /api/task/email/open   {id}           -> {ok: true}  opened in Outlook (410 the file is gone)
POST /api/task/email/remove {id}           -> {ok: true}  the saved copy is deleted too
"""
from http.server import BaseHTTPRequestHandler
from typing import Dict

from paradigm.api.answers import answering
from paradigm.db.emails_repo import AlreadyAttached, BadReply, EmailMissing, EmailRepository, NotAnEmail, NotFound
from paradigm.web.requests import BadRequest, int_field, read_json
from paradigm.web.router import Router

# An Outlook message with attachments can be big; every other route keeps the 8 MB cap.
MAX_EMAIL_BYTES = 30_000_000
UPLOAD_PATH = "/api/task/email/upload"

_answer = answering({NotFound: 404, NotAnEmail: 400, BadReply: 400, BadRequest: 400, AlreadyAttached: 409,
                     EmailMissing: 410})


class EmailsApi:
    def __init__(self, emails: EmailRepository):
        self._emails = emails

    def register(self, router: Router) -> None:
        router.add("POST", UPLOAD_PATH, _answer(self.upload), max_body=MAX_EMAIL_BYTES)
        router.add("GET", "/api/task/emails", _answer(self.list))
        router.add("POST", "/api/task/email/reply", _answer(self.reply))
        router.add("POST", "/api/task/email/open", _answer(self.open))
        router.add("POST", "/api/task/email/remove", _answer(self.remove))

    def upload(self, req: BaseHTTPRequestHandler) -> Dict:
        return {"email": self._emails.add(_id_param(req, "task"), req.query.get("name", ""), req.body)}

    def list(self, req: BaseHTTPRequestHandler) -> Dict:
        return {"emails": self._emails.list(_id_param(req, "task"))}

    def reply(self, req: BaseHTTPRequestHandler) -> Dict:
        payload = read_json(req)
        return {"email": self._emails.set_reply(int_field(payload, "id"), payload.get("reply"))}

    def open(self, req: BaseHTTPRequestHandler) -> Dict:
        self._emails.open(int_field(read_json(req), "id"))
        return {"ok": True}

    def remove(self, req: BaseHTTPRequestHandler) -> Dict:
        self._emails.remove(int_field(read_json(req), "id"))
        return {"ok": True}


def _id_param(req: BaseHTTPRequestHandler, name: str) -> int:
    raw = req.query.get(name, "")
    if not raw.isdigit():
        raise BadRequest("{} must be a whole number".format(name))
    return int(raw)
