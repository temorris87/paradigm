---
name: feature
description: Paradigm's feature pipeline. Use when Tyson types "build feature" or /feature - takes the first open backlog.md item (or resumes the one in progress) through plan, spec, the feature-build workflow (lanes, integrate, gate, review, docs, fixes, browser check) and close.
---
# Build the next feature

One feature at a time. The order below is the pipeline: don't skip or reorder a step, and let
`tools/pipeline_state.py` record where it stands. Use `python3` on a Mac or Linux, `python` on
Windows.

## 0. Resume or start
Run `python3 tools/pipeline_state.py status`.
- If a feature is in progress, carry it on from its first phase still owed. A phase recorded
  `blocked` waits on Tyson: tell him why, and ask what he wants. Once he says how, make the fix
  (or have the owning lane agent make it). Then resume by running `feature-build` again with
  `startAt`, rather than running its phases by hand:
  - `gate` after a code change (it re-runs the gate, review, browser check, docs and close);
  - `browser` when only the browser phase is owed;
  - `docs` or `close` when only those are owed.
- If nothing is in progress, take the first `- [ ]` item in `backlog.md`, quoted exactly. If
  there is none, say so and stop.

## 1. Plan (with Tyson, in plan mode)
1. Enter plan mode. Read the right `docs/spec/<area>.md` file and the folder `CLAUDE.md` files
   the item touches. Send up to 3 Explore agents in parallel: one on the Python side, one on the
   front end, and one on what already exists that it could reuse or that it changes.
2. Write the plan as the spec draft, following `docs/features/_template.md`: what it does, with
   every key; the data and what trash, restore and archive do to it; the exact API contract;
   which lane owns which files; the migration number (one past the highest in
   `paradigm/db/migrations/`); numbered acceptance checks; and what it leaves out.
3. Ask the open design questions in prose in the plan, and give each one the default you will
   build if he says nothing ("Default: in Files, not a section of its own"). Tyson answers by
   rejecting ExitPlanMode with comments: don't use multiple-choice popups for design. Revise
   until he approves. **Approval with no comments means every default stands.** Write each one
   into the spec as "(default, approved by Tyson, YYYY-MM-DD)", not as a choice he made.
4. Acceptance checks carry the edge cases as well as the happy path: data that is trashed,
   stale (the other window changed it), empty, or nested. If you think of another check later,
   even while the build runs, add it to the spec's checks so the workflow's fix loop covers it,
   instead of handing it to an agent on the side.

## 2. Spec and ledger
1. Write the approved spec to `docs/features/NNN-slug.md`, where NNN is one past the highest
   spec number there (it has nothing to do with the migration number). Mark each of his
   decisions "(Tyson, YYYY-MM-DD)", and each default he approved without comment as above.
2. `python3 tools/pipeline_state.py start <slug> docs/features/NNN-slug.md`
3. `python3 tools/pipeline_state.py record implement running --note "feature-build started"`

## 3. Build: the feature-build workflow
Run the saved workflow `feature-build` with args
`{"slug": "<slug>", "spec": "docs/features/NNN-slug.md", "today": "YYYY-MM-DD",
"item": "<the backlog item, quoted exactly>", "lanes": ["backend", "frontend"]}`.
It runs in the background; tell Tyson it has started, in one line.
- **Size it to the feature.** List only the lanes that change code. A lane with nothing to build
  but tests for code that already exists is not a lane: drop it, and say in the spec that those
  tests are left out. Pass `"integrate": false` when there is one lane, or when the spec's
  contract adds or changes no route (the integrator would have nothing to join).
- **What it does:**
  1. Runs the gate on the untouched tree first. A failure that was already there gets one fix
     outside the fix rounds, or blocks before any build.
  2. Runs the lanes side by side and integrates them.
  3. Runs the gate, then reviews. The review reports every finding in one pass, each verified and
     ranked `important` or `nit`. After a fix round, review re-checks only those fixes. Only
     `important` findings block; nits come back in `nits`.
  4. Fixes in at most 3 rounds, then checks in the browser.
  5. Writes docs last, with what the fixes changed.
  6. Checks off the backlog item and closes the ledger.

## 4. Report
When the workflow finishes, read what it returned and `python3 tools/pipeline_state.py status`.
- **done**: tell Tyson:
  - what was built and the gate result;
  - what review found and fixed, and the `nits` left for him;
  - from the browser check: its `mode`, what was checked, and what is left for him,
    Windows-only behaviour included.

  An `api` mode check never drove a real browser: say so plainly. Don't commit unless he asks; a commit runs the gate again.

## 5. Push (only when he asks)
A push runs the `ci-check` hook: it waits for CI on the pushed commit (Python on Windows, Mac and
Linux; JS in Chrome and Firefox). Green: report it with the push. Red: the hook sends back the
failing jobs and their error lines. Diagnose the cause, fix it, re-run the gate, commit, and push
again until CI is green, then tell Tyson what failed and what fixed it. Not verified: say so.
- **blocked**: tell him the phase, why, and what was tried. The ledger says `blocked`, so the
  session can end. Fix it only once he says how.

Never mark a phase passed that did not run. `.pipeline/` is local working state: never commit it.
