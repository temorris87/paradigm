"""Serves the files under static/, never anything outside it."""
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from typing import Optional
from urllib.parse import unquote

from paradigm.web.responses import send_bytes, send_error_json

# An explicit table, not mimetypes: on Windows, mimetypes reads the registry, which
# can map .js to text/plain, and browsers then refuse to run ES modules.
CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
}
DEFAULT_CONTENT_TYPE = "application/octet-stream"


def resolve_static(root: Path, url_path: str) -> Optional[Path]:
    """The file a URL path names inside root, or None if it is missing or outside root."""
    relative = unquote(url_path).lstrip("/\\") or "index.html"
    if "\x00" in relative:
        return None
    root = root.resolve()
    try:
        candidate = (root / relative).resolve()
    except (OSError, ValueError):
        return None
    if candidate != root and root not in candidate.parents:
        return None
    return candidate if candidate.is_file() else None


def serve_static(req: BaseHTTPRequestHandler, root: Path, url_path: str) -> None:
    path = resolve_static(root, url_path)
    if path is None:
        send_error_json(req, 404, "not found")
        return
    content_type = CONTENT_TYPES.get(path.suffix.lower(), DEFAULT_CONTENT_TYPE)
    send_bytes(req, 200, path.read_bytes(), content_type)
