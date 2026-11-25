# Week, calendar, on call and timesheet

How the app behaves. Kept up to date by each feature that changes it.

- Week (Tyson, 2026-11-22; the calendar and the timesheet became one page): `&week` in the main
  window (`:calendar`, `gw`; `:time` opens its Timesheet; old `&calendar` / `&time` URLs still
  land there). Its bar: the week (‹ This week ›, `[` `]` `t`), Plan | Timesheet | Settings, and
  the week's totals (focus planned, meetings, free). Plan: Monday to Sunday (Saturday and Sunday
  only when something is on them, or with Show weekend); each day's head has its free hours
  and a capacity bar (meetings, then focus blocks, as parts of the working day, lunch out);
  the "due" strip holds tasks due that day ("not placed" when no block comes before it),
  milestones and untimed meetings. Meetings (an end time, else 30 min; cancelled struck
  through) and task blocks. The tray ("To plan · N"): Overdue, Due this week, Next actions,
  Follow-ups, each task with where, when due, how much is placed, and its estimate ("est?";
  set in Edit…: "1.5 h", "45 min"); a filter by project or area and a search box. Drag one
  onto the week for a 30-minute block; `s` on a tray row drops its estimate into the first
  free slot before its due day. Drag a block to move it, its bottom edge to resize (15-minute
  steps); click (or right-click) for its menu: open, done, Edit time…, remove or cancel. An
  empty slot makes a meeting there. A block that has passed is time worked. Plan's footer:
  each code's hours so far, the week projected, Timesheet ↗. Its keys live in
  `js/calendar/calendar-keys.js`.
- Outlook import (worknotes' rules): each morning, Outlook File › Save Calendar, Next 7 days,
  Full details, into `<data>/import/` (made at start). It is read at start, when the calendar
  window gets focus, and with Import (or Import a file…, or a drop on the calendar); the file
  is deleted once read (an unreadable one becomes `*.unreadable`). An event is its uid + day:
  known ones follow Outlook (time, end, place, Join link; a moved day; cancelled, declined or
  gone from an export that covers it: cancelled; back on), new ones of a series with meetings
  go into that hub, the rest wait in the sidebar's To file tab (hub guessed from the newest
  meeting of that name; File, File all, Don't import) and show muted on the week. Skipped:
  all-day, free, tentative, out of office, working elsewhere. Attendees are matched by email,
  then name, else made as people (rooms, groups and you left out; none past 20). A trashed
  imported meeting is never made again. Home and the calendar remind until today's import.
- On call (Tyson, 2026-11-23): the Week page's fourth tab (`:oncall`, the palette's Pages; URL
  `&week=oncall`). Copy the Excel sheet (Role, then one column per week, a date in each header)
  and Ctrl-V on the tab, or Paste sheet… (`p`): a dialog shows the sheet and a preview ("3 roles ×
  6 weeks … replaces 2 weeks already in · 1 name not in People: …"), then Save rota. Each column
  is the week (Mon–Sun) holding its date (11/23, 11/23/26, 2026-11-23, 23-Nov, Nov 23, "Week of
  …"; numbers month/day; no year: the nearest); a paste replaces the weeks it holds, all roles,
  and keeps the rest; Clear rota… empties it. Names are kept as pasted and matched in the page
  ("First Last", "Last, First", a first name only one live person has; a cell split on / & , ;
  and), so a person added later gets linked; an unknown name stays text, never made a person.
  The grid: roles × weeks, the week shown lit, earlier weeks under Earlier (n) (`e`), `[` `]`
  `t` move the week. The Week bar names who is on call the week shown (two roles, then +N),
  on every tab; Today has "On call this week" over Projects (rows in its listbox: Enter opens
  the person, or the rota for an unknown name); a person's head has "On call this week
  (Role)" / "On call from Mon 7 Dec (Role)". Firefox sends a paste outside a text box to the
  body, so the tab listens on the document while it shows.
- Timesheet (the Week page's Timesheet, `:time`): a code per row (with its hub) x Mon-Fri, each
  day exactly the working day (8.00 h) in quarter hours: holidays, time off and sick time first,
  then meetings and task blocks inside the working hours (not lunch), overlaps shared evenly,
  largest-remainder rounding, the rest to the Default code (its total orange past 30% of the
  week). Days after today are projected (italic). Beside it: Check before you submit, This
  week off, how it counts; under it, what made the chosen code (click a row). Copy for
  timesheet puts it on the clipboard as HTML and tab-separated text. Settings: the codes, the
  working day and lunch, holiday rules (US federal ones seeded; observed Sat->Fri, Sun->Mon),
  time off and sick days. Its keys live in `js/timesheet/time-keys.js`.
