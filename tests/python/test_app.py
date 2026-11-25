import errno
import http.client
import os
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from helpers import RunningServer
from paradigm import app
from paradigm.app import LaunchError, port_error_message, run, stop_message
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


def visit_and_drop_tab(port: int, tab: str = "t1") -> None:
    """Behave like Safari closing a tab: the event stream drops and no beacon is sent."""
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    conn.request("GET", "/api/events?tab=" + tab)
    stream = conn.getresponse()
    stream.fp.readline()
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

    def run_with_tab(self, config: Config, tab_action) -> list:
        def browser(url: str) -> None:
            threading.Thread(target=tab_action, args=(config.port,), daemon=True).start()

        result = []
        with self.assertLogs("paradigm", level="INFO") as logs:
            runner = threading.Thread(
                target=lambda: result.append(run(config, open_url=browser)), daemon=True
            )
            runner.start()
            runner.join(timeout=10)
        self.assertFalse(runner.is_alive(), "server did not stop")
        self.assertEqual(result, [0])
        return [record.getMessage() for record in logs.records]

    def test_beacon_logs_last_tab_closed(self) -> None:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        config = Config(data_dir=Path(tmp.name), port=free_port(), grace_seconds=0.2,
                        idle_seconds=30)
        messages = self.run_with_tab(config, visit_and_close_tab)
        self.assertIn("Last tab closed", messages)
        self.assertEqual(messages[-1], "Paradigm stopped")

    def test_stops_when_the_tab_drops_without_a_beacon(self) -> None:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        port = free_port()
        config = Config(data_dir=Path(tmp.name), port=port, grace_seconds=0.1,
                        idle_seconds=0.5)
        messages = self.run_with_tab(config, visit_and_drop_tab)
        self.assertIn("No tab for 0.5 s", messages)
        self.assertNotIn("Last tab closed", messages)
        self.assertEqual(messages[-1], "Paradigm stopped")
        self.assertIs(probe("127.0.0.1", port), PortState.FREE)


REPO_ROOT = Path(__file__).resolve().parents[2]


class SecondCtrlCTest(unittest.TestCase):
    """A Ctrl-C while stopping is noted and ignored: the stop still runs to the end."""

    def setUp(self) -> None:
        self.assertIs(threading.current_thread(), threading.main_thread())
        before = signal.getsignal(signal.SIGINT)
        self.addCleanup(signal.signal, signal.SIGINT, before)
        signal.signal(signal.SIGINT, signal.default_int_handler)
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.data = Path(tmp.name)
        self.ran = []

    def install_with_ctrl_c_during_stop(self):
        """install_apis, with each stop hook recorded and a Ctrl-C raised before the tidy-up."""
        original = app.install_apis

        def install(server, config, presence) -> None:
            original(server, config, presence)
            server.on_close[:] = [self.recorded(name, close) for name, close in
                                  zip(("tidy", "db.close"), server.on_close)]
            server.on_close.insert(0, lambda: signal.raise_signal(signal.SIGINT))

        return mock.patch.object(app, "install_apis", install)

    def recorded(self, name: str, close):
        def run_it() -> None:
            close()
            self.ran.append(name)
        return run_it

    def test_second_ctrl_c_after_the_first(self) -> None:
        config = Config(data_dir=self.data, port=free_port(), open_browser=False)
        with self.install_with_ctrl_c_during_stop(), \
                mock.patch.object(app, "wait_for_stop", side_effect=KeyboardInterrupt), \
                self.assertLogs("paradigm", level="INFO") as logs:
            code = run(config)
        messages = [record.getMessage() for record in logs.records]
        self.assertEqual(code, 0)
        self.assertEqual(self.ran, ["tidy", "db.close"])
        stopping = messages.index("Stopping (Ctrl-C)")
        self.assertIn("Already stopping - please wait", messages[stopping:])
        self.assertEqual(messages[-1], "Paradigm stopped")
        self.assertIs(probe("127.0.0.1", config.port), PortState.FREE)

    def test_ctrl_c_while_stopping_after_the_last_tab_closed(self) -> None:
        port = free_port()
        config = Config(data_dir=self.data, port=port, grace_seconds=0.2, idle_seconds=30)

        def browser(url: str) -> None:
            threading.Thread(target=visit_and_close_tab, args=(port,), daemon=True).start()

        with self.install_with_ctrl_c_during_stop(), \
                self.assertLogs("paradigm", level="INFO") as logs:
            code = run(config, open_url=browser)
        messages = [record.getMessage() for record in logs.records]
        self.assertEqual(code, 0)
        self.assertEqual(self.ran, ["tidy", "db.close"])
        closed = messages.index("Last tab closed")
        self.assertIn("Already stopping - please wait", messages[closed:])
        self.assertEqual(messages[-1], "Paradigm stopped")

    def test_ctrl_c_handler_is_back_after_run(self) -> None:
        config = Config(data_dir=self.data, port=free_port(), open_browser=False)
        with mock.patch.object(app, "wait_for_stop", side_effect=KeyboardInterrupt), \
                self.assertLogs("paradigm", level="INFO"):
            run(config)
        self.assertIs(signal.getsignal(signal.SIGINT), signal.default_int_handler)


@unittest.skipIf(os.name == "nt", "SIGINT to a child process is a console event on Windows")
class CtrlCProcessTest(unittest.TestCase):
    """A real paradigm.py on sample data in a temporary folder."""

    def start(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.log_path = Path(tmp.name) / "paradigm.log"
        self.port = free_port()
        process = subprocess.Popen(
            [sys.executable, str(REPO_ROOT / "paradigm.py"), "--data", tmp.name,
             "--no-browser", "--port", str(self.port)],
            cwd=str(REPO_ROOT), stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        self.addCleanup(self.kill, process)
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            if self.log_path.exists() and "Paradigm running" in self.log_text():
                return process
            if process.poll() is not None:
                break
            time.sleep(0.05)
        self.fail("paradigm.py did not start")

    def kill(self, process) -> None:
        if process.poll() is None:
            process.kill()
        process.wait(timeout=10)
        process.stderr.close()

    def log_text(self) -> str:
        return self.log_path.read_text(encoding="utf-8")

    def stopped_cleanly(self, process) -> str:
        code = process.wait(timeout=20)
        stderr = process.stderr.read().decode("utf-8", "replace")
        text = self.log_text()
        self.assertEqual(code, 0, stderr)
        self.assertTrue(text.rstrip().endswith("Paradigm stopped"), text)
        self.assertNotIn("Traceback", text + stderr)
        self.assertIs(probe("127.0.0.1", self.port), PortState.FREE)
        return text

    def test_two_ctrl_c(self) -> None:
        process = self.start()
        process.send_signal(signal.SIGINT)
        time.sleep(0.1)
        if process.poll() is None:
            process.send_signal(signal.SIGINT)
        text = self.stopped_cleanly(process)
        self.assertIn("Stopping (Ctrl-C)", text)

    def test_one_ctrl_c(self) -> None:
        process = self.start()
        process.send_signal(signal.SIGINT)
        text = self.stopped_cleanly(process)
        self.assertIn("Stopping (Ctrl-C)", text)
        self.assertNotIn("Already stopping", text)


class StopMessageTest(unittest.TestCase):
    def test_beacon(self) -> None:
        self.assertEqual(stop_message("beacon", 60.0), "Last tab closed")

    def test_idle(self) -> None:
        self.assertEqual(stop_message("idle", 60.0), "No tab for 60 s")


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
