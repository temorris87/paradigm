# Backlog

Features in build order. "build feature" takes the first unchecked item.

- [x] App launcher: running `paradigm.py` (from a terminal or by double-clicking it in File
  Explorer) starts the local server and opens the app in the browser (done 2026-11-21)
- [x] Windowless launch on Windows: double-click `paradigm.pyw` for just the browser tab (no
  console window); errors show in a message box (done 2026-11-21)
- [x] Security groundwork: Host/Origin checks, security headers, stream limit (done 2026-11-21)
- [x] Reusable Vim text editor component (`<pd-editor>`) (done 2026-11-21)
- [x] Markdown renderer: a pure module (static/js/markdown/) turning Markdown into HTML for the
  full syntax list (GFM, task lists, images, tables, footnotes, ==highlights==, Obsidian callouts
  with folding, [[wiki links]]); raw HTML and emoji shortcodes stay text (done 2026-11-21)
- [x] Live preview in the editor: notes render in place as you type; the block holding the cursor
  shows raw Markdown; variable-height scrolling; links open in a new tab (done 2026-11-21)
- [x] Security audit of vendored KaTeX and Mermaid: written report, go/no-go per library (CSP fit,
  no eval or network, CVEs, sanitising, pinned files with hashes) (done 2026-11-21)
- [x] LaTeX math ($…$ and $$…$$) with vendored KaTeX, if the audit passes (done 2026-11-21)
- [x] Mermaid diagrams with vendored Mermaid, if the audit passes (done 2026-11-21)
- [x] Notes in SQLite with a hierarchy: the database layer (connection, numbered migrations,
  repositories), notes that nest under other notes (hierarchy designed with Tyson), and
  [[wiki links]] that resolve to notes in that hierarchy; the editor opens and saves real notes
  in place of the scratch buffer (done 2026-11-21)
- [x] Escape in insert mode is not putting me in normal mode. (done 2026-11-21)
- [x] Images: paste from the clipboard and drag-and-drop, stored in SQLite, downscaled above
  ~1600 px wide (needs notes in SQLite) (done 2026-11-21)
- [x] Export a note as one self-contained .html file (:export): images inlined, diagrams as SVG,
  maths as MathML, no scripts; wiki-linked notes at the same level or deeper are bundled in,
  links higher up become plain text (needs notes in SQLite) (done 2026-11-21)
- [x] Design heading colors to be uniform, size and underlines should give the
  heading away, not the color. (done 2026-11-21)
- [x] Narrow layout: one column for the right third of a wide screen; the notes tree becomes a
  drawer under ~1400 px wide (docked when wider); a top bar with a navigator button and the
  breadcrumb (done 2026-11-21)
- [x] PARA hubs: top-level notes are projects, areas or resources (`:project`, `:area`,
  `:resource`); unfiled ones sit in an Inbox; the navigator is grouped Inbox / Projects / Areas
  / Resources (done 2026-11-21)
- [x] Hub page: the hub's note above a tabbed section panel (Notes first, an area's Projects, a
  project's area on the hub line), collapsible and expandable, with its own key table (done 2026-11-21)
- [x] Archive and restore a hub with everything in it; collapsed Archive section; links to
  archived notes look muted (done 2026-11-21)
- [x] People: a shared directory with their own notes, linked to hubs with a role; a People tab
  on hubs and a People page with filters (done 2026-11-21)
- [x] Meetings: dated meetings in one hub with attendees and a note for minutes; a Meetings tab on
  hubs and people, a Meetings page, filter dropdowns (hub, period; an area includes its projects) (done 2026-11-21)
- [x] Decisions and open questions: records in a hub (optionally from a meeting, with people); a
  Decisions tab and a Questions tab (open first) on hubs, meetings and people (done 2026-11-21)
- [x] Backlinks: an index of wiki links; a Linked from tab on resources (and any note later) (done 2026-11-21)
- [x] Home: active projects by area, the Inbox count, open questions, and room for today's tasks
  and meetings (done 2026-11-21)
- [x] Note menu on the last crumb: clicking the open note's crumb opens its actions (rename,
  move, new note beside / under, file as project / area / resource / Inbox, archive or
  restore, export, trash with a confirm); a Go to note picker in the top bar; shared menu,
  picker and form dialogs for the items after it (done 2026-11-21)
- [x] Hub line controls: change a hub's kind and a project's area; edit a person's
  organisation, job title and email; a meeting's or record's date and time; mark a question
  answered or reopen it; add and remove the people on a decision or question (done 2026-11-21)
