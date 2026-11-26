import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))

import ci_check  # noqa: E402


class IsPushTest(unittest.TestCase):
    def test_pushes(self) -> None:
        for command in ("git push", "git push origin main", "git push -q origin main 2>&1 | tail -2",
                        "git commit -m x && git push", "cd repo; git -C . push"):
            self.assertTrue(ci_check.is_push(command), command)

    def test_not_pushes(self) -> None:
        for command in ("git status", "git log --oneline", "git push --dry-run", "git push -n origin main",
                        "echo pushing", "git stash push"):
            self.assertFalse(ci_check.is_push(command), command)


class JobsTest(unittest.TestCase):
    JOBS = [
        {"name": "Python 3.11 on macos-latest", "conclusion": "failure"},
        {"name": "Python 3.11 on ubuntu-latest", "conclusion": "success"},
        {"name": "JS tests", "conclusion": "skipped"},
    ]

    def test_failed_jobs(self) -> None:
        self.assertEqual(ci_check.failed_jobs(self.JOBS), ["Python 3.11 on macos-latest"])

    def test_job_lines(self) -> None:
        self.assertEqual(ci_check.job_lines(self.JOBS)[0], "  Python 3.11 on macos-latest: failure")


class FailureLinesTest(unittest.TestCase):
    def test_picks_failures_and_drops_noise(self) -> None:
        log = "\n".join([
            "JS tests\tJS tests (Chrome)\t2026-11-25T23:05:05.6046889Z FAIL markdown safety: took 6688 ms",
            "JS tests\tJS tests (Chrome)\t2026-11-25T23:05:05.6047460Z ok   all fine",
            "JS tests\tJS tests (Chrome)\t2026-11-25T23:05:05.6157614Z ##[error]Process completed with exit code 1.",
        ])
        self.assertEqual(ci_check.failure_lines(log),
                         ["  [JS tests / JS tests (Chrome)] FAIL markdown safety: took 6688 ms"])

    def test_keeps_only_the_last_lines(self) -> None:
        log = "\n".join(f"FAIL test {n}" for n in range(ci_check.MAX_FAILURE_LINES + 10))
        lines = ci_check.failure_lines(log)
        self.assertEqual(len(lines), ci_check.MAX_FAILURE_LINES)
        self.assertEqual(lines[-1], f"  FAIL test {ci_check.MAX_FAILURE_LINES + 9}")


if __name__ == "__main__":
    unittest.main()
