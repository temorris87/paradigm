# 014 The focus stays on the block

Status: built (2026-11-26)
Backlog item: "Escape on a calendar block's menu leaves the focus on the page body instead of the block."
Decided with Tyson: 2026-11-26 (plan approved with no comments: every default stands)
Lanes: frontend (integrate: false; no route added or changed)
Migration: none
Batch: 2026-11-26 (built side by side with specs 009–015, merged on `batch/2026-11-26`)

## Context: the cause
Escape does focus the block (`ui/menu.js:136`). But `GridView.draw` rebuilds every
block node and never puts the focus back. The redraw can come from the window-focus import,
which starts on the same click that opens the menu, from another window's `changed`, or from
the ResizeObserver. When it lands after Escape, the focused node goes and the focus drops to
`<body>`. Menu choices with no dialog (Done, Remove, Not cancelled, Join) never refocus at all.
The same happens after Edit time… or Cancel the meeting, where the redraw comes after
`restoreFocus`.

## What it does
- `GridView.draw` notes whether the focus was on a block (by `data-key`) and puts it back on
  that block's new node. If the block is gone, the focus goes to the calendar (`.week-plan`).
  If the focus was elsewhere, it is left alone.
- A menu choice with no dialog ends with the focus on the block, or on the calendar when the
  block was removed.

## Data
None: no table or column changes; trash, restore, archive and purge are unchanged.

## API contract
No route is added or changed; the front end uses the routes it already calls.

## Files
- Backend lane: none.
- Frontend lane (paths under `static/js/` unless shown in full): `calendar/grid-view.js`, `calendar/calendar-page.js`, and tests (a fake redraw while
focused).

## Acceptance checks
1. Click a block, Escape: the focus is on the block (the outline shows, and `[`/`]`
still work).
2. Click a block, focus the note window and come back (the import redraws), then
Escape: still on the block.
3. Done from the menu: the focus is on the block.
4. Remove from
calendar: the focus is on the calendar, not the body.
5. Edit time… → Save: the focus is on the
block after the redraw.
6. Cancel the meeting → Keep the meeting: the focus is on the block.

## As built
Built as planned, with these details:
- `GridView.draw` reads the focused block's key (`focusedKey`) before rebuilding and calls
  `refocus(key)` after. When the block is gone it calls a new optional handler,
  `onFocusLost()`, and `CalendarPage` passes `() => this.focus()` (the calendar). The grid
  itself never focuses the page.
- Menu choices with no dialog go through `CalendarPage.stayOn(block, work)`: the block gets the
  focus at once, and again when the work settles, but only if the focus has dropped to
  `<body>` by then. Those choices are Open its note, Mark done / Open it again, Remove from
  calendar, Open the meeting, Join ↗, Not cancelled and Don't import. Open task, File it…,
  Edit time… and Cancel the meeting keep their own focus handling.
- Tests: `tests/js/test_calendar_focus.js` gained the redraw-while-focused cases (block kept,
  block gone, focus elsewhere left alone).
- Check 6 could not be run as written: in this worktree the Cancel the meeting dialog still
  has Cancel / Cancel the meeting with the focus on the danger button. "Keep the meeting" and
  the safe default focus belong to the sibling backlog item "focus the safe choice in the
  Cancel the meeting dialog". Recheck it on `batch/2026-11-26` after the merge. This feature
  does not change that dialog.

## Not in this feature
Nothing else was discussed.
