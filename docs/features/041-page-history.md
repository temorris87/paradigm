# 041 Shift-H / Shift-L: back and forward

Status: built (2026-11-28)
Backlog item: Shift H should take me to the previous page I was on, Shift L should take me forward to
  the page I was last on.
Decided with Tyson: 2026-11-28
Lanes: frontend
Migration: none

## What it does
1. **`H` goes back and `L` goes forward** a page, window-wide in the main window (entries in
   `MAIN_KEYS`, `static/js/layout/main-keys.js`, so the `busy()` rule keeps them out of text
   boxes, the editor and dialogs). They call `history.back()` and `history.forward()`, so they
   go exactly where the browser's Back and Forward go; the existing `popstate` handler
   (`static/js/notes/app.js`, `openFromUrl`) opens the page.
2. **Every page change is its own history step** (default, approved by Tyson, 2026-11-28). The
   `replaceState` between one page view and another in `static/js/notes/page-views.js` (`show`,
   near line 76) becomes a `pushState`, so Today → People → Meetings → a dashboard is four steps
   and `H` walks back through each. `leave` (which calls `history.back()` for a `{view}` step)
   keeps working. The browser's own Back changes the same way.
3. A page you come back to opens as it opens now (its default cursor and scroll); nothing is
   restored beyond what the URL says.
4. **The ends.** The app keeps its own position in its history: a counter in the state it pushes
   (`history.state`), carried by every push and replace and read on `popstate`. With nothing to go
   back to, `H` shows `E: no earlier page` on the status line and does nothing; at the forward
   end `L` shows `E: no later page`. Pages opened before the app's first entry (a reload) count
   from that entry.
5. **Dashboard `L` (Log status…) moves to `S`** ("status"), keeping `:log` (default, approved by
   Tyson, 2026-11-28). The bar on project and area dashboards shows `S log status`; plain
   dashboards still leave it out.
6. **Live** keeps its own history rules (default, approved by Tyson, 2026-11-28); `H` on Live
   goes back to the page before it.
7. The `?` list shows `H` "back a page" and `L` "forward a page" under "Anywhere in this window";
   the bar shows `H L back / forward` (label `"H L"`) only if room allows within the window
   hints, else only in `?` — the frontend lane decides by the bar's existing rule for window
   keys.

## Data
None.

## API contract
None: no route is added or changed.

## Files
- Frontend lane:
  - `static/js/layout/main-keys.js` (`H`, `L`), `static/js/main.js` (wiring, status messages);
  - `static/js/notes/page-views.js` (push between pages), `static/js/notes/app.js` (history
    position in `history.state`, the ends);
  - possibly a small new pure module for the history position (e.g.
    `static/js/layout/page-history.js`);
  - `static/js/hubs/hub-keys.js` (`L`→`S`) and the handler if it names the key;
  - tests: `tests/js/test_main_url.js` (steps between pages, positions), new tests for the ends,
    `test_key_hints.js`, `test_hubs.js`.

## Acceptance checks
1. From Today, open People, then Meetings, then a project dashboard; `H` three times goes back
   through Meetings and People to Today; `L` twice goes forward to Meetings.
2. `H` on the first page of the session shows `E: no earlier page`; `L` at the end shows
   `E: no later page`.
3. On a project dashboard, `S` opens Log status…; `L` there goes forward (or says there is no
   later page).
4. `H` typed in a text box or the palette types an `H`.
5. The browser's Back button also steps through each page.

## Not in this feature
- Restoring each page's cursor and scroll on Back.
- Moving between sidebars with Shift-H/L (later backlog item; Tyson to decide its keys).

