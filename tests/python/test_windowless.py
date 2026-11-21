import contextlib
import io
import logging
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import paradigm.app as app_module
from paradigm.logging_setup import close_logging, setup_logging
from paradigm.notify import show_error_box
from test_app import OtherServer


class LoggingTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()

    def tearDown(self) -> None:
        close_logging()
        self.tmp.cleanup()

    def handler_types(self):
        return [type(h) for h in logging.getLogger("paradigm").handlers]

    def test_console_mode_logs_to_console_and_file(self) -> None:
        log_path = setup_logging(Path(self.tmp.name), console=True)
        self.assertIn(logging.StreamHandler, self.handler_types())
        logging.getLogger("paradigm").info("hello")
        self.assertIn("hello", log_path.read_text(encoding="utf-8"))

    def test_windowless_mode_logs_to_file_only(self) -> None:
        setup_logging(Path(self.tmp.name), console=False)
        self.assertNotIn(logging.StreamHandler, self.handler_types())
        self.assertEqual(len(self.handler_types()), 1)  # the file handler (a StreamHandler subclass)


class WindowlessMainTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.other = OtherServer()

    def tearDown(self) -> None:
        close_logging()
        self.other.close()
        self.tmp.cleanup()

    def argv(self):
        return ["--data", self.tmp.name, "--port", str(self.other.port), "--no-browser"]

    def test_failed_start_shows_a_message_box(self) -> None:
        with mock.patch.object(app_module, "show_error_box") as box, \
                mock.patch.object(app_module, "pause_console") as pause:
            code = app_module.main(self.argv(), console=False)
        self.assertEqual(code, 1)
        box.assert_called_once()
        self.assertIn("in use by another program", box.call_args[0][0])
        pause.assert_not_called()

    def test_console_start_failure_pauses_instead(self) -> None:
        with mock.patch.object(app_module, "show_error_box") as box, \
                mock.patch.object(app_module, "pause_console") as pause, \
                contextlib.redirect_stderr(io.StringIO()):
            code = app_module.main(self.argv(), console=True)
        self.assertEqual(code, 1)
        box.assert_not_called()
        pause.assert_called_once()

    def test_unexpected_error_points_at_the_log(self) -> None:
        with mock.patch.object(app_module, "show_error_box") as box, \
                mock.patch.object(app_module, "run", side_effect=RuntimeError("boom")):
            code = app_module.main(["--data", self.tmp.name], console=False)
        self.assertEqual(code, 1)
        self.assertIn("paradigm.log", box.call_args[0][0])


class ShowErrorBoxTest(unittest.TestCase):
    def test_without_windows_it_prints_to_stderr(self) -> None:
        err = io.StringIO()
        with mock.patch("paradigm.notify.os.name", "posix"), contextlib.redirect_stderr(err):
            show_error_box("Port 1 is in use")
        self.assertIn("Port 1 is in use", err.getvalue())

    def test_no_stderr_at_all_is_fine(self) -> None:
        # pythonw.exe has no stderr: nothing to print to, and no crash.
        with mock.patch("paradigm.notify.os.name", "posix"), \
                mock.patch("paradigm.notify.sys.stderr", None):
            show_error_box("anything")


class EntryFilesTest(unittest.TestCase):
    def test_pyw_starts_without_a_console(self) -> None:
        root = Path(__file__).resolve().parents[2]
        source = (root / "paradigm.pyw").read_text(encoding="utf-8")
        self.assertIn("main(console=False)", source)


if __name__ == "__main__":
    unittest.main()
