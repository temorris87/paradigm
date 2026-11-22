"""What a note's list of wiki-link texts may be (sent by the page with a save). Pure.
Keep in step with db/migrations/009_links.sql and static/js/notes/links.js."""
from typing import List

MAX_LINK_LENGTH = 500
MAX_LINKS = 1000


class BadLinks(ValueError):
    pass


def clean_links(value: object) -> List[str]:
    """The link texts, trimmed, empty ones and repeats dropped, in their first order."""
    if not isinstance(value, list) or not all(isinstance(text, str) for text in value):
        raise BadLinks("links must be a list of texts")
    texts = list(dict.fromkeys(text.strip() for text in value if text.strip()))
    if len(texts) > MAX_LINKS:
        raise BadLinks("A note can hold at most {} different links".format(MAX_LINKS))
    if any(len(text) > MAX_LINK_LENGTH for text in texts):
        raise BadLinks("A link can be at most {} characters".format(MAX_LINK_LENGTH))
    return texts
