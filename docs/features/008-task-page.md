# 008 Task page, nested subtasks

Status: built (2026-11-26)
Backlog item: "Tasks should have their own page. Subtask names should be aligned underneath and indented slightly under the task name. Subtasks should render with their own notes column on the task page. Subtasks should be able to have subtasks."
Decided with Tyson: 2026-11-26
Lanes: backend, frontend (integrate: false, because no route is added or renamed; see the contract)
Migration: none. `parent_id` already allows any depth; only Python stops it today.

## Context
Today a task opens only in place, inside a page's Tasks section: its notes as a snippet, a flat
list of subtasks one level deep, and + Add subtask. The subtasks' notes are never shown. The
one-level rule is a single check in `insert_task` (`paradigm/db/tasks_repo.py:180`), but a lot
of code assumes it: `remove` deletes only direct children, and `taskEntries`/`taskRows`/
`subtaskText` in JS walk one level. This feature gives a task a page of its own in the main
window, lets subtasks nest, and lines subtask names up under their parent's name.

## What it does

### The task page (main window, `?note=HUB&task=ID`)
- A new main-window page, `task`, registered like `folder`/`template`: a `<section class="task-view">`
  in `index.html`, `TaskPage` in `static/js/tasks/task-page.js`, `PAGE_VIEWS` key `task`,
  the URL flag `task=ID`, and `showTask(id)` in `app.js` (it opens the task's note's dashboard
  under it, then the page). Back (Escape, browser Back) returns to that dashboard.
- **Breadcrumb**: the hub › each parent task › this task. Each piece is a link: a parent task
  opens that task's page, and the hub opens its dashboard.
- **Head**: ☐/☑ and the title (`--fs-xl`); one detail line: due, → delegate and follow-up, For,
  estimate, "on {note}" (a link that opens the note) unless it is the hub itself, done day.
  Then the task's own notes, rendered with the main window's `rendered-text.js` (maths,
  diagrams, links to notes), or a muted "No notes — e to add" when it has none.
- **Subtasks**: a two-column table, **Subtask | Notes**.
  - The left column is a tree. Each row is ☐ title · due/delegate detail. A child's checkbox
    starts under the start of its parent's title text, so a name sits a little to the right of
    the name above it (one box width per level).
  - The right column is that subtask's own notes, rendered the same way, top-aligned with its
    row. An empty cell stays blank.
  - Done subtasks stay in their position and are muted (as in the section).
  - Under the table: + Add subtask.
  - Columns are about 2fr / 3fr. Under 1400 px they stack, with the notes under the name and
    indented by the same amount.
- **Keys** (a new key table, `static/js/tasks/task-page-keys.js`, the only source):
  - `j`/`k`/arrows move between rows. The head is row 0, the subtasks come after it.
  - `gg`/`G` go to the first and last row.
  - `Enter` on a subtask opens that subtask's own page. On the head it does nothing.
  - `a` adds a subtask under the selected row. On the head, that makes a direct subtask.
  - `Space` marks done or reopens. `e` opens Edit… (the existing dialog: title, notes, due,
    estimate, For). `d` delegates or takes back. `x`/Delete deletes, with the confirm saying
    how many subtasks go with it.
  - `J`/`K` move the selected subtask down or up among its siblings (`/api/task/move`).
  - `Escape` goes back.
  - Clicks do the same: a row selects it, the title opens its page, the box ticks it.
- **Stale, trashed, gone**:
  - The page redraws on the windows' "changed" message, which the note window and the other
    calendar send already, so an edit made elsewhere shows up.
  - A task that no longer exists, or one whose note is in the trash, shows "This task is gone"
    (or "Its note is in the trash", with a link to Trash) and a Back link.
  - A task on an archived note is read-only: no Add, no row actions. This matches the section.

### Where a task page opens from
- A page's Tasks section, main window and note window's sheet:
  - `Enter`/a click on a task row opens its page. From the note window this goes through
    `showMainWindow({type:"view", key:"task", id})`.
  - `z` still opens and closes the row in place, as Enter does today.
  - Enter opens the page; the in-place view is kept behind `z` (default, approved by Tyson, 2026-11-26).
