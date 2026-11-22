"""Reading a synced OneDrive folder on this computer, and opening a file in it with the
program the computer uses for it. The folder on disk is the source of truth: Paradigm only
keeps the paths. Nothing here talks to the network.

Only paths inside a linked folder are ever listed or opened (inside() checks every one)."""
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Dict, Iterator, List, Optional

__all__ = ["BadFolder", "onedrive_roots", "clean_folder", "list_files", "list_folders", "inside", "open_file"]

# More than any project folder holds; past this a folder is read only this far.
MAX_FILES = 5000
MAX_FOLDERS = 3000
MAX_DEPTH = 8
MAX_PATH_LENGTH = 1000
# Office's lock files ("~$Report.docx") and the like are never real files.
_SKIP_PREFIXES = ("~$", ".")
_SKIP_NAMES = {"desktop.ini", "thumbs.db", ".ds_store"}
# Where Windows says OneDrive syncs to (the work one first).
_ROOT_VARIABLES = ("OneDriveCommercial", "OneDrive", "OneDriveConsumer")


class BadFolder(ValueError):
    pass


def onedrive_roots(environ: Optional[Dict[str, str]] = None) -> List[Path]:
    """The OneDrive folders this computer syncs, else the home folder."""
    environ = os.environ if environ is None else environ
    found: List[Path] = []
    for name in _ROOT_VARIABLES:
        value = environ.get(name)
        if value and Path(value).is_dir() and Path(value) not in found:
            found.append(Path(value))
    return found or [Path.home()]


def clean_folder(raw: object) -> Path:
    """An existing folder on this computer, as an absolute path."""
    if not isinstance(raw, str) or not raw.strip() or len(raw) > MAX_PATH_LENGTH:
        raise BadFolder("Give the folder's full path, like C:\\Users\\you\\OneDrive\\Projects\\Pilot")
    text = raw.strip().strip('"')
    path = Path(os.path.expanduser(text))
    if not path.is_absolute():
        raise BadFolder("Give the folder's full path (it starts with a drive, like C:\\, or with /)")
    if not path.is_dir():
        raise BadFolder('"{}" is not a folder on this computer'.format(text))
    return path.resolve()


def _wanted(name: str) -> bool:
    return not name.startswith(_SKIP_PREFIXES) and name.lower() not in _SKIP_NAMES


def list_files(folder: Path) -> List[Dict]:
    """[{rel_path, name, size, modified}] of the files under folder, up to MAX_FILES."""
    found: List[Dict] = []
    for path in _walk(folder, files=True):
        try:
            stat = path.stat()
        except OSError:
            continue
        found.append({"rel_path": path.relative_to(folder).as_posix(), "name": path.name, "size": stat.st_size,
                      "modified": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(timespec="seconds")})
        if len(found) >= MAX_FILES:
            break
    found.sort(key=lambda entry: entry["rel_path"].lower())
    return found


def list_folders(root: Path) -> List[str]:
    """The folders under root (root first), as absolute paths, up to MAX_FOLDERS."""
    found = [str(root)]
    for path in _walk(root, files=False):
        found.append(str(path))
        if len(found) >= MAX_FOLDERS:
            break
    return found


def _walk(folder: Path, files: bool, depth: int = 0) -> Iterator[Path]:
    if depth > MAX_DEPTH:
        return
    try:
        entries = sorted(os.scandir(folder), key=lambda entry: entry.name.lower())
    except OSError:
        return
    for entry in entries:
        if not _wanted(entry.name):
            continue
        try:
            is_dir = entry.is_dir(follow_symlinks=False)
        except OSError:
            continue
        if is_dir:
            if not files:
                yield Path(entry.path)
            yield from _walk(Path(entry.path), files, depth + 1)
        elif files:
            yield Path(entry.path)


def inside(folder: Path, rel_path: str) -> Path:
    """The file at rel_path in folder; BadFolder when the path would leave the folder."""
    target = (folder / rel_path).resolve()
    base = folder.resolve()
    if target != base and base not in target.parents:
        raise BadFolder("That file is outside its folder")
    return target


def open_file(path: Path, platform: str = sys.platform,
              runner: Callable[[List[str]], object] = lambda args: subprocess.Popen(args)) -> None:  # noqa: S603
    """Opens a file with the program this computer uses for it (Excel for .xlsx...)."""
    if not path.is_file():
        raise BadFolder('"{}" is not in its folder any more'.format(path.name))
    if platform == "win32":
        os.startfile(str(path))  # type: ignore[attr-defined]  # Windows only
    elif platform == "darwin":
        runner(["open", str(path)])
    else:
        runner(["xdg-open", str(path)])
