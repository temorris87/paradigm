# 027 Task page as in Figma

Status: built (2026-11-27)
Backlog item: Task page as in Figma (Task): Notes is the main column; Subtasks, Emails, Files, From and
  History in a side column, so it reads well shared at 1280 with the note window on the right
  third.
Decided with Tyson: 2026-11-27
Lanes: backend, frontend
Migration: 031_task_files.sql (the merger renumbers it if another feature in the batch takes 031)

Figma "Paradigm UI" (fileKey WiWq1ftWbEclRLbUyhcwKi): Task 18:229. Where Figma and today's
behaviour differ, Figma wins (Tyson, 2026-11-27).

## What it does
1. **Head.**
   - Left: ☐ (Space ticks it), then the title (`--fs-xl`). Under it, a row of chips:
     - "2 d late · was due Tue 24 Nov" (danger), or "Due Fri" (caution) or "Due Fri 4 Dec"
       (neutral);
     - "2 h estimate" (neutral);
     - "2 h placed Mon · done" or "1 h placed Thu" (success), from the task's sessions.
   - Right: the buttons **Done `Space`** (primary), **Schedule `s`**, **Delegate `d`**,
     **Edit `e`**, and **···** (the existing task actions: move, remove…).
2. **Facts row** (small caps labels over values):
   - **PROJECT** (a link to the hub);
   - **FOR** (the person I owe it to, or "—");
   - **DELEGATED TO** ("Ben Ortiz · follow up Mon", or "—");
   - **NEXT BLOCK** ("Mon 30 Nov 10:00–12:00", or "None · s finds Fri 08:00": the slot `s`
     would take, worked out now).
3. **Main column: Notes**, a card.
   - Head: "Notes", then a chip **Live · editing in the note window** (info) while the task's
     notes are open in the note window, then **Edit `e`**.
   - Body: the task's notes rendered (Markdown, as now).
   - With no notes: "No notes yet. e to write them in the note window."
4. **Side column**, cards in this order:
   1. **Subtasks** "n of m done", + Subtask `a`.
      - Each row is ☐ and the title. On the right: "done Thu 26 Nov", or a delegate and
        follow-up ("→ talk to Ben at stand-up").
      - Done ones are struck through and muted.
      - The Subtask | Notes table goes. A subtask's own notes are on its own page.
      - `J`/`K` reorder as now.
   2. **Emails** "n to answer", + Attach: 021's section, moved here unchanged.
   3. **Files** "n", **+ Add file…**.
      - Each row is a file icon, the file name as a link (opens it), and "OneDrive · {folder}"
        on the right. "· from {name}" is shown when the file's folder belongs to another
        person's hub.
      - Add file… opens 020's native picker, starting in the task's hub's linked folder, and the
        file is linked **to this task**. A file from an unlinked folder offers to link the folder
        to the task's hub, as 020 does.
      - Without tkinter, 020's folder browser.
      - `x` on a file row unlinks it from the task. The file itself is left alone.
      - With no files, a hint: "Add file… opens the file picker in the project's OneDrive
        folder".
   4. **From a meeting** (only when the task has a source in `task_sources`):
      - a chip "From a meeting" (or "From a note");
      - the source's title and day as a link;
      - the quote in `--font-mono` with a left rule.
   5. **History**: the task's life, newest first, each row a day and a line:
      - "Captured in {meeting}" or "Created";
      - "Placed 10:00–12:00 (2 h)", one per session;
      - "Delegated to {name} · follow up {day}";
      - "Done".

      Derived from what is stored, with no event log (default, approved by Tyson, 2026-11-27).
5. **Width.**
   - The side column is about 24rem.
   - At 1280 px wide, the main window's share when the note window takes the right third, Notes
     and the side column sit side by side and nothing scrolls sideways.
   - Below 1000 px the side column goes under Notes.
6. **`s` Schedule.**
   - Puts the task's estimate (or 30 min) in the first free slot from now, before its due day.
     It uses `firstFreeSlot` from `static/js/week/capacity.js`, as the Week's `s` does.
   - It says `"{title}" placed Mon 30 Nov 10:00–10:30`, or `No free 30 min before it is due`.
   - The button does the same.
