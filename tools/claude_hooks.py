"""Claude Code hooks for the feature pipeline (wired in .claude/settings.json).

  commit-gate  PreToolUse on Bash: a `git commit` runs the gate first and is blocked when it fails;
               while a feature is in progress, git commands that rewrite the shared working tree
               (stash, reset, restore, checkout, switch, clean) are refused: the lanes edit it
               side by side, and one agent's stash takes the other's work away.
  ci-check     PostToolUse on Bash: after a `git push`, waits for the GitHub Actions run on the
               pushed commit (tools/ci_check.py). Red sends the failing jobs and their error
               lines back to be diagnosed and fixed; green, or not verified, is reported as
               context, so a push is never called done on CI that wasn't seen.
  stop-check   Stop: while a feature or a batch is in progress, a session can't end with work
               still owed, unless it runs in the background or waits on Tyson.
  edit-guard   PreToolUse on Edit and Write: while a batch is building in worktrees, the main
               tree's code is left alone, so main can be fast-forwarded to the merge at the end.

The hooks are registered once, for the main tree, but a batch runs commands in other worktrees
(`cd <worktree> && ...`, `git -C <worktree> ...`). Each command is judged in the tree it runs in:
that tree's gate, that tree's ledger.

Reads the hook's JSON on stdin. Exit 2 with a message on stderr blocks a tool call; a Stop block
is a JSON decision on stdout.
"""
import json
import pathlib
import re
import subprocess
import sys

import ci_check
import pipeline_batch
import pipeline_state
import worktree

GIT_COMMIT = re.compile(r"(^|[;&|(]|\s)git(\s+-\S+(\s+\S+)?)*\s+commit\b")
GIT_REWRITE = re.compile(r"(^|[;&|(]|\s)git(\s+-\S+(\s+\S+)?)*\s+(stash|reset|restore|checkout|switch|clean)\b")
_PATH = r"(?:\"([^\"]+)\"|'([^']+)'|(\S+))"
LEADING_CD = re.compile(r"^\s*cd\s+" + _PATH + r"\s*(?:&&|;)")
GIT_DASH_C = re.compile(r"(?:^|[;&|(]|\s)git\s+-C\s+" + _PATH)
# The main tree's code: what a batch's fast-forward at the end would overwrite.
CODE_DIRS = ("paradigm", "static", "tests", "tools", ".claude")
REWRITE_HELP = ("Blocked: a feature is in the pipeline and its lanes share this working tree, so git "
                "commands that rewrite it (stash, reset, restore, checkout, switch, clean) are off. "
                "To compare with HEAD, use `git diff` or `git show HEAD:<path>` into the scratchpad "
                "(or `git worktree add <scratch dir> HEAD` for a whole clean copy).")


def _first(match):
    return next(group for group in match.groups() if group)


def command_root(event):
    """The root of the working tree a Bash command runs in: its leading `cd`, its `git -C`, or
    the session's cwd. The main tree when none of them is in one."""
    command = (event.get("tool_input") or {}).get("command", "")
    cwd = pathlib.Path(event.get("cwd") or pipeline_state.REPO)
    for pattern in (LEADING_CD, GIT_DASH_C):
        match = pattern.search(command)
        if match:
            candidate = pathlib.Path(_first(match)).expanduser()
            found = worktree.root_of(candidate if candidate.is_absolute() else cwd / candidate)
            if found:
                return found
    return worktree.root_of(cwd) or pipeline_state.REPO


def slug_in(root):
    """The feature in progress in a tree, read from that tree's own ledger."""
    current = pathlib.Path(root) / ".pipeline" / "current"
    if current.is_file():
        return current.read_text(encoding="utf-8").strip() or None
    return None


