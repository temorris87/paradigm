"""A real Paradigm server on a free port, for tests."""
import http.client
import json
import tempfile
import time
from pathlib import Path
from typing import Callable, Tuple

from paradigm.app import build_server
from paradigm.config import Config
from paradigm.presence import Presence


class RunningServer:
    def __init__(self, grace_seconds: float = 0.2, keepalive_seconds: float = 15.0):
        self.tmp = tempfile.TemporaryDirectory()
        self.config = Config(data_dir=Path(self.tmp.name), port=0, open_browser=False,
                             grace_seconds=grace_seconds, keepalive_seconds=keepalive_seconds)
        self.presence = Presence(grace_seconds)
        self.server = build_server(self.config, self.presence)
        self.port = self.server.port
        self.server.start_in_thread()

    def close(self) -> None:
        self.server.stop()
        self.tmp.cleanup()

    def connection(self) -> http.client.HTTPConnection:
        return http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)

    def request(self, method: str, path: str) -> Tuple[int, dict, bytes]:
        conn = self.connection()
        try:
            conn.request(method, path)
            response = conn.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            conn.close()

    def get_json(self, path: str):
        status, _, body = self.request("GET", path)
        return status, json.loads(body.decode("utf-8"))


def wait_until(condition: Callable[[], bool], timeout: float = 3.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if condition():
            return True
        time.sleep(0.02)
    return condition()
