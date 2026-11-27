# The feature pipeline

How the pieces fit together. The steps themselves are in `.claude/skills/feature/SKILL.md` (one
feature) and `.claude/skills/features/SKILL.md` (a batch).

## Pieces
| Piece | Job |
|---|---|
| `tools/pipeline_state.py` | A feature's phase ledger, in `<tree>/.pipeline/<slug>/state.json`. Each tree has its own, and each record is fingerprinted, so a change after a check makes it stale. |
| `tools/pipeline_batch.py` | The batch ledger, in the main tree's `.pipeline/batch.json`: each feature's worktree, branch and state, and the merge. |
| `tools/worktree.py` | Makes and removes the worktrees beside the repo, in `../paradigm-wt/<name>`. Refuses to start from a main tree with uncommitted work. |
| `tools/pipeline_gate.py` | Every automatic check, on the tree it lives in. |
| `tools/claude_hooks.py` | `commit-gate`, `ci-check`, `stop-check` and `edit-guard`; each judges a command in the tree it runs in. |
| `.claude/workflows/feature-build.js` | One feature: baseline, lanes, integrate, gate, review, fixes, browser, docs, close. With `root` it works in a worktree. With `merge: false` it commits on its branch and leaves `backlog.md` alone. |
| `.claude/workflows/feature-batch.js` | Up to 10 `feature-build` runs side by side, then the merge, a re-review of what the merge touched, browser re-checks and the close. |
| `.claude/agents/feature-merger.md` | Joins the feature branches in backlog order: resolves conflicts keeping both sides, renumbers migrations, leaves a feature out on a key clash. |

## A batch, start to end
```
main (clean) ── worktree.py create ──> ../paradigm-wt/<slug>        on feature/<slug>   (×N, N ≤ 10)
                                       ../paradigm-wt/batch-<date>  on batch/<date>
feature-batch:
  feature-build per worktree, side by side ── commit on feature/<slug>
  feature-merger: git merge --no-ff each into batch/<date>, gate after each
  re-review (conflict, merger and overlap files) ── browser re-check (features the merge touched)
  close: backlog.md ticked, docs/features/batch-<date>.md, commit on batch/<date>
Tyson says commit: main ── git merge --ff-only batch/<date> ── gate ── batch finish ── worktrees removed
```

## Why it is built this way
- **One worktree per feature.** The lanes of two features would write the same `main.js`, key
  tables and `index.html` at once. A worktree also gives each feature its own `.pipeline/`, gate
  cache and fingerprints for free: the tools find their repo from their own path.
- **The main tree stays untouched during a batch.** `main` is fast-forwarded to the merge at the
  end, so any change there would be in the way. `edit-guard` refuses edits to its code while
  `batch.json` exists.
- **Migrations are renumbered at the merge, not planned ahead.** The gate refuses gaps, so a
  branch can't hold `031` without `030`. Each feature takes the next free number, and the merger
  renumbers them in backlog order.
- **The backlog is ticked once, by the merge.** Ten branches each ticking their own line of
  `backlog.md` would conflict ten times.
- **Re-review and re-check only what the merge touched.** Every feature passed its own review
  and browser check. What joining them can break is the files both changed, the files the
  merger edited, and the overlaps the plan named.
- **Branches are never pushed.** Only `main` is, after the fast-forward, and CI then checks it as
  usual (`ci-check`).
