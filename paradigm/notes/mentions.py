"""What a note's list of @mentions may be (sent by the page with a save). Pure.
Keep in step with db/migrations/011_pages.sql and static/js/notes/mentions.js."""
from typing import List, NamedTuple

# The text fields a note can have: its body, and a meeting's agenda.
FIELDS = ("body", "agenda")
MAX_NAME_LENGTH = 100
MAX_CONTEXT_LENGTH = 2000
MAX_MENTIONS = 1000


class BadMentions(ValueError):
    pass


class Mention(NamedTuple):
    field: str
    line: int
    name: str
    context: str


def clean_mentions(value: object) -> List[Mention]:
    """The mentions, repeats (same field, line and name) dropped, in their first order."""
    if value is None:
        return []
    if not isinstance(value, list):
        raise BadMentions("mentions must be a list")
    found = {}
    for entry in value:
        mention = _mention(entry)
        found.setdefault((mention.field, mention.line, mention.name.lower()), mention)
    if len(found) > MAX_MENTIONS:
        raise BadMentions("A note can hold at most {} mentions".format(MAX_MENTIONS))
    return list(found.values())


def _mention(entry: object) -> Mention:
    if not isinstance(entry, dict):
        raise BadMentions("each mention must be an object")
    field, line, name, context = (entry.get(key) for key in ("field", "line", "name", "context"))
    if field not in FIELDS:
        raise BadMentions("a mention's field must be one of {}".format(", ".join(FIELDS)))
    if not isinstance(line, int) or isinstance(line, bool) or line < 0:
        raise BadMentions("a mention's line must be a whole number")
    if not isinstance(name, str) or not name.strip() or len(name) > MAX_NAME_LENGTH:
        raise BadMentions("a mention's name must be text of at most {} characters".format(MAX_NAME_LENGTH))
    if not isinstance(context, str):
        raise BadMentions("a mention's context must be text")
    return Mention(field, line, name.strip(), context[:MAX_CONTEXT_LENGTH])
