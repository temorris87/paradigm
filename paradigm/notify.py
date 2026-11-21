"""Telling the user that Paradigm could not start: in the console, or in a message box
when there is no console (paradigm.pyw runs under pythonw.exe, which has none)."""
import os
import sys

TITLE = "Paradigm"
# MessageBoxW flags: an OK button, the error icon, and on top of other windows so a
# box raised by a windowless process is not hidden behind File Explorer.
_MB_OK = 0x0
_MB_ICONERROR = 0x10
_MB_TOPMOST = 0x40000


def show_error_box(message: str) -> None:
    """A Windows message box; elsewhere (or if that fails) stderr, when there is one."""
    if os.name == "nt":
        try:
            import ctypes

            ctypes.windll.user32.MessageBoxW(None, message, TITLE,
                                             _MB_OK | _MB_ICONERROR | _MB_TOPMOST)
            return
        except (AttributeError, OSError):
            pass
    if sys.stderr is not None:
        print(message, file=sys.stderr)


def pause_console() -> None:
    """Keep a double-clicked console window open long enough to read an error."""
    if os.name != "nt" or sys.stdin is None or not sys.stdin.isatty():
        return
    try:
        input("Press Enter to close...")
    except (EOFError, KeyboardInterrupt):
        pass
