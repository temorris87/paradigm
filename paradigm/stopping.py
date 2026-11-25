"""Ctrl-C while Paradigm stops: noted, never allowed to cut the stop short part-way."""
import contextlib
import signal
import threading
from typing import Callable, Iterator


@contextlib.contextmanager
def ctrl_c_ignored(on_press: Callable[[], object]) -> Iterator[None]:
    """While active, Ctrl-C (SIGINT, on Windows, Mac and Linux alike) only calls on_press().

    The default handler raises KeyboardInterrupt wherever the main thread happens to be, which
    would skip the rest of the stop (the tidy-up, closing the database). signal.signal only
    works in the main thread, so elsewhere (run() in a test thread) this does nothing.
    """
    if threading.current_thread() is not threading.main_thread():
        yield
        return
    previous = signal.getsignal(signal.SIGINT)

    def pressed(signum: int, frame: object) -> None:
        on_press()

    signal.signal(signal.SIGINT, pressed)
    try:
        yield
    finally:
        # None: a handler not set from Python; the default is the closest we can put back.
        signal.signal(signal.SIGINT, previous if previous is not None else signal.SIG_DFL)
