# 029 Timesheet at 1400 px

Status: built (2026-11-27)
Backlog item: Week, Timesheet tab at 1400 px wide: the right-hand panel ("Check before you submit", "This
  week off", "Not counted") is drawn over the hours grid's Thu, Fri and Total columns.
Decided with Tyson: 2026-11-27
Lanes: frontend
Migration: none

## What it does
The batch 2026-11-27b check found the panel no longer overlaps the grid. Instead the grid scrolls
sideways inside a column about 500 px wide: Thu, Fri and Total are cut off, and the time codes wrap
("NW-" / "220").

1. **The side panel goes under the grid when the grid can't fit beside it.**
   - At a window 1600 px wide or more, the grid and the panel sit side by side. The panel's
     column is at most 20rem.
   - Below 1600 px, the panel ("Check before you submit", "This week off", "Not counted", how it
     counts) goes under the grid at full width, its blocks in a row that wraps.
2. **The grid fits.**
   - Number cells lose the `6rem` minimum and keep about `4.5rem`, with tabular figures.
   - The Code column's codes never wrap (`white-space: nowrap`). A very long code is cut with
     "…" and has its full text as `title`.
3. At 1280, 1400 and 1600 px the whole grid (Code, Mon–Fri, Total) shows with **no sideways
   scroll** inside the Timesheet tab, sample data included.
4. Nothing else changes: the keys, the copy (`c`), and the Settings tab.

## Data
None.

## API contract
None.

## Files
- **Frontend lane:**
  - `static/css/week.css` (the `.time-week` rules: the columns and the breakpoint).
  - `static/css/timesheet.css` (the cells: the minimum widths, codes not wrapping).
  - `static/js/timesheet/time-page.js`: only if the long-code `title` needs it.
  - Tests: if a pure width rule falls out, a test in `tests/js`. Otherwise the browser check
    covers it.
- **Backend lane:** none.

## Acceptance checks
Sample data with time codes like "NW-220" and "PRJ-101" and hours on every weekday:
1. At 1400 px wide, the Timesheet tab shows Code, Mon, Tue, Wed, Thu, Fri and Total with no
   sideways scroll. The panel is under the grid.
2. The same at 1280 px.
3. At 1600 px the panel is beside the grid, and the grid still shows every column.
4. No code wraps onto two lines.
5. `c` still copies the grid.

## Not in this feature
- The Timesheet's content and wording.

## As built
- As planned: below 1600 px the panel goes under the grid (`.time-week__side` becomes a
  wrapping flex row, blocks `flex: 1 1 18rem`); from 1600 px it sits beside the grid in a
  `minmax(16rem, 20rem)` column. Number cells are `min-width: 4.5rem` with tabular figures and
  `--sp-2` side padding. The code's span is `nowrap`, cut with "…" at `max-width: 10rem`, and
  `time-page.js` sets its `title` to the full code. No JS test: the browser check covers it.
- The browser check found `c` (and `[` `]` `t`) did nothing on the Timesheet, broken before
  this feature: nothing ever focused `.week-time`, where the keys listen. Fixed here, so check
  5 holds: `.week-time` has `tabindex="-1"` (`static/index.html`); `WeekPage.focus()` hands
  the Timesheet and Settings tabs to the timesheet's `focus()`; clicking a Week tab (Plan,
  Timesheet, Settings, On call) moves the focus into that tab's body; `TimePage.pickCode()`
  puts the focus back on the Timesheet when the redraw took it from the clicked row.
- Also fixed, outside "Nothing else changes": in the palette, `:time` Enter on a project ran
  `:timecode` with no code (it sits earlier in the command table) and cleared the project's
  time code. `paletteGroups` (`static/js/palette/palette-model.js`) now lists the command the
  typed name means first; `:timecode` is still listed and `:timecode AC-1` still runs it. Test
  in `tests/js/test_palette.js`.
- Not fixed: `tools/browser_drive.py` can't set the window width (1280 and 1600 px were
  emulated), and every command fails after an `eval` closes the window. Shared tooling, left
  for its own backlog item.
