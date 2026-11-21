import time
import unittest

from helpers import RunningServer, wait_until


class ServerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.running = RunningServer(grace_seconds=0.2)

    def tearDown(self) -> None:
        self.running.close()

    def open_stream(self, tab: str):
        conn = self.running.connection()
        conn.request("GET", "/api/events?tab=" + tab)
        response = conn.getresponse()
        self.assertEqual(response.status, 200)
        self.assertTrue(response.getheader("Content-Type").startswith("text/event-stream"))
        self.assertEqual(response.fp.readline(), b"retry: 2000\n")
        self.assertTrue(wait_until(lambda: self.running.presence.tab_count >= 1))
        return conn

    def test_ping_names_the_app(self) -> None:
        status, payload = self.running.get_json("/api/ping")
        self.assertEqual(status, 200)
        self.assertEqual(payload["app"], "paradigm")

    def test_serves_the_page(self) -> None:
        status, headers, body = self.running.request("GET", "/")
        self.assertEqual(status, 200)
        self.assertIn("text/html", headers["Content-Type"])
        self.assertIn(b"<title>Paradigm</title>", body)

    def test_javascript_content_type(self) -> None:
        status, headers, _ = self.running.request("GET", "/js/main.js")
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "text/javascript; charset=utf-8")

    def test_files_outside_static_are_refused(self) -> None:
        for path in ("/../CLAUDE.md", "/%2e%2e/CLAUDE.md", "/../paradigm/app.py"):
            with self.subTest(path=path):
                status, _, _ = self.running.request("GET", path)
                self.assertEqual(status, 404)

    def test_wrong_method_on_a_route(self) -> None:
        status, _, _ = self.running.request("POST", "/api/ping")
        self.assertEqual(status, 405)

    def test_stream_needs_a_tab_id(self) -> None:
        for path in ("/api/events", "/api/events?tab=", "/api/events?tab=bad%20id"):
            with self.subTest(path=path):
                status, _, _ = self.running.request("GET", path)
                self.assertEqual(status, 400)

    def test_closing_the_last_tab_stops(self) -> None:
        stream = self.open_stream("tab1")
        status, _, _ = self.running.request("POST", "/api/closing?tab=tab1")
        self.assertEqual(status, 204)
        stream.close()
        self.assertTrue(wait_until(self.running.presence.should_stop))

    def test_dropped_stream_without_beacon_keeps_running(self) -> None:
        stream = self.open_stream("tab1")
        stream.close()
        self.assertTrue(wait_until(lambda: self.running.presence.tab_count == 0))
        time.sleep(0.5)
        self.assertFalse(self.running.presence.should_stop())

    def test_stop_ends_open_streams(self) -> None:
        self.open_stream("tab1")
        self.running.server.stop_event.set()
        self.assertTrue(wait_until(lambda: self.running.presence.tab_count == 0))


class KeepAliveTest(unittest.TestCase):
    def test_stream_sends_keep_alive(self) -> None:
        running = RunningServer(keepalive_seconds=0.1)
        try:
            conn = running.connection()
            conn.request("GET", "/api/events?tab=tab1")
            response = conn.getresponse()
            self.assertEqual(response.fp.readline(), b"retry: 2000\n")
            self.assertEqual(response.fp.readline(), b"\n")
            self.assertEqual(response.fp.readline(), b": keep-alive\n")
            conn.close()
        finally:
            running.close()


if __name__ == "__main__":
    unittest.main()
