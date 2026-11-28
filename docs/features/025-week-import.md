# 025 Week as in Figma: file-only import

Status: built (2026-11-27)
Backlog item: Week as in Figma (Week · imported / not imported): calendar import is file-only. With no
  import this week, the calendar greys out under a centered Import panel (drop the .ics, or `i` to
  pick it; "Plan without it"). The `<data>/import/` folder scan goes.
Decided with Tyson: 2026-11-27
Lanes: backend, frontend
Migration: none

Figma "Paradigm UI" (fileKey WiWq1ftWbEclRLbUyhcwKi): Week imported 13:47, Week not imported
35:362. Where Figma and today's behaviour differ, Figma wins (Tyson, 2026-11-27).

## What it does
1. **When the panel shows.** It shows on the Week's Plan tab when both of these hold:
   - the week shown holds today;
   - nothing has been imported today (`imported_today` is false).

   Past and future weeks never grey. The panel's title follows Figma: "Today's calendar isn't
   imported" (default, approved by Tyson, 2026-11-27).
2. **The panel.** The calendar grid greys out: its blocks wash with the page, and it takes no
   clicks or drags. The tray on the left stays live. Centred over the grid is a raised panel
   (overlay surface) holding:
   - **Today's calendar isn't imported** (`--fs-lg`, 600).
   - "In Outlook: File › Save Calendar › Next 7 days, Full details. Then import that file."
   - A dashed drop zone: **Drop the .ics here** / "or press i to pick it".
   - Two buttons: **Import a file… `i`** (primary, with its key cap) and **Plan without it**.
   - "Last imported: Wed 25 Nov 08:12 · the tray still works". When nothing was ever imported,
     it reads "Never imported yet · the tray still works".
3. **Importing.**
   - `i`, or Import a file…, opens the browser's file input (`accept=".ics"`, several files
     allowed).
   - A drop of `.ics` files anywhere on the Plan tab imports them, as now.
   - Each file goes to `POST /api/calendar/upload`.
   - Afterwards the panel goes and the grid redraws. The status line says "Imported n meetings
     from {file}".
   - A file that won't parse says `E: not a calendar file: {name}`, and the panel stays.
   - `i` still works once imported, to import a newer file.
4. **Plan without it.** It hides the panel for the rest of today in this browser. localStorage
   holds `paradigm.planWithout = "YYYY-MM-DD"`, so tomorrow it is back. After that the bar keeps
   a quiet "Not imported today · i" note on the right.
5. **Keys on the Plan tab** (CALENDAR_KEYS):

   | Key | What it does |
   |---|---|
   | `[` `]` | Week |
   | `g t` | The tray |
   | `g c` | The calendar |
   | `j` `k` | Move |
   | `s` | Schedule |
   | Enter | Block menu |
   | `i` | Import a file |
   | `?` | All keys |

   - Hint bar, as in Figma: `[ ]` week, `g t` tray, `g c` calendar, `j k` move, `s` schedule,
     `Enter` block menu, `?` all keys.
   - **On the Week's Plan tab, `g t` moves the focus to the tray and `g c` to the calendar grid.**
     The Plan tab's table is read before the global table there, so it shadows the global
     `g t` (Today) on that tab only. Everywhere else, the Week's other tabs included, `g t` is
     still Today (Figma wins, Tyson, 2026-11-27). The navigator's Today pin and the top bar's
     Today still reach Today from the Plan tab.
   - The tray's and calendar's existing focus moves (Tab, Esc) keep working.
6. **The folder goes.**
   - There is no `<data>/import/` folder any more: nothing scans it at start, and nothing on
     window focus.
   - No Import (folder) button, and no "Import a file…" link apart from the panel's and the bar's
     new **Import `i`** button.
   - Files already sitting in an old import folder are left alone and never deleted. Paradigm
     doesn't make the folder any more.
7. **Today's banner.** Today's import line loses the folder wording. It now reads "Today's
   calendar isn't imported · Week (g w) to import". Its full redesign is a later item.

## Data
No schema change. `import_log` keeps recording each import's day. The status adds the time of
the last import (`import_log.at`).

## API contract
| Method | Path | Request JSON | Response JSON | Errors |
|---|---|---|---|---|
| GET | /api/calendar/status | — | `{"imported_today": false, "last_day": "2026-11-25", "last_at": "2026-11-25T08:12:00"}` (`last_day` / `last_at` are `null` when never) | — |
| POST | /api/calendar/upload | raw .ics bytes (unchanged) | unchanged: `{...counts, "errors": []}` | 400 empty, too large, or not a calendar |
| POST | /api/calendar/import | **removed** | — | 404 |

- `waiting` and `folder` leave the status.
- `pending`, `file` and `ignore` are unchanged.

