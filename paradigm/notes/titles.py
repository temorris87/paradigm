"""What a note title may be. Pure."""
import unicodedata

MAX_TITLE_LENGTH = 200
# Each of these means something inside [[wiki links]]: / paths, # headings, | aliases.
FORBIDDEN = "/#|[]"


class BadTitle(ValueError):
    pass


def clean_title(raw: object) -> str:
    """The title with outer spaces removed, or BadTitle saying what is wrong with it."""
    if not isinstance(raw, str):
        raise BadTitle("A title must be text")
    title = " ".join(raw.split())
    if not title:
        raise BadTitle("A title cannot be empty")
    if len(title) > MAX_TITLE_LENGTH:
        raise BadTitle("A title can be at most {} characters".format(MAX_TITLE_LENGTH))
    bad = sorted({char for char in title if char in FORBIDDEN})
    if bad:
        raise BadTitle("A title cannot contain {}".format(" ".join(bad)))
    if any(unicodedata.category(char) == "Cc" for char in title):
        raise BadTitle("A title cannot contain control characters")
    return title