## As built
- `static/js/layout/page-history.js` (new, pure): `PageHistory` wraps `window.history`; every
  `pushState` / `replaceState` the app makes carries `step` in its state (a push counts on, a
  replace keeps it), `popped()` reads it again on `popstate`, and `go(by)` (with `goBack()` /
  `goForward()`) returns false past the ends. Moves asked of the browser whose `popstate` has not
  come yet are counted (`position`), so a quick `H H` is checked from where the first lands and
  cannot step out of Paradigm; a Back pressed by hand in between resets the count.
  `whenSettled(fn)` runs fn at once, or once every pending move has landed and the app has drawn
  it (`landed()`, called after `openFromUrl` on `popstate`): `H`, `L` (`static/js/main.js`) and
  Escape (`NotesApp.leaveView`, Settings' leave) go through it, so Escape right after `H` leaves
  from the page landed on, with its own `leave`, and never pushes while Back is on its way. A
  move whose `popstate` has not come within a second counts as skipped: the pending moves are
  cleared, the step is read again from the entry shown, and the keys that waited on it are
  dropped rather than run (a late `popstate` would move the tab after them). The
  entry loaded with no step is marked step 0, so a reload on it later keeps its step. An entry
  reached by `popstate` with no step is a same-page `#` link's (a footnote on Live) when only the
  URL's hash changed from the entry the tab was last on: it counts one on from that entry and is
  marked so, so `H` goes back from it. Where the tab is (its URL without the hash, `base`, and
  its entry index, `at`) is noted again on every move (`seen()`: on load, every push and replace,
  a `popstate` onto a step, and a move given up on), so a footnote on a page `H` went back to is
  one on from that page, not from the page left. Otherwise it is an entry the build before 041
  pushed (a tab open across the upgrade): it counts as far as the tab moved (`movedBy()`: from
  the browser's entry index when it gives one, else from the sign of the `H` or `L` on its way,
  else one Back), and past the ends it widens the earliest (`first`) or furthest step known, both
  kept in `sessionStorage` (so steps can go below 0). An old entry behind is the earliest, and
  `H` there says `E: no earlier page`; one reached by Forward counts ahead, so `L` reaches it
  again. The entry index comes from the `index` option (default `() => null`); `NotesApp` passes
  the Navigation API's `navigation.currentEntry.index`. The page's URL comes from the `where`
  option (default `location.href`). The furthest step reached is kept
  in the tab's `sessionStorage`, so after a reload `L` still goes forward to a later page, as the
  browser's Forward would; only a window that refuses storage falls back to the page loaded as
  the last step. `NotesApp.history` is now this wrapper, and `PageViews` gets it.
- `static/js/notes/page-views.js`: every change of page pushes, so `H` and Back step page by
  page. Built differently from point 2: Escape does not walk back step by step. Each page's step
  carries `leave`, how many steps Escape goes back (`history.go(-leave)`), so Escape still returns
  over the run of pages to the note under them, as before. `STEPS_OVER_PAGES` (task, settings)
  start a new run (Escape returns to the page they were opened from) and `STEPS_KEPT_UNDER`
  (history) keeps Escape from a page opened from History returning to History. When Live closes,
  the page under it takes Live's `leave` (`NotesApp.leaveLive`, `static/js/notes/app.js`).
- `H` and `L` are `MAIN_KEYS` entries (`back`, `forward`) sharing one hint, `H L back / forward`.
  By the bar's existing rule only Live's bar (no table of its own) shows the window's hints, so
  that is the one bar with it; everywhere else it is in the `?` list. No view's own table binds
  `H` or `L`, so nothing shadows them.
- `L` → `S` reached every place that named it: the dashboard head's button caps and "No status
  yet · S to log", the empty status-log line, the status-history dialog's text, the note menu's
  hint and the palette's `:log[!] S`.
- Tests: `tests/js/test_page_history.js` (new: steps, the ends, quick `H H H`, reloads, Escape's
  runs, a footnote link's step, a footnote on a page `H` went back to, Forward onto an older
  build's entry ahead, Escape and `H` / `L` waiting for a pending Back); `test_history.js`, `test_live_return.js`, `test_meetings.js`, `test_key_hints.js`,
  `test_palette.js`, `test_status.js`, `test_task_page.js` updated.
