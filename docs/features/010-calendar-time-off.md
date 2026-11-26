# 010 Holidays and PTO on the calendar

Status: built (2026-11-26)
Backlog item: "Holiday time and PTO time should show on calendar."
Decided with Tyson: 2026-11-26 (plan approved with no comments: every default stands)
Lanes: frontend (integrate: false; no route added or changed)
Migration: none
Batch: 2026-11-26 (built side by side with specs 009–015, merged on `batch/2026-11-26`)

## Context: what is there now
On a holiday the day just loses its "free" text and capacity bar, with nothing saying
why. Time off and sick days don't show at all, and the calendar plans over them.
`GET /api/time/week?monday=D` already returns
`pto: [{day, kind: holiday|time_off|sick, name, hours}]` for exactly the week shown (weekdays,
hours worked out against the working day). The Week page already fetches it for the footer.

## What it does
- Each day off gets a chip at the front of its all-day row: the holiday's name
  ("Thanksgiving"), "Time off" or "Sick". A part day adds its hours ("Time off · 4 h"), and the
  chip's title shows the note.
- A whole day off (hours ≥ the working day): the day's column and head are shaded with a muted
  wash (design tokens, no new colour). The head says "Off" where "N h free" would go, and the
  capacity bar is gone. Meetings and blocks on it still show and can be dragged there.
- A part day off: the day's working minutes shrink by its hours, so its free hours and capacity
  bar shrink too. It isn't drawn as a time range, because time off stores hours, not times.
  (default, approved by Tyson, 2026-11-26)
- Planning respects it. The tray's `s` and the week's totals (free) treat a whole day off like a
  holiday (skipped), and a part day as less room.
- Source: the calendar reads `pto` from `/api/time/week` for the shown week. This replaces
  `planningSettings`' 365-day `upcoming` list for the calendar, so past weeks show their
  holidays too. Today's own planning (`s` on Today, its free gaps) is left as it is (see Not
  in this feature).

### Open questions
- A part day off as hours off the day, not a block at a time. Decided: hours off the day. (default, approved by Tyson, 2026-11-26)
- A whole day off still allows drops and `s` onto it explicitly? Decided: dragging is allowed,
  `s` skips it. (default, approved by Tyson, 2026-11-26)

## Data
None: no table or column changes; trash, restore, archive and purge are unchanged.

## API contract
No route is added or changed. The calendar reads the existing `GET /api/time/week?monday=YYYY-MM-DD` (`paradigm/api/timesheet.py`), whose `pto` field is `[{"day": "YYYY-MM-DD", "kind": "holiday"|"time_off"|"sick", "name": str, "hours": float}]` (weekdays of that week; `hours` already against the working day, quarter hours). The working day's length comes from `GET /api/time/settings` (`settings.day_start`, `day_end`, `lunch_start`, `lunch_end`), already loaded. The note for a chip's title comes from `time_off[].note` in `/api/time/settings`, matched by kind and day range.

## Files
- Backend lane: none.
- Frontend lane (paths under `static/js/` unless shown in full): `calendar/calendar-page.js` (load `pto`, capacity), `calendar/grid-view.js` (chip,
shaded day), `week/capacity.js` (time off in `isWorkingDay`/`dayCapacity`), `week/tray-model.js`
(`weekSummary`), `css/calendar.css`, and tests.

## Acceptance checks
1. Thanksgiving week (seeded rules): Thursday's chip says "Thanksgiving", the day is
shaded, and the head says "Off".
2. Add a whole day of time off on Tuesday in Timesheet
Settings: back on Plan, Tuesday shows "Time off" shaded, and the week's free total drops by a
day.
3. A 4 h time off on Wednesday: the chip says "Time off · 4 h", and Wednesday's free hours
are 4 h less.
4. A sick day shows "Sick".
5. `s` on a tray task never lands on a whole day off.
6. A past week (‹) shows its holiday.
7. Removing the time off brings the day back.

## Not in this feature
Today's `s` and its free gaps ignoring time off; drawing a part day as
a time range.

## As built
- Built as planned, frontend only; no fix rounds.
- `week/capacity.js` gained `timeOffDays(timeSettings, pto, days)` (the days off, kept in
  `settings.off`), `dayOff(day, settings)` (`offMin`, `whole`) and `offChip(off)` (label and
  title). `isWorkingDay` skips a whole day off; `dayCapacity` takes a part day's minutes off
  `workMin`; `firstFreeSlot` passes over a part day once its free time is under the length.
- The week's `pto` is the truth for the days shown. Past them (where the tray's `s` looks
  ahead), the calendar falls back to the settings' upcoming holidays and `time_off` ranges, so
  `s` skips a later day off too. If `/api/time/week` fails, the ranges still count.
- When one day has more than one kind, the chip shows one: holiday, then sick, then time off
  (the server's order).
- The off chip is a plain label (nothing to open), not a button.
- Tests: `tests/js/test_calendar_time_off.js`.
