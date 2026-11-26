# 011 The note window on the 5120×2160 screen

Status: built (2026-11-26)
Backlog item: "Work display resolution is 5120x2160, the right 1/3 is slightly misaligned by default when it loads."
Decided with Tyson: 2026-11-26 (plan approved with no comments: every default stands)
Lanes: frontend (integrate: false; no route added or changed)
Migration: none
Batch: 2026-11-26 (built side by side with specs 009–015, merged on `batch/2026-11-26`)

## Context: likely causes (I can't reproduce this on the Mac)
`windows/note-window.js` places the
window once, while it is still `about:blank`, before `note.html` loads, and never again. Its
box is the screen's right third in CSS px. Two things are left out:
- Windows 10/11's invisible resize border, about 7 px a side. `moveTo`/`resizeTo` place the
  outer frame including it, so the visible edge sits in from where it should, leaving a gap at
  the screen's edge and at the bottom.
- Fractional device pixels under display scaling. At 125% the right third starts at 3413.75
  device px.

## What it does
- Once `note.html` has loaded, the note window places itself again with the same box. When it
  is the window that was opened onto the right third (not forced to the whole screen, and only
  on first load, not on every note), it grows by the invisible border. That border is estimated
  as `(outerWidth − innerWidth) / 2` (left, right and bottom; capped at 10 px; 0 on the Mac,
  where it is 0 anyway).
- The left edge is rounded to whole device pixels (`devicePixelRatio`).
- Window ▾'s "right third" places it again the same way, so a misplaced window can be fixed
  without closing it.

This whole approach is the plan's default (default, approved by Tyson, 2026-11-26).

### Open questions
what does "slightly misaligned" look like? A gap between the two windows, a
gap at the right or bottom edge, or overlapping the main window? That decides which fix is
right. Decided: the build above, which closes edge gaps from the invisible border and from
rounding. If yours is an overlap with a main window that FancyZones or Snap has placed, tell
me, because the page can't move the main window. (default, approved by Tyson, 2026-11-26)

## Data
None: no table or column changes; trash, restore, archive and purge are unchanged.

## API contract
No route is added or changed; the front end uses the routes it already calls.

## Files
- Backend lane: none.
- Frontend lane (paths under `static/js/` unless shown in full): `windows/note-window.js` (a pure `noteWindowBox` that takes the border and the
ratio, and is unit-tested with fake screens: 5120×2160 at 100/125/150%, 3440×1440, a laptop)
and `note-main.js` (the one re-place after load).

## Acceptance checks
1. Unit: on 5120×2160 at 100% the box is x 3413, w 1707, h = availHeight, and with an
8 px border it is x 3405, w 1723, h + 8.
2. On a laptop-sized screen it is still the whole
screen.
3. Browser (headless can't show a real screen): the note window opens and the re-place
runs once without errors; a second note opened in it doesn't move it. Tyson checks it on the
work PC.

## Not in this feature
Placing the main window (the page can't); a real check on the 5120×2160 screen, which Tyson does on the work PC.

## As built (differences from the plan)
- **No growth by the invisible border.** Chrome (Blink, every platform) clamps every window
  rect to `screen.avail*`, so a box grown past the screen is pulled back: the window shifts
  left over the main window by the border and loses the extra height, and the edge gaps stay.
  `placeNoteWindow` places exactly the right third (on the work screen at 100%: x 3413,
  1707 × availHeight). `noteWindowBox`'s `border` option and `frameBorder()` stay (acceptance
  check 1 still tests the 8 px box as a pure function) but are unused when placing; turning
  the growth back on is one line if Chrome on Windows proves not to clamp. Tyson checks this
  on the work PC.
- **Move, resize, move.** `place()` calls `moveTo`, `resizeTo`, then `moveTo` again: with the
  clamping, a window wider than its target was held at the left edge by the first move. A
  unit test with a clamping fake window covers right third and back to whole screen.
- **Whole CSS px only.** `moveTo`/`resizeTo` take integers, so `noteWindowBox` returns whole
  CSS px: the left edge is rounded, then moved (up to 2 px, leftward on a tie) to one that
  also falls on a whole device pixel; width is right edge minus left, so the right edge is
  exact. At 125% (availWidth 4096) the box is 2732/1364. `frameBorder` rounds too.
- **Page zoom.** A new pure `isZoomed(win)` (border estimate below 0 or over the 10 px cap)
  turns device-pixel rounding off, since a zoomed `devicePixelRatio` isn't the screen's.
- **The "placed" mark** lives in sessionStorage, which `window.open` copies; `forgetPlaced()`,
  called by `main.js` at start, drops it, so a later note window is re-placed on first load.
- `connection/changes.js` gains a `{ type: "place", to: "note", mode }` message (Window ▾
  right third tells the open note window to re-place itself).
