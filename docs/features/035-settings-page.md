# 035 Settings behind a gear

Status: built (2026-11-27)
Backlog item: Move all settings into a gear icon setting.
Decided with Tyson: 2026-11-27
Lanes: backend, frontend
Migration: none

Figma "Paradigm UI" (fileKey WiWq1ftWbEclRLbUyhcwKi): "Settings (gear) · 1600" 52:874; the gear in
the top bar of 50:666 and 50:1401 (the Week without its Settings tab).

## What it does
1. **The gear.** The main window's top bar ends with a gear button (an inline SVG icon, `aria-label`
   "Settings", title "Settings (g ,)") in place of the **Window ▾** menu, as 50:666. It is lit
   (selected surface, focus-coloured edge) while Settings is shown.
2. **Opening Settings:** the gear, `g ,` (main window key table), or `:settings` (palette and note
   commands). It is a main-window page, `&settings`, opened with a history step (Back returns).
3. **The page** (52:874): heading **Settings**; on the left a section index (Note window, Codes
   and hours, Holidays, Time off and sick time, Linked folders, Data folder); on the right one card
   per section, in that order, scrolling as one page. Clicking an index entry scrolls to its card;
   the entry of the card at the top is lit.
4. **Note window** (moved from the Window ▾ menu): three radio choices, as `WINDOW_MODES` says:
   **By screen** (the right third on a wide screen, the whole screen on a laptop), **Right third**
   (always beside the main window), **Whole screen** (always over the main window). Choosing one
   saves at once (localStorage `paradigm.noteWindow`, as now) and places an open note window again,
   as the menu did. The Window ▾ menu and its markup go.
5. **Codes and hours, Holidays, Time off and sick time** (moved from the Week's Settings tab):
   the same fields, lists, add and remove buttons and Save as the tab has now, with the same
   routes; drawn as cards. The Week loses its **Settings** tab (tabs: Plan, Timesheet, On call);
   `&week=settings` in an old URL opens Settings instead.
6. **Linked folders**: every OneDrive folder linked to a hub (from `GET /api/files`), one row each:
   hub title (opens the hub), the folder path, and **Unlink…** (the same confirm and route as the
   Files section's Unlink). "No folders linked yet. Link one from a project's Files section." when
   none (default, approved by Tyson, 2026-11-27).
7. **Data folder**: the folder Paradigm keeps its notes in, read only, with **Copy path**. From the
   new `GET /api/about`.
8. **No theme switcher** yet: Nord Light is the only theme in the table (default, approved by
   Tyson, 2026-11-27). The on-call rota stays on the Week (it is data, not a setting).
9. **Keys on Settings:** the window-wide keys only (`?` lists them); `Escape` goes back. Its hint
   bar shows `Esc` back and `?` all keys (034 adds its scroll and letters keys).

## Data
None. Settings keep their stores: timesheet settings, holidays and time off in the database as
now; the note-window mode in localStorage.

## API contract
| Method | Path | Request JSON | Response JSON | Errors |
|---|---|---|---|---|
| GET | /api/about | — | `{"data_folder": "/Users/x/paradigm-notes", "version": "…"}` (`version` as the app already knows it, or omit if it has none) | — |

Everything else uses existing routes: the timesheet settings, holiday and time-off routes the
Week's Settings tab calls now; `GET /api/files`; `POST /api/folder/unlink`.

## Files
- Backend lane: a small `paradigm/api/about.py` (or the nearest existing module that owns app
  facts), `paradigm/app.py` wiring, a test in `tests/python/` (the route returns the `--data`
  folder given).
- Frontend lane: `static/index.html` (the gear in place of Window ▾), `static/js/main.js` (the
  menu wiring goes; the page registered), a new `static/js/settings/` folder: `settings-page.js`
  (the page, the index, the cards), `settings-model.js` (the sections, the index's lit entry;
  pure), `about-api.js`; the Codes/Holidays/Time off drawing moved out of
  `static/js/timesheet/time-page.js` into a module Settings uses (not copied);
  `static/js/week/week-page.js` (tabs), `static/js/notes/page-views.js` (`&settings`, the old
  `&week=settings`), `static/js/notes/commands.js` (`:settings`), `static/js/layout/main-keys.js`
  (`g ,`), `static/js/layout/view-keys.js`, `static/js/windows/note-window.js` (only what the menu
  removal needs), `static/css/settings.css` and `static/css/topbar.css`; tests in `tests/js/`
  imported in `tests/js/index.html`.

## Acceptance checks
1. The top bar shows a gear and no Window ▾ menu; clicking the gear opens Settings with the gear
   lit.
2. `g ,` and `:settings` open Settings; Back returns to the page before.
3. Choosing Right third saves it: reloading Settings shows it chosen, and opening a note puts the
   note window on the right third.
4. Codes and hours: changing Working day ends to 17:00 and Save, then the Week's Plan shows the day
   ending at 17:00.
5. Adding a holiday and removing it work from Settings; the Week's Timesheet counts it.
6. The Week shows tabs Plan, Timesheet, On call only; `&week=settings` opens Settings.
7. Linked folders lists a folder linked on sample data with its hub; Unlink… asks and removes it.
8. Data folder shows the `--data` folder the server was started with; Copy path copies it.
9. Clicking "Holidays" in the index scrolls its card to the top and lights the entry.
10. Esc on Settings goes back.

## Not in this feature
- A theme switcher. Editor `:set` options (they stay in the note window).
- Moving the on-call rota.

## As built
- As planned, with these differences and additions:
- **The Window ▾ menu's Live note entry** went with the menu: the Live note is `gn` or `:live`.
- **`:settings` is typed in full** (min 8), so `:set` stays the editor's options.
- **A key table of its own**, `static/js/settings/settings-keys.js` (`Escape` back), read by
  `view-keys.js` for the hint bar and the `?` list. The Week's "Week: Settings" key table went.
- **The timesheet cards** live in `static/js/timesheet/time-settings.js` (`TimeSettings`), moved
  out of `time-page.js`; `time-page.js` is the week's grid only. Saving them tells the other
  windows (`changed: time`) and redraws the tree.
- **`GET /api/about`** (`paradigm/api/about.py`) returns `data_folder` as an absolute path
  (symlinks kept) and `version` from `paradigm.__version__`; the Data folder card shows
  "Version N" under the path, and "Can't read the data folder: …" if the call fails.
- **The index's lit entry** is the last card whose top reached the scroller's top; at the foot,
  where the last cards can't reach it, the entry clicked stays lit while its card is in view.
- **Focus after a redraw** (fix round 1, from the browser check): every button and field a card
  is redrawn under carries a `data-focus-key`, and the card puts the focus back on the same one
  after Save, Add holiday and a cancelled confirm. After a confirmed Remove (a holiday or a time
  off row) the focus goes to the next row's ×, else the previous one's, else the Name field (the
  Kind select for time off). After a confirmed Unlink it goes to the next folder's Unlink…, else
  the previous one's, else the Linked folders card itself. The extra redraw after the Unlink
  dialog went (unlinking refreshes the tree already). Shared helpers in `static/js/ui/dom.js`:
  `focusedKey`, `focusFirstKey`, `keysAfterRemoving`.
- API contract: unchanged apart from `version` always being present.
