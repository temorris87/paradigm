"""A new, empty database gets one note, so the app never opens on nothing."""
from pathlib import Path

from paradigm.db.notes_repo import NoteRepository

WELCOME_TITLE = "Welcome"
WELCOME_FILE = Path(__file__).resolve().parent / "welcome.md"


def seed_if_empty(notes: NoteRepository) -> None:
    if notes.count() == 0:
        notes.create(None, WELCOME_TITLE, WELCOME_FILE.read_text(encoding="utf-8"))
