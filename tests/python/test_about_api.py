"""GET /api/about (035): the data folder the server was started with, and the version."""
import unittest
from pathlib import Path

from helpers import RunningServer
from paradigm import __version__
from paradigm.api.about import AboutApi


class AboutApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.running = RunningServer()

    def tearDown(self) -> None:
        self.running.close()

    def test_about_gives_the_data_folder_and_version(self) -> None:
        status, body = self.running.get_json("/api/about")
        self.assertEqual(status, 200, body)
        self.assertEqual(body, {"data_folder": str(self.running.config.data_dir.absolute()),
                                "version": __version__})
        self.assertEqual(Path(body["data_folder"]), Path(self.running.tmp.name))


class AboutFolderTest(unittest.TestCase):
    def test_a_relative_data_folder_is_made_absolute(self) -> None:
        api = AboutApi(Path("sample-data"))
        folder = Path(api.about(None)["data_folder"])
        self.assertTrue(folder.is_absolute())
        self.assertEqual(folder, Path.cwd() / "sample-data")


if __name__ == "__main__":
    unittest.main()
