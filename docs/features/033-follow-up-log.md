# 033 Follow-ups: only today's, at the top, logged when done

Status: built (2026-11-27)
Backlog item: Follow ups should only show up on Today if they need to be followed up on that day. They
  should appear at the top.
Decided with Tyson: 2026-11-27
Lanes: backend, frontend
Migration: 032_follow_up_logs.sql (the next free number on this branch; the merger renumbers)

Figma "Paradigm UI" (fileKey WiWq1ftWbEclRLbUyhcwKi), page "4 · Redesign (light)": "Today ·
follow-ups today first · gear" 50:666 and "Today · log a follow-up: close it or follow up again"
54:953.

## What it does
A follow-up is a delegated, open task with a follow-up day (`tasks.follow_up`). Tyson, 2026-11-27:
"When I follow up with someone, I should log that I followed up. I either can close it or
reschedule another follow up. There should never be any follow ups at the end of a day."

1. **Only today's, at the top.** Today's Up next starts with a group **Follow up today · n**
   (section label as in Figma, the shared section-heading style), holding each follow-up whose day
   is today or earlier, oldest first. Then a label **Then · ranked** and the ranked list as now,
   without follow-ups in it. Follow-ups due later never show on Today (they stay on the Week's
   tray and the person page). With none due, neither label shows and Up next looks as now.
2. **Never late, carried forward.** A follow-up not dealt with stays in the group the next day.
   One whose day is past shows the chip **from Wed** (warning tone; the day through
   `ui/dates.js`, "from 20 Nov" past a week) in place of **Today** (info tone). It is never
   "N d late", and follow-ups no longer count in the navigator's overdue count (default, approved
   by Tyson, 2026-11-27).
