"""Which requests the server answers, and the security headers on every response.

The server listens on 127.0.0.1 only, but any web page open in the browser can still send
requests to it, so two checks run before routing:

- Host must name this server (127.0.0.1:PORT or localhost:PORT). This stops DNS rebinding,
  where a hostile site points its own domain at 127.0.0.1 to read our responses.
- /api/ requests must not come from another site: a foreign Origin header, or a
  Sec-Fetch-Site of cross-site / same-site, is refused. This stops forged requests (CSRF).
  Requests with neither header (Python's urllib, curl) are local programs and allowed.
  Static files skip this check: they are the public code of the app.
"""
from typing import Mapping, Optional, Tuple

LOCAL_HOSTS = ("127.0.0.1", "localhost")
API_PREFIX = "/api/"
FOREIGN_FETCH_SITES = ("cross-site", "same-site")

Headers = Tuple[Tuple[str, str], ...]

SECURITY_HEADERS: Headers = (
    # Only our own files; no framing by other sites (the editor will take keystrokes).
    ("Content-Security-Policy",
     "default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; "
     "form-action 'self'; frame-ancestors 'none'"),
    ("X-Frame-Options", "DENY"),
    ("X-Content-Type-Options", "nosniff"),
    # Not "no-referrer": under it browsers send "Origin: null" on POSTs, and the Origin
    # check above would then refuse our own closing beacon.
    ("Referrer-Policy", "same-origin"),
    ("Cross-Origin-Resource-Policy", "same-origin"),
)


# Mermaid writes a <style> element and style="" attributes while it lays a diagram out, which
# the app's CSP blocks. It draws in this hidden frame page instead, which alone allows inline
# styles. Scripts stay 'self' only, outside URLs stay barred, and only our own pages may frame it.
DIAGRAM_FRAME_PATH = "/diagram-frame.html"
DIAGRAM_FRAME_HEADERS: Headers = (
    ("Content-Security-Policy",
     "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
     "object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"),
    ("X-Frame-Options", "SAMEORIGIN"),
) + tuple(header for header in SECURITY_HEADERS
          if header[0] not in ("Content-Security-Policy", "X-Frame-Options"))


def headers_for(path: str) -> Headers:
    """The security headers for a URL path (no query string): the frame page has its own."""
    # An exact match: any other spelling of the path gets the strict headers, which fails safe.
    return DIAGRAM_FRAME_HEADERS if path == DIAGRAM_FRAME_PATH else SECURITY_HEADERS


def allowed_hosts(port: int):
    return {"{}:{}".format(host, port) for host in LOCAL_HOSTS}


def allowed_origins(port: int):
    return {"http://{}:{}".format(host, port) for host in LOCAL_HOSTS}


def refusal_reason(path: str, headers: Mapping[str, str], port: int) -> Optional[str]:
    """Why a request must be refused, or None when it may be answered."""
    host = (headers.get("Host") or "").strip().lower()
    if host not in allowed_hosts(port):
        return "unexpected Host {!r}".format(host)
    if not path.startswith(API_PREFIX):
        return None
    fetch_site = (headers.get("Sec-Fetch-Site") or "").strip().lower()
    if fetch_site in FOREIGN_FETCH_SITES:
        return "Sec-Fetch-Site {!r}".format(fetch_site)
    origin = headers.get("Origin")
    if origin is not None and not _own_origin(origin, fetch_site, port):
        return "foreign Origin {!r}".format(origin)
    return None


def _own_origin(origin: str, fetch_site: str, port: int) -> bool:
    origin = origin.strip().lower()
    if origin in allowed_origins(port):
        return True
    # Browsers may send "null" for our own page in some cases (a strict referrer policy).
    # Pages cannot set Sec-Fetch-Site, and a hostile "null" (a sandboxed frame) arrives
    # as cross-site, so "null" is ours only when the browser says same-origin.
    return origin == "null" and fetch_site == "same-origin"
