"""The batch pipeline's tools: worktrees, the batch ledger, and hooks that judge a command in the
tree it runs in. Each test makes its own throwaway git repo in a temporary folder."""
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

TOOLS = pathlib.Path(__file__).resolve().parents[2] / "tools"
sys.path.insert(0, str(TOOLS))

import claude_hooks  # noqa: E402
import pipeline_batch  # noqa: E402
import worktree  # noqa: E402

GIT = shutil.which("git")


def run_git(cwd, *args):
    subprocess.run(["git", "-c", "user.name=Test", "-c", "user.email=test@example.com", *args],
                   cwd=str(cwd), check=True, capture_output=True, text=True, encoding="utf-8")


@unittest.skipUnless(GIT, "git is not installed")
class RepoCase(unittest.TestCase):
    """A repo at <tmp>/repo on main with one commit; worktrees go to <tmp>/paradigm-wt."""

    def setUp(self):
        self.tmp = pathlib.Path(tempfile.mkdtemp()).resolve()
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.repo = self.tmp / "repo"
        self.repo.mkdir()
        run_git(self.repo, "init", "-q", "-b", "main")
        (self.repo / ".gitignore").write_text(".pipeline/\n", encoding="utf-8")
        (self.repo / "tools").mkdir()
        (self.repo / "tools" / "x.py").write_text("x = 1\n", encoding="utf-8")
        run_git(self.repo, "add", "-A")
        run_git(self.repo, "commit", "-q", "-m", "first")


class WorktreeTest(RepoCase):
    def test_create_makes_a_branch_beside_the_repo(self):
        target, branch = worktree.create("alpha", start=self.repo)
        self.assertEqual(target, self.tmp / "paradigm-wt" / "alpha")
        self.assertEqual(branch, "feature/alpha")
        self.assertTrue((target / "tools" / "x.py").is_file())
        self.assertEqual(worktree.main_root(target), self.repo)
        self.assertEqual(worktree.root_of(target / "tools"), target)

    def test_create_copies_the_spec_written_in_the_main_tree(self):
        spec = self.repo / "docs" / "features" / "009-alpha.md"
        spec.parent.mkdir(parents=True)
        spec.write_text("# 009 Alpha\n", encoding="utf-8")
        run_git(self.repo, "add", "-A")
        run_git(self.repo, "commit", "-q", "-m", "spec")
        target, _ = worktree.create("alpha", spec="docs/features/009-alpha.md", start=self.repo)
        self.assertEqual((target / "docs/features/009-alpha.md").read_text(encoding="utf-8"), "# 009 Alpha\n")

    def test_create_refuses_a_dirty_main_tree(self):
        (self.repo / "tools" / "x.py").write_text("x = 2\n", encoding="utf-8")
        with self.assertRaises(SystemExit) as caught:
            worktree.create("alpha", start=self.repo)
        self.assertIn("uncommitted", str(caught.exception))

    def test_pipeline_state_does_not_make_the_tree_dirty(self):
        (self.repo / ".pipeline").mkdir()
        (self.repo / ".pipeline" / "batch.json").write_text("{}", encoding="utf-8")
        self.assertEqual(worktree.dirty(self.repo), [])

    def test_remove_keeps_a_branch_that_was_never_merged(self):
        target, _ = worktree.create("alpha", start=self.repo)
        (target / "new.txt").write_text("work\n", encoding="utf-8")
        run_git(target, "add", "-A")
        run_git(target, "commit", "-q", "-m", "work")
        deleted, _ = worktree.remove("alpha", start=self.repo)
        self.assertFalse(target.exists())
        self.assertFalse(deleted)
        branches = subprocess.run(["git", "branch"], cwd=self.repo, capture_output=True, text=True).stdout
        self.assertIn("feature/alpha", branches)


