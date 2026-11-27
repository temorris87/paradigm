"""The operating system's own file dialog, run through tkinter in a child process so tk never
runs in a server thread (tk wants the main thread, and one Tk per process).

The child prints {"path": ...} as JSON, or exits with code 3 when tkinter is missing or
cannot open a window. Anything else that goes wrong with the child (it fails to start, it
crashes, its output is garbled) also means "use Paradigm's own folder browser". A dialog left
open past TIMEOUT_SECONDS counts as a cancel.

The runner is injected (and looked up when used), so tests never open a dialog."""
import json
import logging
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, List, Optional

__all__ = ["PickResult", "CHILD_SCRIPT", "NO_TK_EXIT", "TIMEOUT_SECONDS", "pick", "run_child", "parse_result"]

log = logging.getLogger(__name__)

TIMEOUT_SECONDS = 600
NO_TK_EXIT = 3
# Set to "browser" to skip the native dialog: for tests, and a way out if it misbehaves.
MODE_VARIABLE = "PARADIGM_FILE_PICKER"

# argv: [start folder, dialog title]. ensure_ascii keeps the output safe in any code page.
CHILD_SCRIPT = """\
import json, sys
try:
    import tkinter
    from tkinter import filedialog
except ImportError:
    sys.exit(3)
try:
    root = tkinter.Tk()
except tkinter.TclError:
    sys.exit(3)
root.withdraw()
root.attributes("-topmost", True)
root.update()
root.focus_force()
chosen = filedialog.askopenfilename(parent=root, initialdir=sys.argv[1], title=sys.argv[2])
root.destroy()
path = chosen if isinstance(chosen, str) and chosen else None
sys.stdout.write(json.dumps({"path": path}, ensure_ascii=True))
sys.stdout.flush()
"""

Runner = Callable[..., subprocess.CompletedProcess]


@dataclass(frozen=True)
class PickResult:
    path: Optional[str] = None
    fallback: bool = False


def pick(start: str, title: str, runner: Optional[Runner] = None,
         environ: Optional[Dict[str, str]] = None) -> PickResult:
    """Opens the dialog at start and waits for it; the file picked, a cancel, or fallback."""
    environ = os.environ if environ is None else environ
    if environ.get(MODE_VARIABLE, "").strip().lower() == "browser":
        return PickResult(fallback=True)
    try:
        done = (runner or run_child)(_command(start, title))
    except subprocess.TimeoutExpired:
        return PickResult()
    except OSError as error:
        log.warning("The file dialog could not start: %s", error)
        return PickResult(fallback=True)
    return parse_result(done.returncode, done.stdout)


def run_child(args: List[str]) -> subprocess.CompletedProcess:
    # No console window for the child on Windows (the server may run under pythonw).
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) if sys.platform == "win32" else 0
    return subprocess.run(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,  # noqa: S603
                          stderr=subprocess.PIPE, timeout=TIMEOUT_SECONDS, creationflags=flags, check=False)


def parse_result(returncode: int, stdout: object) -> PickResult:
    if returncode == NO_TK_EXIT:
        return PickResult(fallback=True)
    if returncode != 0:
        log.warning("The file dialog failed (exit code %s)", returncode)
        return PickResult(fallback=True)
    text = stdout.decode("utf-8", "replace") if isinstance(stdout, bytes) else str(stdout or "")
    try:
        answer = json.loads(text.strip().splitlines()[-1]) if text.strip() else None
    except ValueError:
        answer = None
    if not isinstance(answer, dict) or not (answer.get("path") is None or isinstance(answer.get("path"), str)):
        log.warning("The file dialog answered something unexpected")
        return PickResult(fallback=True)
    path = answer.get("path")
    # tk answers C:/Users/...; Path gives this computer's own separators.
    return PickResult(path=str(Path(path)) if path else None)


def _command(start: str, title: str) -> List[str]:
    # -I: the child imports nothing from the current folder or PYTHON* settings.
    return [sys.executable, "-I", "-c", CHILD_SCRIPT, start, title]
