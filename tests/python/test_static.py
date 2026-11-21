import tempfile
import unittest
from pathlib import Path

from paradigm.web.static import resolve_static


class ResolveStaticTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        self.root = base / "static"
        (self.root / "js").mkdir(parents=True)
        (self.root / "index.html").write_text("page", encoding="utf-8")
        (self.root / "js" / "main.js").write_text("code", encoding="utf-8")
        (base / "secret.txt").write_text("secret", encoding="utf-8")

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def resolve(self, url_path: str):
        return resolve_static(self.root, url_path)

    def test_root_is_index(self) -> None:
        self.assertEqual(self.resolve("/").name, "index.html")

    def test_nested_file(self) -> None:
        self.assertEqual(self.resolve("/js/main.js").name, "main.js")

    def test_missing_file(self) -> None:
        self.assertIsNone(self.resolve("/nope.js"))

    def test_folder_is_not_served(self) -> None:
        self.assertIsNone(self.resolve("/js"))

    def test_paths_outside_root_are_refused(self) -> None:
        for path in ("/../secret.txt", "/%2e%2e/secret.txt", "/js/../../secret.txt",
                     "/..%5csecret.txt", "//etc/passwd", "/index.html%00.js"):
            with self.subTest(path=path):
                self.assertIsNone(self.resolve(path))


if __name__ == "__main__":
    unittest.main()
