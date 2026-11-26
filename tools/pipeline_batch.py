"""The ledger of a batch: several features built side by side, each in its own worktree, then merged.

Each feature keeps its own phase ledger inside its worktree (`<worktree>/.pipeline/`, through
tools/pipeline_state.py there). This file only tracks the batch as a whole, in the main tree's
`.pipeline/batch.json`: which features are in it, where each is built, how far each got, and
the merge. `.pipeline/` is not in git.

  python tools/pipeline_batch.py start DATE --merge-worktree DIR --merge-branch BRANCH
  python tools/pipeline_batch.py add SLUG --spec PATH --item TEXT --worktree DIR --branch BRANCH
  python tools/pipeline_batch.py set SLUG building|built|blocked|merged|left-out [--note TEXT]
  python tools/pipeline_batch.py merge running|pass|blocked [--note TEXT]
  python tools/pipeline_batch.py status        # exit 1 while the batch is unfinished
  python tools/pipeline_batch.py finish        # needs the merge passed and main on its branch
  python tools/pipeline_batch.py abandon       # only when Tyson says so
"""
import argparse
import json
import sys

import pipeline_state
import worktree

MAX_FEATURES = 10
FEATURE_STATES = ("building", "built", "blocked", "merged", "left-out")
MERGE_STATES = ("waiting", "running", "pass", "blocked")
# A feature is settled once it is on the merge branch, or Tyson has taken it out of the batch. A
# blocked one is not: it waits on him to say how (fix and build again, or leave it out).
SETTLED = ("merged", "left-out")


def batch_path():
    return worktree.main_root() / ".pipeline" / "batch.json"


def active():
    path = batch_path()
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None


def save(batch):
    path = batch_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(batch, indent=2) + "\n", encoding="utf-8", newline="\n")


def require():
    batch = active()
    if not batch:
        raise SystemExit("no batch in progress (.pipeline/batch.json is missing)")
    return batch


def feature(batch, slug):
    for entry in batch["features"]:
        if entry["slug"] == slug:
            return entry
    raise SystemExit(f"{slug!r} is not in the batch")


def start(date, merge_worktree, merge_branch):
    if active():
        raise SystemExit(f"the batch of {active()['date']} is still in progress")
    if pipeline_state.current_slug():
        raise SystemExit(f"{pipeline_state.current_slug()!r} is in progress in the main tree: finish it first")
    batch = {"date": date, "started": pipeline_state.now(), "features": [],
             "merge": {"state": "waiting", "worktree": merge_worktree, "branch": merge_branch, "note": ""}}
    save(batch)
    return batch


def add(slug, spec, item, tree, branch):
    batch = require()
    if any(f["slug"] == slug for f in batch["features"]):
        raise SystemExit(f"{slug!r} is already in the batch")
    if len(batch["features"]) >= MAX_FEATURES:
        raise SystemExit(f"a batch holds at most {MAX_FEATURES} features")
    batch["features"].append({"slug": slug, "spec": spec, "item": item, "worktree": tree,
                              "branch": branch, "state": "building", "note": "", "at": pipeline_state.now()})
    save(batch)


def set_state(slug, state, note=""):
    if state not in FEATURE_STATES:
        raise SystemExit(f"unknown state {state!r}; states: {', '.join(FEATURE_STATES)}")
    batch = require()
    entry = feature(batch, slug)
    entry.update(state=state, note=note, at=pipeline_state.now())
    save(batch)


def set_merge(state, note=""):
    if state not in MERGE_STATES:
        raise SystemExit(f"unknown merge state {state!r}; states: {', '.join(MERGE_STATES)}")
    batch = require()
    batch["merge"].update(state=state, note=note, at=pipeline_state.now())
    save(batch)


def waiting(batch):
    """True while a build or the merge runs in the background, or one waits on Tyson."""
    states = [f["state"] for f in batch["features"]]
    return "building" in states or "blocked" in states or batch["merge"]["state"] in ("running", "blocked")


def owed(batch):
    """What still stands between the batch and done, as sentences. Empty when complete."""
    found = []
    for entry in batch["features"]:
        if entry["state"] not in SETTLED:
            found.append(f"{entry['slug']}: {entry['state']}")
    if batch["merge"]["state"] != "pass":
        found.append(f"merge: {batch['merge']['state']}" + (f" ({batch['merge']['note']})" if batch["merge"]["note"] else ""))
    return found


def on_main(batch):
    """Whether main already holds the merge branch (Tyson said commit, and it was fast-forwarded)."""
    result = worktree.git("merge-base", "--is-ancestor", batch["merge"]["branch"], "main",
                          cwd=worktree.main_root(), check=False)
    return result.returncode == 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    begin = sub.add_parser("start")
    begin.add_argument("date")
    begin.add_argument("--merge-worktree", required=True)
    begin.add_argument("--merge-branch", required=True)
    more = sub.add_parser("add")
    more.add_argument("slug")
    for name in ("--spec", "--item", "--worktree", "--branch"):
        more.add_argument(name, required=True)
    mark = sub.add_parser("set")
    mark.add_argument("slug")
    mark.add_argument("state")
    mark.add_argument("--note", default="")
    merge = sub.add_parser("merge")
    merge.add_argument("state")
    merge.add_argument("--note", default="")
    for name in ("status", "finish", "abandon"):
        sub.add_parser(name)
    args = parser.parse_args(argv)

    if args.command == "start":
        start(args.date, args.merge_worktree, args.merge_branch)
        print(f"batch {args.date} started")
        return 0
    if args.command == "add":
        add(args.slug, args.spec, args.item, args.worktree, args.branch)
        print(f"{args.slug} added")
        return 0
    if args.command == "set":
        set_state(args.slug, args.state, args.note)
        print(f"{args.slug}: {args.state}")
        return 0
    if args.command == "merge":
        set_merge(args.state, args.note)
        print(f"merge: {args.state}")
        return 0

    batch = require()
    if args.command == "status":
        print(f"batch {batch['date']} (merge into {batch['merge']['branch']} at {batch['merge']['worktree']})")
        for entry in batch["features"]:
            note = f"  {entry['note']}" if entry["note"] else ""
            print(f"  {entry['slug']:<24} {entry['state']:<9} {entry['worktree']}{note}")
        print(f"  {'merge':<24} {batch['merge']['state']}")
        found = owed(batch)
        for line in found:
            print(f"  owed: {line}")
        return 1 if found else 0
    if args.command == "finish":
        found = owed(batch)
        if not on_main(batch):
            found.append(f"main does not hold {batch['merge']['branch']} yet: fast-forward it once Tyson says commit")
        if found:
            print("\n".join(["not finished:"] + found))
            return 1
        _archive(batch)
        print(f"batch {batch['date']} finished")
        return 0
    if args.command == "abandon":
        _archive(batch)
        print(f"batch {batch['date']} abandoned; its worktrees and branches are left as they are")
        return 0
    return 2


def _archive(batch):
    path = batch_path()
    path.replace(path.with_name(f"batch-{batch['date']}.json"))


if __name__ == "__main__":
    sys.exit(main())
