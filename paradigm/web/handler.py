"""Turns each HTTP request into a call to a route, or a static file."""
import logging
from http.server import BaseHTTPRequestHandler
from typing import Dict, Optional
from urllib.parse import parse_qs, urlsplit

from paradigm import __version__
from paradigm.web.responses import send_error_json
from paradigm.web.security import headers_for, refusal_reason
from paradigm.web.static import serve_static

log = logging.getLogger(__name__)

# Far beyond any note, and beyond any image downscaled to 1600 px wide. A route may set its own
# cap (Router.add max_body: the .msg upload), checked here before the body is read.
MAX_BODY_BYTES = 8_000_000
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
            length = self._content_length()
            limit = self.server.router.max_body(method, parts.path) or MAX_BODY_BYTES
            if length is None or length > limit:
                # Never a cut-off body: a truncated note saved as if whole would lose text.
                send_error_json(self, 413 if length else 400, "body too large or bad Content-Length")
                self.close_connection = True
                return
            self.body = self.rfile.read(length) if length else b""
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
        # The path, not the query, picks the policy. Errors sent before a request line
        # was read have no path, and get the strict headers.
        path = urlsplit(getattr(self, "path", "") or "").path
        for name, value in headers_for(path):
            self.send_header(name, value)
        super().end_headers()

    def _content_length(self) -> Optional[int]:
        raw = (self.headers.get("Content-Length") or "0").strip()
        return int(raw) if raw.isdigit() else None

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002 (stdlib name)
        log.debug("%s - %s", self.address_string(), format % args)
