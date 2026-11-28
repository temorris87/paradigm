# 043 Small fixes from batch 2026-11-27d

Status: built (2026-11-28)
Backlog item: Small fixes from batch 2026-11-27d: Today's Import panel says "the tray still works" (Today
  has no tray); Today's "to file" rows go stale after Don't import on the Week; switching the note
  window from a task's notes to a note drops what is typed meanwhile; the follow-up route logs on a
  done task, and a failed redraw after logging can log it twice; Settings shows time-off dates raw
  and Escape does nothing on a Note window choice; hovering a changed on-call name says "Open …",
  not "was …".
Decided with Tyson: 2026-11-28
Lanes: backend, frontend
Migration: none

## What it does
1. **Today's Import panel** no longer says "the tray still works". `lastImportedText` /
   `TRAY_STILL_WORKS` (`static/js/calendar/import-state.js`) take which page asks; only the
   Week's panel keeps the tray clause. Today's says only when it was last imported.
2. **Don't import refreshes Today.** `CalendarPage.ignore` (`static/js/calendar/calendar-page.js`)
   sends `"changed"` after it succeeds, as `file()` does, so Today's "to file" rows drop the event
   without a reload.
3. **Typing while switching from a task's notes to a note is kept.** In `NotesApp.switchTo`
   (`static/js/notes/app.js`), the task's notes are saved *after* the note has loaded and just
   before `taskNotes.close()`, so text typed during the load is saved to the task. If that save
   fails, the switch stops and the task's notes stay open with the error shown.
4. **Follow-ups.**
   - Backend: logging a follow-up on a done task is refused with 409
     `{"error": "task is done"}` and logs nothing (default, approved by Tyson, 2026-11-28). The
     guard in `FollowUpRepository.log` (`paradigm/db/follow_ups_repo.py`) also checks the task's
     `done`; the route (`TasksApi.followed_up`, `paradigm/api/tasks.py`) maps it to 409.
   - Front end: in `static/js/tasks/follow-up-dialog.js`, once the POST has succeeded the dialog
     closes and the log can't be sent again; a failed redraw after it only shows the error. The
     same for closing a follow-up (`closeFollowUp`). A 409 shows its message.
5. **Settings.**
   - Time-off dates show in words as holidays do (`timeOffParts` in
     `static/js/timesheet/time-settings.js`, using `dayText`), e.g. "Mon 1 Dec to Fri 5 Dec".
   - Escape on a Note window choice (the radios, `drawWindowChoices` in
     `static/js/settings/settings-page.js`) does what Escape does on the page
     (`settings-keys.js`: radios and checkboxes are not text fields).
6. **On call.** Hovering a changed name (the person link in `OnCallPage.cell`,
   `static/js/oncall/oncall-page.js`) says `was <old name>` (`changedTitle`,
   `oncall-model.js`); clicking still opens the person. Unchanged names keep `Open …`.

## Data
None.

## API contract

| Method | Path | Request JSON | Response JSON | Errors |
|---|---|---|---|---|
| POST | the existing followed-up route (`TasksApi.followed_up`, path unchanged) | unchanged | unchanged | **new:** 409 `{"error": "task is done"}` when the task is done; existing errors unchanged |

## Files
- Backend lane: `paradigm/db/follow_ups_repo.py`, `paradigm/api/tasks.py`,
  `tests/python/test_follow_ups.py`.
- Frontend lane: `static/js/calendar/import-state.js`, `calendar-page.js`,
  `static/js/today/today-page.js`, `static/js/notes/app.js`,
  `static/js/tasks/follow-up-dialog.js`, `static/js/timesheet/time-settings.js`,
  `static/js/settings/settings-keys.js`, `static/js/oncall/oncall-page.js`; tests in
  `test_import_panel.js`, `test_today_import.js`, `test_calendar_import_wiring.js`,
  `test_task_notes.js`, `test_follow_ups.js`, `test_settings.js`, `test_oncall.js`.

## Acceptance checks
1. Today's Import panel shows no "tray" text; the Week's still does.
2. On the Week, Don't import an event; go to Today: it is not in "to file".
3. Open a task's notes in the note window, type, and open a note at once: the typed text is on
   the task's notes when they are opened again.
4. Logging a follow-up on a done task gets 409 and adds no log (Python test); a redraw that fails
   after a log logs it once (JS test).
5. Settings shows time-off dates in words; Escape with a Note window radio focused does what
   Escape does on the page.
6. Hovering a changed on-call name shows `was …`.

## Not in this feature
- The duplicate `import-panel-title` id in `calendar/import-panel.js` (noticed while exploring;
  can be fixed here only if it is a one-line change in a file this feature already touches).

## As built
- No fix rounds; the API contract is as planned (the one new error, 409 `{"error": "task is
  done"}`, raised by `TaskIsDone` in `follow_ups_repo.py`, checked before the not-a-follow-up
  409). The route's docstring in `paradigm/api/tasks.py` lists it.
- Item 1: `lastImportedText(status, today, page = "week")`; Today passes `"today"`.
  `TRAY_STILL_WORKS` is unchanged and only joined on for the Week.
- Item 2: `CalendarPage.ignore` calls `this.changed(["meetings"])` (which sends `"changed"` and
  reloads) in place of `this.load()`.
- Item 3: `NotesApp.saveTaskNotesBeforeClosing()` saves the task's notes in a loop while they
  are dirty, so text typed during that save is saved too, before `taskNotes.close()`.
- Item 4: `follow-up-dialog.js` split `logFollowUp` into `postFollowUp` (the POST, whose
  errors stay in the dialog) and `afterLogged` (the `changed` message, tree refresh and status
  line); the dialog resolves with a promise of the redraw, so a failed redraw rejects to the
  caller's guard after the dialog is gone.
- Item 5: there is no `timeOffParts` function; the time-off row's days are formatted inline in
  `TimeSettings` with `dayText` (one day alone when first = last). Escape: `settingsAction`
  ignores only text fields now (inputs but radios and checkboxes, selects, textareas, dialogs,
  menus), so the Observed checkbox gets the page's keys as well as the Note window radios.
- Item 6: the changed cell's `was …` title goes on the person link as well as the cell and chip.
- The duplicate `import-panel-title` id was not touched.
- Post-batch fixes (front end, no route changed):
  - Go to…: a note chosen in the palette (`palette/palette.js`) and opened in the same window
    gets the focus (`app.focusNote()`) once `app.open` resolves, in the note window or for a
    dashboard in the main window; `finish()` had left it on the Go to… button.
  - To file: after File, File all or Don't import, `TaskSidebar.focusPending(after)`
    (`calendar/task-sidebar.js`, with `focusFirstKey` / `keysAfterRemoving` from `ui/dom.js`)
    puts the focus on the same button of the next row left, else the one before, else the list;
    the buttons carry `data-focus-key` `file-file-<id>` / `file-ignore-<id>`.
  - On call: a test (`test_oncall.js`) that an open On call tab redraws on a `"changed"` message
    from another window; no code change.