7. **Keys** (TASK_PAGE_KEYS):

   | Key | What it does |
   |---|---|
   | Space | Done |
   | `e` | Edit |
   | `d` | Delegate |
   | `s` | Schedule (new) |
   | `a` | Add subtask |
   | `j` `k` | Move over the side column's rows, top to bottom |
   | Esc | Back |
   | `?` | All keys |

   - Hint bar, as in Figma: `Space` done, `e` edit, `d` delegate, `s` schedule, `a` add subtask,
     `j k` move, `Esc` back, `?` all keys.
   - Enter, `o`, `r`, `x`, `J` and `K` keep their meanings on their rows. They are in `?`.

## Data
Migration `031_task_files.sql`:
```sql
CREATE TABLE task_files (
    task_id   INTEGER NOT NULL REFERENCES tasks (id),
    file_id   INTEGER NOT NULL REFERENCES files (id),
    added_at  TEXT    NOT NULL,
    PRIMARY KEY (task_id, file_id)
);
CREATE INDEX task_files_task ON task_files (task_id);
```
- Deleting a task (`/api/task/remove`, its subtasks included) deletes its `task_files` rows in the
  same transaction.
- Unlinking a folder drops its files' task links, as it drops their note links.
- Purging a hub drops its tasks' links with the tasks.
- The files themselves are never touched.

## API contract
| Method | Path | Request JSON | Response JSON | Errors |
|---|---|---|---|---|
| GET | /api/task/files?task=N | — | `{"files": [{"id": 3, "name": "Request form fields v3.xlsx", "rel_path": "Specs/Request form fields v3.xlsx", "folder_id": 1, "folder_name": "Customer portal", "hub_id": 5, "hub_title": "Customer portal v2", "missing": false, "added_at": "2026-11-25T10:00:00"}]}` (oldest added first) | 400 bad id, 404 no task |
| POST | /api/task/file/attach | `{"task_id": 7, "file_id": 3}` | `{"file": {…same shape…}}` | 404 task or file |
| POST | /api/task/file/attach_path | `{"task_id": 7, "path": "C:\\…\\x.pdf"}` | `{"file": {…}}`; or, from a folder not linked, `{"file": null, "folder": "C:\\…\\Specs"}` | 400 bad path, 404 task |
| POST | /api/task/file/detach | `{"task_id": 7, "file_id": 3}` | `{}` | 404 task |
| GET | /api/task/history?task=N | — | `{"events": [{"day": "2026-11-25", "time": "10:00", "kind": "captured", "text": "Captured in Portal design review", "note_id": 12}]}` (newest first; `kind`: created, captured, placed, delegated, done; `time` and `note_id` may be `null`) | 404 no task |

- Picking reuses `POST /api/file/pick {"note_id": <the task's hub id>}` (020) for the native
  dialog's start folder.
- Opening a file reuses `POST /api/file/open {"id"}`.
- Linking a new folder reuses `POST /api/folder/link {"note_id": <hub id>, "path"}`, then
  `attach_path` again.

## Files
- **Backend lane:**
  - `paradigm/db/migrations/031_task_files.sql`.
  - `paradigm/db/files_repo.py`: task attach, attach_path, detach and list, reusing the note
    versions' path checks. Unlinking a folder drops its task links.
  - `paradigm/db/tasks_repo.py`: remove drops `task_files`.
  - A new `paradigm/db/task_history.py` (the derived events; pure where it can be).
  - `paradigm/api/files.py` or a new `paradigm/api/task_files.py` for the routes.
  - The history route in `paradigm/api/tasks.py`.
  - `paradigm/app.py` wiring.
  - Tests: a new `tests/python/test_task_files_api.py` and `tests/python/test_task_history.py`.
