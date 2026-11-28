# 031 A task's notes in the note window

Status: built (2026-11-27)
Backlog item: Edit a task's notes in the note window: the task page's Edit opens them there, with a
  "Live · editing in the note window" chip on the task page while they are open.
Decided with Tyson: 2026-11-27
Lanes: frontend
Migration: none

Figma "Paradigm UI" (fileKey WiWq1ftWbEclRLbUyhcwKi): Task 18:229 (the Notes card's head holds
the chip "Live · editing in the note window" and a ghost "Edit e"; a caret shows where the cursor
is). Figma wins (Tyson, 2026-11-27).

## What it does
1. **Edit opens the note window.** On a task's page (`&task=ID`), the Notes card's **Edit `e`**
   button and the `e` key open the task's notes in the note window (`openNoteWindow`'s window,
   placed as the note window always is). Today `e` opens the Edit… dialog with a notes textarea;
   that dialog keeps title, due date and estimate but loses the notes field (default, approved by
   Tyson, 2026-11-27). It stays on the head's **Edit…** button and moves to the key `E`.
2. **The note window in task mode** (`note.html?task=ID`, or an `open` message with `task`):
   - The crumb reads `Task › {project or hub title} › {task title}`; there is no note menu, no
     sheet, no capture keys, no Live-page sender for notes.
   - The `<pd-editor>` holds `task.notes` (Markdown). `@` completion still works. `:w` saves.
     Saving is automatic as for notes (about 1 s after typing stops, and on leaving or closing).
   - It saves with `POST /api/task/update {"id", "notes"}`. A failed save keeps the text and says
     `E: notes not saved: {error}` in the status line.
   - Last write wins: tasks carry no version (default, approved by Tyson, 2026-11-27).
   - The status line names it: `"{task title}" notes saved`.
   - Opening another note or task in the note window first saves these notes.
3. **The Live chip on the task page.** While the note window has this task's notes open, the
   task page shows the chip **Live · editing in the note window** (info tone, with its dot)
   in the Notes card's head, left of Edit. The Notes card renders the notes as they are typed
   (the same throttled `live` message the Live page uses, carrying `task: id` and the text), with
   the caret drawn where the cursor is (`static/js/live/caret.js`).
4. **When the note window closes or leaves the task** (`live-closed`, or it opens something
   else), the chip goes and the Notes card reloads the saved notes.
5. **Opening the task page later.** A task page opened while its notes are already open in the
   note window asks with `live-ask` and shows the chip straight away.
6. **The task page's hint bar** says `e` "edit notes" (was "edit").

## Data
None. `tasks.notes` as now.

## API contract
No route added or changed. The note window reads the task from `GET /api/tasks` (the list it
already returns, with `notes`) and saves with the existing `POST /api/task/update`
(`{"id": 7, "notes": "..."}` → the task).

Channel messages (BroadcastChannel "paradigm", `static/js/connection/changes.js`):
| Message | Sent by | Fields |
|---|---|---|
| `open` | main window | `{type:"open", to:"note", task: 7}` (as for notes, with `task` in place of `id`) |
| `live` | note window | `{type:"live", task: 7, title, text, caret}` |
| `live-closed` | note window | `{type:"live-closed", task: 7}` |
| `live-ask` | main window | `{type:"live-ask"}`, answered with a `live` message |

## Files
- Frontend lane: `static/js/tasks/task-page.js`, `task-head.js` (Edit… stays, key `E`),
  `task-page-keys.js` (`e`, `E`), `task-commands.js` (no notes field), a new
  `static/js/tasks/task-notes-live.js` (the chip and the live rendering on the task page); the
  note window's task mode: `static/js/note-main.js`, `static/js/notes/app.js`, a new
  `static/js/tasks/task-notes-session.js` (load, autosave, :w; pure where it can be);
  `static/js/windows/note-window.js` (`openNoteWindow` for a task); `static/js/live/live-sender.js`
  (carry `task`); `static/css/task-page.css`; tests in `tests/js/` (session saving, the message
  shape, the chip state) imported in `tests/js/index.html`.

## Acceptance checks
1. On a task page, `e` opens the note window on the task's notes; the editor holds them.
2. The task page shows "Live · editing in the note window" in the Notes card's head while they
   are open.
3. Typing in the note window shows up on the task page's Notes card within a second, with a caret.
4. After typing stops, the notes are saved (`GET /api/tasks` shows the new notes); `:w` saves too.
5. Closing the note window removes the chip; the Notes card shows the saved notes.
6. Opening a different note in the note window saves the task's notes and removes the chip.
7. Opening the task page after the note window already has its notes shows the chip at once.
8. `E` (and the head's Edit… button) opens the Edit dialog without a notes field; saving it keeps
   the notes as they were.
9. A save that fails (server stopped) keeps the text and shows `E: notes not saved: …`.
10. A task with empty notes opens an empty editor; typing and saving gives it notes.
11. Plain notes in the note window still behave as before (open, save, Live page).

## Not in this feature
- Versions and conflict warnings for task notes.
- Subtasks' notes from the side column (each subtask's own page does it).

## As built
- As planned; no route changed. The channel messages are as the contract's table says; a note's
  own `live-closed` (no `task`) also clears the chip, as the note window has gone.
- `openNoteWindow({ task }, { changes })` takes a task in place of a note id (`taskNotesUrl`);
  `tasksApi.update` gained `{ keepalive }` so the save sent as the window closes still lands,
  and the task page reads the notes again at once and 1 s later for it.
- `e` always opens the page's own task's notes (not the selected subtask's); `E`, Space, `d`
  and `s` still act on the selected subtask. Edit… lost its notes field everywhere, hub
  sections' row Edit… included.
- The note window's hint bar shows only `@` and `:w` in task mode (`noteHints({ task })`);
  the unsaved-changes banner counts the task's notes too. `:e!` on a note still saves dirty
  task notes first. A gone task says `E: that task is gone (deleted in another window?)`.
- The Live page ignores messages with `task`, so a task's notes never switch the main window
  to it; `coverNextCharacter` is exported from `live-page.js` for the task page's caret.
- Fix round 0 (before the lanes): `tests/js/test_capture_sheet.js`'s capture-sheet test was
  flaky (the editor shrank to one row while the sheet was docked); it now calls
  `editor.measure()` after the save. App code unchanged.
