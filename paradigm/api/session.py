"""Endpoints that track the app's browser tabs.

GET  /api/ping              who is on this port (a second launch asks this)
GET  /api/events?tab=ID     one open event stream per tab, held until the tab goes away
POST /api/closing?tab=ID    beacon a tab sends when it is really being closed
"""
import re
import select
import socket
import time
from http.server import BaseHTTPRequestHandler
from typing import Optional

from paradigm import __version__
from paradigm.presence import Presence
from paradigm.web.responses import send_empty, send_error_json, send_json
from paradigm.web.router import Router

_TAB_ID = re.compile(r"[A-Za-z0-9_-]{1,64}")
# Reconnect delay the browser uses after a dropped stream (milliseconds).
RETRY_MS = 2000
# How often a stream checks whether the tab went away or the server is stopping.
POLL_SECONDS = 0.5


class SessionApi:
    def __init__(self, presence: Presence, keepalive_seconds: float):
        self._presence = presence
        self._keepalive = keepalive_seconds

    def register(self, router: Router) -> None:
        router.add("GET", "/api/ping", self.ping)
        router.add("GET", "/api/events", self.events)
        router.add("POST", "/api/closing", self.closing)

    def ping(self, req: BaseHTTPRequestHandler) -> None:
        send_json(req, 200, {"app": "paradigm", "version": __version__})

    def closing(self, req: BaseHTTPRequestHandler) -> None:
        tab_id = _tab_id(req)
        if tab_id is None:
            send_error_json(req, 400, "missing or bad tab id")
            return
        self._presence.closing(tab_id)
        send_empty(req)

    def events(self, req: BaseHTTPRequestHandler) -> None:
        tab_id = _tab_id(req)
        if tab_id is None:
            send_error_json(req, 400, "missing or bad tab id")
            return
        req.send_response(200)
        req.send_header("Content-Type", "text/event-stream; charset=utf-8")
        req.send_header("Cache-Control", "no-cache")
        req.end_headers()
        req.wfile.write("retry: {}\n\n".format(RETRY_MS).encode("utf-8"))
        self._presence.connect(tab_id)
        try:
            self._hold(req)
        finally:
            self._presence.disconnect(tab_id)

    def _hold(self, req: BaseHTTPRequestHandler) -> None:
        """Keep the stream open until the tab closes it or the server stops."""
        sock = req.connection
        last_write = time.monotonic()
        while not req.server.stop_event.is_set():
            readable, _, _ = select.select([sock], [], [], POLL_SECONDS)
            if readable and _peer_closed(sock):
                return
            if time.monotonic() - last_write >= self._keepalive:
                req.wfile.write(b": keep-alive\n\n")
                last_write = time.monotonic()


def _peer_closed(sock: socket.socket) -> bool:
    try:
        data = sock.recv(1024)
    except OSError:
        return True
    # A tab only ever closes its stream; anything it sends is ignored.
    return data == b""


def _tab_id(req: BaseHTTPRequestHandler) -> Optional[str]:
    value = req.query.get("tab", "")
    return value if _TAB_ID.fullmatch(value) else None
