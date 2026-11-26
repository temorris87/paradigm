# 006 All tasks on the calendar (next action removed)

Status: built (2026-11-26)
Backlog item: "I want to remove the next task feature and show all tasks on the calendar view when
scheduling my week and days. I should be able to filter by project / area so I can narrow in
on what I want to work on."
Decided with Tyson: 2026-11-26
Lanes: backend, frontend (`integrate: false`: the contract only removes a route, adds none)
Migration: 029_drop_next_action.sql

## Why
At the moment the Week page's tray ("To plan · N") shows only four kinds of task: Overdue, Due
this week, one Next action per project, and Follow-ups. An open task with no due date, or one
due after the week, never appears there unless it is a project's next action. So the tray can't
be used to plan the week from everything that is open. The next-action flag (`n`, Make next,
NEXT) exists only to pick that one task. Tyson wants the flag gone and every task in the tray,
with the project/area filter as the way to narrow the list. The filter already exists
(client-side, an area includes its projects). This feature fixes its gaps and makes it remember
the last choice.

## What it does

### Next action removed everywhere
- Hub Tasks sections: no NEXT badge and no Make next button. The `n` key is gone from
  `hub-keys.js` and the help. Rows keep their own order (position), and the first row is
  selected first.
- An area's Projects table loses its Next action column. It keeps Health, Latest status,
  Updated, Next milestone and Open.
- Today's Up next drops "each live project's next action" (reason "Next action"). The rest of
  the ranking stays: overdue, follow-ups past due, due today, due within 5 working days, and
  questions over 7 days. The empty text becomes "Nothing urgent: nothing overdue, due soon or
  waiting on you."
- Unrelated things also called "NEXT" are kept: the Now card's next block, the note strip's
  next meeting, and `j`/ArrowDown `action: "next"`.

### The tray shows every open task of mine
Every open, top-level task of mine in a hub that is live and not on hold, plus tasks on loose
notes. Each task appears once, in the first group that takes it. The groups, in order:
1. **Overdue**: due before today, oldest first. Meta: hub · "was due Fri 20 Nov" · placed.
2. **Due this week**: due from today to the Sunday of the week shown. Meta: hub · "due Wed"
   or "due today" · placed.
3. **Due later**: due after that Sunday, soonest first. Meta: hub · "due Tue 8 Dec" · placed.
4. **No due date**: by hub title, then in the hub's own order. Meta: hub · placed.
5. **Follow-ups**: delegated tasks whose follow-up day is on or before Sunday. These stay as
   they are.

"Placed" is the existing tone ("1.5 h placed", "placed Mon" or "not placed"). Drag, click,
`s` and the estimate ("est?") work on every row as they do now. "To plan · N" counts every
row. Done, delegated-without-follow-up, archived, on-hold, trashed and removed tasks, and
subtasks, stay out, as now.

### The project/area filter
- Its options: every project or area that has a task in the tray, follow-ups included. An
  area is offered when one of its projects is. An option is labelled "Title (Project/Area)"
  and the list is sorted by title, with "All projects and areas" first. On-hold hubs aren't
  offered, since their tasks aren't listed.
- **New option** "Other notes" (last): only the tasks on notes outside any project or area,
  such as a loose meeting note.
- An area still includes its projects' tasks.
- **Remembered**: the hub choice is kept in `localStorage` (`paradigm.week.trayHub`), so it
  survives a reload, a week change and the other window. If the saved hub no longer has tasks,
  the filter falls back to All, as now. The search box is not remembered.
- With a filter on, the empty text is "No open task matches", as now. Without one it reads
  "Nothing to plan: every task is done or delegated."

## Data
Migration `029_drop_next_action.sql`: `ALTER TABLE tasks DROP COLUMN is_next;`. 022 stays as it
is, because migrations only go forward. SQLite 3.35+ is needed for DROP COLUMN. Python 3.11's
bundled SQLite is newer than that on Windows, Mac and the CI images. No index or trigger uses
the column. Trash, restore, archive and purge are unchanged: nothing new is stored.

## API contract
| Method | Path | Change |
|---|---|---|
| GET | /api/tasks | each task loses `is_next`; every other field is unchanged |
| POST | /api/task/next | **removed** (now 404, like any unknown route) |

No route is added. The tray keeps using `GET /api/tasks` and `GET /api/sessions` as they are.

## Files
- **Backend lane**:
  - new `paradigm/db/migrations/029_drop_next_action.sql`;
  - `paradigm/db/tasks_repo.py`: drop `set_next`, the `is_next` clearing in `set_done` and
    `is_next` in `_task()`;
  - `paradigm/api/tasks.py`: the route, the handler and the docstring;
  - `tests/python/test_task_planning_api.py`: delete the two next-action tests, and add one
    that `/api/task/next` is gone and tasks have no `is_next`;
  - a migration test that 029 drops the column and keeps the task rows.
