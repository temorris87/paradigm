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
  `blocked` waits on Tyson: tell him why, and ask what he wants.
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
3. Ask the open design questions in prose in the plan. Tyson answers by rejecting ExitPlanMode
   with comments: don't use multiple-choice popups for design. Revise until he approves.

## 2. Spec and ledger
1. Write the approved spec to `docs/features/NNN-slug.md`, where NNN is one past the highest
   spec number there (it has nothing to do with the migration number). Mark each of his
   decisions "(Tyson, YYYY-MM-DD)".
2. `python3 tools/pipeline_state.py start <slug> docs/features/NNN-slug.md`
3. `python3 tools/pipeline_state.py record implement running --note "feature-build started"`

## 3. Build: the feature-build workflow
Run the saved workflow `feature-build` with args
`{"slug": "<slug>", "spec": "docs/features/NNN-slug.md", "today": "YYYY-MM-DD",
"item": "<the backlog item, quoted exactly>", "lanes": ["backend", "frontend"]}`
(only the lanes the spec uses). It runs in the background; tell Tyson it has started, in one line.
It runs the lanes side by side, then integrates, runs the gate, reviews with each finding
verified, writes docs alongside, fixes in at most 3 rounds, checks in the browser, checks off
the backlog item and closes the ledger.

## 4. Report
When the workflow finishes, read what it returned and `python3 tools/pipeline_state.py status`.
- **done**: tell Tyson what was built, the gate result, what review found and fixed, and from
  the browser check what was checked and what is left for him, Windows-only behaviour
  included. Don't commit unless he asks; a commit runs the gate again.
- **blocked**: tell him the phase, why, and what was tried. The ledger says `blocked`, so the
  session can end. Fix it only once he says how.

Never mark a phase passed that did not run. `.pipeline/` is local working state: never commit it.
