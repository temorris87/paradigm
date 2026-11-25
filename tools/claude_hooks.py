"""Claude Code hooks for the feature pipeline (wired in .claude/settings.json).

  commit-gate  PreToolUse on Bash: a `git commit` runs the gate first and is blocked when it fails;
               while a feature is in progress, git commands that rewrite the shared working tree
               (stash, reset, restore, checkout, switch, clean) are refused: the lanes edit it
               side by side, and one agent's stash takes the other's work away.
  stop-check   Stop: while a feature is in progress, a session can't end with phases still owed,
               unless one runs in the background or waits on Tyson (`running` / `blocked`).

Reads the hook's JSON on stdin. Exit 2 with a message on stderr blocks a tool call; a Stop block
is a JSON decision on stdout.
"""
import json
import re
import subprocess
import sys

import pipeline_state

GIT_COMMIT = re.compile(r"(^|[;&|(]|\s)git(\s+-\S+(\s+\S+)?)*\s+commit\b")
GIT_REWRITE = re.compile(r"(^|[;&|(]|\s)git(\s+-\S+(\s+\S+)?)*\s+(stash|reset|restore|checkout|switch|clean)\b")
REWRITE_HELP = ("Blocked: a feature is in the pipeline and its lanes share this working tree, so git "
                "commands that rewrite it (stash, reset, restore, checkout, switch, clean) are off. "
                "To compare with HEAD, use `git diff` or `git show HEAD:<path>` into the scratchpad "
                "(or `git worktree add <scratch dir> HEAD` for a whole clean copy).")


def commit_gate(event):
    command = (event.get("tool_input") or {}).get("command", "")
    if GIT_REWRITE.search(command) and pipeline_state.current_slug():
        print(REWRITE_HELP, file=sys.stderr)
        return 2
    if not GIT_COMMIT.search(command):
        return 0
    gate = pipeline_state.REPO / "tools" / "pipeline_gate.py"
    result = subprocess.run([sys.executable, str(gate), "--reuse", "--ledger"], cwd=pipeline_state.REPO,
                            capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode == 0:
        return 0
    tail = "\n".join(result.stdout.strip().splitlines()[-40:])
    print(f"Commit blocked: tools/pipeline_gate.py failed.\n{tail}", file=sys.stderr)
    return 2


def stop_check(event):
    if event.get("stop_hook_active"):
        return 0  # already sent back once this turn: don't loop
    slug = pipeline_state.current_slug()
    if not slug or not pipeline_state.state_path(slug).is_file() or pipeline_state.waiting(slug):
        return 0
    owed = pipeline_state.problems(slug)
    if not owed:
        return 0
    reason = (f"Feature {slug} is still in the pipeline, with phases owed: " + "; ".join(owed) +
              ". Carry on with the next phase. If it needs Tyson, record it with "
              "`python tools/pipeline_state.py record <phase> blocked --note \"why\"` and say so.")
    print(json.dumps({"decision": "block", "reason": reason}))
    return 0


def main():
    hooks = {"commit-gate": commit_gate, "stop-check": stop_check}
    if len(sys.argv) != 2 or sys.argv[1] not in hooks:
        print(f"usage: claude_hooks.py {'|'.join(hooks)}", file=sys.stderr)
        return 1
    raw = sys.stdin.read()
    event = json.loads(raw) if raw.strip() else {}
    return hooks[sys.argv[1]](event)


if __name__ == "__main__":
    sys.exit(main())
