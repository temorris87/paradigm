# paradigm

A web-based work-notes app with Vim-style keys. A local Python 3 server (standard library only)
serves a vanilla HTML/CSS/JS front end in the browser; notes live in a SQLite database.
User: Tyson. It is a fresh project, independent of `../worknotes` (no shared code, data format or
keybindings).

## Hard rules
- **Python 3 standard library only.** Target **3.11**, the work PC's version (3.11.1): nothing
  newer, such as `type` aliases (3.12) or 3.12+ stdlib additions. Check syntax with
  `ast.parse(src, feature_version=(3, 11))`.
  No pip packages.
- **Vanilla HTML/CSS/JS only:** ES modules loaded straight from `static/`. No npm, no CDN, no
  frameworks, no build step, no calls to outside networks.
- **Runs on Windows, Mac and Linux.** The main machine is a Windows work PC. Use `pathlib` for
  paths, pass `encoding="utf-8"` explicitly, write `\n` line endings, and never assume a shell.
  Launch with `python paradigm.py` (`py paradigm.py` on Windows), or double-click
  `paradigm.pyw` for no console window. `.bat` files are not allowed.
- The server binds `127.0.0.1` only.
- **Data:** SQLite (`sqlite3`) at `~/paradigm-notes/paradigm.db`, which `--data DIR` can override.
  The data folder is never inside the repo. Design the schema per feature and version it with
  numbered migrations (`paradigm/db/migrations/NNN_name.sql`).

## Engineering
- Organize code well: small modules, each with one job, and no god files. When a file starts
  doing two things, split it.
- Components are reusable. The editor (`<pd-editor>`, a vanilla Web Component) knows nothing about
  notes: it takes text in and emits events such as `change` and `save`, so any part of the app
  can use it.
- Keep pure logic (buffer, motions, operators, text objects, registers, undo) apart from DOM
  rendering so it can be unit-tested without a browser page.
- All database access goes through a repository layer. SQL is always parameterised, never built
  from strings.
- Name things clearly and keep functions short. Comment the why, not the what.

