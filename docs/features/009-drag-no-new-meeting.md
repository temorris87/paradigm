# 009 Dragging a block opens a new-meeting dialog

Status: built (2026-11-26)
Backlog item: "Moving a meeting around on the calendar always opens a new meeting dialog: bug."
Decided with Tyson: 2026-11-26 (plan approved with no comments: every default stands)
Lanes: frontend (integrate: false; no route added or changed)
Migration: none
Batch: 2026-11-26 (built side by side with specs 009–015, merged on `batch/2026-11-26`)

## Context: the cause
`calendar/drag.js` ends a drag on a `pointerup` on `window`. The browser then fires
a `click` on the nearest common ancestor of the press and the release. The press is on the
block; the release is on the column under it, because the ghost is `pointer-events: none`. So
the `click` reaches `.cal-body`'s `onBodyClick` (`grid-view.js:155`). That finds no
`.cal-block`, works out the slot and calls `onSlotClick`, which runs `newMeetingAt`. The same
happens when you drag a task block, and when you resize a block by its bottom edge. The move
itself is saved correctly (`/api/meeting/update` never creates a meeting).

## What it does
After a real drag (moved 4 px or more; a smaller move is still a click that
opens the block's menu), `drag.js` swallows the one `click` that follows. It does this in the
capture phase on `window`, and the listener drops itself on the next tick, so a later click on
an empty slot still makes a meeting. Moving, resizing and Escape mid-drag work as now.

## Data
None: no table or column changes; trash, restore, archive and purge are unchanged.

## API contract
No route is added or changed; the front end uses the routes it already calls.

## Files
- Backend lane: none.
- Frontend lane (paths under `static/js/` unless shown in full): `static/js/calendar/drag.js`, plus a test in `tests/js/` (a fake pointer sequence
checks that no slot click fires).

## Acceptance checks
1. Drag a meeting to another day or time: it moves and no dialog opens.
2. The same
for a task block.
3. Resize either kind by its bottom edge: no dialog.
4. Afterwards, a click
on an empty slot still opens New meeting.
5. A press without a move still opens the block's
menu.
6. Escape mid-drag puts the block back, with no dialog.

## Not in this feature
Nothing else was discussed.

## As built
- `static/js/calendar/drag.js`: after a real drag, `swallowNextClick()` adds a capture-phase
  `click` listener on `window` that drops one click and removes itself, and is removed by a
  `setTimeout(…, 0)` whether or not a click came.
- One addition to the plan: Escape mid-drag ends the drag while the button is still down, so the
  release would still click an empty slot. `swallowClickAfterRelease()` waits for that pointer's
  `pointerup` (or `pointercancel`) and then swallows the click that follows it.
- Test: `tests/js/test_calendar_drag.js` (imported in `tests/js/index.html`) drives fake pointer
  sequences: drag and drop, Escape mid-drag, a press without a move, and a later slot click.
- No fix rounds.
