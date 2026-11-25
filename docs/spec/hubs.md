# Hubs, resources and pages

How the app behaves. Kept up to date by each feature that changes it.

- PARA hubs: only top-level notes are hubs, and only projects and areas (`notes.kind`:
  project, area; NULL is the Inbox). `:project` etc. on a nested note moves it to the top;
  moving a hub under a note unfiles it. Groups never appear in paths or links, and top-level titles stay unique.
  The tree's top level is the four groups (folded state remembered per browser). Each group
  but the Archive has a + on its heading (a new project, area, ... or person); `a` in the
  tree does the same on a group, and makes a note under the one it is on. The People and
  Meetings pages have New person / New meeting buttons (`a` too).
- Resources (Tyson, 2026-11-22): plain notes sorted into folders, not hubs: no card, no
  sections but Tasks and Files, no meetings, records, people or OneDrive folders (a note
  holding those can't be filed as one). A folder is only a name (`resource_folders`); it
  nests, and holds top-level resource notes (`notes.folder_id`). Folders never appear in
  paths or links. In the tree, Resources lists its folders, then the notes in none; a folder
  folds (`l`/`h`, its twisty), and Enter or a click on its name opens its page in the main
  window (New note…, New folder…, Rename…, Move…, Move to trash…, then its contents). The
  Resources + and `a` on a folder offer New note… / New folder…. A resource's note menu has
  Move to folder…. Trashing a folder trashes its folders and their notes; restoring a note
  brings its folders back.
- Archive: `:archive` on a top-level note archives it with everything under it (only
  `archived_at` on the top-level note; a note is archived when its top note is). It moves to
  the Archive group (last, folded by default) and keeps its kind and area link, so `:restore`
  (from any note inside) puts it back. Archived titles stay taken. Links into an archived hub
  still work but are drawn muted; no project goes into an archived area.
- Pages: the open note is laid out as a page (`static/js/hubs/`). A card under the breadcrumb
  shows what it is and changes it (a project: kind ▾, status ▾ Active / On hold, due date ✎,
  area ✎, People, Next meeting; an area: live / on hold projects, people; a meeting: date,
  hub, Attendees; a person: details ✎; a record: state, date, people, From). Every text box
  has a label (`fields.js`: a project's Outcome, an area's Purpose, a meeting's Agenda over
  its Notes, a decision's Why, a question's Answer, else Notes) with a hint while empty.
  Under the text, a hub, person or meeting has sections (`hub-sections.js`, each kind's
  order in SECTION_ORDER; a project: Questions, Decisions, Notes, Meetings, People; an area:
  Projects first; a meeting: Questions, Decisions; a person:
  Active, Archived (folded), Backlinks). In the note window (Tyson, 2026-11-23) the text
  fills the window down to a one-line bar naming every section with its count ("Tasks 3
  (1 late) · Files 2"; empty ones muted; none: no bar); the sections slide up from it over
  the lower half of the text: a click on the bar, Tab out of the text onto it, or `:hub`.
  Escape, the bar, its ✕ or the focus back in the text close it; it stays open under its
  dialogs, menus and pickers; another note opens with it closed. The main window's dashboard
  is unchanged. Tab or `:hub` reaches the sections: one focus stop, headings fold (Enter or `z`, remembered per kind), long
  sections end in "Show all (n)"; its keys live in `static/js/hubs/hub-keys.js`. Each
  section that can grow has an add button (`add` in its row, and the `a` key); rows that are
  links have Role… / Remove (`r`, `x`); an open question has Answer… (`r`). New record types
  become new rows in `hub-sections.js`. `:inarea {area}` puts a project in an area; a note
  that stops being a project or area loses the link.
- Card controls: what the card shows can be changed there: a hub's kind (▾), a project's
  status (▾) and due date (✎; red once overdue) and area (✎, a picker) and people (+ Add
  person), a person's details (✎), a meeting's date and time and attendees, a record's date,
  a question's state (▾: Answer…, answered today / on a day, reopen), and the people on a
  record (× and + Add person). The person dialog adds someone new to People only when its
  button says "Add new person".
- Dashboards (2026-11-22): a project's or area's head (name at `--fs-2xl`, health, Outcome or
  Purpose on one line, buttons), the card under it as its meta row, a project's Plan strip
  (phases as wide as their working days; done ✓, current, late underlined red, today's line;
  always there on a project: with no phases, "No phases yet", + Phase and Apply plan template…);
  the text box only when the text runs past its first line. The full Gantt is its own page,
  `&plan` (`gp`, or Gantt on the strip; Escape back).
- Plan templates (kept on an area, its Plan templates section): phases and milestones in
  working days from 0, each with standard tasks and subtasks; edited on their own page in
  the main window (a chart in days: drag; + Phase, + Milestone, + Task). "Apply plan
  template…" on a project's chart makes them from a start day, skipping weekends and the
  timesheet's holidays; the applied dates are the baseline; it never replaces anything.
  "Save as plan template…" turns a project's plan into one on its area.
- Note templates: top-level notes in the Templates group (+ on its heading). "Insert
  template…" (the note menu, `:template [name]`) puts one in below the cursor: `{{date}}`,
  `{{time}}`, `{{title}}` filled in, the cursor at `{{cursor}}`, and its `- [ ]` lines become
  tasks of the note (indented ones subtasks). New note… can start from a template.
- Files (OneDrive): a folder synced on this computer is linked to a hub ("Link a OneDrive
  folder…": a picker over the folders under the `OneDriveCommercial` / `OneDrive` roots, or a
  pasted path); its files are listed by reading it. "+ Add file" in any page's Files section
  attaches one (one record, on any number of notes); Enter opens it with this computer's
  program (`os.startfile`); Remove takes it off that note only. A file gone from the folder
  is flagged, kept while attached. A project's Files include its phases' and notes'.
- Linked folders (Tyson, 2026-11-25): a project or area's own Files section lists its linked
  folders first, above the files (in Files, not a section of their own): `📁 Contracts`,
  `OneDrive folder · 12 files · 3 on notes`, the path on hover. Pages inside the hub show
  only files; the section's count and the sheet bar count files, not folders. Enter on a
  folder row opens Add file over that folder's files only. Unlink (the row's ⋯, or `x` /
  `Delete`) asks first, danger: *Unlink "Contracts" from "Northwind rollout"? Its 3 files on
  notes come off them (Kickoff, Phase 1, Review, …). Nothing in OneDrive changes.* (up to
  three notes named; attachments on notes in the trash are counted too: "1 attachment on notes
  in the trash goes too, for good"). It drops the folder, its files and their attachments on every note, and
  can't be undone; nothing on disk changes. The Add file picker has "Unlink a folder…" under
  "Link a OneDrive folder…" when the hub has folders, so a phase or note page reaches it too.
  A hub with no folder left can be filed as a resource again, if nothing else stops it.
  Unlink and Enter on a folder row reload the page's data first: a row left over after the
  other window unlinked it says "that folder is no longer linked" instead.
- Time codes: a project or area has one on its card (`Time code: X ✎`, `(from area)` when a
  project books to its area's, else Set time code; `:timecode`). A resource or Inbox note has
  none: its time is listed as not counted.
- Page refresh (2026-11-22): a question's card: its kind as a badge, "open · 21 days", Raise
  at (the next meeting with its people, "on agenda ✓"), Answer…, Turn into decision (the
  question becomes a decision, same note: `/api/record/convert`), Make a task to find out. A
  phase's card says its slip in words with a mini bar over its baseline, and where it last
  moved and why; its page has Tasks and Milestones side by side. The full plan: a second line
  under each label (done, "+9 d · moved 3×", the slack left before due), the due date as a
  mark, a legend, and the chosen phase's date history beside it. A plan template's page: its
  counts and how many projects use it, Apply to a project…, item cards in two columns. A
  folder's page: its name large, what it holds, New note (`a`, `folder-keys.js`), New folder,
  ⋯ (Rename, Move, Move to trash), a filter and the sort, columns Title, Linked from (hubs,
  from the link index), Edited. Edit dates shows what the move does ("+4 d · 4th move later ·
  pushes Cutover; 2 d slack left before due"; formDialog's `live`). Delegate: To, then Follow
  up: Tomorrow / At our next meeting (also on their To raise) / Pick… / none. Inbox triage
  (File all… under the Inbox, on Today, or `f` there): one note at a time with its start and
  the suggested hub; `1` under it, `r` a Resources folder, `m` under another note, `p` / `a`
  a project or area, `t` a task (and the note to the Trash), `x` Trash; Space skips, `o`
  opens it, `u` undoes the last, Escape stops. The Trash page: "Kept for 7 days…", columns
  Note (+ the notes under it), Was in, Gone in (orange at a day or less). The banner, with
  unsaved changes: "changes since HH:MM are kept in this window and will save when it’s back".