## Layout
```
paradigm.py              entry with a console: python paradigm.py [--port N] [--data DIR] [--no-browser]
paradigm.pyw             entry with no console window (Windows double-click): main(console=False)
paradigm/                Python package
  app.py                 startup / shutdown wiring (main, run, build_server)
  config.py              Config + argparse (port 8765, data ~/paradigm-notes)
  instance.py            probe the port: free / a running Paradigm / another program
  presence.py            open tabs and the shutdown rule (pure logic, injected clock)
  logging_setup.py       console (if any) + <data>/paradigm.log
  notify.py              startup errors: console pause, or a message box with no console
  web/                   server.py (ThreadingHTTPServer), handler.py, router.py,
                         static.py (serves static/), responses.py, security.py
  api/                   JSON endpoints; session.py = /api/ping, /api/events, /api/closing;
                         notes.py (also /api/note/status|due: a project's); images.py
                         (raw-bytes upload, GET /api/image?id=N cached);
                         people.py (/api/people, /api/person/create|update|link|unlink);
                         meetings.py (/api/meetings, /api/meeting/create|update|agenda|attend|
                         unattend); records.py (/api/records, /api/record/create|date|
                         answer|reopen|with|unwith); links.py (/api/links: the wiki-link and
                         mention index and stale notes; /api/links/index: the page's catch-up);
                         trash.py (/api/trash, /api/trash/restore);
                         folders.py (/api/folders, /api/folder/create|rename|move|trash,
                         /api/note/folder: Resources' folders);
                         tasks.py (/api/tasks, /api/task/create|update|delegate|done|move|
                         remove: tasks as records, one level of subtasks; /api/sessions,
                         /api/session/add|move|remove: blocks of time);
                         plans.py (/api/plan: phases, milestones, their date changes;
                         /api/phase/create|make|unmake, /api/milestone/create|done,
                         /api/plan/dates; /api/plan_template/...: create, items, tasks,
                         apply, save); templates.py (/api/template/create: note templates);
                         files.py (/api/files, /api/folders/browse, /api/folder/link|unlink|
                         scan, /api/file/attach|detach|open: OneDrive files);
                         topics.py (/api/person_topics, /api/person_topic/create|raise|
                         remove); status.py (/api/status_logs, /api/status_log/create|update|
                         remove; stale_days from Config);
                         calendar.py (the Outlook import: /api/calendar/status|import|upload|
                         pending|file|ignore); timesheet.py (/api/time/week, /api/time/
                         settings, holiday/add|update|remove, off/add|remove);
                         answers.py (result or expected error -> response)
  db/                    (migrations: 001 notes, 002 images, 003 notes.kind for PARA hubs,
                         004 notes.area_id: a project's area, 005 notes.archived_at:
                         archived hubs, 006 people + hub_people: a person's fields and
                         their hub links with a role, 007 meetings + meeting_people: a
                         meeting's day, time and attendees, 008 decisions + questions +
                         record_people: their days, an answer day, the people on them,
                         009 note_links + link_index: each note's wiki-link texts as
                         written, and the note version they were read from, 010 images.note_id
                         may be NULL: an image outlives its note deleted for good, 011 pages:
                         notes.title_shared (meetings and records may share titles),
                         notes.status/due (a project's), meetings.agenda, people first/
                         last/phone, record_sources (where a record came from, the quote),
                         note_mentions; records and notes moved out from under meetings,
                         012 tasks + task_texts + task_sessions: a note's boxes, the text
                         they were read from, their blocks of time, 013 notes.time_code,
                         014 meetings end_time/cancelled/location/join_url, 015
                         meeting_sources (Outlook uid + day -> meeting), import_pending (To
                         file), import_log, 016 time_settings, holidays, time_off, 017 tasks
                         as records: tasks (note, parent, notes, due, delegate, follow-up,
                         position) + task_sessions, the text-read tasks dropped, 018 phases +
                         milestones (dates and baselines) + schedule_changes (every date
                         move, with why), 019 note_templates, plan_templates + plan_items +
                         plan_item_tasks (working days from 0), project_plans, 020
                         file_folders + files + file_links, 021 resource_folders +
                         notes.folder_id; resources holding hub things became areas,
                         022 tasks.is_next: one flagged next action per note, 023
                         status_logs: dated health + words on a project or area, 024
                         tasks.snoozed_until: off Today's Up next until that day, 025
                         tasks.estimate_min, 026 task_sources (a captured T: line) +
                         tasks.for_person_id (I owe them), 027 person_topics (to raise at
                         the next 1:1))
                         connection.py (one locked connection, transactions, VACUUM at start
                         when worth it), migrate.py
                         (migrations/NNN_name.sql, PRAGMA user_version), notes_repo.py,
                         people_repo.py (people and hub links; a people row is what
                         makes a note a person, reported as kind "person"),
                         meetings_repo.py (a meetings row makes a note a meeting, kind
                         "meeting"; directly under its hub, its name as its title; its
                         agenda saves with its own version), records_repo.py (decisions and
                         questions: a row makes a note one, kind "decision"/"question";
                         directly under its hub; source and quote: where it was made from),
                         links_repo.py (the wiki-link and mention index; store_links runs
                         inside a note save; a note whose version moved past its index is
                         stale),
                         trash_repo.py (the Trash: one entry per note trashed with the notes
                         trashed with it (same deleted_at); restore; purge deletes for good
                         what was trashed over Config.trash_days (7) ago, at start and stop),
                         images_repo.py (image bytes in SQLite, deduped per note by sha256;
                         sweep_unused deletes images no note links to, at start and stop only),
                         tasks_repo.py (tasks and subtasks, delegation, sessions; a task
                         with logged time is only marked removed), plan_repo.py (phases,
                         milestones, every date change logged; a phases/milestones row
                         makes a note kind "phase"/"milestone"), plan_templates_repo.py
                         (templates on an area; apply: working days, weekends and the
                         timesheet's holidays skipped; save from a project), templates_repo.py
                         (a note_templates row makes a top-level note kind "template"),
                         files_repo.py (linked folders, their files, attachments; scan),
                         folders_repo.py (folders in Resources: nest, unique names per
                         parent, trash with their notes, back with a restored note),
                         status_repo.py (status logs on projects and areas),
                         topics_repo.py (what to raise with a person; "@Name ?" lines
                         add them through capture_repo),
                         capture_repo.py (a meeting's T:/D:/Q: lines into tasks and records,
                         once each, inside the note's save; injected into NoteRepository),
                         import_repo.py (applies an Outlook .ics: new, moved,
                         cancelled, removed; series go to their hub, the rest wait in To
                         file; attendees matched or made as people; <data>/import/ read at
                         start and when the calendar asks), time_repo.py (settings, holidays,
                         time off; gathers a week for the report; holiday_dates)
  files/                 folders.py (a synced OneDrive folder: OneDrive roots from the
                         environment, listing files and folders, paths kept inside the
                         folder, opening a file with this computer's program)
  calendar/              ics.py (reads Outlook's .ics: unfolding, its own VTIMEZONE rules,
                         then this computer's local time; pure), import_rules.py (skipped,
                         cancelled, moved, title, agenda, join link, attendees; pure)
  timesheet/             report.py (the week: each weekday exactly the working day in
                         quarter hours, overlaps shared, largest remainder, the rest to the
                         Default code; pure), holidays.py (rules like "4th Thu of Nov + 1",
                         observed Sat->Fri / Sun->Mon, the US seed list; pure)
  images/                formats.py: PNG/JPEG/GIF/WebP from magic bytes + size (SVG refused)
  notes/                 titles.py (title rules), hubs.py (FILE_KINDS: project, area,
                         resource; HUB_KINDS: project, area; a project's statuses and due
                         date), people.py (person
                         fields, roles, first/last name), seed.py + welcome.md (first-run
                         note), meetings.py (day, time), records.py (decision/question
                         kinds), links.py (a save's list of link texts), mentions.py (a
                         save's list of @mentions), tasks.py (a task's fields), plans.py (a
                         phase's dates, a move's reason), days.py (working days),
                         sessions.py (a block's day, start, end)
static/
  index.html             the main window (js/main.js): dashboards, pages, calendar, timesheet
  note.html              the note window (js/note-main.js): one note, written there
  vendor/katex-0.19.1/   KaTeX exactly as audited (package paths kept; checked against
                         docs/security/katex-0.19.1.sha256 by tests/python/test_vendor.py)
  vendor/mermaid-12.3.0/ Mermaid exactly as audited (same check, mermaid-12.3.0.sha256)
  css/                   dashboard.css (the main window's dashboard: sections flowing down
                         columns, long text folded under Show more),
                         gantt.css, plan-template.css, folder-page.css,
                         nord.css (palette variables and THE design tokens: --font-ui,
                         --font-mono, --fs-xs..xl, --sp-0..6, --text/-dim/-faint), base.css (the
                         page grid, color-scheme dark; one column under 1400 px), one file per component (topbar.css, navigator.css...)
                         (export.css styles only the exported file, never the app)
                         (editor.css is loaded inside <pd-editor>'s shadow root;
                         markdown.css styles rendered notes under .md-doc)
  js/boot.js             what both windows start with (connection, navigator, NotesApp)
  js/main.js             the main window: its pages, the dashboard, the Window menu
  js/note-main.js        the note window
  js/layout/main-keys.js THE main window's own key table (: gt gw)
  js/layout/navigator-parts.js  the navigator's pinned Today / Week and its save state
  js/palette/            palette-model.js (groups for what is typed: Recent, Pages, Notes,
                         Commands with their keys; pure), palette.js (the dialog), recent.js
                         (the notes opened last, per browser)
  js/layout/navigator.js the panel holding the tree: docked at 1400 px and wider, a drawer
                         over the note below that (inert while closed); NARROW_QUERY is the
                         one breakpoint, kept in step with the CSS
  js/notes/              app.js (NotesApp in either window: role "main" never edits and
                         sends other notes to the note window; role "note" sends pages to
                         the main window), api.js,
                         note-session.js (autosave, versions, conflicts), agenda.js (a
                         meeting's second text box, saved like the note), resolve.js (wiki
                         links, nearest note wins), links.js (wikiTargets: a body's link
                         texts, read by the renderer; linksInto: who links to a note, resolved
                         now; pure), mentions.js (@mentions: found by the renderer, with their
                         line and the lines indented under it; which person a name reaches;
                         who mentions a person; rewriting a renamed person's; pure),
                         capture.js (a meeting's T:/D:/Q: lines: kind, title, a name
                         first delegates, a name later is who I owe, !day; pure),
                         mention-actions.js (@ completion, opening a mention, the rename
                         rewrite), selection-menu.js (THE right-click menu in the text: Add
                         question… / Add decision… from the selection), link-index.js (the
                         page's copy: saves send links and mentions, stale notes caught
                         up after load), tasks.js (tasksIn: a text's "- [ ]" boxes: only
                         Markdown now, a template's become tasks; boxState/setBox; pure),
                         tree-model.js, tree-view.js (meetings, decisions, questions and
                         milestones left out; phases tagged), tree-keys.js
                         (THE tree key table), breadcrumb.js, commands.js (THE note ex
                         commands: :e :new :child :rename :parent :nav :project :area
                         :resource :inbox :inarea :archive :restore :people :newperson
                         :addperson :dropperson :org :job :email :phone :meetings :meeting :date
                         :attendee :dropattendee :decision :question :answered :reopen :with
                         :dropwith :task :template :dashboard :timecode :calendar :time :hub
                         :home :export :trash :trashed :find),
                         page-views.js (which page the main window shows: &home, &people,
                         &meetings, &trash, &calendar, &time, &template=ID; the URL flag
                         and Back),
                         hub-groups.js (THE PARA group table: Inbox, Projects, Areas,
                         Resources; then People, Templates and the Archive, folded by
                         default; phase, milestone and template kinds),
                         headings.js, note-menu.js (THE note menu on the open note's crumb:
                         which items show for which note; pure), note-actions.js (what the
                         menu, its dialogs and the Go to picker do: NotesApp methods),
                         images.js (editor "files" event -> shrink, upload, insert links)
  js/hubs/               prep.js (a meeting's Prep box); the page around the open note (a hub, person or meeting gets the card,
                         labels and sections; a decision or question the card and label; any
                         other note its label): hub-page.js (wiring; data-page on .app__note),
                         hub-line.js (the card: "Project ▾ · Active ▾ · due ... · Area: X",
                         People, Next meeting; a meeting's Attendees; a person's details; a
                         record's state, people and From), hub-line-controls.js (the card's
                         buttons: ▾ ✎ + ×, they only report), dash-head.js (a project's or
                         area's dashboard head: name, health badge, Outcome, Log status),
                         plan-strip.js (a project's phases in one strip, Gantt gp), hub-actions.js (what the card's
                         and the sections' buttons do: menus, pickers, dialogs, then the same
                         code as the ex commands; personDialog, personDetailsDialog,
                         answerDialog, newMeetingDialog, newRecordDialog), fields.js (THE field
                         table: the label over each text box per kind: Outcome, Purpose,
                         Agenda + Notes, Why, Answer, Notes), hub-panel.js (the sections: one
                         focus stop, headings fold, Show all), hub-sections.js (THE section
                         table and each kind's order: Plan, Projects, Tasks, Questions,
                         Decisions, Meetings, Files, Plan templates, Notes, People, Linked
                         from; a phase's Milestones; a plain note's Tasks and Files; a
                         person's Waiting on, Active, Archived, Backlinks; pure), dashboard.js (the main window: a hub's text
                         rendered with Edit ↗, a project's or an area's Gantt chart),
                         project-facts.js (status, due, next meeting texts;
                         pure), hub-areas.js (project <-> area; pure), hub-folds.js (folded
                         sections, remembered per kind), hub-keys.js (THE sections key table)
  js/today/              the Today page (the start page, &home): today-facts.js (today's
                         meetings, open questions, live projects by area, the Inbox; pure),
                         today-model.js (the Now block, the day's timeline with free gaps,
                         the ranked Up next, projects' status; pure), today-page.js (three
                         columns, one listbox), today-actions.js (what its keys run),
                         today-keys.js (THE Today key table), context-strip.js (the note
                         window's NOW strip)
  js/week/               capacity.js (working hours, a day's meetings / focus / free,
                         free gaps, the first free slot; pure), tray-model.js (the tray's
                         groups, the "due" strip, the week's totals; pure), week-page.js
                         (&week: the bar, Plan | Timesheet | Settings, time so far)
  js/pages/              list-page.js (a list page in place of the note: filters, search
                         box, one-focus-stop listbox), page-keys.js (THE key table of the
                         People and Meetings pages)
  js/people/             one-on-one.js (I owe them, to raise, next together; pure),
                         topic-commands.js (+ Add, Raised, Start 1:1 notes), api.js, people-model.js (who is on a hub, an area with its projects;
                         the People page filters; pure), people-page.js (the People page,
                         a ListPage), people-commands.js
  js/meetings/           api.js, prep-model.js (a meeting's prep: open questions with its
                         attendees, what they owe, last time; pure), meeting-days.js (local days, today/tomorrow, times, the
                         Period filter; pure), meetings-model.js (a hub's meetings, an area
                         with its projects', a person's; the page filters; pure),
                         meetings-page.js (a ListPage), meetings-commands.js
  js/records/            decisions and questions: api.js, records-model.js (a hub's, an
                         area's with its projects', a meeting's, a person's; the tab order:
                         decisions newest first, questions open first; pure),
                         records-commands.js
  js/images/             downscale.js: shrinks images wider than 1600 px on a canvas (GIFs
                         never); viewer.js: <pd-image-viewer>, a click on an image opens it
                         with its own zoom and pan; viewer-math.js (pure), viewer-keys.js
                         (THE viewer key table)
  js/math/typeset.js     draws the renderer's .md-math placeholders with KaTeX (audited
                         options, errors caught); ensureMathFonts() puts KaTeX's @font-face
                         in the page, since Chrome ignores it inside a shadow root
  js/diagrams/           mermaid.js: draws the renderer's .md-mermaid placeholders (Mermaid
                         loaded on first use, strict, one render at a time, cached by source;
                         onDiagramDrawn tells the editor to remeasure); work-area.js: the
                         off-screen element Mermaid lays out in; insert-svg.js: puts SVG in
                         under the CSP (constructed sheets + CSSOM styles, links allowlisted),
                         syncDiagramSheets keeps a root's sheets in step with its diagrams
  js/export/             :export, one self-contained .html file: scope.js (which linked notes
                         come along: beside, under, or under a note beside; pure),
                         render-notes.js (sections, links inside the file; pure), page.js (the
                         file + its own no-script CSP; pure), assets.js (MathML, cleaned SVG,
                         images as data: URLs, in an inert document), download.js, export.js
  js/status/             api.js, status-model.js (health, stale, since last log, the weekly
                         digest; pure), status-commands.js (Log status…, history, :log,
                         Copy weekly digest)
  js/ui/                 shared pieces that know nothing about notes: key-sequence.js
                         (two-key entries in a key table: gg, gp; pure), clipboard.js
                         (copyRich: HTML + text), dates.js (THE on-screen
                         day and time format: "Wed 25 Nov", 24-hour, the year only when not
                         this year; pure), menu.js (a popup menu
                         under a button), dialog.js (formDialog, confirmDialog on <dialog>:
                         errors show inside and keep it open), picker.js (a text box over a
                         filtered list; filterItems is pure), ui-keys.js (THE key table of
                         menus, pickers and dialogs), dom.js
  js/triage/             triage-model.js (the hub a note's links and mentions point to most;
                         the options; pure), triage-keys.js (THE triage key table), triage.js
                         (the Inbox one note at a time)
  js/trash/              api.js, trash-model.js (where a note goes back to, what must come
                         back first; pure), trash-page.js (the Trash page, a ListPage)
  js/connection/         connection.js (event stream + beacon), banner.js, tab-id.js (a key
                         per window kind: a popup copies its opener's sessionStorage),
                         changes.js (BroadcastChannel between the app's windows: "changed",
                         "open" a note)
  js/windows/note-window.js  the note window: the right third on a wide screen (>= 2400 CSS
                         px and > 2.1 times as wide as tall), else the whole screen, or as
                         the Window menu says; one window, reused; showMainWindow
  js/plan/               api.js, plan-model.js (phases, milestones, slip against the
                         baseline, history; pure), plan-rows.js (a chart's rows: project,
                         area, template; the Plan strip and Portfolio bars; pure),
                         plan-page.js (&plan: the full Gantt over a dashboard, gp), plan-commands.js (dialogs: new phase /
                         milestone, edit dates + why, history, apply / save templates),
                         template-page.js (a plan template's page in the main window)
  js/gantt/              gantt-model.js (axis, bars, drags; pure), gantt-view.js (the chart:
                         drag bars, ends, diamonds), gantt-keys.js (THE Gantt key table)
  js/templates/          api.js, template-text.js ({{date}} {{time}} {{title}} {{cursor}};
                         boxes become tasks; pure), template-commands.js
  js/resources/          Resources' folders: api.js, folders-model.js (folders, the notes in
                         each; pure), folder-commands.js (new note / folder, rename, move,
                         trash, move a note to a folder; pickers), folder-page.js (a folder's
                         page in the main window, &folder=ID)
  js/files/              api.js, files-model.js (a page's files; folders of a hub and its
                         area; pure), file-commands.js (link a folder, add, open, remove)
  js/tasks/              api.js, tasks-model.js (a page's tasks with subtask counts, never
                         rolled up past their project; waiting on; the calendar's open list
                         of mine and its filter; today's blocks; pure), task-commands.js
  js/calendar/           (the Week page's Plan) api.js (the import), week-model.js (days shown, the weekend rule,
                         blocks, side-by-side layout, 15-minute snap; pure), grid-view.js
                         (the week grid), drag.js (pointer drags: drop, move, resize),
                         task-sidebar.js (Tasks and To file), calendar-page.js (the page:
                         loading, menus, dialogs, the import), calendar-keys.js (THE
                         calendar key table)
  js/timesheet/          api.js, copy.js (the grid as HTML and tab-separated text; pure),
                         time-page.js (Week and Settings), time-keys.js (THE timesheet key
                         table)
  js/editor/             the <pd-editor> component:
    pd-editor.js         the custom element (hidden textarea takes keys; events out: change,
                         save, link, mention, menu, highlight, files, image...)
    completion.js        a list under the cursor in insert mode ("@" offers people; the
                         host gives the items)
    highlights.js        marks quoted text in rendered blocks with a badge (a record's source)
    render.js            draws visible lines, cursor, selection, matches, status line
    view.js              viewport math in steps: top line + skip rows, scrolloff, H/M/L
    text-layout.js       the layout interface (units of lines and their rows); plain text
    preview-layout.js    live preview layout: rendered units away from the cursor (pure)
    preview-units.js     text -> units (top-level blocks, lists split into items), raw ranges
    preview-measure.js preview-view.js   DOM: unit heights (cached), unit nodes (reused)
    vim.js               the engine: state + feed(key); no DOM
    keys.js              THE editor key table (normal, visual, insert, cmdline)
    parser.js            keys -> command (register, counts, operator, motion)
    command.js           runs normal/visual commands, records "." changes
    motions.js text-objects.js operators.js actions.js visual.js insert.js
    cmdline.js ex.js options.js put.js lines.js scroll.js
    buffer.js position.js words.js sentences.js brackets.js search.js
    registers.js undo.js marks.js key-names.js markdown-tokens.js errors.js
  js/markdown/           the Markdown renderer: pure, Markdown in, HTML string out, no DOM
    index.js             parseMarkdown, renderMarkdown, renderBlocks (blocks with source lines)
    blocks.js            block parser (CommonMark algorithm); block-types.js, block-starts.js
    lines.js lists.js tables.js callouts.js footnotes.js references.js
    render.js renderCode ```mermaid fences become .md-mermaid placeholders (source as text)
    math.js              the $ rules ($...$, $$...$$, $$ blocks); maths renders as a
                         placeholder holding the TeX, filled in by js/math/typeset.js
    inline.js            inline parser; delimiters.js (emphasis), autolinks.js (bare URLs),
                         mentions.js (@Name at a word start; never in code or links)
    link-syntax.js urls.js (scheme allowlist) escape.js slug.js
    render.js render-inline.js   tree -> HTML; every value escaped, no style="" attributes
