import unittest

from helpers import RunningServer, wait_until
from paradigm.web.security import (DIAGRAM_FRAME_HEADERS, SECURITY_HEADERS, headers_for,
                                    refusal_reason)

PORT = 8765


def reason(path="/api/ping", **headers):
    named = {key.replace("_", "-"): value for key, value in headers.items()}
    named.setdefault("Host", "127.0.0.1:{}".format(PORT))
    return refusal_reason(path, named, PORT)


class HostTest(unittest.TestCase):
    def test_local_hosts_are_allowed(self) -> None:
        for host in ("127.0.0.1:8765", "localhost:8765", "LOCALHOST:8765"):
            with self.subTest(host=host):
                self.assertIsNone(reason(Host=host))

    def test_other_hosts_are_refused_everywhere(self) -> None:
        # DNS rebinding: a hostile domain pointed at 127.0.0.1 arrives with its own Host.
        for host in ("evil.example:8765", "127.0.0.1:9999", "127.0.0.1", "localhost", "",
                     "127.0.0.1:8765.evil.example"):
            for path in ("/api/ping", "/", "/js/main.js"):
                with self.subTest(host=host, path=path):
                    self.assertIsNotNone(reason(path, Host=host))


class OriginTest(unittest.TestCase):
    def test_own_origin_is_allowed(self) -> None:
        for origin in ("http://127.0.0.1:8765", "http://localhost:8765"):
            with self.subTest(origin=origin):
                self.assertIsNone(reason(Origin=origin, Sec_Fetch_Site="same-origin"))

    def test_no_browser_headers_is_a_local_program(self) -> None:
        self.assertIsNone(reason())

    def test_foreign_origins_are_refused_on_the_api(self) -> None:
        for origin in ("http://evil.example", "null", "https://127.0.0.1:8765",
                       "http://127.0.0.1:9999", "http://localhost:8765.evil.example"):
            with self.subTest(origin=origin):
                self.assertIsNotNone(reason(Origin=origin))

    def test_null_origin_only_with_same_origin_fetch(self) -> None:
        self.assertIsNone(reason(Origin="null", Sec_Fetch_Site="same-origin"))
        self.assertIsNotNone(reason(Origin="null", Sec_Fetch_Site="cross-site"))
        self.assertIsNotNone(reason(Origin="null"))

    def test_cross_site_fetches_are_refused_on_the_api(self) -> None:
        for site in ("cross-site", "same-site", "Cross-Site"):
            with self.subTest(site=site):
                self.assertIsNotNone(reason(Sec_Fetch_Site=site))
        for site in ("same-origin", "none"):
            with self.subTest(site=site):
                self.assertIsNone(reason(Sec_Fetch_Site=site))

    def test_static_files_skip_the_origin_check(self) -> None:
        self.assertIsNone(reason("/", Origin="http://evil.example", Sec_Fetch_Site="cross-site"))


FRAME_CSP = ("default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
             "object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'")


class HeadersForTest(unittest.TestCase):
    def test_the_diagram_frame_gets_its_own_policy(self) -> None:
        headers = dict(headers_for("/diagram-frame.html"))
        self.assertEqual(headers["Content-Security-Policy"], FRAME_CSP)
        self.assertEqual(headers["X-Frame-Options"], "SAMEORIGIN")

    def test_the_frame_keeps_the_other_headers(self) -> None:
        strict, frame = dict(SECURITY_HEADERS), dict(DIAGRAM_FRAME_HEADERS)
        self.assertEqual(set(frame), set(strict))
        for name in strict:
            if name not in ("Content-Security-Policy", "X-Frame-Options"):
                with self.subTest(name=name):
                    self.assertEqual(frame[name], strict[name])

    def test_every_other_path_keeps_the_strict_policy(self) -> None:
        for path in ("/", "", "/index.html", "/note.html", "/api/ping", "/missing",
                     "/js/diagrams/frame-main.js", "/diagram-frame.html/", "/x/diagram-frame.html",
                     "/DIAGRAM-FRAME.HTML", "/diagram%2Dframe.html", "//diagram-frame.html"):
            with self.subTest(path=path):
                self.assertIs(headers_for(path), SECURITY_HEADERS)


