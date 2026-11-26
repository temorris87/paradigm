"""Teams' joining text in an invite's description: the block Outlook puts between underscore
rules, and its lines wherever they turn up (forwarded or pasted invites have no rules). Pure."""
import re
from typing import List, Tuple

_RULE = re.compile(r"\s*_{8,}\s*")
_LINK = re.compile(r"<https?://[^>\s]*>?", re.IGNORECASE)
# A Teams join link only: an organiser's own channel or file links are not joining text.
_JOIN_LINK = re.compile(r"https?://(?:[\w-]+\.)*teams\.(?:microsoft|live)\.com/(?:l/meetup-join|meet)/",
                        re.IGNORECASE)

# Lines that are the whole of a Teams phrase (a trailing link removed first).
_WHOLE_LINES = (
    "microsoft teams meeting", "microsoft teams need help?", "join the meeting now",
    "join on your computer, mobile app or room device", "click here to join the meeting",
    "download teams | join on the web", "join with a video conferencing device",
    "join on a video conferencing device", "dial in by phone", "find a local number", "more info",
    "learn more | meeting options", "reset dial-in pin",
)
# Lines that start with a label and go on with an ID, a key or links.
_LINE_STARTS = re.compile(
    r"(?:meeting id\s*:|passcode\s*:|phone conference id\s*:|for organizers\s*:|tenant key\b|video id\b"
    r"|\+?\d[\d\s().-]*,,\d+#)")
# Whole lines only Teams writes: a rule-bounded section holding one is Teams' block. Exact
# phrases, so an organiser's "Microsoft Teams rollout plan" between rules is not taken for one.
_MARKERS = frozenset((
    "microsoft teams meeting", "microsoft teams need help?", "join on your computer, mobile app or room device",
    "click here to join the meeting", "download teams | join on the web", "learn more | meeting options",
    "join the meeting now",
))


def _plain(line: str) -> str:
    """The line as matched: links gone, spaces closed up, case folded."""
    text = _LINK.sub("", line.replace("\xa0", " "))
    return " ".join(text.split()).casefold()


def is_boilerplate(line: str) -> bool:
    plain = _plain(line).rstrip(" .")
    return plain in _WHOLE_LINES or _LINE_STARTS.match(plain) is not None


def _is_marker(line: str) -> bool:
    return _JOIN_LINK.search(line) is not None or _plain(line).rstrip(" .") in _MARKERS


def _sections(lines: List[str]) -> List[Tuple[int, List[str]]]:
    """The lines between rules, each with the length of the rule that opens it (0 for what comes
    before the first rule)."""
    sections: List[Tuple[int, List[str]]] = [(0, [])]
    for line in lines:
        if _RULE.fullmatch(line):
            sections.append((len(line.strip()), []))
        else:
            sections[-1][1].append(line)
    return sections


def strip_teams(lines: List[str]) -> List[str]:
    """The lines without Teams' joining text and without the underscore rules. A section opened
    by a rule that holds a Teams-only line opens Teams' block. A section after it goes with it,
    whole, only when a shorter (inner) rule opens it and it holds boilerplate: that is the
    dial-in half, which runs to the end when no rule closes it. A rule as long as the block's
    opening one closes the block. Other sections are kept, less their boilerplate lines."""
    kept: List[str] = []
    block_rule = 0  # length of the rule that opened Teams' block; 0 outside one
    for index, (rule, section) in enumerate(_sections(lines)):
        if index > 0 and any(_is_marker(line) for line in section):
            block_rule = rule
        elif block_rule and rule < block_rule and any(is_boilerplate(line) for line in section):
            pass
        else:
            block_rule = 0
            kept.extend(line for line in section if not is_boilerplate(line))
    return kept
