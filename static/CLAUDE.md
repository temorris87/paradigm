# static/ (the front end)

## Layout
Paths from the repo root. The editor's files are in `static/js/editor/CLAUDE.md`. Update this
layout when the structure here changes.
```
static/
  index.html             the main window (js/main.js): dashboards, pages, calendar, timesheet
  note.html              the note window (js/note-main.js): one note, written there
  vendor/katex-0.19.1/   KaTeX exactly as audited (package paths kept; checked against
                         docs/security/katex-0.19.1.sha256 by tests/python/test_vendor.py)
  vendor/mermaid-12.3.0/ Mermaid exactly as audited (same check, mermaid-12.3.0.sha256)
  css/                   dashboard.css (the main window's dashboard: sections flowing down
                         columns, long text folded under Show more),
                         gantt.css, plan-template.css, folder-page.css, oncall.css (the On call
                         tab, the Week bar's line, Today's rows, a person's head line),
                         sheet.css (the note window's sections sheet and its bar),
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
                         :dropwith :task :template :dashboard :plan :timecode :calendar :time :oncall :hub
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
                         focus stop, headings fold, Show all), section-sheet.js (the note
                         window's sheet: the bar of counts, open / close, its focus rules),
                         section-summary.js (the bar's counts: "Tasks 3 (1 late)"; pure),
                         hub-sections.js (THE section
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
                         area; a folder's summary and the unlink confirm's text; pure),
                         file-commands.js (link and unlink a folder, add, open, remove)
  js/tasks/              api.js, tasks-model.js (a page's tasks with subtask counts, never
                         rolled up past their project; waiting on; the calendar's open list
                         of mine and its filter; today's blocks; pure), task-commands.js
  js/calendar/           (the Week page's Plan) api.js (the import), week-model.js (days shown, the weekend rule,
                         blocks, side-by-side layout, 15-minute snap; pure), grid-view.js
                         (the week grid), drag.js (pointer drags: drop, move, resize),
                         task-sidebar.js (Tasks and To file), calendar-page.js (the page:
                         loading, menus, dialogs, the import), calendar-keys.js (THE
                         calendar key table)
  js/oncall/             the on-call rota: sheet.js (the Excel sheet: header dates in many
                         forms, month/day, nearest year; each column its date's Monday; pure),
                         oncall-model.js (Rota, names to people: "First Last", "Last, First", a
                         unique first name; a person's next week; the Week bar's line; the
                         paste's preview; pure), oncall-page.js (the Week's On call tab),
                         oncall-keys.js (THE On call key table), api.js
  js/timesheet/          api.js, copy.js (the grid as HTML and tab-separated text; pure),
                         time-page.js (Week and Settings), time-keys.js (THE timesheet key
                         table)
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
```

## Keys
- Keys the browser owns (Ctrl-W, Ctrl-T, Ctrl-N, Ctrl-Tab, ...) are given up. Don't fight the browser.
- Clicking a rendered image opens `<pd-image-viewer>` (its keys live in
  `static/js/images/viewer-keys.js`).
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