- **Frontend lane**:
  - `static/js/tasks/tasks-model.js`: remove `nextAction`; `hubChoices` takes follow-ups and
    leaves out on-hold hubs;
  - `static/js/tasks/api.js` (`setNext`) and `static/js/tasks/task-commands.js`
    (`setNextAction`);
  - `static/js/hubs/hub-sections.js` (ordering, MAKE_NEXT, `row.next`, the Projects column
    and its classes), `hub-panel.js` (the badge, first selection, `makeNext`), `hub-actions.js`
    and `hub-keys.js` (`n`);
  - `static/js/today/today-model.js` and `today-page.js` (the empty text);
  - `static/js/week/tray-model.js` (the new groups and the "Other notes" scope);
  - `static/js/calendar/task-sidebar.js` (the "Other notes" option, the remembered hub, the
    empty text);
  - CSS: remove `.hub__next` (hub.css), `.today-next__row--next` (today.css) and
    `.cal-group--next` (week.css);
  - tests: delete `tests/js/test_next_action.js` and its import in `tests/js/index.html`;
    update `test_today.js` (Up next, tray groups) and `test_hubs.js` (Projects table, now 5
    cells); tidy `is_next` out of the fixtures; add tray tests.

## Acceptance checks
1. A project with tasks: its Tasks section shows no NEXT badge and no Make next. `n` does
   nothing and isn't in the help. The first task is selected first.
2. An area's Projects table has no Next action column, and its cells line up with the five
   headings.
3. Today's Up next lists no "Next action" rows. A project whose only open task has no due date
   adds nothing to Up next.
4. `POST /api/task/next` answers 404, and `GET /api/tasks` has no `is_next` field.
5. An existing database at migration 028 that has flagged tasks starts cleanly. 029 runs, the
   tasks are all still there, and their done state, due date and subtasks are unchanged.
6. Week tray with sample data covering every case (overdue, due this week, due after Sunday,
   no due date, delegated with a follow-up, delegated without one, done, a subtask, an
   on-hold project, an archived project, a trashed note, a loose meeting note with a task):
   - the groups are Overdue, Due this week, Due later, No due date, Follow-ups, in that order;
   - each task appears once;
   - the excluded ones are absent;
   - "To plan · N" matches the number of rows.
7. Move to next week with `]`. A task due in that week moves from Due later to Due this week.
8. Choose an area: its own tasks and its projects' tasks show. Choose a project: only that
   project's show. Choose "Other notes": only the loose meeting note's task shows. Search
   narrows further, inside the chosen filter.
9. Reload the page: the chosen hub is still chosen. Archive that hub in the other window and
   come back: the filter falls back to All with no error.
10. A hub whose only open task is a delegated follow-up is offered in the filter, and the
    on-hold project isn't.
11. Drag a No due date task onto the week: a 30-minute block appears, and its row reads
    "placed Mon". `s` on a Due later row places it before its due day. `s` on a No due date
    row places it in the next two weeks.
12. The filter is empty (every task done): "Nothing to plan: every task is done or delegated."
13. A trashed task's note is restored. Its task is back in the tray, in its group.

## As built
- Built as planned: migration 029 drops `tasks.is_next`, `POST /api/task/next` is gone (404),
  `GET /api/tasks` has no `is_next`; NEXT, Make next, `n`, the Projects table's Next action
  column and Up next's next actions are removed; the tray has the five groups, "Other notes"
  and the remembered hub (`paradigm.week.trayHub`).
- First selection (fix round 1, check 1): the hub panel chose the first task only on its very
  first draw, so a hub opened from the navigator kept the "Tasks" heading when its tasks
  loaded later. `hub-panel.js` now picks the first task on every draw until you move, press a
  key or click (`touched`); `panel.reset()` (called by `hub-page.js` on another note) starts
  over. A redraw after a move keeps your row.
- `gw` focus (fix round 1, check 7): `gw` focused `section.week-view`, outside `.week-plan`
  where the calendar's keys listen, so `[` `]` `t` needed a Tab first. `.week-plan` now has
  `tabindex="-1"` (`index.html`) and `WeekPage.focus()` focuses the calendar on the Plan tab.
  Outside the planned file list (`week-page.js`, `index.html`).
- Due before the week shown (fix round 1): with next week shown, a task due this Friday falls
  in Due this week and reads "due Fri 27 Nov", not a bare "due Fri". Days inside the week
  shown still read "due Wed", today "due today".
- Check 11's wording: "placed" counts blocks from today on (as before this feature), so a
  block dropped on a past day of the week reads "not placed". Drop on today or later to see
  "placed Mon". No code change.
- `hubChoices(tree, tasks, { until })` takes the week's Sunday, so a follow-up only offers its
  hub when it is in the tray.

### Decisions
1. Two new groups, Due later and No due date, after Due this week (default, approved by Tyson, 2026-11-26).
2. Subtasks stay out of the tray; the parent is what gets dragged (default, approved by Tyson, 2026-11-26).
3. Tasks on notes outside any project or area are shown, with an "Other notes" filter option (default, approved by Tyson, 2026-11-26).
4. The hub choice is remembered across reloads (`localStorage`); the search is not (default, approved by Tyson, 2026-11-26).
5. Today's Up next drops next actions and nothing replaces them (default, approved by Tyson, 2026-11-26).
6. The `is_next` column is dropped by migration 029 (default, approved by Tyson, 2026-11-26).

## Not in this feature
- Folding tray groups, and sorting choices.
- Filtering the week's blocks themselves by project.
- Showing subtasks on the calendar (unless you choose option 2's alternative).
- Today's `s` and Up next changes beyond removing next actions.
