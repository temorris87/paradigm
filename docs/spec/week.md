# Week, calendar, on call and timesheet

How the app behaves. Kept up to date by each feature that changes it.

- Week (Tyson, 2026-11-22; the calendar and the timesheet became one page): `&week` in the main
  window (`:calendar`, `gw`; `:time` opens its Timesheet; old `&calendar` / `&time` URLs still
  land there). Its bar: the week (‹ This week ›, `[` `]` `t`), Plan | Timesheet | Settings, and
  the week's totals (focus planned, meetings, free). ‹ This week › come first, at the bar's left
  edge, then the range ("23–29 Nov 2026") in a fixed width that fits the longest one ("28 Dec
  2026 – 3 Jan 2027"), left-aligned: the buttons and the tabs stay put as the week changes, so
  `›` can be clicked again and again without moving the mouse; the same on every tab, and when a
  narrow window wraps the bar the three stay together at its start (Tyson, 2026-11-27). Plan: Monday to Sunday (Saturday and Sunday
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
  steps); dropping or resizing a block, or Escape mid-drag (which puts it back), never opens
  New meeting (Tyson, 2026-11-26). A press that moves less than 4 px is a click; click (or right-click) for its menu: open, Open task (a task's own page, tasks.md),
  done, Edit time…, remove or cancel. Escape on the menu puts the focus back on the block,
  even when the week was redrawn under it (an import, another window's change, a resize). A choice with no dialog (open, done, Not cancelled, Join ↗, Don't import) leaves
  the focus on the block; Remove from calendar leaves it on the calendar. A redraw keeps the
  focus on a focused block (on the calendar if the block is gone) and leaves focus elsewhere
  alone. An
  empty slot makes a meeting there. A block that has passed is time worked. Plan's footer:
  each code's hours so far, the week projected, Timesheet ↗. Its keys live in
  `js/calendar/calendar-keys.js`: `[` `]` (or `h` `l`) the week, `t` this week, `w` the
  weekend, `g t` the tray (its focused row, else the first; on To file it shows To plan
  first), `g c` the calendar (the chosen block, else the first), `j` `k` the next or previous
  tray row or block (by day, then time), `s` schedule, Enter the block's menu (on a button,
  the button's own), `i` import, `x` / Delete take a task block off, Esc choose none. The hint
  bar, as in Figma: `[ ]` week, `g t` tray, `g c` calendar, `j k` move, `s` schedule, `Enter`
  block menu, `? all keys`. On the Plan tab `g t` is the tray's, not Today: the tab's table
  is read before the window's, wherever the focus is on the Week page (its bar, tabs, arrows,
  or nowhere in particular), and the `?` list leaves the window's `g t` out there. The keys
  reach the calendar from anywhere on the Week page; in the navigator, on the other Week tabs
  and everywhere else `g t` is still Today (Figma wins, Tyson, 2026-11-27).
- Days off on Plan (Tyson, 2026-11-26): a holiday, time off or a sick day gets a chip first in
  its "due" cell: the holiday's name ("Thanksgiving"), "Time off" or "Sick"; a part day adds its
  hours ("Time off · 4 h"), and the chip's title shows the note. A whole day off (its hours
  cover the working day) is shaded (head, due cell and column), its head says "Off" in place of
  "N h free", and it has no capacity bar; meetings and blocks on it still show, and dragging
  onto it still works, but `s` skips it and the week's free total leaves it out. A part day
  off is hours off the day, not a time range: its free hours, capacity bar and room for `s`
  shrink by them. The days come from `/api/time/week`'s `pto` for the week shown, so a past
  week shows its own holidays; beyond it (where `s` may look), the upcoming holidays and the
  time off in Settings. Today's `s` and free gaps don't count time off yet.
- The day heads, the all-day row and the hour grid keep the same columns whatever scroll bar
  the system draws (Windows' classic one, the Mac's overlay, a wide one under high contrast or
  scaling): above the hour grid's scroll bar the heads leave an empty strip in their own
  background, kept even when the day fits without scrolling; on the Mac it has no width
  (Tyson, 2026-11-26). When Edit time… or Cancel the meeting closes (Esc, Cancel or Save), the
  focus goes back to the block, and stays on it when the week redraws after (on the calendar
  if the block is gone); so does Not cancelled, which has no dialog. Cancel the meeting opens
  on "Keep the meeting" (its safe button, not "Cancel"), so Enter straight away keeps it
  (Tyson, 2026-11-26).
