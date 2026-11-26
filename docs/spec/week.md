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
  through) and task blocks. The tray ("To plan · N", counting every row) holds every open,
  top-level task of mine in a live hub that isn't on hold, and on notes outside any hub, each
  once, in the first group that takes it (Tyson, 2026-11-26; it replaced Next actions):
  Overdue (oldest first, "was due Fri 20 Nov"), Due this week (today to the Sunday shown, "due
  Wed" or "due today"; due before the Monday shown, as when next week is shown: "due Fri 27
  Nov"), Due later (soonest first, "due Tue 8 Dec"), No due date (by hub title, then the hub's
  own order), Follow-ups (delegated, follow-up on or before Sunday). Each row has where it is,
  when due, how much is placed from today on ("1.5 h placed", "placed Mon", "not placed": a
  block on a past day doesn't count) and its estimate ("est?"; set in Edit…: "1.5 h",
  "45 min"). Done, delegated-without-follow-up, archived, on-hold, trashed tasks and subtasks
  stay out. The filter by project or area offers every hub with a row, follow-ups included
  (an area once one of its projects is; never on hold), "Title (Project/Area)" by title,
  after "All projects and areas", and last "Other notes" (only tasks on notes outside any
  hub); an area includes its projects. The choice is remembered (`localStorage`
  `paradigm.week.trayHub`: reloads, week changes, the other window) and falls back to All once
  that hub has nothing in the tray; the search box isn't remembered and narrows inside the
  filter. Empty: "No open task matches" with a filter or search, else "Nothing to plan: every
  task is done or delegated." Drag one onto the week for a 30-minute block; `s` on a tray
  row drops its estimate into the first free slot before its due day (no due date: within
  the next two weeks). `gw` (or opening Plan) puts the focus on the calendar, so `[` `]` `t`
  and `s` work at once. Drag a block to move it, its bottom edge to resize (15-minute
  steps); click (or right-click) for its menu: open, done, Edit time…, remove or cancel. An
  empty slot makes a meeting there. A block that has passed is time worked. Plan's footer:
  each code's hours so far, the week projected, Timesheet ↗. Its keys live in
  `js/calendar/calendar-keys.js`.
- The day heads, the all-day row and the hour grid keep the same columns whatever scroll bar
  the system draws (Windows' classic one, the Mac's overlay, a wide one under high contrast or
  scaling): above the hour grid's scroll bar the heads leave an empty strip in their own
  background, kept even when the day fits without scrolling; on the Mac it has no width
  (Tyson, 2026-11-26). When Edit time… or Cancel the meeting closes (Esc, Cancel or Save), the
  focus goes back to the block, or to the calendar if the block was redrawn.
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