- **Frontend lane:**
  - `static/js/tasks/task-page.js` (the page and the two columns), split into:
    - `task-head.js` (the head, chips, facts row, buttons);
    - `task-side.js` (the side cards' order and rows);
    - `task-files.js` (the Files card and its add, open and unlink);
    - `task-history.js` (the History and From cards).
  - `static/js/tasks/task-page-keys.js` (`s`, hints).
  - `static/js/tasks/api.js` (files, history).
  - `static/js/files/file-commands.js` (adding to a task: pick and attach, offering a link).
  - `static/css/task-page.css`.
  - The Live chip comes from the note window's open-note message the main window already gets
    on its channel.
  - Tests: `tests/js/test_task_page.js` (the layout model, chips, Next block text),
    `tests/js/test_task_emails.js` if moved code needs it, `tests/js/test_key_hints.js`, and
    `tests/js/index.html`.

## Acceptance checks
Sample data: a task with a source meeting, 2 subtasks (1 done), 2 emails, 2 sessions, and a
delegate with a follow-up.
1. The task page at 1400 px shows the head:
   - the chips (late, estimate, placed);
   - the buttons Done Space, Schedule s, Delegate d, Edit e, ···;
   - the facts row Project, For, Delegated to, Next block.
2. Notes is the wide left column. Subtasks, Emails, Files, From a meeting and History are on the
   right, in that order.
3. At 1280 px the two columns are still side by side, with no sideways scroll.
4. Subtasks reads "1 of 2 done", and the done one is struck through. There is no Subtask | Notes
   table.
5. + Add file… through the API: attach a sample file to the task. It is listed under Files.
   Unlinking it with `x` removes the row and leaves the file on disk.
6. From a meeting shows the source meeting's title and the quote. A task with no source has no
   such card.
7. History lists Captured in …, Placed … for each session, Delegated to …, newest first.
8. `s` places a 30 min block in a free slot and says where. Next block then shows it.
9. Opening the task's notes in the note window shows the "Live · editing in the note window"
   chip.
10. The hint bar reads Space done, e edit, d delegate, s schedule, a add subtask, j k move, Esc
    back, ? all keys.
11. Removing the task deletes its `task_files` rows (Python test).

## Not in this feature
- A real change log for tasks.
- Files on subtasks shown on the parent.
- Dragging files onto the task page (only .msg drops, from 021).

## Decisions after the first build (Tyson, 2026-11-27)
- **The "Live · editing in the note window" chip is dropped from this feature.** A task's notes
  are a field on the task, edited in the Edit dialog. The note window can't open them, so the chip
  could never show. Remove the chip and its unused wiring (`liveOnTask` and its tests).
  - Editing a task's notes in the note window is a new backlog item for a later batch.
  - Acceptance check 9 no longer applies.
- **The empty Notes text** is "No notes yet. e to write them." (`e` opens the Edit dialog).
- **On a delegated task**, the head's button reads "Take back d", because `d` takes it back
  there, as in hub sections.

## As built
- Built as specified, with the decisions above: no Live chip (and no `liveOnTask`), the empty
  Notes text "No notes yet. e to write them.", and "Take back d" on a delegated task.
- The pure logic is in a new `static/js/tasks/task-page-model.js` (chips, facts, Next block,
  `s`'s slot and words, the cards' lines, `SIDE_CARDS`); `task-commands.js`'s `scheduleTask`
  now uses its `freeSlotFor` and takes `{ words }` for the task page's own lines.
- `static/js/ui/dates.js`'s `dayText` gained `short: true` (the weekday alone), used for days
  within 6 days either way ("Due Fri", "placed Mon", "follow up Mon").
- Due chip: "Due today" and "Due tomorrow" (caution) before the weekday form.
- The facts row's first label is AREA or PERSON on those hubs, PROJECT otherwise.
- `s` with no due day and no room says `No free 30 min in the next two weeks`. `s` (like
  Space, `e`, `d`) acts on the selected subtask when one is selected.
- Subtask rows show "due Fri" on the right when neither done nor delegated.
- History's API event for a delegation has `day: null` (the delegation's day is not stored) and
  an extra `follow_up` (YYYY-MM-DD or null) that the front end words; it is listed first.
- A file gone from its folder is kept (flagged) while a task has it, as for notes; purging a
  hub's folders from the trash drops their task links too (`trash_repo.py`).
- Read-only (an archived note's task): no buttons, "No files".