class BatchLedgerTest(RepoCase):
    def setUp(self):
        super().setUp()
        patcher = mock.patch.object(pipeline_batch, "batch_path", return_value=self.repo / ".pipeline" / "batch.json")
        patcher.start()
        self.addCleanup(patcher.stop)
        current = mock.patch.object(pipeline_batch.pipeline_state, "current_slug", return_value=None)
        current.start()
        self.addCleanup(current.stop)

    def start(self, *slugs):
        pipeline_batch.start("2026-12-01", "/wt/batch", "batch/2026-12-01")
        for slug in slugs:
            pipeline_batch.add(slug, f"docs/features/{slug}.md", f"Item {slug}", f"/wt/{slug}", f"feature/{slug}")

    def test_building_features_are_waiting_not_owed_to_stop(self):
        self.start("alpha", "beta")
        batch = pipeline_batch.active()
        self.assertTrue(pipeline_batch.waiting(batch))
        self.assertEqual(len(pipeline_batch.owed(batch)), 3)

    def test_built_and_not_merged_is_owed(self):
        self.start("alpha")
        pipeline_batch.set_state("alpha", "built")
        batch = pipeline_batch.active()
        self.assertFalse(pipeline_batch.waiting(batch))
        self.assertEqual(pipeline_batch.owed(batch), ["alpha: built", "merge: waiting"])

    def test_merged_or_left_out_with_a_passed_merge_is_complete(self):
        self.start("alpha", "beta")
        pipeline_batch.set_state("alpha", "merged")
        pipeline_batch.set_state("beta", "left-out", "key clash with alpha")
        pipeline_batch.set_merge("pass")
        self.assertEqual(pipeline_batch.owed(pipeline_batch.active()), [])

    def test_a_blocked_feature_waits_on_tyson_and_stays_owed(self):
        self.start("alpha")
        pipeline_batch.set_state("alpha", "blocked", "gate")
        batch = pipeline_batch.active()
        self.assertTrue(pipeline_batch.waiting(batch))
        self.assertIn("alpha: blocked", pipeline_batch.owed(batch))

    def test_at_most_ten_features_and_no_second_batch(self):
        self.start(*[f"f{n}" for n in range(10)])
        with self.assertRaises(SystemExit):
            pipeline_batch.add("f10", "s", "i", "w", "b")
        with self.assertRaises(SystemExit):
            pipeline_batch.start("2026-12-02", "/wt/b", "batch/x")

    def test_unknown_states_are_refused(self):
        self.start("alpha")
        with self.assertRaises(SystemExit):
            pipeline_batch.set_state("alpha", "done")
        with self.assertRaises(SystemExit):
            pipeline_batch.set_merge("done")


class HookRootTest(RepoCase):
    def setUp(self):
        super().setUp()
        self.tree, _ = worktree.create("alpha", start=self.repo)

    def event(self, command, cwd=None):
        return {"tool_input": {"command": command}, "cwd": str(cwd or self.repo)}

    def test_a_leading_cd_names_the_tree(self):
        self.assertEqual(claude_hooks.command_root(self.event(f"cd {self.tree} && git status")), self.tree)
        self.assertEqual(claude_hooks.command_root(self.event(f'cd "{self.tree}/tools"; git status')), self.tree)

    def test_git_dash_c_names_the_tree(self):
        self.assertEqual(claude_hooks.command_root(self.event(f"git -C {self.tree} commit -m x")), self.tree)

    def test_otherwise_the_session_cwd(self):
        self.assertEqual(claude_hooks.command_root(self.event("git status", cwd=self.tree)), self.tree)
        self.assertEqual(claude_hooks.command_root(self.event("git status")), self.repo)

    def test_rewrite_is_refused_only_in_the_tree_with_a_feature_in_progress(self):
        (self.tree / ".pipeline").mkdir()
        (self.tree / ".pipeline" / "current").write_text("alpha\n", encoding="utf-8")
        with mock.patch("sys.stderr"):
            self.assertEqual(claude_hooks.commit_gate(self.event(f"cd {self.tree} && git stash")), 2)
        self.assertEqual(claude_hooks.commit_gate(self.event("git stash list")), 0)


class EditGuardTest(RepoCase):
    def guard(self, path, batch):
        with mock.patch.object(pipeline_batch, "active", return_value=batch), \
                mock.patch.object(worktree, "main_root", return_value=self.repo), mock.patch("sys.stderr"):
            return claude_hooks.edit_guard({"tool_input": {"file_path": str(path)}})

    def test_main_tree_code_is_refused_during_a_batch(self):
        self.assertEqual(self.guard(self.repo / "tools" / "x.py", {"date": "d"}), 2)

    def test_worktrees_docs_and_no_batch_are_allowed(self):
        self.assertEqual(self.guard(self.tmp / "paradigm-wt" / "alpha" / "tools" / "x.py", {"date": "d"}), 0)
        self.assertEqual(self.guard(self.repo / "backlog.md", {"date": "d"}), 0)
        self.assertEqual(self.guard(self.repo / "tools" / "x.py", None), 0)


class StopCheckTest(unittest.TestCase):
    def stop(self, batch):
        with mock.patch.object(claude_hooks, "_feature_owed", return_value=None), \
                mock.patch.object(pipeline_batch, "active", return_value=batch), \
                mock.patch("sys.stdout") as out:
            claude_hooks.stop_check({})
        written = "".join(call.args[0] for call in out.write.call_args_list)
        return json.loads(written) if written else None

    def batch(self, *states, merge="waiting"):
        return {"date": "d", "merge": {"state": merge, "note": ""},
                "features": [{"slug": f"f{i}", "state": s} for i, s in enumerate(states)]}

    def test_a_built_batch_not_merged_keeps_the_session_going(self):
        self.assertEqual(self.stop(self.batch("built", "merged"))["decision"], "block")

    def test_building_or_done_lets_it_stop(self):
        self.assertIsNone(self.stop(self.batch("building", "built")))
        self.assertIsNone(self.stop(self.batch("merged", merge="pass")))
        self.assertIsNone(self.stop(None))


if __name__ == "__main__":
    unittest.main()
