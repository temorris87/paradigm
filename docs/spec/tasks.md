# Tasks, plans and status

How the app behaves. Kept up to date by each feature that changes it.

- Note window strip and `:t` (2026-11-22): under the note window's breadcrumb, NOW (the task
  block on now: its time, what is left, a bar moving each minute) and Next: the meeting starting
  within 2 h (a link to it and its Prep); hidden when neither is near. `:t {text} [@Name]
  [!day]` puts a task on the open note's hub without leaving the note, its words read as the
  old T: lines were (a name first: theirs to do; later: I owe them; `:t` keeps this reading
  since T: lines went, 2026-11-27); while it is typed a hint over the command line
  says what it will make (`editor.hints`, pd-editor.js).
- Tasks (Tyson, 2026-11-22: records, not text; this replaced the `- [ ]` tasks): a task
  belongs to one note (a project, an area, a phase, a milestone, a meeting, any note) and is
  made in that page's Tasks section (+ New task, `a`, or `:task [!]{text}`, ! due today).
  Subtasks nest (2026-11-26): a task plus at most 4 levels under it (deeper: "Subtasks go 4
  levels deep"). A Tasks section lists a task once with "2/5 subtasks", counting every level;
  Enter (or a click on its title) opens its own page (below), `z` (or a click on its ▸) opens
  it in place: its notes, every level of subtasks, each box under the start of the title above
  it, and + Add subtask for direct ones (deeper ones are added on the task page). Row buttons:
  Done (Space), Edit… (`e`: text, due; no notes field since 2026-11-27, the notes are written
  in the note window from the task's page), Delegate… / Take back (`d`), Delete (`x`; it
  takes every subtask under it, and its confirm says how many and opens on Cancel; a task
  with logged time keeps its row, so the timesheet doesn't change). Marking a task done marks
  every open subtask under it done too, at every level, delegated ones included, with today's
  done day; ones already done keep theirs (Tyson, 2026-11-26). Reopening reopens that task
  alone, and ticking the last open subtask leaves its parent open. A subtask keeps its parent:
  no indent or outdent. A delegated task shows "→ Name, follow up …" (red past
  the follow-up day), leaves the Week tray (but for Follow-ups, when its follow-up day is in
  the week shown or before), and is listed in Waiting on (Home) and
  They owe me (the person's page). Roll-up: a project lists its tasks and those of the notes inside it;
  an area lists its own only, and each of its projects in Projects with that project's
  counts (open tasks, decisions, open questions, next milestone).
- Task page (2026-11-26; laid out as in Figma, Tyson, 2026-11-27, where Figma wins over the old
  page; `?note=HUB&task=ID`, `static/js/tasks/task-page.js`): a task's own page in the main
  window, over its note's dashboard (or its hub's); from the note window's sheet Enter shows it
  in the main window. The breadcrumb is the hub › each parent task › this task, each a link.
  - Head (`task-head.js`): ☐/☑ and the title (`--fs-xl`), under it a row of chips: due ("2 d
    late · was due Tue 24 Nov" danger; "Due today", "Due tomorrow" or "Due Fri" within 6 days,
    caution; "Due Fri 4 Dec" further off, neutral; none once done), "2 h estimate" (neutral),
    and one "2 h placed Mon" per block of time, "· done" once over (success). On the right the
    buttons Done `Space` (primary), Schedule `s`, Delegate `d` (Take back `d` on a delegated
    task, as in hub sections), Edit… `E` (title, due date, estimate, for whom: no notes field;
    it was `e`, Tyson, 2026-11-27), and ··· (the other task actions).
  - Facts row, small caps labels over values: PROJECT (AREA or PERSON on those hubs; a link to
    the hub), FOR (I owe it to them, or "—"), DELEGATED TO ("Ben Ortiz · follow up Mon", or
    "—"), NEXT BLOCK (the next block not over: "Mon 30 Nov 10:00–12:00"; else "None · s finds
    Fri 08:00", the slot `s` would take, worked out now; "None" when done, archived or no room).
  - Two columns: Notes, the main one, a card (Notes, Edit `e`: the notes in the note window,
    below) with the task's notes rendered (maths, diagrams, note links), or "No notes yet. e
    to write them." (Tyson, 2026-11-27); and
    a side column about 24rem wide of cards, in this order (`task-side.js`):
    Subtasks "1 of 2 done", + Subtask `a`: each row ☐ and the title, a tree (each box under the
    start of its parent's title), on the right "done Thu 26 Nov", "→ Ben · follow up Mon" or
    "due Fri"; done ones struck through and muted. The Subtask | Notes table is gone: a
    subtask's own notes are on its own page. Emails "n to answer", + Attach (below). Files "n",
    + Add file… (below). From a meeting, only for a task with a source in `task_sources`: a
    chip "From a meeting" (or "From a note"), the source's title and day as a link, the quote in
    `--font-mono` with a left rule. History: the task's life newest first, each row a day and a
    line: "Captured in {meeting}" or "Created", "Placed 10:00–12:00 (2 h)" per block, "Done",
    and "Delegated to {name} · follow up {day}", which is undated and listed first (it is how
    the task stands now: the delegation's day is not stored). Derived from what is stored, with
    no event log (Tyson, 2026-11-27; `paradigm/db/task_history.py`, `GET /api/task/history`).
    The one stored log is the follow-ups logged on Today (feature 033, `follow_up_logs`): each
    is a row on its day, "Followed up: {note}" (or "Followed up") then "· next Tue 1 Dec" or
    "· closed", newest first. The logs stay with a task through trash and restore, and go
    when the task is removed.
  - Width: at 1280 px (the main window's share with the note window on the right third) Notes
    and the side column sit side by side and nothing scrolls sideways; under 1000 px the side
    column goes under Notes.
  - Schedule (`s` or the button): the task's estimate (or 30 min) in the first free slot from
    now, before its due day (`firstFreeSlot`, as the Week's `s`): `"{title}" placed Mon 30 Nov
    10:00–10:30`, or `E: No free 30 min before it is due` (`… in the next two weeks` with no due
    day); Next block then shows it.
  - Keys (`task-page-keys.js`), one listbox: the head is the first row, then the side column's
    rows top to bottom (subtasks, emails, files, From, History). `j`/`k`/↑↓, `gg`/`G`; `h`/`l`
    and ←/→ across: the head (over the Notes) is the left column, the side column's rows the
    right, landing on the row nearest in height (2026-11-28; feature 039);
    Space done or reopen, `E` Edit…, `d` delegate or take back, `s` schedule (each on the
    selected subtask, else the page's task); `e` the page's task's notes in the note window;
    `a` adds a subtask under the row (elsewhere: a
    direct one); Enter opens the row (a subtask's page, the email, the file, the meeting or
    note); `o`, `r` and `x`/Delete on emails and files (below); `x`/Delete on a subtask deletes
    it; `J`/`K` move a subtask among its siblings; Escape back to the dashboard. The hint bar:
    `Space` done, `e` edit notes, `d` delegate, `s` schedule, `a` add subtask, `j k` move, `h l` columns, `Esc` back,
    `f` follow, `?` all keys; the rest are in `?`.
  - Notes are written in the note window, never on the page (the main window never edits
    text). The chip "Live · editing in the note window" was first dropped, as the note window
    couldn't open a task's notes (Tyson, 2026-11-27); 031 brought both back (Figma wins, Tyson,
    2026-11-27; below). It redraws when another window changes something; a
    deleted task shows "This task is gone", one on a trashed note "Its note is in the trash" (a
    link to Trash), each with Back; a task on an archived note is read-only (no buttons, "No
    files", "No emails"). Waiting on and I owe rows open it too; the calendar, the Week tray and
    Today keep opening the note (the block menu has Open task); the palette lists no tasks.
- A task's notes in the note window (Tyson, 2026-11-27; `note.html?task=ID`,
  `static/js/tasks/task-notes-session.js`, `task-notes-live.js`): on a task's page, the Notes
  card's Edit `e` (or the key) opens the task's notes in the note window, placed as it always
  is, and says `"{title}" notes are open in the note window` (popups blocked: `E: the browser
  blocked the note window: …`). The note window's crumb reads Task › {project or hub} › {task};
  there is no note menu, sheet, captures or note Live page, and its hint bar has only `@` and
  `:w`. The editor holds the notes as Markdown with `@` completion; they save about 1 s after
  typing stops, on `:w` ("{title}" notes saved), and on leaving or closing the window, with
  `POST /api/task/update {id, notes}`. No versions: the last write wins (Tyson, 2026-11-27). A
  failed save keeps the text and says `E: notes not saved: {error}`. Opening another note or
  task there saves them first (`:e!` drops a note's edits, never the task's notes), and again
  once the note has loaded, just before they close, so text typed during the load is kept; if
  that save fails the switch stops, the task's notes stay open and the error shows
  (2026-11-28). A task gone
  says `E: that task is gone (deleted in another window?)`.
  While the note window holds them, the task page shows the info chip **Live · editing in the
  note window** (with its dot) in the Notes card's head, left of Edit, and the card renders the
  notes as they are typed with the caret where the cursor is (the Live page's throttled `live`
  message, carrying `task`). A task page opened later asks (`live-ask`) and shows the chip at
  once. When the note window closes or opens something else the chip goes and the card reads
  the saved notes again (once more a second later, for a save sent as the window closed). A
  task's notes never switch the main window to its Live page.
- Files on tasks (2026-11-27; `static/js/tasks/task-files.js`, `paradigm/api/task_files.py`,
  `task_files`, migration 031): + Add file… on the task page's Files card opens 020's native
  picker starting in the task's hub's linked folder (without tkinter, the folder browser), and
  links the file to this task, not the hub. A file from a folder not linked offers to link its
  folder to the task's hub, as on a hub. Each row: a file icon, the name as a link (Enter, `o`
  or a click opens it with this computer's program), "OneDrive · {folder}" on the right, "·
  from {hub}" when the folder is another hub's. Oldest added first; with none, the hint "Add
  file… opens the file picker in the project's OneDrive folder". `x`/Delete unlinks it from
  the task (`"<name>" unlinked from the task (it stays in OneDrive)`); the file itself is never
  touched. A file gone from its folder is kept, flagged, while a task has it. Deleting a task
  (its subtasks too), unlinking a folder, or purging a hub from the trash drops those links.
- Emails on tasks (2026-11-27; `static/js/tasks/task-emails.js`, `paradigm/files/msg_reader.py`):
  a task's page has an Emails card in its side column, under Subtasks. Drag one or more Outlook
  .msg files onto the page (from classic Outlook, Explorer or Finder), or `:att[ach]` there for
  the file picker. Only the task page in the main window takes them: `:attach` anywhere else (Today, the
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
  `static/js/gantt/gantt-keys.js` (`e` Edit dates…, `t` date history (it was `h`, 2026-11-28), Space a milestone done,
  `p` / `m` new). An area's chart has a bar per project. The note window lists the same as
  the project's Plan section; a phase's page has Tasks, Milestones, Files, Notes.
- Status log (Tyson, 2026-11-22): a project or area keeps dated entries with a health (on
  track, at risk, blocked; shown as "Off track" everywhere since 2026-11-27, Figma's word,
  still stored as `blocked`) and a few words (`status_logs`), never in its text. Log status… (the
  head's button, `S` in the sections (`L` until 2026-11-28), `:log`, first on its note menu) has the health as three
  buttons (`1` `2` `3`), the words, and "since last log" lines to click in (date moves,
  decisions, answers, done tasks); Ctrl-Enter logs it. Escape from it or its history puts the
  focus back on the page, even when the menu item that opened it is gone. The newest entry is
  its health: the
  dashboard head's badge, "Where I am" first in Act (the newest boxed, two older, History),
  an area's Projects table (Health, Latest status, Updated, Next milestone, Open; the Next
  action column went with the next action, 2026-11-26). On hold beats it; none logged reads "—" / "log one"; stale at `Config.stale_days`
  (14). An area's dashboard: Projects across both lanes, then Portfolio (a bar per project),
  Tasks; Weekly digest on the right (Copy: Markdown + HTML).