class ServerSecurityTest(unittest.TestCase):
    def setUp(self) -> None:
        self.running = RunningServer(max_streams=2)
        self.own = "http://127.0.0.1:{}".format(self.running.port)

    def tearDown(self) -> None:
        self.running.close()

    def test_wrong_host_is_refused(self) -> None:
        for path in ("/", "/api/ping"):
            with self.subTest(path=path):
                status, _, body = self.running.request("GET", path, {"Host": "evil.example"})
                self.assertEqual(status, 403)
                self.assertNotIn(b"Paradigm", body)

    def test_forged_closing_beacon_is_refused(self) -> None:
        status, _, _ = self.running.request(
            "POST", "/api/closing?tab=x", {"Origin": "http://evil.example"})
        self.assertEqual(status, 403)
        status, _, _ = self.running.request("POST", "/api/closing?tab=x", {"Origin": self.own})
        self.assertEqual(status, 204)

    def test_cross_site_event_stream_is_refused(self) -> None:
        status, _, _ = self.running.request(
            "GET", "/api/events?tab=x", {"Sec-Fetch-Site": "cross-site"})
        self.assertEqual(status, 403)
        self.assertEqual(self.running.presence.tab_count, 0)

    def test_security_headers_on_every_response(self) -> None:
        for method, path in (("GET", "/"), ("GET", "/js/main.js"), ("GET", "/api/ping"),
                             ("GET", "/missing"), ("POST", "/api/ping")):
            with self.subTest(path=path):
                _, headers, _ = self.running.request(method, path)
                self.assertIn("frame-ancestors 'none'", headers["Content-Security-Policy"])
                self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
                self.assertEqual(headers["X-Frame-Options"], "DENY")
                self.assertEqual(headers["Referrer-Policy"], "same-origin")

    def test_diagram_frame_headers(self) -> None:
        for path in ("/diagram-frame.html", "/diagram-frame.html?x=1"):
            for method in ("GET", "HEAD"):
                with self.subTest(path=path, method=method):
                    _, headers, _ = self.running.request(method, path)
                    self.assertEqual(headers["Content-Security-Policy"], FRAME_CSP)
                    self.assertEqual(headers["X-Frame-Options"], "SAMEORIGIN")
                    self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
                    self.assertEqual(headers["Referrer-Policy"], "same-origin")

    def test_the_query_does_not_pick_the_frame_policy(self) -> None:
        for path in ("/?p=/diagram-frame.html", "/note.html?diagram-frame.html",
                     "/api/ping?path=/diagram-frame.html", "/note.html", "/unknown"):
            with self.subTest(path=path):
                _, headers, _ = self.running.request("GET", path)
                self.assertIn("frame-ancestors 'none'", headers["Content-Security-Policy"])
                self.assertNotIn("unsafe-inline", headers["Content-Security-Policy"])
                self.assertEqual(headers["X-Frame-Options"], "DENY")

    def try_stream(self, tab: str):
        """Open an event stream; the response if it opened, else None (closed)."""
        conn = self.running.connection()
        conn.request("GET", "/api/events?tab=" + tab)
        response = conn.getresponse()
        if response.status == 200:
            return response
        response.read()
        response.close()
        return None

    def test_stream_limit(self) -> None:
        first, second = self.try_stream("a"), self.try_stream("b")
        self.assertIsNotNone(first)
        self.assertIsNotNone(second)
        self.assertIsNone(self.try_stream("c"))  # 503: the cap is 2
        first.close()
        opened = []
        # The slot frees once the server notices the closed stream.
        self.assertTrue(wait_until(lambda: opened.append(self.try_stream("c")) or opened[-1]))
        opened[-1].close()
        second.close()

if __name__ == "__main__":
    unittest.main()
