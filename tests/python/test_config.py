import unittest
from pathlib import Path

from paradigm.config import DEFAULT_PORT, STATIC_DIR, parse_args


class ConfigTest(unittest.TestCase):
    def test_defaults(self) -> None:
        config = parse_args([])
        self.assertEqual(config.host, "127.0.0.1")
        self.assertEqual(config.port, DEFAULT_PORT)
        self.assertEqual(config.data_dir, Path.home() / "paradigm-notes")
        self.assertTrue(config.open_browser)
        self.assertEqual(config.url, "http://127.0.0.1:8765/")

    def test_overrides(self) -> None:
        config = parse_args(["--port", "9000", "--data", "notes-here", "--no-browser"])
        self.assertEqual(config.port, 9000)
        self.assertEqual(config.data_dir, Path("notes-here"))
        self.assertFalse(config.open_browser)

    def test_static_dir_holds_the_page(self) -> None:
        self.assertTrue((STATIC_DIR / "index.html").is_file())


if __name__ == "__main__":
    unittest.main()
