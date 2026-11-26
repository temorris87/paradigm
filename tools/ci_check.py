"""Wait for the GitHub Actions CI run on a pushed commit and say how it went.

Run by the `ci-check` hook in tools/claude_hooks.py after every `git push`, so a push is only
reported done once CI on it is green; or by hand:

  python tools/ci_check.py            # the run on HEAD
  python tools/ci_check.py SHA

Needs the GitHub CLI (`gh`) signed in. Without it CI is not verified, and the result says so
rather than passing. Exit 0 green, 1 red, 2 not verified.
"""
import json
import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, field
from typing import List, Optional

import pipeline_state

GREEN, RED, UNKNOWN = "green", "red", "unknown"
# How long to wait for GitHub to start a run for the commit, then for the run to finish.
APPEAR_SECONDS = 90
FINISH_SECONDS = 15 * 60
POLL_SECONDS = 10
# Lines of a failed job's log worth showing: test failures and errors, not the whole log.
FAILURE_LINE = re.compile(r"FAIL|Error|error:|Traceback|AssertionError|took \d+ ms")
MAX_FAILURE_LINES = 60

GIT_PUSH = re.compile(r"(^|[;&|(]|\s)git(\s+-\S+(\s+\S+)?)*\s+push\b")
DRY_RUN = re.compile(r"\s(--dry-run|-n)\b")


@dataclass
class Outcome:
    state: str
    summary: str
    details: List[str] = field(default_factory=list)

    def text(self) -> str:
        return "\n".join([self.summary] + self.details)


def is_push(command: str) -> bool:
    """A real `git push` (not a dry run) somewhere in a shell command."""
    return bool(GIT_PUSH.search(command)) and not DRY_RUN.search(command)


def job_lines(jobs: List[dict]) -> List[str]:
    return [f"  {job.get('name', '?')}: {job.get('conclusion') or job.get('status') or '?'}" for job in jobs]


def failed_jobs(jobs: List[dict]) -> List[str]:
    return [job.get("name", "?") for job in jobs if job.get("conclusion") not in ("success", "skipped")]


def failure_lines(log: str) -> List[str]:
    """The lines of `gh run view --log-failed` that name a failure: job, step, then the message."""
    picked = []
    for line in log.splitlines():
        parts = line.split("\t", 2)
        message = parts[-1]
        message = re.sub(r"^\S*\d{4}-\d\d-\d\dT[\d:.]+Z ", "", message)
        if FAILURE_LINE.search(message) and "##[error]Process completed" not in message:
            where = " / ".join(parts[:2]) if len(parts) == 3 else ""
            picked.append(f"  [{where}] {message.strip()}" if where else f"  {message.strip()}")
    return picked[-MAX_FAILURE_LINES:]


def gh(*args: str, timeout: float = 60) -> subprocess.CompletedProcess:
    return subprocess.run(["gh", *args], cwd=pipeline_state.REPO, capture_output=True, text=True,
                          encoding="utf-8", errors="replace", timeout=timeout)


def full_sha(rev: str = "HEAD") -> str:
    """`gh run list --commit` only matches a full SHA, so a short one is resolved first."""
    return subprocess.run(["git", "rev-parse", rev], cwd=pipeline_state.REPO, capture_output=True,
                          text=True, encoding="utf-8", check=True).stdout.strip()


def find_run(sha: str) -> Optional[dict]:
    deadline = time.monotonic() + APPEAR_SECONDS
    while True:
        result = gh("run", "list", "--commit", sha, "--json", "databaseId,status,conclusion,workflowName,url")
        runs = json.loads(result.stdout or "[]") if result.returncode == 0 else []
        if runs:
            return runs[0]
        if time.monotonic() >= deadline:
            return None
        time.sleep(POLL_SECONDS)


def wait_for(run_id: int) -> dict:
    """The run once completed, or as last seen at the deadline. A failed gh call (the network
    gone, say) keeps polling, and its error is kept in "error" so the report can name it."""
    deadline = time.monotonic() + FINISH_SECONDS
    run: dict = {}
    while True:
        result = gh("run", "view", str(run_id), "--json", "status,conclusion,jobs,url")
        if result.returncode == 0:
            run = json.loads(result.stdout)
        else:
            run = {**run, "error": (result.stderr or result.stdout).strip().splitlines()[-1:]}
        if run.get("status") == "completed" or time.monotonic() >= deadline:
            return run
        time.sleep(POLL_SECONDS)


def check(sha: Optional[str] = None) -> Outcome:
    if not shutil.which("gh"):
        return Outcome(UNKNOWN, "CI not verified: the GitHub CLI (gh) is not installed.")
    if gh("auth", "status").returncode != 0:
        return Outcome(UNKNOWN, "CI not verified: gh is not signed in (run `gh auth login`).")
    sha = full_sha(sha or "HEAD")
    short = sha[:7]
    found = find_run(sha)
    if not found:
        return Outcome(UNKNOWN, f"CI not verified: no GitHub Actions run appeared for {short} "
                                f"within {APPEAR_SECONDS} s.")
    run = wait_for(found["databaseId"])
    jobs = run.get("jobs", [])
    if run.get("status") != "completed":
        error = run.get("error")
        why = f"gh kept failing ({error[0]})" if error else f"the run was still going after {FINISH_SECONDS // 60} min"
        return Outcome(UNKNOWN, f"CI not verified for {short}: {why}: {found.get('url', '')}", job_lines(jobs))
    if run.get("conclusion") == "success":
        return Outcome(GREEN, f"CI passed for {short}.", job_lines(jobs))
    log = gh("run", "view", str(found["databaseId"]), "--log-failed", timeout=120).stdout
    details = job_lines(jobs) + ["Failure lines from the log:"] + failure_lines(log)
    return Outcome(RED, f"CI FAILED for {short} ({', '.join(failed_jobs(jobs)) or run.get('conclusion')}): "
                        f"{run.get('url', '')}", details)


def main(argv: Optional[List[str]] = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    outcome = check(argv[0] if argv else None)
    print(outcome.text())
    return {GREEN: 0, RED: 1, UNKNOWN: 2}[outcome.state]


if __name__ == "__main__":
    sys.exit(main())
