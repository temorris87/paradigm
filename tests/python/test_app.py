import http.client
import socket
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from helpers import RunningServer
from paradigm.app import LaunchError, run
from paradigm.config import Config
from paradigm.instance import PortState, probe


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class OtherHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        self.send_response(404)
        self.end_headers()

    def log_message(self, *args: object) -> None:
        pass


class OtherServer:
    """Some other program on the port."""

    def __init__(self) -> None:
        self.server = HTTPServer(("127.0.0.1", 0), OtherHandler)
        self.port = self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()


class ProbeTest(unittest.TestCase):
    def test_free_port(self) -> None:
        self.assertIs(probe("127.0.0.1", free_port()), PortState.FREE)

    def test_paradigm(self) -> None:
        running = RunningServer()
        try:
            self.assertIs(probe("127.0.0.1", running.port), PortState.PARADIGM)
        finally:
            running.close()

    def test_other_program(self) -> None:
        other = OtherServer()
        try:
            self.assertIs(probe("127.0.0.1", other.port), PortState.OTHER)
        finally:
            other.close()


class FullLaunchTest(unittest.TestCase):
    def test_starts_opens_the_page_and_stops_when_the_tab_closes(self) -> None:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        port = free_port()
        config = Config(data_dir=Path(tmp.name), port=port, grace_seconds=0.2)
        visits = []

        def browser(url: str) -> None:
            # Behave like a tab: open the stream, then close it with a beacon.
            def tab() -> None:
                conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                conn.request("GET", "/api/events?tab=t1")
                stream = conn.getresponse()
                stream.fp.readline()
                beacon = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                beacon.request("POST", "/api/closing?tab=t1")
                beacon.getresponse().read()
                beacon.close()
                stream.close()
            visits.append(url)
            threading.Thread(target=tab, daemon=True).start()

        result = []
        runner = threading.Thread(
            target=lambda: result.append(run(config, open_url=browser)), daemon=True
        )
        runner.start()
        runner.join(timeout=10)
        self.assertFalse(runner.is_alive(), "server did not stop after the tab closed")
        self.assertEqual(result, [0])
        self.assertEqual(visits, [config.url])
        self.assertIs(probe("127.0.0.1", port), PortState.FREE)


class SecondLaunchTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.opened = []

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def config(self, port: int, open_browser: bool = True) -> Config:
        return Config(data_dir=Path(self.tmp.name), port=port, open_browser=open_browser)

    def test_reuses_a_running_paradigm(self) -> None:
        running = RunningServer()
        try:
            code = run(self.config(running.port), open_url=self.opened.append)
        finally:
            running.close()
        self.assertEqual(code, 0)
        self.assertEqual(self.opened, ["http://127.0.0.1:{}/".format(running.port)])

    def test_no_browser_opens_nothing(self) -> None:
        running = RunningServer()
        try:
            run(self.config(running.port, open_browser=False), open_url=self.opened.append)
        finally:
            running.close()
        self.assertEqual(self.opened, [])

    def test_port_taken_by_another_program(self) -> None:
        other = OtherServer()
        try:
            with self.assertRaises(LaunchError):
                run(self.config(other.port), open_url=self.opened.append)
        finally:
            other.close()
        self.assertEqual(self.opened, [])


if __name__ == "__main__":
    unittest.main()
