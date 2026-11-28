# 039 h and l move between columns

Status: built (2026-11-28)
Backlog item: For pages that have multiple columns, h and l should work from vim key bindings to
  move left and right, not having to only use j and k.
Decided with Tyson: 2026-11-28
Lanes: frontend
Migration: none

## What it does
1. On **Today** (the Now, Next and side columns, `.today__col--now`, `--next`, `--side`), on every
   **dashboard** (its lanes `wide`, `card`s, `act`, `know`; a person's cards included) and on the
   **task page** (the notes and its side column), `h` moves the cursor to the column on the left
   and `l` to the column on the right (default, approved by Tyson, 2026-11-28).
2. The row it lands on is the one in that column nearest in height to the row it left, as ←/→
   already do on dashboards. `laneTarget` (`static/js/hubs/hub-panel.js`) is pulled out into a
   shared, pure helper (e.g. `static/js/ui/column-target.js`) that takes each option's column
   and vertical position, so all three pages use it and it is unit-tested without a page.
3. In the first column `h` does nothing, and in the last column `l` does nothing (no wrap).
   A column with no rows is skipped.
4. ←/→ do the same as h/l on Today and the task page (on dashboards they already do). Tab and
   S-Tab on a person's page keep their behaviour.
5. **Dashboard and Gantt `h` moves to `t`.** The date history of a phase or milestone row
   (`history` in `hubs/hub-keys.js` and `gantt/gantt-keys.js`) is now on `t` ("timeline"), on
   both, so the same key does it everywhere (default, approved by Tyson, 2026-11-28). Its help
   text and any hint follow.
6. **Week tabs keep h/l** as previous/next week (Plan, Timesheet, On call): the week's columns
   are days, not lists (default, approved by Tyson, 2026-11-28). The navigator tree keeps h/l
   as collapse/expand.
7. Pages with one column (People, Meetings, Trash, History) don't bind h/l (default, approved by
   Tyson, 2026-11-28).
8. The key-hint bar shows `h l` "columns" (label `"h l"`) on Today, dashboards and the task page;
   the `?` list lists them in the movement group.

## Data
None.

## API contract
None: no route is added or changed.

## Files
- Frontend lane:
  - new `static/js/ui/column-target.js` (pure: next/previous column target by nearest height);
  - `static/js/hubs/hub-panel.js` (use the helper), `static/js/hubs/hub-keys.js` (h/l, `h`→`t`);
  - `static/js/gantt/gantt-keys.js` (`h`→`t`) and its handler if it names the key;
  - `static/js/today/today-keys.js`, `static/js/today/today-page.js` (h/l, ←/→, columns of each
    option);
  - `static/js/tasks/task-page-keys.js`, `static/js/tasks/task-page.js` (h/l, ←/→);
  - tests: new `tests/js/test_column_target.js` (imported in `tests/js/index.html`), and updates in
    `test_today.js`, `test_hubs.js`, `test_task_page.js`, `test_key_hints.js`, and any Gantt test
    that presses `h`.

## Acceptance checks
1. On Today with rows in Now and Next, `l` on a Now row puts the cursor on the Next row nearest
   in height; `h` brings it back to Now.
2. On a project dashboard, `l` and `h` move the cursor between lanes; `t` on a phase row opens its
   date history; `h` no longer does.
3. On the Plan (Gantt), `t` opens a row's date history.
4. On a task page, `l` moves from the notes to the side column and `h` back.
5. On the Week's Plan tab, `h` still goes to the previous week.
6. The bar on Today shows `h l columns`; `test_hubs.js` still finds no key bound twice.

## Not in this feature
- j/k scrolling instead of moving by row, and moving between sidebars (the backlog item after
  Shift-H/L: next batch).
- h/l between the Week Plan's tray and grid.

## As built
- `static/js/ui/column-target.js` holds two pure helpers: `columnTarget(rows, active,
  direction)` (rows: `{ column, top }`; a NaN column is never reached) and `laneColumns(rects,
  active)`. Today, the task page and `HubPanel.laneTarget` all go through `columnTarget`.
- Built differently from the plan (browser check, fix round 1): on a dashboard, h/l follow where
  the lanes sit on screen, not the order they were built in. `laneTarget` measures each
  `.hub__lane` and `laneColumns` counts only the lanes beside the current one (sharing some of
  its height, fully to its left or right), by their left edge; the rest are out of reach. When
  no two lanes sit side by side (stacked under 1400 px, or no CSS), the old lane order holds.
  On a person's page this means `l` on To raise does nothing (it used to drop to Notes), `h`
  on To raise goes to I owe, `h`/`l` go between Notes and Together, and `h` on Notes does
  nothing. On an area page `l` from the full-width top lane now does nothing (it used to go to
  the lane below). ←/→ on dashboards changed with it, as they share the action. Tab and S-Tab
  on a person's page are unchanged.
- `t` for the date history also renamed the slip button's title on a dashboard row to "Its
  date history (t)" (`hub-line.js`).
- The task page's head counts as the left column's one row (it sits over the Notes); `l`
  from it lands on the side column's row nearest in height.
- Tests: new `tests/js/test_column_target.js` (both helpers, the person layout as a grid),
  plus `test_today.js`, `test_hubs.js`, `test_task_page.js`, `test_key_hints.js`,
  `test_plans.js` and `test_follow_ups.js`.
