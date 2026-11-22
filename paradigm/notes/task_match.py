"""Following a note's tasks from one version of its text to the next. Pure.

A task is the box on one line. When the text changes, the lines the tasks were read from are
followed into the new text (difflib's matching blocks: unchanged lines keep their place, and a
run of changed lines replaced by a run as long is taken as those lines edited), so a task whose
line was edited or moved down by new lines above it stays the same task. A box no line leads
to is then paired with a vanished task of the same title (a line cut and put elsewhere)."""
import difflib
from typing import Collection, Dict, List, Optional, Sequence


# How alike an edited line must still be to its old self (difflib's ratio, 0 to 1).
SIMILAR = 0.6


def follow_lines(old_text: str, new_text: str, wanted: Optional[Collection[int]] = None) -> Dict[int, int]:
    """{old line: new line} for every old line that is still there, edited or not. wanted: the
    only old lines worth pairing inside a run of changed lines (comparing lines costs)."""
    old, new = old_text.split("\n"), new_text.split("\n")
    matcher = difflib.SequenceMatcher(a=old, b=new, autojunk=False)
    moved: Dict[int, int] = {}
    for tag, old_from, old_to, new_from, new_to in matcher.get_opcodes():
        if tag == "equal" or (tag == "replace" and old_to - old_from == new_to - new_from):
            for offset in range(old_to - old_from):
                moved[old_from + offset] = new_from + offset
        elif tag == "replace":
            lines = [line for line in range(old_from, old_to) if wanted is None or line in wanted]
            moved.update(_alike(old, new, lines, range(new_from, new_to)))
    return moved


def _alike(old: List[str], new: List[str], old_lines: Sequence[int], new_lines: range) -> Dict[int, int]:
    """In a run of changed lines, each old line paired with the most alike new line after the
    last one paired (lines keep their order)."""
    paired: Dict[int, int] = {}
    after = new_lines.start
    for old_line in old_lines:
        best, best_ratio = None, SIMILAR
        for new_line in range(after, new_lines.stop):
            ratio = difflib.SequenceMatcher(a=old[old_line], b=new[new_line], autojunk=False).ratio()
            if ratio >= best_ratio:
                best, best_ratio = new_line, ratio
        if best is not None:
            paired[old_line] = best
            after = best + 1
    return paired


def match_tasks(old: Sequence[Dict], new_lines: Sequence[int], new_titles: Sequence[str],
                moved: Dict[int, int], spare: Sequence[Dict] = ()) -> List[Optional[int]]:
    """For each new box (its line and title), the id of the old task it is, or None (new).

    old: the field's live tasks [{id, line, title}]; moved: follow_lines of the field's text;
    spare: tasks of the note no longer in its text (removed earlier), which a box of the same
    title brings back (an undo)."""
    at_line = {}
    for task in old:
        line = moved.get(task["line"])
        if line is not None:
            at_line.setdefault(line, task["id"])
    found: List[Optional[int]] = [at_line.get(line) for line in new_lines]
    used = {task_id for task_id in found if task_id is not None}
    left = [task for task in list(old) + list(spare) if task["id"] not in used]
    for index, task_id in enumerate(found):
        if task_id is not None:
            continue
        title = new_titles[index].casefold()
        twin = next((task for task in left if task["title"].casefold() == title), None)
        if twin is not None:
            found[index] = twin["id"]
            left.remove(twin)
    return found
