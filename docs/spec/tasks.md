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
  One level of subtasks. A Tasks section lists a task once with "2/5 subtasks"; Enter (or a
  click) opens it in place: its subtasks, its notes and + Add subtask. Row buttons: Done
  (Space), Edit… (`e`: text, notes, due), Delegate… / Take back (`d`), Delete (`x`; a task
  with logged time keeps its row). A delegated task shows "→ Name, follow up …" (red past
  the follow-up day), leaves the Week tray (but for Follow-ups, when its follow-up day is in
  the week shown or before), and is listed in Waiting on (Home and
  the person's page). Roll-up: a project lists its tasks and those of the notes inside it;
  an area lists its own only, and each of its projects in Projects with that project's
  counts (open tasks, decisions, open questions, next milestone).
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
  track, at risk, blocked) and a few words (`status_logs`), never in its text. Log status… (the
  head's button, `L` in the sections, `:log`, first on its note menu) has the health as three
  buttons (`1` `2` `3`), the words, and "since last log" lines to click in (date moves,
  decisions, answers, done tasks); Ctrl-Enter logs it. The newest entry is its health: the
  dashboard head's badge, "Where I am" first in Act (the newest boxed, two older, History),
  an area's Projects table (Health, Latest status, Updated, Next milestone, Open; the Next
  action column went with the next action, 2026-11-26). On hold beats it; none logged reads "—" / "log one"; stale at `Config.stale_days`
  (14). An area's dashboard: Projects across both lanes, then Portfolio (a bar per project),
  Tasks; Weekly digest on the right (Copy: Markdown + HTML).