## Files
- **Backend lane:**
  - `paradigm/config.py`: `import_dir` goes.
  - `paradigm/app.py`: `import_calendar` and its start-up call go.
  - `paradigm/db/import_repo.py`: `import_folder` and `_waiting` go, and the folder argument
    goes. `status()` adds `last_at` and drops `waiting` and `folder`.
  - `paradigm/api/calendar.py`: the import route goes.
  - An upload that isn't a calendar answers 400 with "not a calendar file", if it doesn't
    already.
  - Tests: `tests/python/test_calendar_import.py` (the folder tests go; status tests for
    `last_at`), `tests/python/test_tasks_calendar_api.py`, and any test that builds
    `ImportRepository` or `Config` with the folder.
- **Frontend lane:**
  - `static/js/calendar/calendar-page.js`: no focus import and no folder button. The panel is
    shown and hidden.
  - A new `static/js/calendar/import-panel.js`: draws the panel, the drop zone and the buttons.
  - A new `static/js/calendar/import-state.js`, pure: whether the panel shows (week, today,
    status, the Plan-without-it day), and the "Last imported" text.
  - `static/js/calendar/api.js` (`importFolder` goes).
  - `static/js/calendar/calendar-keys.js`: `i` help, and `gt` `gc` with hints. Two-key entries
    go through `ui/key-sequence.js`.
  - `static/js/layout/view-keys.js` and the main window's key dispatch (`main.js` or
    `layout/main-keys.js` handling): the Plan tab's `gt` is read before MAIN_KEYS.
  - CSS: a new `static/css/import-panel.css`, linked in `index.html`.
  - `static/js/today/today-page.js`: the banner text only.
  - Tests: a new `tests/js/test_import_panel.js` (the show rule, the texts, Plan without it by
    day), `tests/js/test_key_hints.js` (`g t` / `g c` caps on the Plan tab; `g t` still Today
    elsewhere), `tests/js/index.html`.

## Acceptance checks
Sample data in a temporary `--data` folder with no import today:
1. Week, Plan tab, this week: the grid is greyed under the centred panel, with every text above.
   The tray still opens and moves with `j`/`k`.
2. Next week (`]`): no panel. Back with `[`: the panel is there again.
3. `i` opens a file input that accepts .ics.
4. Dropping a sample .ics on the Plan tab imports it. The panel goes and the meetings show.
   "Last imported" in a fresh window shows today's time.
5. Plan without it hides the panel. A reload keeps it hidden, and the bar shows "Not imported
   today · i".
6. On the Plan tab, `g t` moves the focus to the tray and `g c` to the grid. On the Timesheet tab
   and on Today, `g t` still opens Today.
7. The hint bar reads `[ ]` week, `g t` tray, `g c` calendar, `j k` move, `s` schedule, `Enter`
   block menu, `?` all keys.
8. No `import` folder appears in the data folder after a start. `POST /api/calendar/import`
   answers 404.
9. Today's banner reads "Today's calendar isn't imported · Week (g w) to import" and mentions no
   folder.

## Not in this feature
- Today's Import panel ("Not today"): the next batch.
- A per-week "imported" flag.
- Reading Outlook directly.

## As built
- The API is as the contract says: status gives `imported_today`, `last_day`, `last_at`;
  `waiting` and `folder` are gone; `POST /api/calendar/import` answers 404; a non-calendar
  upload answers 400 "not a calendar file".
- The Plan table also keeps `t` (this week), `w` (weekend), `x` / Delete and Esc, out of the
  hint bar. Enter now opens the block's menu (it opened the block's note); on a button it is the
  button's own. `j` `k` move by day, then time; while the panel shows they move only in the tray.
- `g t` on the tray's To file tab shows To plan first (`TaskSidebar.focusRow`). With no row, the
  focus goes to the calendar's root. `g c` with the panel up goes to its Import a file….
- The `g t` shadow applies wherever the focus is on the Week page, not only inside `.week-plan`:
  its bar, tabs, This week, the arrows and the page body (fix rounds 2 and 3). A window keydown
  listener in `main.js` sends keys typed there to `calendar.onKey`, so `i`, `[`, `]` and `g t`
  work from the bar too. The navigator is left out, so `g t` there still opens Today.
- When the panel redraws, the page takes the focus back if the grid had it and went inert, or if
  the panel hid with the focus in it (an import from its own button): the Plan keys keep
  working (fix round 1).
- A multi-file upload says "Imported n meetings from 2 files. E: not a calendar file: b.ics";
  `hasError` styles any E: part as an error, not only a line that starts with one.
- The bar's status line no longer says "not imported" itself: the panel, or the quiet note once
  planned without, does.
- Tests added beyond the plan: `tests/js/test_calendar_import_wiring.js` (a real CalendarPage on
  a fake API and storage).