- [x] Hub tab actions: an add button on every tab (note, person with a role, meeting,
  attendee, decision, question), remove and change role on rows, empty tabs offer the
  button; a + on each tree group; New person and New meeting on their pages (done 2026-11-21)
- [x] Trash view: trashed notes are kept for one week, then deleted for good; a Trash page
  lists them and restores a note (with the notes under it) (done 2026-11-21)
- [x] Meetings tidy-up: meetings out of the sidebar, no notes under a meeting, the date a
  field and not part of the name (meetings may share a name), no `~` on empty editor lines
  (done 2026-11-22)
- [x] Pages as layouts: a card under the breadcrumb (a project's status, due date, area,
  people, next meeting), a label over every text box (Outcome, Purpose, Agenda + Notes, Why,
  Answer), sections under the text in place of tabs; people get first and last name and phone
  (done 2026-11-22)
- [x] @mentions: `@Name` links to the person, with completion after `@`; a person's page lists
  what they are on (live, archived) and Backlinks with the mentioning lines; renaming someone
  offers to rewrite their mentions (done 2026-11-22)
- [x] Decisions and questions from selected text: select, right-click, Add question… / Add
  decision…; the record rolls up to the hub, its area, the meeting and Home; the source text
  gets a badge; Answer… writes the answer into the question (done 2026-11-22)
- [x] Two windows: notes open in their own window (right 1/3 on a wide screen, full screen on
  the laptop, one reused window); the main window is wide; Calendar and Time become pages in
  the main window instead of popups (done 2026-11-22)
- [x] Tasks as records: a Tasks section instead of `- [ ]` lines, one level of subtasks shown
  as counts, delegation to a person with a follow-up date and a Waiting on list; tasks,
  questions and decisions roll up to their project only, areas show per-project counts (done 2026-11-22)
- [x] Phases and milestones: phases are notes with start/end days (Tasks + Notes), milestones
  are dated points; every date change is audited (baseline, slip, history, reason) (done 2026-11-22)
