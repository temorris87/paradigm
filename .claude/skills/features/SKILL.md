---
name: features
description: Paradigm's batch pipeline. Use when Tyson types "build features" or /features - plans up to 10 open backlog.md items together with him, builds each in its own git worktree side by side (the feature-batch workflow runs feature-build per feature), then the feature-merger joins them into one batch branch that main is fast-forwarded to when he says commit.
---
# Build the next features, side by side

The single-feature pipeline (`/feature`, `.claude/skills/feature/SKILL.md`) is unchanged. This is
the same pipeline, run once per feature in its own worktree, plus a merge. Everything there about
the plan, the spec and defaults holds here too. Use `python3` on a Mac or Linux and `python` on
Windows. Batches run on the Mac: the work PC only pulls.

## 0. Resume or start
`python3 tools/pipeline_batch.py status`.
- **A batch is in progress:** carry it on. A feature or merge marked `blocked` waits on Tyson:
  tell him why, and do what he says. That is either a fix in that feature's worktree, then
  `feature-build` again with its `root`, `merge: false` and a `startAt`, or
  `pipeline_batch.py set <slug> left-out`. Once every built feature is settled, run the merge
  again through `feature-batch` with only the built features, or finish (step 5).
- **A single feature is in progress in the main tree** (`pipeline_state.py status`): a batch
  waits for it. Say so and stop.
- **`git status --porcelain` in the main tree isn't empty:** every branch starts from `main`, so
  work that isn't committed would be missing from all of them. Ask Tyson to commit first.
- **Otherwise:** take the open `- [ ]` items in `backlog.md` in order, up to 10, each quoted
  exactly. If there are none, say so and stop.

## 1. Plan the batch (with Tyson, in plan mode)
1. Enter plan mode. Read the `docs/spec/<area>.md` and folder `CLAUDE.md` files the items touch.
   Send at most 3 Explore agents in all, not 3 per item: split them by side (Python, front end,
   what exists to reuse or change), each covering every item.
2. Write one plan with a section per item, each laid out like `docs/features/_template.md`, with
   its open questions in prose and the default you will build. Tyson answers them all by
   rejecting ExitPlanMode with comments. Approval with no comment means every default stands;
   record each as "(default, approved by Tyson, YYYY-MM-DD)".
3. **Numbers.** Hand out spec numbers in backlog order, one past the highest in
   `docs/features/`. Migrations: each feature takes the next free number on its own branch
   (they may all be `030`). The gate refuses gaps, so the merger renumbers them in order. Say
   which items have a migration.
4. **Overlaps.** List each pair or group of items that will edit the same shared file (a key
   table, `main.js`, `commands.js`, `index.html`, the same `docs/spec` file) or the same route,
   with the files. Flag a key two items both want: that is a design question for Tyson now, not
   one for the merger to meet later.
5. **Dependencies.** An item that needs another's code ("after X") leaves this batch for the
   next one, unless Tyson says to build them as one feature. Default: it leaves the batch.
6. **Cost.** Say how many features run, and that each costs about what a single `/feature` run
   does.

## 2. Worktrees, specs and ledgers
For each approved item, in backlog order:
1. `python3 tools/worktree.py create <slug>` makes `../paradigm-wt/<slug>` on `feature/<slug>`.
2. Write its spec straight into the worktree: `../paradigm-wt/<slug>/docs/features/NNN-slug.md`.
   Don't write it in the main tree; the main tree stays untouched for the whole batch.
3. `cd <worktree> && python3 tools/pipeline_state.py start <slug> docs/features/NNN-slug.md`,
   then `record implement running --note "feature-batch started"` there.

Then the merge worktree, and the batch ledger, from the main tree:
- `python3 tools/worktree.py create batch-<date> --branch batch/<date>`
- `python3 tools/pipeline_batch.py start <date> --merge-worktree <path> --merge-branch batch/<date>`
- `python3 tools/pipeline_batch.py add <slug> --spec <spec> --item "<item>" --worktree <path> --branch feature/<slug>`
  for each feature.

## 3. Build: the feature-batch workflow
Run the saved workflow `feature-batch` with args:
`{"today": "YYYY-MM-DD", "main": "<main tree root>", "features": [{"slug", "spec", "item",
"lanes", "integrate", "worktree", "branch"}, ...], "overlaps": [{"features": [...], "files":
[...], "why": "..."}], "merge": {"worktree": "<merge worktree>", "branch": "batch/<date>"}}`.
Paths are absolute. Size each feature's `lanes` and `integrate` as `/feature` says. The workflow
runs in the background; tell Tyson it has started, in one line.

What it does:
1. Runs `feature-build` for each feature in its own worktree: baseline, lanes, integrate, gate,
   review, fixes, browser, docs. Close commits the feature on its branch and leaves
   `backlog.md` alone.
2. The `feature-merger` joins the built branches into `batch/<date>`, in backlog order. It
   resolves conflicts keeping both sides and renumbers migrations. On a key clash or a gate it
   can't clear, it leaves that feature out.
3. Re-reviews the files with conflicts, the files the merger changed and the overlaps, with up
   to 2 fix rounds.
4. Browser re-checks the features the merge touched.
5. Ticks `backlog.md` and writes `docs/features/batch-<date>.md` on the batch branch.

## 4. Report
Per feature: built or blocked (phase and why), fix rounds, nits, and the browser `mode` and
what's left for him. An `api` mode check never drove a real browser: say so. Then the merge:
what went in, what was left out and why, each conflict and how it was resolved, migrations
renumbered, the re-review and the gate.

## 5. Commit and push (only when he asks)
**Commit:** from the main tree, which must still be clean:
1. `git merge --ff-only batch/<date>`.
2. `python3 tools/pipeline_gate.py` on `main`.
3. `python3 tools/pipeline_batch.py finish`.
4. `python3 tools/worktree.py remove <slug>` for each feature, and `remove batch-<date> --branch
   batch/<date>`. It deletes only branches that are merged.

A `partial` batch (some features left out or blocked) can still be committed: what is on
`batch/<date>` is complete on its own. Mark each feature he doesn't want fixed now
`pipeline_batch.py set <slug> left-out` before `finish`. Its backlog item stays unchecked for the
next batch, and its branch stays (`remove` keeps unmerged branches).

Squash only if he says "squash": then use `git merge --squash batch/<date>` and one commit
instead of the fast-forward.

**Push:** `ci-check` waits for CI, as for `/feature`. If CI is red, diagnose it, fix it on `main`,
commit and push again until it is green, then tell him what failed.

Never mark a phase or a batch state passed that did not run. `.pipeline/` and `../paradigm-wt/`
are local working state: never commit them.
