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
  (overdue, follow-ups past due, due today, due within 5 working days, questions waiting over
  7 days; never done, on-hold, archived or snoozed; next actions left it with the flag,
  2026-11-26, and an empty list reads "Nothing urgent: nothing overdue, due soon or waiting on
  you."); Projects with their latest status, the Inbox, and whether today's
  calendar is in. One focus stop, starting on Up next; `j k gg G`, `}` `{`, Space done (a
  question: Answer…), `s` into the first free slot before it is due (its estimate or 30 min,
  working days only, the timesheet's holidays skipped), `d` delegate, `z` snooze to tomorrow,
  `o`/Enter open (`static/js/today/today-keys.js`, also the key-hint bar at the foot).
- Note menu: clicking the open note's name (the last crumb, with ▾) opens its menu: rename,
  move (a picker), new note beside / under, file as, archive or restore, export, move to
  trash (with a confirm); a project's or area's starts with Log status…. The table is
  `static/js/notes/note-menu.js`. Menus, pickers and dialogs share `static/js/ui/` and its
  keys (`ui-keys.js`).
- A red confirm (Cancel the meeting, Move to trash, Clear rota, Remove a holiday, Unlink
  folder, Remove from the template, Delete plan template, Delete task) opens on its safe
  button, so Enter straight away closes it and changes nothing; Tab then Enter, a click or
  Ctrl-Enter confirms. Non-red confirms (Make it a plain note, Make it a decision) still open
  on OK, and a dialog with fields starts in its first field (Tyson, 2026-11-26).
- Top bar and palette (Tyson, 2026-11-22): the main window's bar is ☰, Today | Week, the
  breadcrumb, the palette's field and Window ▾ (Go to, Home, People, Meetings, Calendar and
  Time left it; Live note added 2026-11-26). The note window's: ☰, the breadcrumb, Go to…, Dashboard ↗. The palette
  (`static/js/palette/`; the field, Go to…, `:find`, or `:` anywhere in the main window outside
  a text box, which opens it on ":") lists Recent (the last 8 opened) and Pages with nothing
  typed; notes and pages as you type (each word in the title or path); after ":", every note
  command by its label with its usage and key (`label` in `commands.js`; keys from the key
  tables' `command` fields), then notes. Enter opens or runs, Shift-Enter opens in the note
  window, Tab completes a command. Buttons never show `:command` names; the palette's command
  mode is the one place they appear.
- Note commands act on the note on screen (Tyson, 2026-11-27). In the main window a page is
  drawn over the dashboard, which stays open under it, so every "this note" command (`:trash`,
  `:rename`, `:parent`, the kind commands, `:inarea`, `:archive`, `:restore`, `:export`,
  `:timecode`, `:date`, the person fields, `:addperson`, `:dropperson`, `:meeting`,
  `:attendee`, `:decision`, `:question`, `:answered`, `:reopen`, `:with`, `:task`, `:t`, `:log`,
  `:dashboard`) acts on the note shown (`static/js/notes/screen-note.js`), never on the hidden
  hub: on a bare dashboard or Plan, the hub; on Live, the note window's note (the note window
  is told, so its title, place and fields follow; `:export` takes the text the Live page shows);
  on a task page they say "E: this page shows a task: x deletes it" (`x` / Delete still deletes
  the task); on Today, Week, People, Meetings, Trash, a template or a Resources folder they say
  "E: no note on this page" and change nothing. The palette's "on {title}" label names the same
  note: none on a page without one, the Live note on Live. The note window is unchanged.
- `:new {title}` (beside) and `:child {title}` (under) take their place from the same note on
  screen (Tyson, 2026-11-27): on a dashboard or Plan, beside or under the hub; on Live, beside or
  under the Live note; on a task page the task refusal; on Today, Week, People, Meetings, Trash,
  a template or folder page, Home, or with no note open at all (an empty database), "E: no note
  on this page" and nothing is made. A top-level note on screen gives a top-level note with
  `:new`. In the note window they use its open note; the note menu's new beside / under are
  unchanged. Afterwards a plain note opens in the note window and a hub opens its dashboard.
- Main-window keys (`static/js/layout/main-keys.js`, read in the capture phase): `:` the palette,
  `gt` Today, `gw` the Week, `gn` the Live page, `gp` the plan of the project or area on the dashboard (anywhere on
  it; on another page it says to open one; `:plan` in the palette), `gh` the History of the
  project on the dashboard (2026-11-27; else `E: History is a project's`), `?` every key of the view
  shown (2026-11-27). `g` waits for a second key everywhere (as in Vim): `gg` is the
  first row in every list (`static/js/ui/key-sequence.js` reads two-key entries; a page-wide
  key clears a list's waiting `g`).
- Look (Tyson, 2026-11-26): both windows open in Nord Light, the default and only theme
  (Snow Storm backgrounds, Frost accents, dark text; native scrollbars and checkboxes light),
  and Mermaid diagrams and `:export` follow it. Every text colour reaches 4.5:1 on the
  surfaces it sits on, and things dimmed for being muted (cancelled or past blocks, done Gantt
  bars, on-hold projects) wash the fill and keep the text readable. Headings stand out by
  weight, not colour. Nord Dark stays on disk for a switcher later; there is no switcher yet.
  One focus ring (Tyson, 2026-11-27): every button-like control (top bar, crumb menu,
  dashboard head, navigator pins and Trash, hub-line controls, dialog buttons, fields,
  segmented buttons, the palette's field) shows a 2 px `--border-focus` outline 1 px outside it
  on keyboard focus; a tint is for hover only. A control in a box that scrolls draws it 2 px
  inside instead, so the box can't clip it: the navigator's Today and Week pins, as the sidebar
  scrolls (Tyson, 2026-11-27). List rows keep their inset ring. `tests/js/test_focus_ring.js`
  fails on any other ring.
- Shared look (2026-11-27; feature 019): status shows as one chip everywhere, a short label on
  its tone's tint (a dashboard's and Today's health with a dot, Today's Up next reasons, the
  hub-line question and decision badges, Live's highlights, the Gantt's late badge, the list
  pages' filter pills: the one on is info). Missed due dates, late and blocked are danger;
  at risk warning; due today or soon caution; on track success; follow-ups and waiting on info,
  however late (the text says how late: Tyson, 2026-11-27); on hold neutral; tasks, decisions,
  questions and meetings their kind's colour (`static/js/ui/chip-tones.js`). Calendar chips and
  the tree's count pills are not status and keep their look. One key cap (mono, boxed) is used
  by the bar, the palette, triage, the top bar and Today. Menus, dialogs, the palette, the
  picker, triage, the `?` list, the editor's completion list and the status line all float on
  the overlay surface with a thin border and a strong shadow; a dialog also dims the page.
- Key-hint bar (Tyson, 2026-11-27): a 35 px bar at the foot of the page shows the main keys of
  the view on screen, each as a key cap and a word or two, and changes with the view (Today,
  each Week tab, People, Meetings, a dashboard, a task page, Plan, a template, a folder, Live,
  Trash). It shows only keys the view's key table binds (the entries with `hint:`), and in the
  main window ends with `? all keys`. A dashboard that isn't a project's or an area's leaves out
  `L`; the Trash leaves out New and calls Enter "restore". Live has no keys of its own, so it
  shows `g t` Today, `g w` Week, `:` command, `? all keys`. `?` (outside text boxes, the editor
  and dialogs) opens a read-only list of every key of the view, grouped as its table groups
  them, then "Anywhere in this window" (less any key the view already lists, so each key shows
  once, in the view's words: a project's `g h`, Tyson, 2026-11-27); Esc or Close shuts it and
  the focus goes back where it was. The note window's bar has no `?` (there it is the editor's search backwards): `i`
  insert, `Esc` normal, `:w` save, `/` search, and `Tab` sheet when the note has its sections
  sheet. The status line sits just above the bar. `static/js/ui/key-hints.js`,
  `static/js/layout/view-keys.js`.
- Two windows (Tyson, 2026-11-22): the main window (`/`, left 2/3 of the ultrawide) shows
  dashboards and pages and never edits text; the note window (`/note.html`) is where notes
  are written. Opening any note in the main window that isn't a hub or a person (tree, a
  section row, Go to, the calendar, a Gantt bar) shows it in the one note window, reused. Its
  place: the right third, full height, on a wide screen (`availWidth >= 2400` CSS px and
  over 2.1 times as wide as tall), else the whole screen (the laptop); the main window's
  Window ▾ menu can force either. The page can't place the main window itself. Once
  `note.html` has loaded, the note window places itself again (first load only, so a second
  note opened in it doesn't move it), and Window ▾ "right third" re-places an open window, so
  a misplaced one is fixed without closing it (Tyson, 2026-11-26). The left edge falls on a
  whole device pixel under display scaling (not when the page is zoomed); the box is exactly
  the right third, not grown by Windows' invisible border, as Chrome keeps every window inside
  the screen (Tyson checks it on the 5120×2160 work screen). In the note
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
- A plain note's URL in the main window (Tyson, 2026-11-27; `mainFromUrl` in
  `static/js/notes/app.js`): `/?note=<id>` of a note that is neither a hub nor a person (a
  bookmark, a typed URL, Back or Forward) shows that note's hub dashboard, or Home when it has
  no hub; never the first dashboard found. The address is rewritten (`replaceState`, after Back
  and Forward too) to what is shown, so it never names a note that isn't on screen, and the
  status line says `"<title>" is a note: Enter on it opens the note window`; the cursor goes to
  the note's row where the hub's Notes section lists it. The main window doesn't open the note
  window itself: the browser blocks a popup no key asked for. The note on screen, the
  session's note and the address agree, so `:trash` acts on the hub shown, or says "E: no note
  on this page" on Home. An unknown or trashed id shows Home; a page flag in the URL (a task's
  `&task`) keeps its page. A hub's or a person's own URL opens it quietly, as before. Back and
  Forward clear the main window's status line before the page they show sets its own, so a
  message about the page left behind (an error on it) doesn't stay.
