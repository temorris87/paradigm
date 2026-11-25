"""A real Paradigm server on a free port, for tests."""
import http.client
import json
import tempfile
import time
from pathlib import Path
from typing import Callable, Dict, Optional, Tuple

from paradigm.app import build_server
from paradigm.config import Config
from paradigm.presence import Presence


class RunningServer:
    def __init__(self, grace_seconds: float = 0.2, keepalive_seconds: float = 15.0,
                 max_streams: int = 50, idle_seconds: float = 60.0):
        self.tmp = tempfile.TemporaryDirectory()
        self.config = Config(data_dir=Path(self.tmp.name), port=0, open_browser=False,
                             grace_seconds=grace_seconds, idle_seconds=idle_seconds,
                             keepalive_seconds=keepalive_seconds,
                             max_streams=max_streams)
        self.presence = Presence(grace_seconds, idle_seconds)
        self.server = build_server(self.config, self.presence)
        self.port = self.server.port
        self.server.start_in_thread()

    def close(self) -> None:
        self.server.stop()
        self.tmp.cleanup()

    def connection(self) -> http.client.HTTPConnection:
        return http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)

    def request(self, method: str, path: str, headers: Optional[Dict[str, str]] = None,
                body: Optional[bytes] = None) -> Tuple[int, dict, bytes]:
        conn = self.connection()
        try:
            conn.request(method, path, body=body, headers=headers or {})
            response = conn.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            conn.close()

    def get_json(self, path: str):
        status, _, body = self.request("GET", path)
        return status, json.loads(body.decode("utf-8"))

    def post_json(self, path: str, payload, headers: Optional[Dict[str, str]] = None):
        all_headers = {"Content-Type": "application/json"}
        all_headers.update(headers or {})
        status, _, body = self.request("POST", path, all_headers, json.dumps(payload).encode("utf-8"))
        return status, json.loads(body.decode("utf-8")) if body else None


def wait_until(condition: Callable[[], bool], timeout: float = 3.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if condition():
            return True
        time.sleep(0.02)
    return condition()
