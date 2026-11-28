# 036 The Week's ‹ This week › buttons stay put

Status: built (2026-11-27)
Backlog item: Previous, This Week, and Next Week buttons shouldn't move as the width of the date's text
  adjusts. I should be able to keep clicking the same location to move forward or backward with
  ease.
Decided with Tyson: 2026-11-27
Lanes: frontend
Migration: none

Figma "Paradigm UI" (fileKey WiWq1ftWbEclRLbUyhcwKi): "Week · fixed ‹ This week › · no Settings
tab · 1600" 50:1401.

## What it does
1. **The buttons come first.** The Week bar reads `‹` `This week` `›` then the range
   ("23–29 Nov 2026"), then the tabs, then the week's totals, as 50:1401 (default, approved by
   Tyson, 2026-11-27). The buttons sit at the bar's left edge, so they never move.
2. **The range has a fixed width**, wide enough for the longest range in the app's format
   ("30 Nov – 6 Dec 2026", in `ch`), so the tabs after it don't move either. The text is
   left-aligned in it.
3. **The same on every tab** (Plan, Timesheet, On call): the bar is shared.
4. **Narrow windows.** Under 1400 px the bar may wrap, but the three buttons stay together at its
   start.

## Data
None.

## API contract
None.

## Files
- Frontend lane: `static/js/week/week-page.js` (the bar's order), `static/css/week.css`; a test
  in `tests/js/` that the bar's first three children are the buttons (imported in
  `tests/js/index.html`).

## Acceptance checks
1. On the Week, clicking `›` five times in a row without moving the mouse goes forward five
   weeks (the button is under the pointer each time), across a month change ("30 Nov – 6 Dec").
2. The same for `‹` and This week.
3. The tabs (Plan, Timesheet, On call) don't move between "23–29 Nov" and "30 Nov – 6 Dec".
4. The Timesheet and On call tabs show the same bar order.
5. At 1280 px nothing overlaps.

## Not in this feature
- Removing the Settings tab (035).

## As built
- The bar's children are `‹`, `This week`, `›` (each `cal-button week-bar__move`, `flex: none`),
  then the range, the tabs, the totals, on call and Copy for timesheet (`week-page.js`).
- The range is `24ch` wide with `font-variant-numeric: tabular-nums`, `white-space: nowrap` and
  `overflow: hidden` (`week.css`). It is sized for the year's turn ("28 Dec 2026 – 3 Jan 2027"),
  which is longer than the plan's "30 Nov – 6 Dec 2026". Its margin moved from the right to
  the left, because it now follows the buttons.
- Narrow windows: no extra rule was needed. The bar already wraps (`flex-wrap: wrap`), and the
  buttons come first, so they stay together at its start.
- Test: `tests/js/test_week_bar.js` checks the bar's order and that `›` five times from 23 Nov
  reaches 28 Dec 2026 – 3 Jan 2027 and stays the third child, and that This week comes back.
- A fix round also steadied a test from before this feature, `tests/js/test_capture_sheet.js`
  (note captures: `\t` ... `\u`): it waits two animation frames for the editor to re-measure
  after the sheet closes before it looks for the line's mark. No product code changed.
