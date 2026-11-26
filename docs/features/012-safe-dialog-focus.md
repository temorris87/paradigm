# 012 Dialogs that destroy start on the safe button

Status: built (2026-11-26)
Backlog item: "The "Cancel the meeting" dialog opens with the focus on its destructive button, so pressing Enter straight away cancels the meeting: focus the safe choice instead."
Decided with Tyson: 2026-11-26 (plan approved with no comments: every default stands)
Lanes: frontend (integrate: false; no route added or changed)
Migration: none
Batch: 2026-11-26 (built side by side with specs 009–015, merged on `batch/2026-11-26`)

## Context: the cause
`ui/dialog.js:130` focuses OK in a dialog with no fields unless `safeFocus` is set.
Only Delete task sets it.

## What it does
- In `dialog.js`, `danger: true` implies `safeFocus`, so every red confirm opens on its safe
  button: Cancel the meeting, Move to trash (note, folder), Clear rota, Remove a holiday,
  Unlink folder, Remove from the template, Delete plan template (both). Enter straight away
  closes the dialog and does nothing. Tab then Enter, a click, or Ctrl-Enter (a deliberate
  chord) still confirms. (default, approved by Tyson, 2026-11-26)
- In the Cancel the meeting dialog, the safe button reads "Keep the meeting" instead of
  "Cancel", so two "Cancel"s don't sit side by side. (default, approved by Tyson, 2026-11-26)
- Focus comes back to the block after either choice, as now.

### Open questions
should "Make it a plain note" (its dates go) and "Make it a decision", which
aren't red, also start on Cancel? Decided: no, they stay as they are. (default, approved by Tyson, 2026-11-26)

## Data
None: no table or column changes; trash, restore, archive and purge are unchanged.

## API contract
No route is added or changed; the front end uses the routes it already calls.

## Files
- Backend lane: none.
- Frontend lane (paths under `static/js/` unless shown in full): `ui/dialog.js`, `calendar/calendar-page.js` (the label), and tests.

## Acceptance checks
1. Cancel the meeting, then Enter at once: the meeting isn't cancelled, and the
focus is on its block.
2. Tab to "Cancel the meeting", then Enter: it is cancelled.
3. Move to
trash on a note, then Enter: nothing is trashed.
4. Clear rota, then Enter: the rota is kept.
5. Delete task still behaves as before.
6. A dialog with fields (Edit time…) still starts in its
first field.

## Not in this feature
Non-red confirms ("Make it a plain note", "Make it a decision") keep focusing OK.

## As built
- `ui/dialog.js`: `danger` implies `safeFocus` (a dialog with fields still starts in its
  first field), and `formDialog` / `confirmDialog` take a new `cancel` option, the safe
  button's label (default "Cancel"). `confirmDialog` passes every other option through.
- `calendar/calendar-page.js`: Cancel the meeting passes `cancel: "Keep the meeting"`.
- Added in the fix round (browser check): choosing Not cancelled from a cancelled meeting's
  block menu runs with no dialog, so the focus was left on the page body. `cancelMeeting` now
  puts the focus back on the block (or the calendar, if the block was redrawn) after it, too.
  Test: "Not cancelled, with no dialog, puts the focus on the block" in
  `tests/js/test_calendar_focus.js`; the dialog cases are in `tests/js/test_ui.js`.
- API, routes and data: unchanged, as planned.