- [x] Wide project and area dashboards with a Gantt chart (drag to move/resize phases;
  an area's Gantt has one bar per project) and a projects table on areas (done 2026-11-22)
- [x] Note templates: a Templates group, Insert template… with {{date}} {{title}} {{cursor}},
  New note from template (done 2026-11-22)
- [x] Plan templates on areas: phases, milestones and tasks in days from the start, applied to
  a project from a start day; Save as plan template… from a project's Gantt (done 2026-11-22)
- [x] OneDrive files: a file record whose OneDrive link is the truth, attached to many notes
  and meetings; names filled from a linked, synced OneDrive folder (done 2026-11-22)
- [x] Simpler resources and calmer dashboards: resources are plain notes in folders (not hubs);
  project and area dashboards in two fixed lanes, Act and Know, under the full-width text
  (done 2026-11-22)
- [x] Next action: one flagged open task per project, area or phase (`n` on a task row; with
  none flagged, the first open task). Shown as NEXT on the dashboard, in an area's Projects
  table and in the Week tray. Migration 022 `tasks.is_next` (1e, 1f, 2h) (done 2026-11-22)
- [x] Status log: `:log`, `L` and Log status… make a dated entry with a health (on track / at
  risk / blocked) on a project or area. "Where I am" comes first in Act; the latest log shows
  in the header badge, the area table ("updated N d ago", red at 14 d) and the navigator dot.
  History, and "since last log" suggestions taken from date moves, decisions and done tasks.
  Migration 023 `status_logs` (1e, 1f, 2l) (done 2026-11-22)
- [x] Today replaces Home: a Now card, a day timeline with free gaps, one ranked Up next
  (overdue → follow-ups due → due today → due soon → next actions → questions waiting over
  7 d), project status and the Inbox. Keys `j k Space s d z o`. Empty-day state (1c, 2m) (done 2026-11-22)
- [x] Week: Calendar and Time become one page with Plan / Timesheet / Settings. Each day gets
  a capacity bar (meetings, focus, free), the tray is grouped Overdue / Due this week / Next
  actions / Follow-ups with estimates, the "due" strip shows due tasks and milestones, and a
  footer shows time so far. `s` drops a task into the first free slot before its due day.
  Migration 024 `tasks.estimate_min` (1d, 2c) (done 2026-11-22)
- [x] Top bar and palette: the top bar becomes Today | Week, a palette field and Window ▾.
  `:` opens the palette: Recent, Pages and every command with its key, all read from the
  central key tables. Go to, People, Meetings, Calendar, Time and Trash leave the bar; the
  palette must reach everything they did first (1c, 2a) (done 2026-11-22)
- [x] Navigator: Today and Week pinned at the top with counts, the Inbox count as a pill with
  File all…, a health dot and stale age on projects, note counts on folders, and a save state
  in the footer (2b) (done 2026-11-22)
- [x] Meeting capture: on save, `T:` `D:` `Q:` lines become a task, decision or question
  (`@Name`, `!day`), with an inline badge and a parse hint while typing. In a `T:` line, a
  name first in the sentence delegates the task to them ("T: @Tom send the numbers");
  anywhere else it is a task I owe them ("T: send @Tom the numbers"). A Prep box on meetings
  lists open questions with the attendees, follow-ups waiting on them, and what happened last
  time. The Meetings page is grouped by day with a Prep column (1g, 2d) (done 2026-11-22)
- [x] Note window context strip (Now block, time left, next meeting with a prep link) and
  `:t {text} [@Name] [!day]` for a quick task (1h) (done 2026-11-22)
- [x] People as 1:1 prep: "I owe them" (`tasks.for_person_id`) and "To raise next 1:1"
  (`person_topics`; `@Name ?` lines add one), plus Start 1:1 notes. The People page gets Open
  items / Everyone and counts for each. Migration 025 (1i, 2e) (done 2026-11-22)
- [x] Page refresh: question and decision page (Raise at, turn into decision), phase page
  (slip in words), full plan with date history, plan template page, folder page with Linked
  from, Inbox triage dialog, Delegate with "at our 1:1", Edit dates showing the knock-on
  effect, Trash with "Gone in", and the disconnected banner copy (only promise kept changes
  once `note-session.js` can keep them through a disconnect). New token `--fs-2xl` (2f–2m) (done 2026-11-22)
- [x] Tables like worknotes: new table, Tab / Shift-Tab / Enter between cells in insert mode
  (inside a table row only), columns kept aligned, sort by a column, align a column, a paste
  of Excel/Word cells becomes a table, copy a table for Word/Excel (done 2026-11-23)
- [x] Start a plan on a new project: the dashboard's Plan strip always shows on a project
  (empty: + Phase, Apply plan template…, Gantt gp); `gp` works anywhere on a project's or
  area's dashboard; a Plan command in the palette (done 2026-11-23)
- [x] Live preview: no blank line between a list item and its sub-bullets; the block under the
  cursor stays rendered in normal mode (a cursor marker beside it, nested bullets their own
  units) and shows raw Markdown only in insert mode (and in a visual selection or search match)
  (done 2026-11-23)
- [x] On call: paste the Excel on-call sheet (Role + one column per week) into an On call tab
  on the Week page; this week's names on Today and in the Week bar; a person's next on-call
  week on their dashboard (done 2026-11-23)
- [x] Add ability to remove folders from Project/areas and other locations where folders are added (done 2026-11-25)
- [x] Auto shutoff of the server does not work on Mac (done 2026-11-25)
- [x] A second Ctrl-C while Paradigm is stopping leaves it half-stopped (no "Paradigm stopped" in the log, the tidy-up skipped) (done 2026-11-25)
- [ ] I want to have the popup window that takes up the 1/3 of my screen to be a markdown view
  of any note and the note content should be visible on the main page. The reasoning behind
  this is to get rid of the weird behavior that real time rendering in the vim windows is
  causing. The real time view on the main 2/3 screen page should show where the cursor is so
  when I share my screen with just the 2/3 window, people are able to see where I'm typing while
  I focus on the right 1/3.
- [ ] On Chrome on windows, the heading and column on the calendar doesn't align with the content.
- [ ] I want to remove the next task feature and show all tasks on the calendar view when
  scheduling my week and days. I should be able to filter by project / area so I can narrow in
  on what I want to work on.
- [ ] Remove generic teams boilerplate text from agenda imports.
- [ ] Tasks should have their own page. Subtask names should be aligned underneath and indented
  slightly under the task name. Subtasks should render with their own notes column on the task
  page. Subtasks should be able to have subtasks.
- [ ] Moving a meeting around on the calendar always opens a new meeting dialog: bug.
- [ ] Holiday time and PTO time should show on calendar.
- [ ] Work display resolution is 5120x2160, the right 1/3 is slightly misaligned by default when
  it loads.
