"""Git worktrees for features built side by side: one worktree and one local branch per feature.

Two features can't share a working tree (both lanes write main.js, the key tables, index.html),
so a batch gives each its own, beside the repo in `../paradigm-wt/<name>`. The branches stay
local: nothing here pushes.

  python tools/worktree.py create SLUG [--branch B] [--base REF] [--spec docs/features/NNN-x.md]
  python tools/worktree.py remove SLUG [--branch B]   # deletes the branch only once it is merged
  python tools/worktree.py list
  python tools/worktree.py root [DIR]                 # the repo root DIR is in
"""
import argparse
import pathlib
import shutil
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
# The pipeline's own state never blocks a batch, should it ever show up as untracked.
IGNORED_DIRTY = (".pipeline/",)


def git(*args, cwd=None, check=True):
    result = subprocess.run(["git", *args], cwd=str(cwd or REPO), capture_output=True, text=True,
                            encoding="utf-8", errors="replace")
    if check and result.returncode != 0:
        raise SystemExit(f"git {' '.join(args)} failed: {(result.stderr or result.stdout).strip()}")
    return result


def main_root(start=None):
    """The main working tree's root, also when called from inside a feature's worktree."""
    common = git("rev-parse", "--path-format=absolute", "--git-common-dir", cwd=start).stdout.strip()
    return pathlib.Path(common).parent


def root_of(directory):
    """The root of the working tree `directory` is in, or None when it isn't in one."""
    path = pathlib.Path(directory)
    if not path.is_dir():
        return None
    result = git("rev-parse", "--show-toplevel", cwd=path, check=False)
    return pathlib.Path(result.stdout.strip()).resolve() if result.returncode == 0 else None


def home(start=None):
    return main_root(start).parent / "paradigm-wt"


def path_for(name, start=None):
    return home(start) / name


def dirty(root):
    """Uncommitted changes in a tree, minus what git doesn't track for the pipeline."""
    lines = git("status", "--porcelain", cwd=root).stdout.splitlines()
    return [line for line in lines if not line[3:].startswith(IGNORED_DIRTY)]


def create(name, branch=None, base="main", spec=None, start=None):
    root = main_root(start)
    target = path_for(name, root)
    branch = branch or f"feature/{name}"
    changes = dirty(root)
    if changes:
        # The features are taken from `base`; work left uncommitted in the main tree would be
        # missing from every branch, and would block the fast-forward at the end.
        raise SystemExit("the main tree has uncommitted changes; commit them first:\n  " + "\n  ".join(changes[:10]))
    if target.exists():
        raise SystemExit(f"{target} already exists")
    target.parent.mkdir(parents=True, exist_ok=True)
    git("worktree", "add", "-b", branch, str(target), base, cwd=root)
    if spec:
        source = root / spec
        if source.is_file():
            # An approved spec written in the main tree before the worktree existed.
            (target / spec).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target / spec)
    return target, branch


def remove(name, branch=None, start=None):
    root = main_root(start)
    target = path_for(name, root)
    branch = branch or f"feature/{name}"
    if target.exists():
        git("worktree", "remove", str(target), cwd=root)
    # -d, not -D: a branch that never reached main stays, so no work is lost by a clean-up.
    result = git("branch", "-d", branch, cwd=root, check=False)
    return result.returncode == 0, (result.stderr or result.stdout).strip()


def listing():
    return git("worktree", "list", cwd=main_root()).stdout.strip()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    make = sub.add_parser("create")
    make.add_argument("name")
    make.add_argument("--branch")
    make.add_argument("--base", default="main")
    make.add_argument("--spec")
    drop = sub.add_parser("remove")
    drop.add_argument("name")
    drop.add_argument("--branch")
    sub.add_parser("list")
    where = sub.add_parser("root")
    where.add_argument("directory", nargs="?", default=".")
    args = parser.parse_args(argv)

    if args.command == "create":
        target, branch = create(args.name, args.branch, args.base, args.spec)
        print(f"{target} on {branch}")
    elif args.command == "remove":
        deleted, message = remove(args.name, args.branch)
        print(f"removed {path_for(args.name)}" + ("" if deleted else f"; branch kept: {message}"))
    elif args.command == "list":
        print(listing())
    elif args.command == "root":
        found = root_of(args.directory)
        if not found:
            raise SystemExit(f"{args.directory} is not in a git working tree")
        print(found)
    return 0


if __name__ == "__main__":
    sys.exit(main())
