# 023 A plain note's URL in the main window

Status: built (2026-11-27)
Backlog item: A plain note's URL opened straight in the main window (`/?note=16`) leaves the note before
  it as the note on screen, so `:trash` there trashed that one (Ada Park, in a browser check on
  sample data). The note on screen must follow what the main window shows.
Decided with Tyson: 2026-11-27
Lanes: frontend
Migration: none

## What it does
The main window shows dashboards and pages and never edits text (`docs/spec/navigation.md`, "Two
windows"). This feature covers loading a plain note's address straight into the main window, for
example `/?note=16` where 16 is neither a hub nor a person (a bookmark, a typed URL, or Back and
Forward):

1. The main window shows that note's hub dashboard. If the note has no hub, it shows Home.
2. The address is rewritten (`replaceState`) to what is shown: `?note=<hub>` or Home's address.
   The address never names a note that isn't on screen.
3. The status line says `"<title>" is a note: Enter on it opens the note window`.
   - The main window doesn't open the note window by itself: the browser blocks a popup that no
     key or click asked for (default, approved by Tyson, 2026-11-27).
   - Where the hub's dashboard lists the note, the cursor goes to its row if that is easy;
     otherwise it stays where it was.
4. The note on screen (`screenNote(app)`), the session's open note (`currentId`) and the address
   all agree. `:trash` (and the other note commands) then acts on the hub shown, or refuses on
   Home with `E: no note on this page`. It never acts on a note shown earlier.

**First reproduce the reported case** on generated sample data (open the person Ada Park, then
load a plain note's URL, then `:trash`). Find where the earlier note stays as the session's note
or as the screen note. The likely place is `mainFromUrl` in `static/js/notes/app.js` (near line
433), together with `open()` and `views`. Then fix it there. Write down the cause in the spec's
"What it does" when the docs step runs.

**Cause (found as built).** `mainFromUrl` picked, for a plain note with no hub (16, "Ideas to
sort", at the top level), the first top-level dashboard as a fallback: in the sample data that
was Ada Park. Because that fallback was a dashboard, the page flag stayed null, so Ada Park's
dashboard opened as the main window's note and `:trash` acted on it, while the address still
said `?note=16`. After Back or Forward (history "none") the address was never rewritten either.
The fix: a plain note shows its own hub, or Home when it has none (never the first dashboard),
and the address is rewritten whenever the note asked for isn't the one shown.

## Data
None.

## API contract
None.

## Files
Frontend lane only (`integrate: false`):
- `static/js/notes/app.js` (`mainFromUrl`, and `open` if needed);
- possibly `static/js/notes/screen-note.js` or `static/js/notes/page-views.js`;
- a JS test in `tests/js/` of `mainFromUrl` with a fake tree and history: a plain note under a
  hub, a top-level plain note, an unknown id and a trashed id, each started from an earlier
  person or hub.

## Acceptance checks
1. Open the person Ada Park, then load `/?note=<a plain note under Team>`:
   - Team's dashboard shows;
   - the address names Team's id;
   - the status line names the note;
   - `:trash` asks about Team, not Ada Park, and cancelling leaves both.
2. A plain top-level note's URL shows Home, and `:trash` says `E: no note on this page`.
3. A trashed or unknown id shows Home as now, and nothing from before is left as the note on
   screen.
4. Back and Forward after these keep the screen, the address and the note on screen in step. A
   `:trash` after Back acts on what Back shows.
5. A hub's or a person's own URL still opens its dashboard as before, with no status message.

## Not in this feature
- Opening the note window automatically.
- Changes to the note window's own URL handling.

## As built
- `mainFromUrl` (`static/js/notes/app.js`) as planned: hub or Home, `replaceState` to what is
  shown (Back and Forward too), the status-line hint; a page flag in the URL (a task's `&task`)
  keeps its page and gives no hint.
- The cursor on the note's row: a new `selectNote(id)` on `HubPage` (`static/js/hubs/hub-page.js`)
  and `HubPanel` (`static/js/hubs/hub-panel.js`), which looks in the Notes section only; neither
  file was in the plan's list. `screen-note.js` and `page-views.js` were not changed.
- Test: `tests/js/test_main_url.js` (wired into `tests/js/index.html`).
- Fix round 1 (browser check), two older behaviours fixed in `static/js/notes/app.js`, not
  caused by this feature:
  - `:trash` without `!` on a note with notes under it now refuses in the page, with the same
    message as the server's 409 ("E: The note has notes under it: :trash! deletes them too"),
    and sends no request, so the browser's console no longer lists a failed load. The server
    still decides everything else (the last note, archived or hidden children); the backend is
    unchanged.
  - Back and Forward clear the main window's status line (new `clearStatus()`) before
    `openFromUrl("none")`, so an earlier error no longer stays; the hint above is set after the
    clear and still shows. The note window's status line (the editor's) is untouched.
  - Two tests for these in `tests/js/test_main_url.js`; the `popstate` wiring line itself has
    no unit test.