- **Waiting on** and **I owe** rows (Home, a person's page): Enter opens the task page instead
  of the note (default, approved by Tyson, 2026-11-26).
- The calendar, the Week tray and Today keep "open its note". The block menu gains
  "Open task", which is the only change there (default, approved by Tyson, 2026-11-26).
- Palette: no task entries; there are too many to list (default, approved by Tyson, 2026-11-26).

### Opened in place (the section), now nested
- The open row lists **every** descendant, indented by depth. The CSS indent changes to
  "one box width past the parent's title start" (the `hub__row--depth-N` padding, worked
  out from the twisty and box widths), so names line up under the task name, as the item asks.
- One + Add subtask at the end, for direct subtasks; deeper ones are added on the task page
  (`a` on a row) (default, approved by Tyson, 2026-11-26).
- The count reads all descendants: "3/7 subtasks", every level, not just direct ones (default, approved by Tyson, 2026-11-26).

### Nesting rules
- **At most 5 levels**, a task plus 4 levels of subtasks (default, approved by Tyson, 2026-11-26). Deeper is refused with 400
  "Subtasks go 4 levels deep". This keeps the indent readable in the 1/3 window.
- Delete removes the whole subtree. Any task in it with logged time keeps its row
  (`removed_at`), as today, so the timesheet doesn't change.
- **Closing a task closes its whole subtree** (Tyson, 2026-11-26): marking a task done marks every
  open subtask under it, at every level, done too (delegated ones included), in one
  transaction; each gets today's `done_day`, while ones already done keep theirs. No confirm.
  Reopening a task reopens only that task; its subtasks stay done, since they may have been
  done on their own before (default, approved by Tyson, 2026-11-26). Ticking the last open subtask does not close the parent.
- No re-parenting (indent/outdent) in this feature: `parent_id` stays fixed after creation.
- The Week tray still leaves subtasks out at every depth (006). The calendar block label "in
  {parent}" stays the immediate parent.
- `:t`, `:task` and the meeting `T:` lines keep making top-level tasks.
- Plan templates stay one level (their own table): left out.

## Data
- No migration and no schema change.
- On trash, restore and purge, the behaviour is depth-independent: trash hides the tasks
  through `_LIVE_TASK`, restore brings back the whole tree, and purge sets `parent_id` to NULL
  and then deletes by note. As built, purge also clears `tasks.for_person_id` pointing at a
  purged note and deletes its `task_sources` rows (the task stays, without its source), so it
  is not quite "unchanged".
- `TaskRepository.remove(id)` collects the subtree with a recursive CTE. Rows with sessions
  are soft-removed. The others are deleted after their children's `parent_id` is set to NULL.
  It returns every removed id.

## API contract (no new routes)
| Method | Path | Request | Response | Errors |
|---|---|---|---|---|
| POST | /api/task/create | `{note_id, title, parent_id?, due?, notes?}`, now with `parent_id` at any depth < 5 | task | 400 `Subtasks go 4 levels deep`, 400 different note, 404 parent gone |
| POST | /api/task/remove | `{id}` | `{removed: [ids]}`: the task and **all** its descendants | 404 |
| POST | /api/task/done | `{id, done}` | the task (unchanged shape); `done: true` also closes every open descendant; the page refetches `/api/tasks` | 400 done not a bool, 404 |
| GET | /api/tasks | none | unchanged; the page builds the tree from `parent_id` | none |

## Files
- **Backend**:
  - `paradigm/db/tasks_repo.py`: a depth check that walks up the parent chain in place of the
    one-level check; a `MAX_TASK_DEPTH` constant; recursive `remove`; `set_done(id, True)`
    closes the open subtree (the same recursive CTE); docstrings.
  - `tests/python/test_task_nesting.py` (new): a grandchild is allowed; closing cascades down; the 6th level is refused; a subtree delete with mixed logged time;
    `move` among nested siblings; purge of a nested tree.
- **Frontend**:
  - `static/js/tasks/tasks-model.js`: `taskEntries` becomes a recursive walk (depth, parent,
    ancestors); `subtaskText` counts descendants; `taskTree(tasks, id)` gives the page's rows
    (pure).
  - New: `static/js/tasks/task-page.js` (the page), `static/js/tasks/task-page-keys.js`.
  - `static/css/task-page.css` (new); `static/css/hub.css` (depth indents).
  - `static/js/hubs/hub-sections.js` (nested `taskRows`; Waiting on/I owe open the task),
    `hub-page.js` (Enter opens the page, `z` opens in place), `hub-keys.js`.
  - `task-commands.js` (the delete confirm counts the whole subtree).
  - `static/js/notes/page-views.js`, `static/js/notes/app.js` (`showTask`, `mainFromUrl`
    `task=`, `onMessage`), `static/js/main.js`, `static/index.html`.
  - `static/js/calendar/calendar-page.js` (block menu "Open task").
  - Tests: `tests/js/test_tasks_calendar.js` (nested entries, counts), new
    `tests/js/test_task_page.js` (tree rows, indent depth, key table), `tests/js/index.html`.

## Acceptance checks
1. In a project's Tasks section, Enter on "Book van" opens the main window's task page: the
   breadcrumb is Project › Book van, the head shows its title, due and rendered notes, and
   the URL has `&task=ID`. Escape returns to the dashboard.
2. The subtasks table shows each subtask's name in the left column and its rendered notes
   (bold, a link to a note) in the right column. An empty notes cell is blank.
3. `a` on a subtask row adds a grandchild under it. Its checkbox sits under the start of the
   parent's title text, and its name is indented one step further.
4. Nesting to level 5 works. A 6th level is refused with the error shown in the dialog.
5. Enter on a subtask opens its own page. Its breadcrumb is Project › Book van › Get quotes,
   and the Book van link goes back up.
6. Space, `e`, `d`, `J`/`K` and `x` work on the page. `x` on a task with two levels under it
   says how many go and removes them all; one with logged time keeps its timesheet hours.
7. `z` in the Tasks section opens the row in place, with every level indented under the
   task name. The count reads all descendants ("1/4 subtasks").
8. From the note window's sheet, Enter on a task shows its page in the main window.
9. Waiting on (on a person's page) opens the task page. The calendar block menu has Open task.
10. Stale: with the task page open, editing the task's notes from the note window's section
    (Edit…) redraws the page with the new notes.
11. Trash the task's note while its page is open: the page says the note is in the trash.
    Restore it, and the full nested tree comes back.
12. Delete the task from another window while its page is open: "This task is gone" and Back.
13. A task on an archived project shows its page read-only, with no Add and no row buttons.
14. A task with no notes and no subtasks shows "No notes — e to add" and only + Add subtask.
15. The Week tray still lists only top-level tasks.
16. Space on a task with open subtasks two levels deep (one delegated, one already done last
    week) closes them all: the open ones get today's done day, the earlier one keeps its day.
    Reopening the parent reopens it alone.
17. Closing a subtask in the middle of a tree closes only its own subtree; its parent and
    siblings stay open.
18. Titles beat details on the task page: a delegated, done grandchild with a long name
    ("Ask Northwind about the loading dock") beside "done Thu 26 Nov · → Dana Northwind" shows
    its whole title at 1400 px; the facts are cut first, and when there is no room left for
    them they wrap onto a line under the title instead of being squeezed to nothing.
19. With the main window showing a note's dashboard (or a task page on it), `:trash` on that
    note in the note window shows no "E: No such note" error, and no failed /api/note load.
20. With the main window showing a bare dashboard (no page over it), `:trash` on that note in
    the note window moves the main window to the dashboard of the trashed note's parent (or
    the first top-level dashboard when it had none, never an Inbox note with no dashboard) and says '"Acme Annex" was moved to the Trash'; it is never left
    empty.

## Backlog
Tyson asked (2026-11-26) for the problems the browser check found outside this feature to go
on `backlog.md`: the Delegate dialog making a duplicate person, Escape on a calendar block's
menu losing focus, and a one-off jump to the Live page. They are his items now; the two found
inside this feature (a cut-short subtask title, "E: No such note" after trashing) were fixed
here instead (checks 18 to 20).

## As built
Built as planned, except:
- In a Tasks section, Enter or a click on a task's title opens its page; `z` or a click on its
  ▸ opens it in place (`onExpand` in `hub-panel.js`). Waiting on, I owe and the subtasks opened
  in place open their task's page too (`openTask` in `hub-actions.js`).
- The delete confirm names every level (`removeTaskText`) and opens with the focus on Cancel
  (`safeFocus` in `ui/dialog.js`), since it takes the whole subtree.
- `a` always opens the New subtask dialog; a level too deep is refused inside it with the
  server's "Subtasks go 4 levels deep" before any request (the server still sends the 400).
- Trashing and restoring a note send a "changed" message, so the other window's task page
  redraws. With the main window on a bare dashboard of a note trashed in the note window, it
  moves to the parent's dashboard (or the first top-level one) and says '"Title" was moved to
  the Trash' (`leaveTrashed`), without fetching the gone note (checks 19, 20).
- On a selected section row the row buttons wrap to a second line rather than squeeze the
  title or its "1/4 subtasks"; under the mouse alone they lie over the end of the line.
- The calendar block menu takes a `fallbackFocus`: Escape puts the focus on the block even
  when the week was redrawn under the menu (`ui/menu.js`). This touches the backlog item about
  Escape on a block's menu; ticking it stays Tyson's call.
- "Save as plan template…" leaves out a subtask's own subtasks (templates stay one level).
- The browser round found no failures (20 of 20 checks). The backlog's "jumped to the Live
  page" reproduces when the note window opens a different note, which is the designed switch
  in `docs/spec/navigation.md` (Live page); a task page stays put while the note window keeps
  its note. It is probably not a bug.
- No migration was added; the last is still `029_drop_next_action.sql`.

## Not in this feature
Re-parenting (indent/outdent, dragging between parents); reopening cascading down; closing the parent when its last subtask is done; nested plan
templates; tasks in the palette; editing notes inline on the page (they are edited through
Edit…); `:task` making a subtask.

## Decisions
Every default in the plan stood (approved by Tyson, 2026-11-26, with no further comments); his
one change was that closing a task closes its whole subtree (Tyson, 2026-11-26). Task notes are
edited through Edit… only, never inline on the page, since the main window never edits text
(default, approved by Tyson, 2026-11-26).

## Verification
`python3 tools/pipeline_gate.py` (Python + JS tests, 3.11 syntax, etc.), then the browser check
with `tools/browser_drive.py` on generated sample data in a temporary `--data` folder, walking
checks 1–20.
