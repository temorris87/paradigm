"""What a note's list of tasks may be (sent by the page with a save), and the box on a task's
line. Pure. Keep in step with db/migrations/012_tasks.sql and static/js/notes/tasks.js."""
import re
from typing import List, NamedTuple, Optional

from paradigm.notes.mentions import FIELDS

MAX_TITLE_LENGTH = 500
MAX_TASKS = 2000

# A list item's box at the start of a line, inside any number of "> " quotes:
# group 1 is everything before the box's mark, group 2 the mark (" ", "x" or "X").
BOX = re.compile(r"^((?:[ \t]*>)*[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+\[)([ xX])\]")


class BadTasks(ValueError):
    pass


class Task(NamedTuple):
    field: str
    line: int
    parent_line: Optional[int]   # the line of the box it is nested under, in the same field
    title: str
    done: bool


def clean_tasks(value: object) -> List[Task]:
    """The tasks, one per (field, line), in field and line order."""
    if value is None:
        return []
    if not isinstance(value, list):
        raise BadTasks("tasks must be a list")
    if len(value) > MAX_TASKS:
        raise BadTasks("A note can hold at most {} tasks".format(MAX_TASKS))
    found = {}
    for entry in value:
        task = _task(entry)
        found.setdefault((task.field, task.line), task)
    return [found[key] for key in sorted(found, key=lambda key: (FIELDS.index(key[0]), key[1]))]


def _task(entry: object) -> Task:
    if not isinstance(entry, dict):
        raise BadTasks("each task must be an object")
    field, line, parent, title, done = (entry.get(key) for key in ("field", "line", "parent", "title", "done"))
    if field not in FIELDS:
        raise BadTasks("a task's field must be one of {}".format(", ".join(FIELDS)))
    if not _line_number(line):
        raise BadTasks("a task's line must be a whole number")
    if parent is not None and not (_line_number(parent) and parent < line):
        raise BadTasks("a task's parent must be the line of a box above it")
    if not isinstance(title, str) or len(title) > MAX_TITLE_LENGTH * 4:
        raise BadTasks("a task's title must be text")
    if not isinstance(done, bool):
        raise BadTasks("a task's done must be true or false")
    return Task(field, line, parent, " ".join(title.split())[:MAX_TITLE_LENGTH], done)


def _line_number(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def box_state(line: str) -> Optional[bool]:
    """Whether a line's box is ticked (None: the line holds no box)."""
    match = BOX.match(line)
    return None if match is None else match.group(2) != " "


def set_box(line: str, done: bool) -> str:
    """The line with its box ticked or cleared (the line unchanged if it holds no box)."""
    return BOX.sub(lambda match: match.group(1) + ("x" if done else " ") + "]", line, count=1)