def commit_gate(event):
    command = (event.get("tool_input") or {}).get("command", "")
    is_rewrite, is_commit = GIT_REWRITE.search(command), GIT_COMMIT.search(command)
    if not is_rewrite and not is_commit:
        return 0
    root = command_root(event)
    if is_rewrite and slug_in(root):
        print(REWRITE_HELP, file=sys.stderr)
        return 2
    if not is_commit:
        return 0
    # That tree's own copy of the gate: it fingerprints and checks the tree it lives in.
    gate = root / "tools" / "pipeline_gate.py"
    if not gate.is_file():
        gate = pipeline_state.REPO / "tools" / "pipeline_gate.py"
    result = subprocess.run([sys.executable, str(gate), "--reuse", "--ledger"], cwd=root,
                            capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode == 0:
        return 0
    tail = "\n".join(result.stdout.strip().splitlines()[-40:])
    print(f"Commit blocked: tools/pipeline_gate.py failed in {root}.\n{tail}", file=sys.stderr)
    return 2


def ci_after_push(event):
    command = (event.get("tool_input") or {}).get("command", "")
    if not ci_check.is_push(command):
        return 0
    outcome = ci_check.check()
    if outcome.state == ci_check.RED:
        reason = (outcome.text() + "\nDiagnose the failure (`gh run view <id> --log-failed`), fix it, "
                  "and push again; the push is not done until CI is green. Tell Tyson what failed.")
        print(json.dumps({"decision": "block", "reason": reason}))
        return 0
    context = outcome.text()
    if outcome.state == ci_check.UNKNOWN:
        context += "\nSay so when reporting the push: CI was not verified."
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": context}}))
    return 0


def _feature_owed():
    slug = pipeline_state.current_slug()
    if not slug or not pipeline_state.state_path(slug).is_file() or pipeline_state.waiting(slug):
        return None
    owed = pipeline_state.problems(slug)
    if not owed:
        return None
    return (f"Feature {slug} is still in the pipeline, with phases owed: " + "; ".join(owed) +
            ". Carry on with the next phase. If it needs Tyson, record it with "
            "`python tools/pipeline_state.py record <phase> blocked --note \"why\"` and say so.")


def _batch_owed():
    batch = pipeline_batch.active()
    if not batch or pipeline_batch.waiting(batch):
        return None
    owed = pipeline_batch.owed(batch)
    if not owed:
        return None
    return (f"The batch of {batch['date']} is unfinished: " + "; ".join(owed) +
            ". Carry on with it (/features). If it needs Tyson, record it with "
            "`python tools/pipeline_batch.py set <slug> blocked --note \"why\"` and say so.")


def stop_check(event):
    if event.get("stop_hook_active"):
        return 0  # already sent back once this turn: don't loop
    reason = _feature_owed() or _batch_owed()
    if reason:
        print(json.dumps({"decision": "block", "reason": reason}))
    return 0


def edit_guard(event):
    batch = pipeline_batch.active()
    target = (event.get("tool_input") or {}).get("file_path")
    if not batch or not target:
        return 0
    path = pathlib.Path(target).expanduser().resolve()
    main = worktree.main_root().resolve()
    try:
        parts = path.relative_to(main).parts
    except ValueError:
        return 0  # a worktree, the scratchpad: anywhere but the main tree
    if parts and parts[0] in CODE_DIRS:
        print(f"Blocked: the batch of {batch['date']} is building in worktrees, so the main tree's code "
              f"stays as it is until the merge is fast-forwarded onto main. Edit the feature's own "
              f"worktree instead (`python tools/pipeline_batch.py status` lists them).", file=sys.stderr)
        return 2
    return 0


def main():
    hooks = {"commit-gate": commit_gate, "ci-check": ci_after_push, "stop-check": stop_check,
             "edit-guard": edit_guard}
    if len(sys.argv) != 2 or sys.argv[1] not in hooks:
        print(f"usage: claude_hooks.py {'|'.join(hooks)}", file=sys.stderr)
        return 1
    raw = sys.stdin.read()
    event = json.loads(raw) if raw.strip() else {}
    return hooks[sys.argv[1]](event)


if __name__ == "__main__":
    sys.exit(main())
