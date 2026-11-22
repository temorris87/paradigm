"""PARA hub kinds: what a top-level note can be filed as. None means the Inbox."""
from typing import Optional

# Keep in step with the CHECK in db/migrations/003_hub_kind.sql and static/js/notes/hub-groups.js.
HUB_KINDS = ("project", "area", "resource")


class BadKind(ValueError):
    pass


def clean_kind(kind: object) -> Optional[str]:
    if kind is None or kind in HUB_KINDS:
        return kind
    raise BadKind("kind must be one of {} or null".format(", ".join(HUB_KINDS)))
