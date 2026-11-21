"""Helpers that write a complete response on a request handler."""
import json
from http.server import BaseHTTPRequestHandler
from typing import Any, Iterable, Tuple


def send_bytes(req: BaseHTTPRequestHandler, status: int, body: bytes, content_type: str,
               cache: str = "no-cache", extra_headers: Iterable[Tuple[str, str]] = ()) -> None:
    req.send_response(status)
    req.send_header("Content-Type", content_type)
    req.send_header("Content-Length", str(len(body)))
    req.send_header("Cache-Control", cache)
    for name, value in extra_headers:
        req.send_header(name, value)
    req.end_headers()
    if req.command != "HEAD":
        req.wfile.write(body)


def send_json(req: BaseHTTPRequestHandler, status: int, payload: Any) -> None:
    body = json.dumps(payload).encode("utf-8")
    send_bytes(req, status, body, "application/json; charset=utf-8")


def send_error_json(req: BaseHTTPRequestHandler, status: int, message: str) -> None:
    send_json(req, status, {"error": message})


def send_empty(req: BaseHTTPRequestHandler, status: int = 204) -> None:
    req.send_response(status)
    req.send_header("Content-Length", "0")
    req.end_headers()
