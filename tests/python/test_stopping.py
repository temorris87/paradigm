import signal
import threading
import unittest

from paradigm.stopping import ctrl_c_ignored


class CtrlCIgnoredTest(unittest.TestCase):
    def setUp(self) -> None:
        self.assertIs(threading.current_thread(), threading.main_thread())
        self.before = signal.getsignal(signal.SIGINT)

    def tearDown(self) -> None:
        signal.signal(signal.SIGINT, self.before)

    def test_ctrl_c_only_calls_on_press_while_active(self) -> None:
        presses = []
        with ctrl_c_ignored(lambda: presses.append(1)):
            signal.raise_signal(signal.SIGINT)
            signal.raise_signal(signal.SIGINT)
        self.assertEqual(presses, [1, 1])

    def test_previous_handler_is_back_afterwards(self) -> None:
        signal.signal(signal.SIGINT, signal.default_int_handler)
        with ctrl_c_ignored(lambda: None):
            pass
        self.assertIs(signal.getsignal(signal.SIGINT), signal.default_int_handler)
        with self.assertRaises(KeyboardInterrupt):
            signal.raise_signal(signal.SIGINT)

    def test_handler_restored_when_the_body_raises(self) -> None:
        signal.signal(signal.SIGINT, signal.default_int_handler)
        with self.assertRaises(ValueError):
            with ctrl_c_ignored(lambda: None):
                raise ValueError("boom")
        self.assertIs(signal.getsignal(signal.SIGINT), signal.default_int_handler)

    def test_off_the_main_thread_does_nothing(self) -> None:
        signal.signal(signal.SIGINT, signal.default_int_handler)
        seen = []
        errors = []

        def body() -> None:
            try:
                with ctrl_c_ignored(lambda: None):
                    seen.append(signal.getsignal(signal.SIGINT))
            except Exception as error:
                errors.append(error)

        thread = threading.Thread(target=body)
        thread.start()
        thread.join(timeout=5)
        self.assertEqual(errors, [])
        self.assertEqual(seen, [signal.default_int_handler])
        self.assertIs(signal.getsignal(signal.SIGINT), signal.default_int_handler)


if __name__ == "__main__":
    unittest.main()
