# 030 Today as in Figma: the Import panel and plain free time

Status: built (2026-11-27)
Backlog item: Today as in Figma (Today): the same Import panel ("Not today"), and plain wording for
  the free time left.
Decided with Tyson: 2026-11-27
Lanes: frontend
Migration: none

Figma "Paradigm UI" (fileKey WiWq1ftWbEclRLbUyhcwKi), page "4 · Redesign (light)": Today 15:105.
Where Figma and today's behaviour differ, Figma wins (Tyson, 2026-11-27). Today's Up next order
and the follow-up rows are feature 033's; the keys model (f, j/k scroll) is feature 034's. This
feature leaves both alone.

## What it does
1. **When the panel shows.** On Today, when nothing has been imported today
   (`ctx.importStatus.imported_today` is false) and "Not today" (or the Week's "Plan without it")
   wasn't chosen today. The rule is `showsPanel` in `static/js/calendar/import-state.js`, called
   with today as the only day.
2. **The panel** is the Week's Import panel (`static/js/calendar/import-panel.js`, reused, not
   copied), centred over Today's day column (the timeline under the Now card). That column greys
   out and takes no clicks, as the Week's grid does. The Now card, Up next and the side column stay
   live. Its contents as in Figma 15:105:
   - **Today's calendar isn't imported**;
   - the dashed drop zone: **Drop the .ics here** / "or press i to pick it";
   - **Import a file… `i`** (primary) and **Not today** (in place of the Week's "Plan without
     it"). The Outlook steps line and the "Last imported" line stay, as on the Week.
3. **Importing from Today.** `i` (Today's key table) or Import a file… opens the file input
   (`accept=".ics"`, several files); a drop of `.ics` files anywhere on Today imports them. Each
   goes to `POST /api/calendar/upload` as on the Week (the same client code, moved where both pages
   can call it, not copied). After it, the panel goes, Today redraws, and the status line says
   "Imported n meetings from {file}". A file that won't parse says `E: not a calendar file: {name}`
   and the panel stays.
4. **Not today** hides the panel for the rest of today in this browser, in the same
   localStorage flag the Week's "Plan without it" sets (`paradigm.planWithout`), so choosing it on
   either page hides both (default, approved by Tyson, 2026-11-27).
5. **The old import chip goes.** The side column's "● Today's calendar isn't imported · Week (g w)
   to import" / "Calendar imported today · N meetings this week" chip (`importChip`) is removed:
   the panel replaces it. When imported, nothing is said.
6. **Plain wording for the free time left** (default, approved by Tyson, 2026-11-27). The day
   column's head says what is left from now, not the whole day's sum:
   - during the working day: "**2.5 h free left today** · 1.5 h meetings · 1 h focus" (free time
     from now to the end of the working day, outside meetings and placed blocks);
   - when none is left: "No free time left today";
   - after the working day ends, or on a day off: "Working day over" / "Day off".
   The Now card keeps Figma's headline ("The rest of today is free" when nothing else is on).
   Gap rows keep "1.5 h free". Hours go through `hoursText` (capacity.js).
7. **Keys.** Today's table gains `i`: import a calendar file (help "import today's calendar
   (.ics)"; no hint in the bar: the panel shows its key).

## Data
None.

## API contract
No route added or changed. Today calls the existing `POST /api/calendar/upload` and
`GET /api/calendar/status` exactly as the Week does.

## Files
- Frontend lane: `static/js/today/today-page.js`, `today-model.js` (free time left; pure),
  `today-keys.js` (`i`), `today-actions.js`; the upload code shared out of
  `static/js/calendar/calendar-page.js` into a small module both pages import (e.g.
  `static/js/calendar/import-upload.js`); `static/js/calendar/import-panel.js` only if it needs an
  option for the second button's label; `static/css/today.css`; tests in `tests/js/` (free time
  left; showsPanel for Today; the button label) imported in `tests/js/index.html`.

## Acceptance checks
1. On sample data with nothing imported today, Today shows the Import panel over the day column
   with "Import a file… i" and "Not today"; the Now card, Up next and the side column still work
   (a row can be opened, a task ticked).
2. The day column under the panel is greyed and takes no clicks.
3. `i` on Today opens the file picker; importing a valid .ics hides the panel and the timeline
   shows the imported meetings; the status line says "Imported n meetings from …".
4. Importing a file that isn't a calendar says "E: not a calendar file: …" and the panel stays.
5. "Not today" hides the panel; reloading Today keeps it hidden; the Week's Plan tab no longer
   shows its panel today either. Changing the stored day to yesterday brings both back.
6. Choosing "Plan without it" on the Week hides Today's panel too.
7. With a calendar imported today, there is no panel and no import chip on Today.
8. The day column head shows "N h free left today · … meetings · … focus" and the free figure
   falls as the clock passes a free gap (unit test with a fixed now); after the day's end it says
   "Working day over".
9. Week's Import panel still works as before (its own checks from 025 still pass).

## Not in this feature
- Follow-ups and Up next's order (033). The f / j-k scroll keys model (034).
- Changing the navigator's "6.5 h free" pin.

## As built
- Shared upload code is `static/js/calendar/import-upload.js` (the .ics picker, one upload per
  file, the stored Plan without it / Not today day); `import-panel.js` gained a `withoutLabel`
  option for the second button, and `panel.grid` may be set again when Today redraws.
- **Events still to file show on Today** (browser fix round 1; the spec was silent). A first
  import puts new series in the Week's To file, so the day looked empty after "Imported n
  meetings". `refreshTree` (`static/js/notes/app.js`) now also loads the existing
  `GET /api/calendar/pending` into ctx as `pending` (an empty list if that call fails), and
  `dayTimeline` draws today's ones as muted rows, "to file on the Week (g w)", sorted with the
  meetings. Opening one (click or Enter) runs `actions.toFile()`, which opens the Week on its
  Plan tab (the To file tab is one click away). `restIsFree` counts them, so the Now card
  doesn't say "The rest of today is free" while one is still to come.
- **They count as busy** (fix round 2): `busyOn` in `static/js/week/capacity.js` takes an
  optional `ctx.held` list of `{ day, time, end_time }` counted as meetings (default `[]`;
  the Week never sets it, so its numbers are unchanged). Today's `busyCtx` passes `pending`
  there, so the head's free time left, the free-gap rows and the Now card agree. The Week's
  own capacity line still leaves To file events out.
- The empty Now card's "N items are up next — plan the day" link is out of the Tab order
  (`tabIndex = -1`), like the card's other buttons, so a redraw no longer drops a focus on it
  to the page body. Not checked with a real Tab. Not today has no key of its own.
- API contract unchanged: no route or field added; the new call is the existing
  `GET /api/calendar/pending`. A file that won't parse still gets the upload's designed 400, so
  the browser logs "Failed to load resource: 400" for `/api/calendar/upload` (as on the Week
  since 025); the page says `E: not a calendar file: {name}`. Changing that would be its own
  item, for both pages.
- Tests: `tests/js/test_today_import.js`.
