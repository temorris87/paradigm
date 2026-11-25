"""The feature pipeline's ledger: which phases a feature has been through, and on what code.

One feature at a time. `.pipeline/current` names it; `.pipeline/<slug>/state.json` holds its
phases. Each record keeps a fingerprint of the source tree, so a check made before a later code
change no longer counts (see FRESH). `.pipeline/` is not in git.

  python tools/pipeline_state.py start SLUG docs/features/NNN-slug.md
  python tools/pipeline_state.py record PHASE pass|fail|running|blocked [--note TEXT]
  python tools/pipeline_state.py status        # the ledger; exit 1 while incomplete
  python tools/pipeline_state.py finish        # needs a complete ledger; clears current
  python tools/pipeline_state.py abandon       # only when Tyson says so
"""
import argparse
import datetime
import hashlib
import json
import pathlib
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
STATE_DIR = REPO / ".pipeline"
CURRENT = STATE_DIR / "current"

PHASES = ["plan", "implement", "integrate", "gate", "review", "docs", "browser", "close"]
# Phases that judge the code must have seen it as it is now, each over what it judges: the gate
# and review read tests and tools too; the browser check only the app, so a new test leaves it be.
ALL = "all"
APP = "app"
FRESH = {"gate": ALL, "review": ALL, "browser": APP}
STATUSES = ("pass", "fail", "running", "blocked")

SOURCE_FILES = ("paradigm.py", "paradigm.pyw")
SOURCE_DIRS = {ALL: ("paradigm", "static", "tests", "tools"), APP: ("paradigm", "static")}
SKIP_DIRS = {"__pycache__", ".git", ".pipeline"}
# Docs (.md, CLAUDE.md included) never change what the code does, so editing them stales nothing.
SKIP_SUFFIXES = {".md", ".pyc"}


def source_files(scope=ALL):
    for name in SOURCE_FILES:
        path = REPO / name
        if path.is_file():
            yield path
    for top in SOURCE_DIRS[scope]:
        for path in (REPO / top).rglob("*"):
            rel = path.relative_to(REPO)
            if path.is_file() and not SKIP_DIRS & set(rel.parts) and path.suffix not in SKIP_SUFFIXES:
                yield path


def fingerprint(scope=ALL):
    digest = hashlib.sha256()
    for path in sorted(source_files(scope)):
        digest.update(path.relative_to(REPO).as_posix().encode("utf-8") + b"\0")
        digest.update(path.read_bytes() + b"\0")
    return digest.hexdigest()


def now():
    return datetime.datetime.now().isoformat(timespec="seconds")


def current_slug():
    if CURRENT.is_file():
        slug = CURRENT.read_text(encoding="utf-8").strip()
        return slug or None
    return None


def state_path(slug):
    return STATE_DIR / slug / "state.json"


def load(slug):
    return json.loads(state_path(slug).read_text(encoding="utf-8"))


def save(state):
    path = state_path(state["slug"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8", newline="\n")


def record(slug, phase, status, note=""):
    if phase not in PHASES + ["fix"]:
        raise SystemExit(f"unknown phase {phase!r}; phases: {', '.join(PHASES)}, fix")
    if status not in STATUSES:
        raise SystemExit(f"unknown status {status!r}; statuses: {', '.join(STATUSES)}")
    state = load(slug)
    entry = {"status": status, "at": now(), "fingerprint": fingerprint(FRESH.get(phase, ALL)), "note": note}
    state["phases"][phase] = entry
    state["history"].append({"phase": phase, **entry})
    save(state)
    return entry


def problems(slug):
    """What still stands between this feature and done, as sentences. Empty when complete."""
    state = load(slug)
    phases = state["phases"]
    found = []
    for phase in PHASES:
        entry = phases.get(phase)
        if entry is None:
            found.append(f"{phase}: not done")
        elif entry["status"] != "pass":
            found.append(f"{phase}: {entry['status']}" + (f" ({entry['note']})" if entry["note"] else ""))
        elif phase in FRESH and entry["fingerprint"] != fingerprint(FRESH[phase]):
            found.append(f"{phase}: passed at {entry['at']}, but the code has changed since")
    return found


def waiting(slug):
    """True while a phase runs in the background or waits on Tyson: stopping is fine then."""
    return any(e["status"] in ("running", "blocked") for e in load(slug)["phases"].values())


def _require_current(args):
    slug = getattr(args, "slug", None) or current_slug()
    if not slug:
        raise SystemExit("no feature in progress (.pipeline/current is missing)")
    if not state_path(slug).is_file():
        raise SystemExit(f"no ledger for {slug!r}")
    return slug


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    start = sub.add_parser("start")
    start.add_argument("slug")
    start.add_argument("spec")
    rec = sub.add_parser("record")
    rec.add_argument("phase")
    rec.add_argument("status")
    rec.add_argument("--note", default="")
    rec.add_argument("--slug")
    for name in ("status", "finish", "abandon"):
        sub.add_parser(name).add_argument("--slug")
    args = parser.parse_args(argv)

    if args.command == "start":
        if current_slug():
            raise SystemExit(f"{current_slug()!r} is still in progress: one feature at a time")
        spec = REPO / args.spec
        if not spec.is_file():
            raise SystemExit(f"the spec {args.spec} does not exist: the plan phase writes it first")
        save({"slug": args.slug, "spec": args.spec, "started": now(), "phases": {}, "history": []})
        CURRENT.write_text(args.slug + "\n", encoding="utf-8")
        record(args.slug, "plan", "pass", f"spec {args.spec}")
        print(f"started {args.slug}")
        return 0

    slug = _require_current(args)
    if args.command == "record":
        entry = record(slug, args.phase, args.status, args.note)
        print(f"{slug}: {args.phase} {entry['status']}")
        return 0
    if args.command == "status":
        state = load(slug)
        print(f"{slug} (spec {state['spec']})")
        for phase in PHASES:
            entry = state["phases"].get(phase)
            print(f"  {phase:<10} {entry['status'] + ' ' + entry['at'] if entry else '-'}")
        found = problems(slug)
        for line in found:
            print(f"  owed: {line}")
        return 1 if found else 0
    if args.command == "finish":
        found = problems(slug)
        if found:
            print("\n".join(["not finished:"] + found))
            return 1
        CURRENT.unlink()
        print(f"{slug} finished")
        return 0
    if args.command == "abandon":
        CURRENT.unlink(missing_ok=True)
        print(f"{slug} abandoned; its ledger stays in .pipeline/{slug}/")
        return 0
    return 2


if __name__ == "__main__":
    sys.exit(main())