3. **Followed up… (Space).** On a follow-up row, Space (and a click on the row's → glyph) opens
   the dialog **Followed up with {person}** (overlay surface), as Figma 54:953:
   - a line "{task title} · {hub} · {n}th follow-up" (n counts the logged ones plus this one;
     "1st" when none);
   - **What happened** (one-line text box, optional), "goes in the task's history";
   - two choices, **Follow up again** (default, with a date box) and **Close it** ("done: they did
     it, or it no longer matters");
   - the date box starts two working days after today (default, approved by Tyson, 2026-11-27),
     takes YYYY-MM-DD or a word the app's day parser already reads (tomorrow, mon, +3), and must be
     after today; quick picks under it: +1 tomorrow · +3 · Mon;
   - **Log Enter** (primary) and **Cancel Esc**. Up/Down or `j`/`k` while the choices have focus
     switch between them.
   Logging writes the entry, then:
   - Follow up again: the task's follow-up day becomes the new day; it leaves Today's group.
   - Close it: the task is done (done_day today), as Space on a task does.
   Status line: "Logged: follow up again Tue 1 Dec" / "Logged and closed: {title}".
4. **Quick keys on a follow-up row** (Today's table): `c` close it (logs an entry with no note,
   outcome closed; no dialog); `r` follow up again on… (a small dialog with only the date box,
   then logs an entry with no note). Space on a non-follow-up row still ticks the task done.
5. **The task's History** (task page's History card) lists each logged follow-up, newest first:
   "Followed up: {note}" (or "Followed up" with no note) on its day, then "next Tue 1 Dec" or
   "closed".
6. **Hint bar on Today** when a follow-up row is the cursor's: `Space` followed up…, `c` close it,
   `r` follow up again on… (the table's hints; the bar shows them as in 54:953).

## Data
Migration `032_follow_up_logs.sql`:
```sql
CREATE TABLE follow_up_logs (
    id          INTEGER PRIMARY KEY,
    task_id     INTEGER NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    day         TEXT    NOT NULL,          -- 'YYYY-MM-DD', local: when I followed up
    note        TEXT    NOT NULL DEFAULT '',
    outcome     TEXT    NOT NULL CHECK (outcome IN ('again', 'closed')),
    next_day    TEXT    NOT NULL DEFAULT '', -- the new follow-up day for 'again', else ''
    created_at  TEXT    NOT NULL
);
CREATE INDEX follow_up_logs_task ON follow_up_logs (task_id, day);
```
Removing a task removes its logs (cascade). A task's logs follow it through trash and restore as
the task does (they are only read for live tasks). Note text max 500 characters.

## API contract
| Method | Path | Request JSON | Response JSON | Errors |
|---|---|---|---|---|
| POST | /api/task/followed_up | `{"id": 7, "note": "Pinged on Teams", "outcome": "again", "next": "2026-12-01", "today": "2026-11-27"}` | the task, as `/api/task/update` returns it, plus `"follow_up_count": 3` | 400 bad outcome; 400 `next` missing, not a day, or not after `today` for "again"; 400 note too long; 404 no such task; 409 the task is not delegated or has no follow-up day |
| GET | /api/task/history?id=7 | — | `{"events": [...]}` as now, plus one event per log: `{"key": "followup:12", "day": "2026-11-27", "kind": "followed_up", "text": "Followed up: Pinged on Teams", "next": "2026-12-01" or null, "closed": false}` | 404 as now |
| GET | /api/tasks | — | as now; each task gains `"follow_up_count": n` (its logs) | — |

`today` is the browser's local day (the server never guesses the user's day). "closed" also sets
`done = 1, done_day = today` exactly as `/api/task/done` does and keeps `follow_up` as it was.
"again" sets `follow_up = next`.

## Files
- Backend lane: `paradigm/db/migrations/032_follow_up_logs.sql`, a new
  `paradigm/db/follow_ups_repo.py` (log, count, list), `paradigm/db/task_history.py` (the log
  events; `build_events` stays pure), `paradigm/db/tasks_repo.py` (`follow_up_count` on tasks),
  `paradigm/api/tasks.py` (the route), `paradigm/app.py` wiring; tests in `tests/python/`.
- Frontend lane: `static/js/today/today-model.js` (the group first, carried chips, nav counts),
  `today-page.js` (the two labels), `today-keys.js` (Space on a follow-up, `c`, `r`),
  `today-actions.js`, a new `static/js/tasks/follow-up-dialog.js`, `static/js/tasks/api.js`
  (`followedUp`), `static/js/tasks/task-history.js` / `task-page-model.js` (the log rows),
  `static/css/today.css`; tests in `tests/js/` imported in `tests/js/index.html`.

## Acceptance checks
1. Sample data with one follow-up due today, one due Wed (past), one due next week: Today's Up next
   starts with "Follow up today · 2" holding the past one ("from Wed", warning) then today's
   ("Today", info); the next-week one is not on Today; "Then · ranked" follows.
2. No follow-up due: no labels; Up next as before.
3. Space on a follow-up row opens "Followed up with {person}" with "Follow up again" chosen and a
   date two working days on; typing a note and Enter logs it; the row leaves the group; the task's
   follow-up day is the new day (`GET /api/tasks`).
4. Choosing Close it and Enter: the task is done, leaves Today, and the status line says "Logged
   and closed: …".
5. `c` on a follow-up row closes it with no dialog; `r` asks only the date.
6. A date of today or earlier, or nonsense, is refused in the dialog (the error shows inside, the
   dialog stays).
7. The task page's History card shows "Followed up: {note}" with "next Tue 1 Dec", and a closed
   one "closed", newest first.
8. The navigator's overdue count does not count follow-ups.
9. Trashing the task's project and restoring it keeps the logs; removing the task removes them.
10. The route refuses an undelegated task (409) and a bad outcome (400) (Python tests).
11. The dialog's "nth follow-up" counts earlier logs (3rd after two logs).

## Not in this feature
- Logging a follow-up from the task page or the person page (only Today).
- An end-of-day prompt for follow-ups not dealt with (they carry to the next day instead).
- The keys model change (034): this feature binds its keys in Today's table as it stands; 034
  makes them act on the selected row.

## As built
- As planned: migration `032_follow_up_logs.sql`, `paradigm/notes/follow_ups.py` (the pure
  checks: outcome, a one-line note of at most 500 characters with no control characters, the
  days), `paradigm/db/follow_ups_repo.py` (log, the list; the count is a subquery in every task
  read of `tasks_repo.py`, so every task answer carries `follow_up_count`, not only
  `/api/tasks`), `POST /api/task/followed_up` (400 `BadFollowUp`, 409 `NotAFollowUp`, 404).
  "closed" goes through the new `close_task` in `tasks_repo.py`, which `/api/task/done` now
  shares, so its open subtasks close with it as they do on Space.
- The history route keeps its parameter as it was: `GET /api/task/history?task=N`, not `?id=`
  as the contract table wrote it. Followed-up events have `note_id: null` and the log's local
  time; two logs on one day sort by the order they were logged in.
- Removing a task is a soft delete (`removed_at`), so the cascade never runs: `remove` deletes
  the task's logs itself. Trash and restore of its hub leave them alone.
- Up next: the follow-up group now comes before overdue tasks (it was after them in the ranked
  order); every item has `group` ("followup" or "ranked"); the reason kind "carried" is new
  (warning, `ui/chip-tones.js`). "Up next"'s heading count is the ranked rows only.
- The follow-up words and days are in a new pure `static/js/tasks/follow-up-model.js`
  (ordinal, the dialog's line, the default day, the date box's parser, the carried chip, the
  status line); `addWorkingDays` moved from `today-model.js` into `week/capacity.js` so both
  use it. A weekday in the date box is the next one after today (on a Monday, "mon" is next
  week's); the box shows the day it reads as you type.
- `r`'s dialog is titled "Follow up again with {person}". Up/Down and `j`/`k` on the choices
  are a new `choices` scope in `ui/ui-keys.js`.
- The key-hint bar follows Today's cursor: `TodayPage` takes `onCursor`, the app sends a
  "cursor" event, and `viewTable(..., { followUp })` reads Today's table's `followHint:` words
  (`move`, `followed up…`, `close it`, `follow up again on…`, `open`).
- Tests: `tests/python/test_follow_ups.py`, `tests/js/test_follow_ups.js`, `test_today.js`
  updated. Before this feature, `test_capture_sheet.js` sometimes failed ("note captures: \t
  opens the sheet…", the line-1 mark undefined), and the fix round could not make it fail
  again. The likely cause is a timing race in the test: while the sheet is open the editor
  draws only line 0, and it measures itself again on a later frame. The test now waits two
  animation frames after the sheet closes. No app code changed, and this fix is not confirmed.