- Outlook import (worknotes' rules; file-only, Tyson, 2026-11-27): each morning, Outlook File ›
  Save Calendar, Next 7 days, Full details, then import that file: the bar's Import `i`
  button, `i`, the Import panel's Import a file…, or a drop of `.ics` files anywhere on the
  Plan tab. The picker takes `.ics`, several at once; each file is its own
  `POST /api/calendar/upload`. The status line says "Imported n meetings from week.ics" (or
  "from 2 files"); a file that won't parse says `E: not a calendar file: notes.ics` (a 400),
  in the error colour, also after the part that went in. There is no `<data>/import/` folder
  any more: nothing is read at start or on window focus, Paradigm doesn't make the folder,
  and files left in an old one stay there, never deleted; `POST /api/calendar/import` is gone
  (404). An event is its uid + day:
  known ones follow Outlook (time, end, place, Join link; a moved day; cancelled, declined or
  gone from an export that covers it: cancelled; back on), new ones of a series with meetings
  go into that hub, the rest wait in the sidebar's To file tab (hub guessed from the newest
  meeting of that name; File, File all, Don't import) and show muted on the week. Skipped:
  all-day, free, tentative, out of office, working elsewhere. Attendees are matched by email,
  then name, else made as people (rooms, groups and you left out; none past 20). A trashed
  imported meeting is never made again. Today's banner reads "Today's calendar isn't imported ·
  Week (g w) to import" until today's import.
- Import panel (Figma "Week · not imported", Tyson, 2026-11-27): on the Plan tab, while the
  week shown holds today and nothing was imported today, the grid greys out (its blocks wash
  with the page; no clicks or drags) under a raised panel centred over it: "Today's calendar
  isn't imported", "In Outlook: File › Save Calendar › Next 7 days, Full details. Then import
  that file.", a dashed drop zone ("Drop the .ics here" / "or press i to pick it"), Import a
  file… `i` and Plan without it, and "Last imported: Wed 25 Nov 08:12 · the tray still works"
  ("Never imported yet · the tray still works"). Past and future weeks never grey (`]` hides
  it, `[` brings it back). The tray stays live; `g c` goes to the panel's Import a file…, and
  `j` `k` do nothing in the grid while it shows. Once a file goes in, the panel goes, the grid
  redraws and the focus stays on the page; a failed file leaves it up. Plan without it hides it
  for the rest of today in this browser (`localStorage` `paradigm.planWithout`, the day), so
  tomorrow it is back; meanwhile the bar keeps a quiet "Not imported today · i" on the right.
  `/api/calendar/status` gives `imported_today`, `last_day` and `last_at` (null when never).
- Imported agenda (Tyson, 2026-11-26): the invite's text, without Teams' joining text. A section
  between underscore rules is Teams' block when one of its lines is wholly a Teams phrase
  ("Microsoft Teams meeting", "Microsoft Teams Need help?", "Join the meeting now", "Join on your
  computer, mobile app or room device", "Click here to join the meeting", "Download Teams | Join
  on the web", "Learn More | Meeting options") or holds a Teams join link (`/l/meetup-join/`,
  `/meet/`); it goes with its dial-in half (the section after Outlook's shorter inner rule), to
  the end when no rule closes it. A rule as long as the opening one closes it, and the text after
  stays. Elsewhere only the boilerplate lines go (Meeting ID, Passcode, Dial in by phone, `,,digits#`
  numbers, Find a local number, Phone conference ID, Tenant key, Video ID, More info, For
  organizers, Reset dial-in PIN …), in any case, with or without Outlook's `<link>`. Sections
  between rules with no Teams text, lines that only mention Teams ("Microsoft Teams rollout plan")
  and Teams channel or file links are kept; the rules themselves go. Also dropped: `** CAUTION`
  banners and "You don't often get email from … Learn why this is important". `<url>` becomes
  `url`, `* ` bullets `- `. The Join button still comes from the uncleaned invite. Only new
  imports and events waiting in To file get it; meetings already made keep their agenda, and
  only Teams is cleaned, not Zoom, Webex or Meet (Tyson, 2026-11-26).
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
  week). Days after today are projected (italic). Beside it (1600 px wide or more, the panel
  at most 20rem) or under it at full width with its blocks in a row that wraps (below 1600 px):
  Check before you submit, This week off, Not counted, how it counts; under the grid, what made
  the chosen code (click a row). The whole grid (Code, Mon-Fri, Total) fits with no sideways
  scroll at 1280 px and wider: number cells about 4.5rem with tabular figures, codes never
  wrap, a very long one cut with "…" and its full code as its title (2026-11-27). Clicking a
  tab or a row leaves the focus on the Timesheet, where `[` `]` `t` and `c` are heard. Copy for
  timesheet (`c`) puts it on the clipboard as HTML and tab-separated text. Settings: the codes, the
  working day and lunch, holiday rules (US federal ones seeded; observed Sat->Fri, Sun->Mon),
  time off and sick days. Its keys live in `js/timesheet/time-keys.js`.