- Live page (Tyson, 2026-11-26; `&live`, `static/js/live/`): the main window shows the note
  open in the note window, rendered as on a dashboard (math, Mermaid, images, links) under its
  breadcrumb title, updated as it is typed (every keystroke, not on save, at most every 50 ms),
  so a screen share of the main window alone shows the typing. A caret in the Live caret color (`--live-caret`) sits where the
  cursor is: a thin bar in insert and replace mode, a block in every other mode; the block
  holding the cursor gets a band with a `--live-caret` bar at its left edge. Where no caret can sit in
  rendered text (a fence line, a table's `|---|` row, a rule, a link's URL or an image's path,
  maths, a diagram's source, a blank line) only the band shows; on a heading, list or quote
  marker the caret goes to the start of the text. It scrolls only to keep the caret in its
  middle third. A meeting shows Agenda, then Notes, each under its label. Every note opened in
  the note window, any way, switches the main window to its Live page; hubs and people too
  (their live text, not the dashboard; Dashboard ↗ or `:dashboard` still shows that). Typing
  alone never switches it, nor does the note that opens by itself after a trash. Back to it:
  `gn`, Window ▾ Live note, `:live`. Links open as on a dashboard, an image click opens the
  image viewer, and the page has no keys of its own. A main window opened after the note
  window asks it what it shows. No note open: "No note open in the note window." with an
  Open note window button; the note window closed: the last view stays, with "The note window
  is closed"; trashed: "Moved to trash"; empty: "Empty note". Unchanged blocks are not drawn
  again, so math and diagrams don't redraw on each keystroke.
- Trash: trashing a note (its menu, or `:trash!`) takes the notes under it too; `:trash` on a
  note with notes under it says "E: The note has notes under it: :trash! deletes them too"
  without asking the server (which refuses it as well, but the browser's console would list
  that as a failed load; the server still decides the rest). Trashed notes stay in the
  Trash for a week, then are deleted for good (with their person, meeting, record rows and
  links) when Paradigm starts or stops. The Trash page (`&trash`; the Trash button at the foot
  of the notes panel, or `:trashed`) lists them; Enter or a click restores one with the notes
  trashed with it and opens it: under its old parent, or at the top when that is still
  trashed (a meeting, decision or question waits for its hub). A title taken meanwhile gets
  " (restored)".
  Trashing or restoring a note tells the other window, so a task page on it there redraws
  ("Its note is in the trash"). When the main window shows the bare dashboard of a note
  trashed from the note window, it moves to the dashboard of its parent (or the first
  top-level dashboard) and says '"Title" was moved to the Trash'; it is never left empty and
  never reports "No such note".
  A trash never pulls the main window to the Live page (Tyson, 2026-11-26): trashing from the
  note window, even with a key pressed while it is under way, keeps the main window where it
  is (a task page on the note says "Its note is in the trash"), and so does a note trashed
  elsewhere that the note window was showing. Trashing from the main window (`:trash`, a
  crumb's note menu; on Live, `:trash` trashes the Live note, not the hub under it, whose
  unsaved edits are kept, and the URL leaves `&live` so a reload shows the dashboard) goes to the dashboard of the note's parent (or its hub, else the first
  top-level one), never to a plain note; with no dashboard left it goes Home, and the note
  window empties and takes no typing until a note opens. With no note open in the main window
  (every hub trashed), `:trash` says "E: no note is open". A trashed note restored and opened
  again shows on the Live page as usual.
- An image is deleted from the database once no note (trashed ones included) links to it any
  more, but only when Paradigm starts or stops: while a tab is open, `u` or `p` can bring a
  deleted link back.
- Paradigm stops by itself once no tab is open. Close the last tab and it stops 10 s later,
  when the tab's closing beacon got out (Chrome, Edge). With no beacon (Safari closing a tab,
  a browser that quits or crashes) it stops once no tab has been open for 60 s (Tyson,
  2026-11-25). A tab that comes back first (a reload, Undo Close Tab) keeps it running, and
  after the machine sleeps the wait starts again from the wake. The log says "Last tab closed"
  or "No tab for 60 s"; there is no flag for either wait.
- Ctrl-C in the console stops Paradigm ("Stopping (Ctrl-C)"). Once it is stopping, for any
  reason, a further Ctrl-C is ignored and only logs "Already stopping - please wait", so the
  tidy-up always runs and the log ends "Paradigm stopped"; there is no force-quit on a third
  press (Tyson, 2026-11-25). Ctrl-C during startup, Ctrl-Break and closing the console window
  are unchanged.
