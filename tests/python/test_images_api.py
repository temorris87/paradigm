import json
import os
import unittest

from helpers import RunningServer
from image_samples import png
from paradigm.app import build_server
from paradigm.presence import Presence


class ImagesApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.running = RunningServer()
        status, payload = self.running.get_json("/api/notes")
        self.note_id = payload["notes"][0]["id"]

    def tearDown(self) -> None:
        self.running.close()

    def upload(self, data, note_id=None, headers=None):
        all_headers = {"Content-Type": "image/png"}
        all_headers.update(headers or {})
        path = "/api/image/upload?note={}".format(self.note_id if note_id is None else note_id)
        status, _, body = self.running.request("POST", path, all_headers, data)
        return status, json.loads(body.decode("utf-8"))

    def test_upload_then_fetch(self) -> None:
        data = png(6, 4)
        status, added = self.upload(data)
        self.assertEqual(status, 200, added)
        self.assertEqual((added["width"], added["height"]), (6, 4))
        status, headers, body = self.running.request("GET", added["url"])
        self.assertEqual((status, body), (200, data))
        self.assertEqual(headers["Content-Type"], "image/png")
        self.assertIn("immutable", headers["Cache-Control"])
        self.assertEqual(headers["Content-Disposition"], "inline")
        self.assertEqual(headers["X-Content-Type-Options"], "nosniff")

    def test_the_browser_type_is_ignored(self) -> None:
        status, added = self.upload(png(2, 2), headers={"Content-Type": "text/html"})
        self.assertEqual((status, added["mime"]), (200, "image/png"))

    def test_bad_uploads(self) -> None:
        cases = [
            (b"<svg xmlns='http://www.w3.org/2000/svg'></svg>", None, 400),
            (b"", None, 400),
            (png(2, 2), 999, 404),
        ]
        for data, note_id, expected in cases:
            with self.subTest(expected=expected, data=data[:10]):
                status, payload = self.upload(data, note_id)
                self.assertEqual(status, expected)
                self.assertIn("error", payload)
        status, _, _ = self.running.request("POST", "/api/image/upload?note=x", {}, png(2, 2))
        self.assertEqual(status, 400)

    def test_unknown_image_is_404(self) -> None:
        for path, expected in (("/api/image?id=999", 404), ("/api/image?id=a", 400), ("/api/image", 400)):
            with self.subTest(path):
                self.assertEqual(self.running.request("GET", path)[0], expected)

    def test_a_cross_site_upload_is_refused(self) -> None:
        status, _ = self.upload(png(2, 2), headers={"Origin": "http://evil.example", "Sec-Fetch-Site": "cross-site"})
        self.assertEqual(status, 403)

    def test_get_with_post_is_405(self) -> None:
        self.assertEqual(self.running.request("POST", "/api/image?id=1", {}, b"")[0], 405)


class UnusedImagesTest(unittest.TestCase):
    """Images with no link left go when the server stops (no tab open) or starts."""

    def setUp(self) -> None:
        self.running = RunningServer()

    def tearDown(self) -> None:
        self.running.close()

    def restart(self) -> None:
        if not self.running.server.stop_event.is_set():
            self.running.server.stop()
        self.running.server = build_server(self.running.config, Presence(0.2))
        self.running.port = self.running.server.port
        self.running.server.start_in_thread()

    def test_an_unlinked_image_is_gone_after_a_restart(self) -> None:
        _, payload = self.running.get_json("/api/notes")
        note_id = payload["notes"][0]["id"]
        kept, dropped = [], []
        for target, size in ((kept, 3), (dropped, 4)):
            status, _, body = self.running.request("POST", "/api/image/upload?note={}".format(note_id), {}, png(size, size))
            target.append(json.loads(body.decode("utf-8"))["url"])
        _, note = self.running.get_json("/api/note?id={}".format(note_id))
        body = "![a]({})".format(kept[0])
        status, _ = self.running.post_json("/api/note/save", {"id": note_id, "body": body, "version": note["version"]})
        self.assertEqual(status, 200)
        # While the server runs, nothing goes: an undo could still bring the link back.
        self.assertEqual(self.running.request("GET", dropped[0])[0], 200)
        self.restart()
        self.assertEqual(self.running.request("GET", kept[0])[0], 200)
        self.assertEqual(self.running.request("GET", dropped[0])[0], 404)

    def test_deleted_at_stop_then_the_file_shrinks_at_the_next_start(self) -> None:
        _, payload = self.running.get_json("/api/notes")
        note_id = payload["notes"][0]["id"]
        # A PNG header and 2 MB of noise: only the header is read, and noise doesn't compress.
        big = png(1000, 1000)[:33] + os.urandom(2_000_000)
        status, _, _ = self.running.request("POST", "/api/image/upload?note={}".format(note_id), {}, big)
        self.assertEqual(status, 200)
        db_file = self.running.config.data_dir / "paradigm.db"
        self.running.server.stop()  # no tab open: the stop deletes the unlinked image
        self.assertGreater(db_file.stat().st_size, 2_000_000, "the stop doesn't vacuum")
        self.restart()  # this start deletes nothing, but the file is mostly free space
        self.assertLess(db_file.stat().st_size, 400_000)


if __name__ == "__main__":
    unittest.main()
