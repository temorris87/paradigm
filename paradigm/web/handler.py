"""Turns each HTTP request into a call to a route, or a static file."""
import logging
from http.server import BaseHTTPRequestHandler
from typing import Dict
from urllib.parse import parse_qs, urlsplit

from paradigm import __version__
from paradigm.web.responses import send_error_json
from paradigm.web.security import SECURITY_HEADERS, refusal_reason
from paradigm.web.static import serve_static

log = logging.getLogger(__name__)

MAX_BODY_BYTES = 1_000_000
_DISCONNECTS = (BrokenPipeError, ConnectionResetError, ConnectionAbortedError)


class RequestHandler(BaseHTTPRequestHandler):
    server_version = "Paradigm/" + __version__
    query: Dict[str, str]
    body: bytes

    def do_GET(self) -> None:
        self._dispatch("GET")

    def do_HEAD(self) -> None:
        self._dispatch("HEAD")

    def do_POST(self) -> None:
        self._dispatch("POST")

    def _dispatch(self, method: str) -> None:
        parts = urlsplit(self.path)
        self.query = {key: values[0] for key, values in parse_qs(parts.query).items()}
        try:
            reason = refusal_reason(parts.path, self.headers, self.server.port)
            if reason is not None:
                log.warning("Refused %s %s: %s", method, parts.path, reason)
                send_error_json(self, 403, "forbidden")
                return
            self.body = self._read_body()
            route = self.server.router.resolve(method, parts.path)
            if route is not None:
                route(self)
            elif self.server.router.allows(parts.path):
                send_error_json(self, 405, "method not allowed")
            elif method in ("GET", "HEAD"):
                serve_static(self, self.server.static_dir, parts.path)
            else:
                send_error_json(self, 404, "not found")
        except _DISCONNECTS:
            log.debug("client went away during %s %s", method, parts.path)
        except Exception:
            log.exception("error answering %s %s", method, parts.path)
            try:
                send_error_json(self, 500, "internal error")
            except OSError:
                pass

    def end_headers(self) -> None:
        for name, value in SECURITY_HEADERS:
            self.send_header(name, value)
        super().end_headers()

    def _read_body(self) -> bytes:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return b""
        return self.rfile.read(min(length, MAX_BODY_BYTES))

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002 (stdlib name)
        log.debug("%s - %s", self.address_string(), format % args)