docs/security/           vendor-audit.md (KaTeX + Mermaid go/no-go, conditions for use) and
                         one .sha256 manifest per audited vendor version
tests/python/            unittest; helpers.py runs a real server on a free port
tests/js/                index.html runner, harness.js, fakes.js, editor-helpers.js, test_*.js
                         (test_editor_vim_cases.js: key sequences checked against real Vim)
                         markdown-sample.html: dev-only page rendering every Markdown construct
                         preview-sample.html: dev-only live preview; ?keys=... feeds Vim keys
```
Update this section when the structure changes.

## How it launches and stops
- `paradigm.py` asks the port (`GET /api/ping`). If a Paradigm is there it opens a tab on it
  and exits. If another program is there it explains and exits. Otherwise it starts the server
  and opens the browser.
- Each tab holds one Server-Sent Events stream (`/api/events?tab=ID`) and sends a beacon
  (`POST /api/closing`) on `pagehide`. The server stops only when no tab is connected, the
  last tab to leave sent a beacon, and nothing reconnects within 10 s. A drop without a beacon
  (sleep, a sleeping tab) never stops it.
- `paradigm.pyw` runs under `pythonw.exe`, which opens no window. `sys.stdout`, `sys.stderr`
  and `sys.stdin` are `None` there, so never `print` or `input` without checking. Startup errors
  go to a message box (`notify.show_error_box`, using ctypes `MessageBoxW`) and to the log.
- If the stream is down for over 3 s, the page shows "Paradigm has stopped" and keeps retrying.
  When the server is back it reconnects by itself.
- Static files use an explicit content-type table, not `mimetypes`: on Windows the registry can
  turn `.js` into `text/plain`, and then browsers refuse to run the modules.
- `ParadigmServer` turns off `SO_REUSEADDR` on Windows, where it would let two servers share
  a port.

## Keys
- The editor is a real modal Vim on raw Markdown: normal, insert, visual and command-line modes,
  counts, operators + motions, text objects, `.`, registers and undo. Vim itself is the reference
  for its keys.
- Live preview (`:set preview`, on by default): blocks away from the cursor render; the block
  under the cursor, a visual selection and the incsearch match show raw. Lists split per item.
  A rendered block scrolls one step per row; a plain line is one step.
- **Tab / Shift-Tab: in insert mode they indent (spaces to the next shiftwidth stop) and
  unindent. In every other mode they leave the editor and move focus like on any web page**,
  so they are never bound there (Tyson's choice, 2026-11-21).
- Keys the browser owns (Ctrl-W, Ctrl-T, Ctrl-N, Ctrl-Tab, ...) are given up. Don't fight the browser.
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
  Active, Archived (folded), Backlinks). The page scrolls as a whole. Tab or `:hub` reaches
  the sections: one focus stop, headings fold (Enter or `z`, remembered per kind), long
  sections end in "Show all (n)"; its keys live in `static/js/hubs/hub-keys.js`. Each
  section that can grow has an add button (`add` in its row, and the `a` key); rows that are
  links have Role… / Remove (`r`, `x`); an open question has Answer… (`r`). New record types
  become new rows in `hub-sections.js`. `:inarea {area}` puts a project in an area; a note
  that stops being a project or area loses the link.
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
- People: a person is a top-level note (free text, notes under it) plus a `people` row with
  first and last name (the note's title is "First Last": changing either renames it, and the
  @mentions of the old name can follow after a confirm), email, phone, organisation and job
  title (`:org`, `:job`, `:email`, `:phone`), never written into the note. New person asks
  first and last name; `:newperson {name}` splits at the first space. On a hub,
  `:addperson[!] {name}[, {role}]` puts them on it (again: changes the role; `!` adds someone
  new) and `:dropperson {name}` takes them off. A person can't be filed or nested. Hubs have a
  People section (an area's includes its projects' people). A person's page: Active (live
  hubs with their role, meetings attended, decisions and questions they're on), Archived (the
  same, archived), Backlinks (notes that @mention them, with the lines, or [[link]] to them).
  `:people` or the People button opens the People page (filters: hub, role, organisation,
  name); its keys live in `static/js/pages/page-keys.js`. Archived people leave the People
  page and are muted; links survive trash and archive.
- @mentions: `@PriyaShah` (the full name without spaces) or `@Priya` (a first name only one
  live person has) in any note or agenda links to that person; case is ignored, `@` must start
  a word (an email is never one), code never holds one, and an unknown name stays text. The
  page reads them with the renderer and sends them with every save beside the wiki links
  (`note_mentions`: name, line, field, and context: the line and the lines indented under it).
  Typing `@` in insert mode offers people (`completion.js`); Enter puts in the full form; the
  last row adds someone new. A click on a rendered mention opens the person.
- People as 1:1 prep (2026-11-22): a person's dashboard: their head (name, job, organisation,
  email, how many projects; Next 1:1, the next meeting they attend; Start 1:1 notes: that
  meeting's agenda gets the topics still to raise, then it opens in the note window, or New
  meeting "1:1 First" with them), then three columns: Waiting on them, I owe them (my tasks
  for them: `tasks.for_person_id`, set by a T: line with a name later, `:t`, or Edit…'s For),
  To raise next 1:1 (topics: + Add, or an "@Name ?" line in any note; Raised (Space), x;
  then the open questions they are on); then Backlinks | Active, Archived. The People page:
  Open items (the default) / Everyone pills, columns Name, Role · organisation, On, Waiting on
  them (late in orange), I owe, To raise, Next together.
- Meetings: a meeting is a note directly under its hub (its title is its name, never its date;
  its text is the minutes) plus a `meetings` row (day, optional time, agenda) and attendees.
  Meetings in one hub may share a name (`title_shared`); `[[Weekly sync]]` reaches a plain
  note of that name, else the meeting made last (`resolve.js`). A meeting has no notes under it, and it can only move to another hub.
  `:meeting [{date}] [{time}] {title}` on a hub or any note in it makes one (today if no date;
  dates also `today`, `tomorrow`, `yesterday`). `:date {date} [{time}]` changes the date;
  `:attendee[!] {name}, {name}...` and `:dropattendee`. Its page: the card (date ✎, hub,
  Attendees × and + Add attendee), Agenda, Notes, then Questions and Decisions made from it.
  Hubs (an area: its projects' too) have a Meetings section, upcoming first; a person's are
  in Active / Archived. `:meetings` or the Meetings button opens the Meetings page (filters:
  hub, period, title), with the same keys as the People page (`static/js/pages/page-keys.js`).
- Note window strip and `:t` (2026-11-22): under the note window's breadcrumb, NOW (the task
  block on now: its time, what is left, a bar moving each minute) and Next: the meeting starting
  within 2 h (a link to it and its Prep); hidden when neither is near. `:t {text} [@Name]
  [!day]` puts a task on the open note's hub without leaving the note, read as a T: line (a
  name first: theirs to do; later: I owe them); while it is typed a hint over the command line
  says what it will make (`editor.hints`, pd-editor.js).
- Meeting capture (Tyson, 2026-11-22): in a meeting's Notes, a line "T: text", "D: text" or
  "Q: text" becomes a task, a decision or a question on the meeting's hub when it is saved, once
  (`task_sources` / `record_sources` hold the line; editing it later makes a new one, deleting
  it deletes nothing). In a T: line a name first delegates ("T: @Tom book the room"), a name
  later is someone I owe ("T: send @Tom the numbers"); `!fri`, `!tomorrow`, `!2026-12-01` set
  the due date (the coming day, today included). D:/Q: lines take their @names as people. Never
  inside code. Rendered, a captured line shows a TASK / DECISION / QUESTION badge in place of
  its prefix and what it made; while typing one a hint under the line says what it will make;
  the status line counts "N captured · N pending". A meeting's Prep box (under its card):
  open questions its attendees are on, what they owe (late first), last time (the same name in
  the same hub before it); Add all to agenda. The Meetings page: Upcoming / Past / Needs notes
  pills, grouped by day, columns When, Meeting, Hub, With, Prep; `}` `{` jump days, `p` only
  those with something to prep.
- Decisions and questions: each is a note directly under its hub (its title says it; its text
  is the Why, or the Answer) plus a row with its day, an answer day for a question, the people
  on it, and where it came from (`record_sources`: the source note or meeting and the quoted
  text). They are made from text: select it in any note inside a hub (drag with the mouse, or
  visual mode) and right-click (or Shift-F10, the Menu key): Add question… / Add decision…
  (`selection-menu.js`). The dialog has the text as the title, the meeting's day or today, and
  the people @mentioned in it. The note stays open; the quoted text gets a muted underline and
  a badge (Question / Answered / Decision; a click opens it). Not in a hub, the items are
  greyed with the reason. Each section's + New question / New decision, and `:decision
  [{date}] {title}` / `:question ...`, make one too (from the open note). `:answered [{date}]`,
  `:reopen`, `:date {date}`, `:with[!] {name}, ...`, `:dropwith {name}`. Answer… (the card's ▾,
  or a question row) writes the answer into the question's note and marks it answered. Hubs
  (an area: its projects' too), the meeting it came from and its people show them: Questions
  (open first, oldest first; then answered, muted) near the top of a hub's page, Decisions
  newest first; its own page shows its card ("From: Site checklist “...”", and when that text
  has changed since) and no sections.
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
  `gt` Today, `gw` the Week. `g` waits for a second key everywhere (as in Vim): `gg` is the
  first row in every list (`static/js/ui/key-sequence.js` reads two-key entries; a page-wide
  key clears a list's waiting `g`).
- Card controls: what the card shows can be changed there: a hub's kind (▾), a project's
  status (▾) and due date (✎; red once overdue) and area (✎, a picker) and people (+ Add
  person), a person's details (✎), a meeting's date and time and attendees, a record's date,
  a question's state (▾: Answer…, answered today / on a day, reopen), and the people on a
  record (× and + Add person). The person dialog adds someone new to People only when its
  button says "Add new person".
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
- Tasks (Tyson, 2026-11-22: records, not text; this replaced the `- [ ]` tasks): a task
  belongs to one note (a project, an area, a phase, a milestone, a meeting, any note) and is
  made in that page's Tasks section (+ New task, `a`, or `:task [!]{text}`, ! due today).
  One level of subtasks. A Tasks section lists a task once with "2/5 subtasks"; Enter (or a
  click) opens it in place: its subtasks, its notes and + Add subtask. Row buttons: Done
  (Space), Edit… (`e`: text, notes, due), Delegate… / Take back (`d`), Delete (`x`; a task
  with logged time keeps its row). A delegated task shows "→ Name, follow up …" (red past
  the follow-up day), leaves the calendar's task list, and is listed in Waiting on (Home and
  the person's page). Roll-up: a project lists its tasks and those of the notes inside it;
  an area lists its own only, and each of its projects in Projects with that project's
  counts (open tasks, decisions, open questions, next milestone).
- Next action: one open task per note is flagged NEXT (`n` or Make next on its row;
  `tasks.is_next`, one per note). With none flagged, the first open task of mine stands in
  (`nextAction` in `tasks-model.js`); on a project, its own flag beats one inside it (a
  phase's). It leads its Tasks section, is selected first, and shows in an area's Projects table. Questions and decisions
  roll up the same way. `- [ ]` in a note is plain Markdown again (a click still ticks it).
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
  an area's Projects table (Health, Latest status, Updated, Next action, Next milestone,
  Open). On hold beats it; none logged reads "—" / "log one"; stale at `Config.stale_days`
  (14). An area's dashboard: Projects across both lanes, then Portfolio (a bar per project),
  Tasks; Weekly digest on the right (Copy: Markdown + HTML).
- Dashboards (2026-11-22): a project's or area's head (name at `--fs-2xl`, health, Outcome or
  Purpose on one line, buttons), the card under it as its meta row, a project's Plan strip
  (phases as wide as their working days; done ✓, current, late underlined red, today's line);
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
- Time codes: a project or area has one on its card (`Time code: X ✎`, `(from area)` when a
  project books to its area's, else Set time code; `:timecode`). A resource or Inbox note has
  none: its time is listed as not counted.
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
- Timesheet (the Week page's Timesheet, `:time`): a code per row (with its hub) x Mon-Fri, each
  day exactly the working day (8.00 h) in quarter hours: holidays, time off and sick time first,
  then meetings and task blocks inside the working hours (not lunch), overlaps shared evenly,
  largest-remainder rounding, the rest to the Default code (its total orange past 30% of the
  week). Days after today are projected (italic). Beside it: Check before you submit, This
  week off, how it counts; under it, what made the chosen code (click a row). Copy for
  timesheet puts it on the clipboard as HTML and tab-separated text. Settings: the codes, the
  working day and lunch, holiday rules (US federal ones seeded; observed Sat->Fri, Sun->Mon),
  time off and sick days. Its keys live in `js/timesheet/time-keys.js`.
- Clicking a rendered image opens `<pd-image-viewer>` (its keys live in
  `static/js/images/viewer-keys.js`).
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
- App-level keys are designed fresh with Tyson, one feature at a time. Each scope has one central
  key table, and it is the only source for both the mappings and any help listing.

## Look
- Nord palette, defined as CSS variables in `static/css/nord.css`. Components use the variables,
  never raw hex values.
- Tokens (also `nord.css`): fonts only `--font-ui` (Segoe UI first) and `--font-mono` (Consolas
  first); sizes only `--fs-xs` 12, `--fs-sm` 13, `--fs-md` 15 (body), `--fs-lg` 18, `--fs-xl` 22;
  weights 400 and 600; spacing only `--sp-0`..`--sp-6` (2, 4, 8, 12, 16, 24, 32 px). Muted text
  uses `--text-dim` / `--text-faint`, never opacity. `color-scheme: dark` keeps native controls
  and scrollbars dark. Section headings are one style everywhere (sentence case, `--fs-sm`, 600).
- Titles beat details: in a row the detail shrinks first (`flex-shrink: 100`). Red marks only the
  signal (a dot, a date), never a whole row.
- Dates on screen go through `static/js/ui/dates.js` ("Wed 25 Nov", "14:00–15:00"); the API and
  ex commands keep "YYYY-MM-DD"; the timesheet's clipboard copy keeps "Mon 11/23".
- Links are nord8 (frost cyan). Headings are all nord13 (one colour, set apart from the
  nord4 text), never nord8: size, weight and a rule under H1 and H2 tell the levels apart
  (raw lines, one row high: an underline on H1 and H2).

## Web security (paradigm/web/security.py, applied in handler.py to every request)
- Any page open in the browser can send requests to 127.0.0.1, so before routing:
  - Every request must have Host `127.0.0.1:PORT` or `localhost:PORT`. This stops DNS rebinding.
  - `/api/` requests must not come from another site: a `Sec-Fetch-Site` of cross-site or
    same-site, or a foreign `Origin`, gets 403. This stops CSRF.
- **Every endpoint that reads or changes data must live under `/api/`.** That is what puts it
  behind the Origin check. Use POST (never GET) for anything that changes data.
- Every response carries a CSP (`default-src 'self'`, `frame-ancestors 'none'`), `nosniff`,
  `X-Frame-Options: DENY` and `Referrer-Policy: same-origin`. Never use `no-referrer`: under it
  browsers send `Origin: null` on POSTs and our own requests get refused.
- The CSP forbids inline scripts, inline `style=""` attributes, `eval` and outside URLs. Keep JS
  in modules and styles in `static/css/`.
- Event streams are capped at `Config.max_streams` (50); past that, 503.
- Every security change is checked in a real browser too. Unit tests cannot see what headers a
  browser actually sends (that is how the `Origin: null` problem was caught).

## Privacy and safety
- Notes are work data: colleagues' names, emails and meetings. Never commit `~/paradigm-notes`
  or any `.db` file, and never echo real names or emails.
- Test only on generated sample data in a temporary folder (`--data`), never on `~/paradigm-notes`.
- **Never name Tyson's employer** anywhere in the repo: code, comments, docs, CLAUDE.md, commit
  messages, tests or sample data. This holds **even when a prompt names it**. Use generic wording
  ("the company", "work") and made-up names (Acme, Northwind) instead. The repo is public.

## Testing (every feature, before reporting it done)
1. Python: `python -m unittest discover tests/python` passes (add `-W error::ResourceWarning`
   to catch unclosed sockets).
2. JS: browsers won't load ES modules from `file://`, so serve the repo root:
   `python -m http.server 8766 --bind 127.0.0.1`, then open `http://127.0.0.1:8766/tests/js/`.
   The page title becomes `PASS n` or `FAIL n/m`. Headless on Linux:
   `firefox --headless -no-remote -profile <fresh dir> --screenshot out.png <url>`. Use a fresh
   profile every time, because a reused one serves cached JS. The screenshot can fire before
   async tests end: instead put `user_pref("devtools.console.stdout.content", true);` in the
   profile's `user.js`, run `firefox --headless -no-remote -profile <dir> <url>` under a
   timeout, and read the `TESTS PASS n` / `FAIL ...` lines the harness logs.
3. Check the behaviour in a real browser on sample data, including the keys.
4. Report what was tested and what wasn't, such as Windows-specific behaviour Tyson must check
   at work.

## Working with Tyson
- One feature at a time. Discuss the design in prose in plan mode. He answers by rejecting
  ExitPlanMode with comments, so don't use multiple-choice popups for open design questions.
- Commit or push only when asked, straight to `main`. The work PC only pulls and never pushes.

## Backlog workflow
- `backlog.md` lists features as `- [ ] Feature`. Tyson writes and orders it.
- When Tyson types **"build feature"**: open `backlog.md` and take the first unchecked item.
  Plan it in plan mode, build it, test it (above), then mark it `- [x] Feature (done YYYY-MM-DD)`.
- Never reorder, reword or delete his items. Suggest new items in chat, and add them only when
  he agrees.

## Windows findings
Fill this in as we learn: Python version and source, browser, whether localhost is allowed, and
how the app is launched.
- Double-clicking `paradigm.py` works (2026-11-21). It opens a PowerShell console window, and
  closing that window stops the server.
- A refused connection to an empty local port takes about 2 s on Windows. Never probe a port
  before binding it: bind first, and probe only when the bind fails.
- Double-clicking `paradigm.pyw` works with no window. In Chrome, closing the last tab stops
  the server, with the security checks on (2026-11-21). The windowless process shows in Task
  Manager as `pythonw.exe`; `http://127.0.0.1:8765/api/ping` answers when it is running.
- Python 3.11.1. Browser: Chrome. Add `127.0.0.1` under Settings, Performance, "Always keep
  these sites active" so Memory Saver never unloads the app's tab.
- Vimium (and similar Vim extensions) catches Escape in text fields before the page sees it,
  so the editor stays in insert mode. Exclude `127.0.0.1` in the extension's settings
  (2026-11-21). The page cannot win this: the extension's handler runs first.
