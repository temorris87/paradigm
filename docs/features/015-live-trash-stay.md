# 015 Trashing never pulls the main window to Live

Status: built
Backlog item: "The main window once jumped to the Live page instead of staying on the task page it had open, after a note had been trashed (seen once, not reproduced)."
Decided with Tyson: 2026-11-26 (plan approved with no comments: every default stands)
Lanes: frontend (integrate: false; no route added or changed)
Migration: none
Batch: 2026-11-26 (built side by side with specs 009–015, merged on `batch/2026-11-26`)

## Context: the candidate causes
Not reproduced; the explore pass found three paths that can switch the main window to Live after a trash. Each is fixed below.

## What it does
1. In `live/live-sender.js`, a key, click or focus change in the note window while the trash is
   in flight clears the hold. Then `redrawn()` resets `quiet` when the id changes, so the next
   note goes out as fresh and the main window switches.
   Fix: from `trashed()` until the next note has been sent once, every message goes out as
   `reply: true`, whatever `touched()` and `redrawn()` do in between. A throttled send waiting
   on its timer carries the flag it was queued with.
2. A note trashed elsewhere (from the main window, an ancestor or hub, a Resources folder):
   the note window's `leaveTrashed` opens another note with no hold, so the main window
   switches. Fix: `leaveTrashed` goes through the same quiet path as `trashCommand`.
3. Trashing from the main window (`:trash`, or a crumb's note menu) can `open(next)` a plain
   note, which calls `openInNoteWindow` and so `showView("live")`. Fix: after a trash, the main
   window goes to the next dashboard (the parent's, else the first top-level one), as the spec
   already says for the note window. It never opens a plain note and never switches to Live.

Tyson's own opens (tree, Go to, `gn`, Window ▾ Live note) still switch to Live, as now.

All three fixes are the plan's default (default, approved by Tyson, 2026-11-26).

## Data
None: no table or column changes; trash, restore, archive and purge are unchanged.

## API contract
No route is added or changed; the front end uses the routes it already calls.

## Files
- Backend lane: none.
- Frontend lane (paths under `static/js/` unless shown in full): `live/live-sender.js`, `live/live-page.js` (only if the reply flag needs it),
`notes/app.js` (`trashCommand`, `leaveTrashed`), and tests (the sender with scripted events,
where a `touched()` mid-trash is case 1).

## Acceptance checks
1. Main window on a task page, note window on a note of it: `:trash` the note in
the note window, typing a key straight away. The main window stays on the task page ("Its note
is in the trash").
2. Trash the note's hub from the main window: the main window goes to a
dashboard, not Live.
3. Trash a plain top-level note from the main window's palette: it goes to
a dashboard, not Live.
4. Afterwards, opening a note from the tree still switches to Live.
5. `gn` still works.

## Not in this feature
Nothing else was discussed.

## As built
Built as planned, except:
- `afterTrash` in `live/live-sender.js` (case 1) is cleared by `redrawn()` once a different
  note opens than the one that opens by itself after the trash (`afterTrash.next`). That
  includes the trashed note itself, restored and opened again: it goes out as news over its
  "Moved to trash", and its typing reaches the Live page again. Before, a next note nobody
  touched left the hold set and froze the Live page on that note.
- `dashboardAfter(parent, gone)` in `notes/app.js` picks the dashboard for both
  `trashCommand` (main window) and `leaveTrashed`. The note window's `trashCommand` still uses
  `nextAfterDeleting`.
- With no dashboard left, the main window's `trashCommand` goes Home
  (`showView("home", "push")`) instead of staying on the gone note's page. In the note window,
  both `trashCommand` and `leaveTrashed` call a new `showNoNote()`: the editor empties, goes
  read-only and the agenda box closes, so typing cannot save nowhere; `switchTo` makes the
  editor editable again when a note opens. (The no-next path was there before the feature.)
- `trashCommand` now starts with `if (id === null) throw new Error("E: no note is open")`, as
  `exportCommand` does. With every hub trashed the main window has no note, and `:trash` used
  to send id null (a 400, "E: id must be a whole number"). Check 3 cannot be done as written:
  while any dashboard exists a plain top-level note is never the main window's note, and with
  none left `:trash` now says "E: no note is open" and stays put.
- Outside the plan, found by the browser check (there before the feature): Log status…
  and its history (`status/status-commands.js`) fall back to `app.focusNote?.()` when what
  opened them is gone, so Escape after opening it from the crumb ▾ gives the focus back to the
  page and `L` works again.
- `live/live-page.js` needed no change.
