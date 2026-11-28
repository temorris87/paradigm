# Tasks, plans and status

How the app behaves. Kept up to date by each feature that changes it.

- Note window strip and `:t` (2026-11-22): under the note window's breadcrumb, NOW (the task
  block on now: its time, what is left, a bar moving each minute) and Next: the meeting starting
  within 2 h (a link to it and its Prep); hidden when neither is near. `:t {text} [@Name]
  [!day]` puts a task on the open note's hub without leaving the note, read as a T: line (a
  name first: theirs to do; later: I owe them); while it is typed a hint over the command line
  says what it will make (`editor.hints`, pd-editor.js).
- Tasks (Tyson, 2026-11-22: records, not text; this replaced the `- [ ]` tasks): a task
  belongs to one note (a project, an area, a phase, a milestone, a meeting, any note) and is
  made in that page's Tasks section (+ New task, `a`, or `:task [!]{text}`, ! due today).
  Subtasks nest (2026-11-26): a task plus at most 4 levels under it (deeper: "Subtasks go 4
  levels deep"). A Tasks section lists a task once with "2/5 subtasks", counting every level;
  Enter (or a click on its title) opens its own page (below), `z` (or a click on its ▸) opens
  it in place: its notes, every level of subtasks, each box under the start of the title above
  it, and + Add subtask for direct ones (deeper ones are added on the task page). Row buttons:
  Done (Space), Edit… (`e`: text, notes, due), Delegate… / Take back (`d`), Delete (`x`; it
  takes every subtask under it, and its confirm says how many and opens on Cancel; a task
  with logged time keeps its row, so the timesheet doesn't change). Marking a task done marks
  every open subtask under it done too, at every level, delegated ones included, with today's
  done day; ones already done keep theirs (Tyson, 2026-11-26). Reopening reopens that task
  alone, and ticking the last open subtask leaves its parent open. A subtask keeps its parent:
  no indent or outdent. A delegated task shows "→ Name, follow up …" (red past
  the follow-up day), leaves the Week tray (but for Follow-ups, when its follow-up day is in
  the week shown or before), and is listed in Waiting on (Home and
  the person's page). Roll-up: a project lists its tasks and those of the notes inside it;
  an area lists its own only, and each of its projects in Projects with that project's
  counts (open tasks, decisions, open questions, next milestone).
- Task page (2026-11-26; `?note=HUB&task=ID`, `static/js/tasks/task-page.js`): a task's own
  page in the main window, over its note's dashboard (or its hub's); from the note window's
  sheet Enter shows it in the main window. The breadcrumb is the hub › each parent task › this
  task, each a link. The head: ☐/☑, the title, one line of facts (due, → delegate and
  follow-up, For, estimate, "on {note}" when it is not the hub, done day), then its notes
  rendered (maths, diagrams, note links), or "No notes — e to add". Under it a Subtask | Notes
  table (about 2fr / 3fr; under 1400 px the notes go under each name): the left column a tree,
  each box under the start of its parent's title; the right that subtask's own notes, blank
  when it has none; done ones stay in place, muted. Titles win over facts: the facts are cut
  first and wrap under the title when there is no room. + Add subtask under the table. Keys
  (`task-page-keys.js`): `j`/`k`/arrows (the head is the first row), `gg`/`G`, Enter opens a
  subtask's page, `a` adds a subtask under the row (on the head: a direct one), Space done or
  reopen, `e` Edit…, `d` delegate or take back, `x`/Delete, `J`/`K` move among siblings,
  Escape back to the dashboard. Notes are edited through Edit… only, never on the page (the
  main window never edits text). It redraws when another window changes something; a deleted
  task shows "This task is gone", one on a trashed note "Its note is in the trash" (a link to
  Trash), each with Back; a task on an archived note is read-only. Waiting on and I owe rows
  open it too; the calendar, the Week tray and Today keep opening the note (the block menu has
  Open task); the palette lists no tasks.
- Emails on tasks (2026-11-27; `static/js/tasks/task-emails.js`, `paradigm/files/msg_reader.py`):
  a task's page has an Emails section under Subtasks. Drag one or more Outlook .msg files onto
  the page (from classic Outlook, Explorer or Finder), or `:att[ach]` there for the file
  picker. Only the task page in the main window takes them: `:attach` anywhere else (Today, the
  note window) says `E: open the task's page to attach`, and a task row on a dashboard or Today
  takes no drop (Tyson, 2026-11-27). A file that is not a .msg says `E: not an Outlook message
  (.msg): <name>`, one over 30 MB `E: over 30 MB: <name>`, the same email (subject, sender,
  sent time) again `E: already on this task`; the others in the drop still go in. Each row:
  ✉ subject, a chip ("Reply needed", caution; "Replied Fri", or "Replied 20 Nov" past six
  days, success; none for No reply), Reply ↗ while a reply is needed, else Open ↗, and under it
  the sender and the sent date and time, dim. Newest sent first; with none, the hint `Drag an
  email (.msg) from Outlook onto the task, or :attach` ("No emails" when read-only). A new
  email starts as Reply needed: the .msg can't say (Tyson, 2026-11-27). Keys on an email row:
  `j`/`k` go through subtasks and emails as one list; `r` Reply needed → Replied (today) → No
  reply; Enter, `o`, or the ↗ link opens the saved .msg in Outlook (this computer's program for
  .msg; we can't start a reply); `x`/Delete asks `Remove "<subject>" from this task? The saved
  copy is deleted.` (it opens on Cancel). An archived note's task still opens its emails; `r`,
  `x`, drops and `:attach` are refused as read-only. The .msg is read by our own stdlib
  compound-file reader (no third-party tool at work): subject, sender name and email, sent time
  (submit time, else delivery time), as local time; a broken, truncated or looping file is
  refused. The bytes are saved as `<data>/emails/<task>/<id>.msg` with the row; a task deleted
  (`x`) or purged with its note from the trash takes its emails' rows and that folder; a
  trashed note's tasks keep theirs. A saved file gone by hand: `E: the saved email is missing`.
- No next action (Tyson, 2026-11-26; it replaced the NEXT flag): a Tasks section keeps its
  tasks in their own order, with no NEXT badge, no Make next and no `n`. A page opened shows
  its first task selected, even when the tasks load after the first draw, until you move, press
  a key or click; another page starts on its first task again. `tasks.is_next` was dropped
  (migration 029) and `POST /api/task/next` is gone. Planning from everything open is the
  Week tray's job (week.md). Questions and decisions roll up the same way as tasks. `- [ ]` in a note is plain Markdown again (a click still ticks it).
- Plan (Tyson, 2026-11-22): a project's phases are notes (kind "phase", directly under the
  project, in the tree tagged Phase, with notes under them) with a start and an end day; its
  milestones are notes (kind "milestone", under the project or a phase, out of the tree)
  with a day and reached or not. Not every note is on the plan: "Make it a phase…" on a
  plain note's menu (and "Make it a plain note"). The first dates are the baseline; every
  move is kept in `schedule_changes` with when and why ("Why it moved" in Edit dates…; a
  drag that ends later asks). The slip shows as "+9 d, moved 3×", red ("keeps slipping")
  once moved later 3 times; History lists the moves. The main window's Plan page (`&plan`,
  `gp`) draws a project's plan as a Gantt chart (weeks, today, the baseline dashed under a bar): drag a bar, either
  end, or a diamond; click opens it in the note window; its keys are in
  `static/js/gantt/gantt-keys.js` (`e` Edit dates…, `h` history, Space a milestone done,
  `p` / `m` new). An area's chart has a bar per project. The note window lists the same as
  the project's Plan section; a phase's page has Tasks, Milestones, Files, Notes.
- Status log (Tyson, 2026-11-22): a project or area keeps dated entries with a health (on
  track, at risk, blocked; shown as "Off track" everywhere since 2026-11-27, Figma's word,
  still stored as `blocked`) and a few words (`status_logs`), never in its text. Log status… (the
  head's button, `L` in the sections, `:log`, first on its note menu) has the health as three
  buttons (`1` `2` `3`), the words, and "since last log" lines to click in (date moves,
  decisions, answers, done tasks); Ctrl-Enter logs it. Escape from it or its history puts the
  focus back on the page, even when the menu item that opened it is gone. The newest entry is
  its health: the
  dashboard head's badge, "Where I am" first in Act (the newest boxed, two older, History),
  an area's Projects table (Health, Latest status, Updated, Next milestone, Open; the Next
  action column went with the next action, 2026-11-26). On hold beats it; none logged reads "—" / "log one"; stale at `Config.stale_days`
  (14). An area's dashboard: Projects across both lanes, then Portfolio (a bar per project),
  Tasks; Weekly digest on the right (Copy: Markdown + HTML).
