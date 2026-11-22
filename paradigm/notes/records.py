"""What decisions and questions are: their kinds and their days. Pure.
Keep in step with db/migrations/008_decisions.sql and static/js/records/."""
from paradigm.notes.meetings import BadWhen, clean_day

__all__ = ["RECORD_KINDS", "BadKind", "BadWhen", "clean_day", "clean_record_kind"]

# The tables are named after the kind in the plural.
RECORD_KINDS = ("decision", "question")


class BadKind(ValueError):
    pass


def clean_record_kind(kind: object) -> str:
    if kind in RECORD_KINDS:
        return kind
    raise BadKind("kind must be one of {}".format(", ".join(RECORD_KINDS)))
