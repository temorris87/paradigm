import errno
import http.client
import socket
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from helpers import RunningServer
from paradigm.app import LaunchError, port_error_message, run
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


def visit_and_close_tab(port: int, tab: str = "t1") -> None:
    """Behave like a browser tab: open the event stream, then close it with a beacon."""
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    conn.request("GET", "/api/events?tab=" + tab)
    stream = conn.getresponse()
    stream.fp.readline()
    beacon = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    beacon.request("POST", "/api/closing?tab=" + tab)
    beacon.getresponse().read()
    beacon.close()
    stream.close()


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
            visits.append(url)
            threading.Thread(target=visit_and_close_tab, args=(port,), daemon=True).start()

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

    def test_free_port_is_never_probed(self) -> None:
        # Asking an empty port is slow on Windows, so a free port must not be probed.
        probed = []
        port = free_port()
        config = Config(data_dir=Path(self.tmp.name), port=port, grace_seconds=0.1)

        def browser(url: str) -> None:
            threading.Thread(target=visit_and_close_tab, args=(port,), daemon=True).start()

        def probe_port(host: str, port: int) -> PortState:
            probed.append(port)
            return PortState.FREE

        result = []
        runner = threading.Thread(
            target=lambda: result.append(run(config, open_url=browser, probe_port=probe_port)),
            daemon=True,
        )
        runner.start()
        runner.join(timeout=10)
        self.assertEqual(result, [0])
        self.assertEqual(probed, [])


class PortErrorMessageTest(unittest.TestCase):
    def error(self, code: int, winerror: int = 0) -> OSError:
        error = OSError(code, "boom")
        if winerror:
            error.winerror = winerror
        return error

    def test_in_use(self) -> None:
        message = port_error_message(8765, self.error(errno.EADDRINUSE))
        self.assertIn("in use by another program", message)
        message = port_error_message(8765, self.error(0, winerror=10048))
        self.assertIn("in use by another program", message)

    def test_reserved_or_blocked(self) -> None:
        message = port_error_message(8765, self.error(errno.EACCES))
        self.assertIn("reserved or blocked", message)
        message = port_error_message(8765, self.error(0, winerror=10013))
        self.assertIn("excludedportrange", message)

    def test_anything_else_shows_the_error(self) -> None:
        message = port_error_message(8765, self.error(errno.EINVAL))
        self.assertIn("boom", message)


if __name__ == "__main__":
    unittest.main()
