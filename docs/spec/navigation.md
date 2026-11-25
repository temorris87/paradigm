# Navigation, windows and trash

How the app behaves. Kept up to date by each feature that changes it.

- Navigator (2026-11-22): Today ("N overdue") and Week ("N h free" left this week) pinned over
  the tree, the page shown lit; the Inbox's count as a pill; a dot before each live project
  for its health (on hold: a ring), with its stale age ("16 d") on the right; folders show
  how many notes they hold. Its foot: Trash (the main window), and the open note's save state
  (the note window): Saved, Saving…, Unsaved, Not saved, Offline (changes stay in the window
  and save when the server is back). `static/js/layout/navigator-parts.js`.
- The notes tree is reached with `:nav` or the ☰ button in the top bar. Under 1400 px wide it
  is a drawer: it opens over the note and closes on Enter (opening a note), Escape, a click on
  the backdrop, or the focus leaving it. Meetings, decisions and questions are not in it (they
  live on their hub's page); while one is open, its hub stands for it.
- Backlinks: the server keeps each note's `[[link]]` texts as written; the page reads them with
  the Markdown renderer (so never in code) and sends them with every save, and catches up
  notes saved without them after load. They are resolved in the page with `resolve.js`, so a
  backlink is wherever the link goes today. A person's Backlinks use them (`linksInto` in
  `links.js`: notes outside it whose links reach it or a note under it).
- Today (Tyson, 2026-11-22; replaced Home): a page in place of the note (`&home` still), and
  the start page: a URL with no `?note=` opens on it. `:home` reaches it. Three columns
  (`static/js/today/`): the Now card (the task block on now: time left, a bar moving each
  minute, Done / Open note / +15 min; else the next block; else "<Day> is clear.") over the
  day (meetings with their prep, blocks, free gaps of 30 min or more in the working hours,
  "Log status" when projects are stale); Up next, one list ranked across every project
  (overdue, follow-ups past due, due today, due within 5 working days, each live project's
  next action when it has none of those, questions waiting over 7 days; never done, on-hold,
  archived or snoozed); Projects with their latest status, the Inbox, and whether today's
  calendar is in. One focus stop, starting on Up next; `j k gg G`, `}` `{`, Space done (a
  question: Answer…), `s` into the first free slot before it is due (its estimate or 30 min,
  working days only, the timesheet's holidays skipped), `d` delegate, `z` snooze to tomorrow,
  `o`/Enter open (`static/js/today/today-keys.js`, also the hint line).
- Note menu: clicking the open note's name (the last crumb, with ▾) opens its menu: rename,
  move (a picker), new note beside / under, file as, archive or restore, export, move to
  trash (with a confirm); a project's or area's starts with Log status…. The table is
  `static/js/notes/note-menu.js`. Menus, pickers and dialogs share `static/js/ui/` and its
  keys (`ui-keys.js`).
- Top bar and palette (Tyson, 2026-11-22): the main window's bar is ☰, Today | Week, the
  breadcrumb, the palette's field and Window ▾ (Go to, Home, People, Meetings, Calendar and
  Time left it). The note window's: ☰, the breadcrumb, Go to…, Dashboard ↗. The palette
  (`static/js/palette/`; the field, Go to…, `:find`, or `:` anywhere in the main window outside
  a text box, which opens it on ":") lists Recent (the last 8 opened) and Pages with nothing
  typed; notes and pages as you type (each word in the title or path); after ":", every note
  command by its label with its usage and key (`label` in `commands.js`; keys from the key
  tables' `command` fields), then notes. Enter opens or runs, Shift-Enter opens in the note
  window, Tab completes a command. Buttons never show `:command` names; the palette's command
  mode is the one place they appear.
- Main-window keys (`static/js/layout/main-keys.js`, read in the capture phase): `:` the palette,
  `gt` Today, `gw` the Week, `gp` the plan of the project or area on the dashboard (anywhere on
  it; on another page it says to open one; `:plan` in the palette). `g` waits for a second key everywhere (as in Vim): `gg` is the
  first row in every list (`static/js/ui/key-sequence.js` reads two-key entries; a page-wide
  key clears a list's waiting `g`).
- Two windows (Tyson, 2026-11-22): the main window (`/`, left 2/3 of the ultrawide) shows
  dashboards and pages and never edits text; the note window (`/note.html`) is where notes
  are written. Opening any note in the main window that isn't a hub or a person (tree, a
  section row, Go to, the calendar, a Gantt bar) shows it in the one note window, reused. Its
  place: the right third, full height, on a wide screen (`availWidth >= 2400` CSS px and
  over 2.1 times as wide as tall), else the whole screen (the laptop); the main window's
  Window ▾ menu can force either. The page can't place the main window itself. In the note
  window, Dashboard (or `:dashboard`) shows the note's hub in the main window; Home,
  `:people`, `:calendar`... show there too (`showMainWindow`; Chrome may refuse to raise it).
  A hub's dashboard: its head and card, a project's Plan strip, its text rendered
  (Edit ↗ opens it in the note window), full width, then its sections in two fixed lanes
  (Tyson, 2026-11-22; `DASHBOARD_LAYOUT` in `hub-sections.js`, `wide` over both): Act on the
  left (Where I am, Tasks, Open questions; an area: Portfolio, Tasks, Open questions, Where I
  am) and Know on the right (Meetings, Decisions, Answered questions, Notes, Files, People; an
  area: Weekly digest first, Plan templates); an area's Projects table spans both. No boxes: a heading with a rule; each row's date in a right-aligned column;
  empty sections share one "Nothing yet:" line at the foot of their lane (in the note window
  too). ←/→ cross between the lanes. Under 1400 px the lanes stack. A hub's linked folders
  are read again when its dashboard opens.
- Trash: trashing a note (its menu, or `:trash`) takes the notes under it too; they stay in the
  Trash for a week, then are deleted for good (with their person, meeting, record rows and
  links) when Paradigm starts or stops. The Trash page (`&trash`; the Trash button at the foot
  of the notes panel, or `:trashed`) lists them; Enter or a click restores one with the notes
  trashed with it and opens it: under its old parent, or at the top when that is still
  trashed (a meeting, decision or question waits for its hub). A title taken meanwhile gets
  " (restored)".
- An image is deleted from the database once no note (trashed ones included) links to it any
  more, but only when Paradigm starts or stops: while a tab is open, `u` or `p` can bring a
  deleted link back.
