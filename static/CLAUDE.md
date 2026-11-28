# static/ (the front end)

## Layout
Paths from the repo root. The editor's files are in `static/js/editor/CLAUDE.md`. Update this
layout when the structure here changes.
```
static/
  index.html             the main window (js/main.js): dashboards, pages, calendar, timesheet
  note.html              the note window (js/note-main.js): one note, written there
  diagram-frame.html     hidden frame Mermaid draws in (js/diagrams/frame-main.js); the one
                         page served with its own CSP (paradigm/web/CLAUDE.md)
  vendor/katex-0.19.1/   KaTeX exactly as audited (package paths kept; checked against
                         docs/security/katex-0.19.1.sha256 by tests/python/test_vendor.py)
  vendor/mermaid-12.3.0/ Mermaid exactly as audited (same check, mermaid-12.3.0.sha256)
  css/                   dashboard.css (the main window's dashboard: sections flowing down
                         columns, long text folded under Show more),
                         person-cards.css (a person's dashboard: the three cards in a
                         row, Notes and Together under them, stacked under 1400 px),
                         gantt.css, history.css (a project's History page: its bar, tabs, week
                         groups), plan-template.css, import-panel.css (the Week Plan's
                         Import panel over the greyed grid), folder-page.css, task-page.css (a
                         task's page: head, facts row, Notes beside a 24rem side column of
                         cards, stacked under 1000 px), oncall.css (the
                         On call tab, the Week bar's line, Today's rows, a person's head line),
                         sheet.css (the note window's sections sheet and its bar),
                         capture-sheet.css (the capture sheet and the strip under the editor),
                         diagram-picker.css (Insert diagram…: the types beside the block),
                         live.css (the Live page: its head, the caret, the cursor's band),
                         settings.css (the Settings page: its index and cards),
                         chip.css (THE status chip: .chip and its tones), key-hints.css
                         (THE key cap .key, the key-hint bar at the foot, the ? list),
                         follow-hints.css (f's labels: a fixed layer, a key cap per target),
                         tokens.css (THE design tokens: --font-ui, --font-mono, --fs-xs..2xl,
                         --sp-0..6, --radius-sm/md/lg; no colours), themes/ (one file per
                         theme, setting every role token under :root[data-theme="<id>"]:
                         nord-light.css, the default and the only row in the table;
                         nord-dark.css, kept complete on disk, out of the table;
                         _template.css lists every token with what it is for, never
                         loaded), base.css (the page grid; one column under 1400 px),
                         one file per component (topbar.css, navigator.css...)
                         (export.css styles only the exported file, never the app; it sets
                         color-scheme normal over the theme's, as the export always had)
                         (editor.css is loaded inside <pd-editor>'s shadow root;
                         markdown.css styles rendered notes under .md-doc)
  js/boot.js             what both windows start with (connection, navigator, NotesApp)
  js/main.js             the main window: its pages, the dashboard, the Settings gear
  js/note-main.js        the note window
  js/layout/main-keys.js THE main window's own key table (: gt gw gp gh gn g, f H L ?)
  js/layout/page-history.js  the tab's history with the app's step in each entry: H and L
                         say when there is no earlier or later page (pure)
  js/layout/view-keys.js which key table each main-window view reads (its hint bar, its ?
                         list) and the note window's short fixed hints; pure
  js/layout/navigator-parts.js  the navigator's pinned Today / Week and its save state
  js/live/               the Live page (&live): the note window's note rendered in the main
                         window as it is typed, with a caret where the cursor is:
                         caret.js (the cursor's sentinel in a field's raw text, bar or block,
                         none where no caret can sit; pure), live-sender.js (the note window:
                         a throttled "live" message on the windows' channel, answers
                         "live-ask", "live-closed" on pagehide; a task's notes' messages
                         carry task), live-page.js (the main
                         window: blocks drawn per line range, the caret and the band, empty /
                         closed / trashed lines, link, highlight and image clicks; a closed
                         note window that does not come back within 2 s asks to leave),
                         live-return.js (the page Live took over from, shown again when the
                         note window closes; pure),
                         highlights.js (a record's source text underlined with its badge, a
                         captured line's chip after it), agreed-card.js (a meeting's "Agreed in
                         this meeting" beside its Agenda and Notes, from the live message's
                         captures)
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
                         capture.js (:t's words: a name first delegates, a name later is who I
                         owe, !day; "@Name ?" topic lines; T:/D:/Q: lines are no longer read;
                         pure), capture-model.js (capture by key, \t \q \d: the title from a
                         line, who it names, the nearest hub, the default role and day, the
                         line marks, the chips, the Agreed rows; pure), capture-sheet.js (the
                         sheet docked at the foot of the note window's editor),
                         capture-sheet-keys.js (THE capture sheet key table),
                         capture-actions.js (the note window's \t \q \d \u, marks and the
                         "From this meeting" strip; the open note's captures),
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
                         :dropwith :task :attach :template :diagram :dashboard :plan :timecode :calendar :time :oncall :hub
                         :home :live :export :trash :trashed :find),
                         screen-note.js (the note on screen, which every "this note" command
                         acts on: a main-window page hides the dashboard; Live is the note
                         window's note; pure),
                         page-views.js (which page the main window shows: &home, &people,
                         &meetings, &trash, &calendar, &time, &live, &template=ID, &folder=ID,
                         &task=ID, &settings (the old &week=settings too); the URL flag and Back),
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
                         People, Next meeting, not on a project's main-window dashboard; a
                         meeting's Attendees; a person's details; a record's state, people
                         and From), hub-line-controls.js (the card's buttons: ▾ ✎ + ×, they
                         only report), dash-head.js (the dashboard head: an area's name,
                         health badge, Outcome, Log status; a project's name, health chip,
                         last status and its age, Log status S, Open in note window ↗,
                         History g h, ···, then its facts row: Due, Next milestone, Area,
                         People, Time code; a person's: avatar, Role · Org, email, NEXT 1:1,
                         Before that),
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
                         from; a meeting's Agreed in this meeting (its captures, in place of
                         its Questions and Decisions); a phase's Milestones; a plain note's Tasks and Files; a
                         person's They owe me, I owe, To raise (three cards in a row on the
                         dashboard), Notes and Together (Backlinks and Archived unfold under
                         it); pure), dashboard.js (the main window: a hub's text
                         rendered with Edit ↗, a project's or an area's Gantt chart),
                         project-facts.js (status, due, next meeting texts; a project's
                         head: due in n days, next milestone, its chip, initials; pure),
                         hub-areas.js (project <-> area; pure), hub-folds.js (folded
                         sections, remembered per kind), hub-keys.js (THE sections key table;
                         page: "person" rows work only on a person's page: Tab, a, r, n, o)
  js/history/            a project's History page (&history=ID, g h): history-model.js (every
                         dated thing it has as rows by week, tabs, counts, search, pages of 4
                         weeks, historyCounts: the counts a project page's footers say; pure),
                         history-page.js (the bar, the weeks, more drawn near the foot),
                         history-keys.js (THE History key table)
  js/today/              the Today page (the start page, &home): today-facts.js (today's
                         meetings, open questions, live projects by area, the Inbox; pure),
                         today-model.js (the Now block, the day's timeline with free gaps
                         and To file events, the free time left, Up next: today's follow-ups
                         first, then ranked; projects' status; pure), today-page.js (three
                         columns, one listbox, the Import panel over the day; the key-hint
                         bar follows its cursor), today-actions.js (what its keys run, the
                         import),
                         today-keys.js (THE Today key table), context-strip.js (the note
                         window's NOW strip)
  js/week/               capacity.js (working hours, a day's meetings / focus / free,
                         free gaps, the first free slot, working days on, days off and
                         their chips; pure),
                         tray-model.js (the tray's groups, the "due" strip, the week's
                         totals; pure), week-page.js
                         (&week: the bar, Plan | Timesheet | On call, time so far)
  js/pages/              list-page.js (a list page in place of the note: filters, search
                         box, one-focus-stop listbox), page-keys.js (THE key table of the
                         People and Meetings pages)
  js/people/             one-on-one.js (I owe them, to raise; still to come by the clock:
                         next together, the next 1:1, Before that, last together, this
                         month's meetings; pure),
                         topic-commands.js (+ Add, Raised, Start 1:1 notes), api.js, people-model.js (who is on a hub, an area with its projects;
                         the People page filters, Sort and footnote; matchPerson, who a typed
                         name means; pure), people-page.js (the People page, a ListPage),
                         people-commands.js
  js/meetings/           api.js, prep-model.js (a meeting's prep: open questions with its
                         attendees, what they owe, last time; pure), meeting-days.js (local days, today/tomorrow, times, the
                         Period filter, meetingEnded, splitMeetings: coming and ended; pure),
                         meetings-model.js (a hub's meetings, an area
                         with its projects', a person's; the page filters; pure),
                         meetings-page.js (a ListPage), meetings-commands.js
  js/records/            decisions and questions: api.js, records-model.js (a hub's, an
                         area's with its projects', a meeting's, a person's; the tab order:
                         decisions newest first, one decisionOrder everywhere, questions
                         open first; pure),
                         records-commands.js
  js/images/             downscale.js: shrinks images wider than 1600 px on a canvas (GIFs
                         never); viewer.js: <pd-image-viewer>, a click on an image opens it
                         with its own zoom and pan; viewer-math.js (pure), viewer-keys.js
                         (THE viewer key table)
  js/math/typeset.js     draws the renderer's .md-math placeholders with KaTeX (audited
                         options, errors caught, groups nested past 100 refused first); ensureMathFonts() puts KaTeX's @font-face
                         in the page, since Chrome ignores it inside a shadow root
  js/diagrams/           mermaid.js: draws the renderer's .md-mermaid placeholders (Mermaid
                         loaded on first use, strict, one render at a time, cached by source,
                         ‹blanks› drawn unwrapped; onDiagramDrawn tells the editor to remeasure); frame-client.js: the
                         window's hidden diagram frame, Mermaid's {initialize, render} over
                         postMessage, 20 s per diagram; frame-main.js + frame-listener.js: the
                         frame page's side (Mermaid loaded there, answers only its parent at
                         our origin); work-area.js: the off-screen element in the frame that
                         Mermaid lays out in; insert-svg.js: puts SVG in
                         under the CSP (constructed sheets + CSSOM styles, links allowlisted),
                         syncDiagramSheets keeps a root's sheets in step with its diagrams;
                         mermaid-types.js (every type the vendored Mermaid draws: keyword,
                         name, line, a template with ‹blanks›; how Mermaid detects the type;
                         the picker's groups; pure), mermaid-syntax.js (what can be typed in
                         a mermaid block by type and place, mermaidContext, the status line's
                         words; pure), mermaid-syntax-tables.js (its rows, one table per
                         type, and the names a block uses; pure), mermaid-help.js (wires
                         both into the note window's editor), insert-diagram.js (the
                         Insert diagram picker, :diagram)
  js/theme/themes.js     THE theme table (id, label, file, colorScheme), DEFAULT_THEME,
                         themeOf, currentTheme (<html data-theme>), applyTheme; no switcher yet
  js/export/             :export, one self-contained .html file: scope.js (which linked notes
                         come along: beside, under, or under a note beside; pure),
                         render-notes.js (sections, links inside the file; pure), page.js (the
                         file + its own no-script CSP; pure), assets.js (MathML, cleaned SVG,
                         images as data: URLs, in an inert document), download.js, export.js
                         (inlines tokens.css, the current theme's file, markdown.css and
                         export.css; the file's <html> carries the same data-theme)
  js/status/             api.js, status-model.js (health and its labels: On track,
                         At risk, Off track (stored blocked), stale, since last log, the weekly
                         digest; pure), status-commands.js (Log status…, history, :log,
                         Copy weekly digest)
  js/ui/                 shared pieces that know nothing about notes: chip.js (THE status
                         chip), chip-tones.js (a state or kind -> its tone; pure), avatar.js
                         (a person's initials in a circle),
                         key-hints.js (the key-hint bar from a table's hint:/label:; key
                         caps; pure apart from drawing), keys-dialog.js (the ? list),
                         follow-hints.js (f's follow mode: labels for n targets, reading
                         order, what typed letters reach; pure), follow-overlay.js (the
                         targets in view, their labels, its keys, a target clicked or
                         pressed; installed before the window's keys),
                         key-sequence.js
                         (two-key entries in a key table: gg, gp; pure), column-target.js
                         (h l on a page of columns: the nearest column that way with rows,
                         its row nearest in height; on a dashboard, only the lanes beside on
                         screen; Today, dashboards, the task page; pure),
                         clipboard.js
                         (copyRich: HTML + text), dates.js (THE on-screen
                         day and time format: "Wed 25 Nov", "Thu 26" (dayText, month: false),
                         "23–29 Nov" (weekRange), 24-hour, the year only when not this year;
                         pure), menu.js (a popup menu
                         under a button), dialog.js (formDialog, confirmDialog on <dialog>:
                         errors show inside and keep it open; a blocked submit; key caps on
                         the buttons; anchor: opens under an element), picker.js (a text box over a
                         filtered list; filterItems is pure), ui-keys.js (THE key table of
                         menus, pickers and dialogs), dom.js (restoreFocus; data-focus-key:
                         focusedKey, focusFirstKey, keysAfterRemoving, so a part drawn again
                         puts the focus back on the same button or the next row's), rendered-text.js (rendered
                         Markdown in the main window, the dashboard's and the Live page's:
                         maths and diagrams drawn, links to notes open the note)
  js/triage/             triage-model.js (the hub a note's links and mentions point to most;
                         the options; pure), triage-keys.js (THE triage key table), triage.js
                         (the Inbox one note at a time)
  js/trash/              api.js, trash-model.js (where a note goes back to, what must come
                         back first; pure), trash-page.js (the Trash page, a ListPage)
  js/connection/         connection.js (event stream + beacon), banner.js, tab-id.js (a key
                         per window kind: a popup copies its opener's sessionStorage),
                         changes.js (BroadcastChannel between the app's windows: "changed",
                         "open" a note or a task's notes, "place" the note window)
  js/windows/note-window.js  the note window: the right third on a wide screen (>= 2400 CSS
                         px and > 2.1 times as wide as tall), else the whole screen, or as
                         Settings says; one window, reused; showMainWindow;
                         placed again once note.html loads (first load only) and from
                         Settings' Right third: move, resize, move again (Chrome clamps each
                         step to the screen, so it can't grow past it by Windows' invisible
                         border), left edge on a whole device pixel (all whole CSS px; no
                         rounding when the page is zoomed)
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
                         file-commands.js (Add file…: the server's native file dialog, then
                         attach to a note or a task, offering to link a folder not linked
                         yet; Search linked
                         files…, link and unlink a folder, open, remove), folder-browser.js
                         (the in-app folder browser when the native dialog can't open),
                         folder-browser-model.js (its rows, paths, filter; pure),
                         folder-browser-keys.js (THE folder browser key table)
  js/tasks/              api.js, tasks-model.js (a page's tasks with subtask counts at every
                         level, never rolled up past their project; subtasks nest up to
                         MAX_TASK_DEPTH; taskTree, J/K's moveTarget; waiting on; the calendar's
                         open list of mine and its filter; today's blocks; pure),
                         task-commands.js, task-page.js (a task's page in the main window,
                         &task=ID: breadcrumb, head, Notes | the side column; one listbox),
                         task-head.js (title, chips, Done / Schedule / Delegate / Edit… / ···,
                         the facts row), task-side.js (the cards, their order, Subtasks),
                         task-files.js (the Files card: Add file…, open, x unlinks),
                         task-history.js (the From and History cards), task-page-model.js
                         (chips, facts, Next block, s's slot and words, the cards' lines;
                         pure), task-page-keys.js (THE task page key table),
                         follow-up-model.js (Followed up…'s words, days and the carried
                         chip; pure), follow-up-dialog.js (Followed up…, c, r: a follow-up
                         logged, closed or followed up again), emails-api.js,
                         emails-model.js (an email row's chip, sender line, link; the reply
                         cycle; pure), task-emails.js (the Emails card, .msg drops on the
                         task page, :attach), task-notes-session.js (a task's notes in the
                         note window, ?task=ID: load, autosave, :w, the crumb, the channel's
                         messages; the session pure), task-notes-live.js (the task page's
                         "Live · editing in the note window" chip and the notes as typed)
  js/calendar/           (the Week page's Plan) api.js (the import: .ics uploads only, no
                         folder), week-model.js (days shown, the weekend rule,
                         blocks, side-by-side layout, 15-minute snap; pure), grid-view.js
                         (the week grid), drag.js (pointer drags: drop, move, resize),
                         task-sidebar.js (Tasks and To file), calendar-page.js (the page:
                         loading, menus, dialogs, the import), import-panel.js (the Import
                         panel greying the grid while today isn't imported; Today's too), import-state.js
                         (when it shows, Plan without it by day, its texts; pure),
                         import-upload.js (the import's browser side, Today's too: the .ics
                         picker, one upload per file, the stored Plan without it / Not today day),
                         calendar-keys.js (THE Plan tab's key table; its gt, the tray,
                         shadows the window's gt there)
  js/oncall/             the on-call rota: sheet.js (the Excel sheet: header dates in many
                         forms, month/day, nearest year; each column its date's Monday; pure),
                         oncall-model.js (Rota, names to people: "First Last", "Last, First", a
                         unique first name; a person's next week; the Week bar's line; the
                         paste's preview and the changed names it replaces; changed cells by
                         the row's changed flag; pure), oncall-page.js (the Week's On call
                         tab; Change… a cell's name in a dialog under it; a redraw keeps the
                         focused cell), oncall-keys.js (THE On call key table), api.js
  js/timesheet/          api.js, copy.js (the grid as HTML and tab-separated text; pure),
                         time-page.js (the week's grid), time-settings.js (Codes and hours,
                         Holidays, Time off: the Settings page's cards), time-keys.js (THE
                         timesheet key table)
  js/settings/           the Settings page (&settings: the gear, g , and :settings):
                         settings-model.js (the sections, the index's lit entry, the note
                         window's choices, the linked folders' rows; pure), settings-page.js
                         (the index and the cards), settings-keys.js (THE Settings key table),
                         about-api.js (/api/about: the data folder)
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
- The key-hint bar at the foot of each view shows a table's entries that carry `hint:` (its
  words); `label:` is the key cap when the first key alone would mislead (`"j k"`). Every
  cap must name keys its table binds (`tests/js/test_key_hints.js`). `?` in the main window
  lists the view's whole table (`layout/view-keys.js` says which table a view reads).
- Status (overdue, blocked, on track...) and kinds (task, decision...) show as the shared chip
  (`ui/chip.js`), toned by `ui/chip-tones.js`; never a page's own badge.

## Look
- Colours are role tokens (`--surface-*`, `--text-*`, `--border-*`, `--link`, `--accent`,
  `--state-*`, `--kind-*`, `--chart-*`...), set per theme in `static/css/themes/` and picked by
  `<html data-theme>` (the table: `static/js/theme/themes.js`). Components use only the role
  tokens, named by what the colour is for: never `--nordN` (a theme's own primitives) and never
  raw hex or `rgb()` (`tests/python/test_theme_tokens.py` fails on them). A new role goes in
  `_template.css` with its comment and in every theme.
- Nord Light is the default (Tyson, 2026-11-26): its text tokens reach 4.5:1 on page, raised,
  sunken, hover, selected and input, and focus 3:1 (`tests/python/test_theme_contrast.py`).
  White text on danger uses `--state-danger-fill`, never `--state-danger-solid`; a visible input
  edge is `--border-control`. Muted things wash their fill with the page (a `color-mix`
  gradient), never `opacity` on text.
- One focus ring (Tyson, 2026-11-27): a button-like control's `:focus-visible` is
  `outline: 2px solid var(--border-focus); outline-offset: 1px` (inside, `-2px`, where the
  parent scrolls); a background tint is for hover only. List rows keep the inset `--focus-ring`.
- Tokens (`tokens.css`): fonts only `--font-ui` (Segoe UI first) and `--font-mono` (Consolas
  first); sizes only `--fs-xs` 12, `--fs-sm` 13, `--fs-md` 15 (body), `--fs-lg` 18, `--fs-xl` 22;
  weights 400 and 600; spacing only `--sp-0`..`--sp-6` (2, 4, 8, 12, 16, 24, 32 px). Muted text
  uses `--text-dim` / `--text-faint`, never opacity. The theme's `color-scheme` keeps native
  controls and scrollbars in step. Section headings are one style everywhere (sentence case, `--fs-sm`, 600).
- Titles beat details: in a row the detail shrinks first (`flex-shrink: 100`). Red marks only the
  signal (a dot, a date), never a whole row.
- Dates on screen go through `static/js/ui/dates.js` ("Wed 25 Nov", "14:00–15:00"); the API and
  ex commands keep "YYYY-MM-DD"; the timesheet's clipboard copy keeps "Mon 11/23".
- Links are `--link`. Headings are all `--text-heading` (one colour, set apart from the
  body text), never `--link`: size, weight and a rule under H1 and H2 tell the levels apart
  (raw lines, one row high: an underline on H1 and H2).
