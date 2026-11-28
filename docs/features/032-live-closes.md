# 032 Closing the note window closes the Live page

Status: built (2026-11-27)
Backlog item: When a note is closed, the preview should also close.
Decided with Tyson: 2026-11-27
Lanes: frontend
Migration: none

## What it does
"The preview" is the Live page (`&live`): the note window's note rendered in the main window as it
is typed, shown on the main window (the left two thirds) while a note is edited. "Closed" is the
note window closing (Tyson, 2026-11-27).

1. **When the note window closes** (its `live-closed` message, sent on pagehide), the Live page
   leaves and the main window goes back to the page the note was opened from: the page shown
   when Live took over (Tyson, 2026-11-27). Today it stays up saying "The note window is closed".
2. **Which page that is.** When the main window switches to Live (because a note was opened into
   the note window, or `g n`), it remembers the view it was showing (its URL state: the view key
   and note). On `live-closed` it shows that view again with `replace`, so Back does not return to
   a dead Live page (default, approved by Tyson, 2026-11-27).
3. **Only when Live is on screen.** If the main window has already moved off Live when the note
   window closes, nothing happens (default, approved by Tyson, 2026-11-27).
4. **If that page is gone** (its note trashed meanwhile), the main window shows Today (default,
   approved by Tyson, 2026-11-27).
5. **Reloading the note window** (a pagehide followed by a new `live` message within 2 s) is not a
   close: Live stays. The leave waits 2 s for a new `live` from the same window before acting.
6. **Opening Live by hand** with no note window open still shows "The note window is closed", as
   now; nothing to go back to.

## Data
None.

## API contract
No route. Channel messages as now: `live`, `live-closed`, `live-ask`.

## Files
- Frontend lane: `static/js/live/live-page.js` (on `live-closed`: ask to leave), `static/js/main.js`
  and/or `static/js/notes/page-views.js` (remember the view under Live, show it again), a small
  pure helper for "what to go back to" with tests in `tests/js/` imported in `tests/js/index.html`.

## Acceptance checks
1. From a project dashboard, open a note so the note window opens and the main window shows Live;
   close the note window: within about 2 s the main window shows the project dashboard again.
2. Same from Today and from the People page: each returns to where it was.
3. After returning, browser Back does not land on the Live page.
4. With Live on screen, reloading the note window (F5) keeps Live up.
5. If the main window was moved to the Week while the note window was open, closing the note
   window leaves the Week on screen.
6. If the page under Live was a note that got trashed meanwhile, closing the note window shows
   Today.
7. `g n` with no note window open still shows "The note window is closed".

## Not in this feature
- Closing the note window from the main window.

## As built
- Frontend only, as planned. `static/js/live/live-return.js` (pure) holds `viewUnderLive`,
  `returnTo` and `RELOAD_GRACE_MS` (2000); `live-page.js` waits that long after `live-closed`
  (cancelled by a new `live`) and calls its new `onClosed` option; `main.js` wires it to
  `NotesApp.leaveLive()` in `static/js/notes/app.js`, which replaces Live's history step with
  the remembered page and opens it through `openFromUrl("replace")` (a gone note falls back to
  Today there), keeping the step's state so Escape still goes Back. `page-views.js` is unchanged.
- The page under Live is remembered in `showView("live")` only when Live is not already shown.
  Fix round 1: coming back to Live by Back or Forward (or a reload on `&live`) keeps the page
  remembered when that step was made, rather than wiping it, so closing the note window after
  Back still returns to it.
- Tests: `tests/js/test_live_return.js` (the helper, the grace and reload, leaving Live, off
  Live, Back onto Live, the gone page showing Today). `tests/js/test_capture_sheet.js` now waits
  for the editor to draw line 1 before checking its mark: a flaky test that raced the editor's
  layout, failing before this feature; the app was unchanged.
