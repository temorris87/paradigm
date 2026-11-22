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
- [ ] Archive and restore a hub with everything in it; collapsed Archive section; links to
  archived notes look muted
- [ ] People: a shared directory with their own notes, linked to hubs with a role; a People tab
  on hubs and a People page with filters
- [ ] Meetings: dated meetings in one hub with attendees and a note for minutes; a Meetings tab on
  hubs and people, a Meetings page, filter dropdowns (hub, period; an area includes its projects)
- [ ] Decisions and open questions: records in a hub (optionally from a meeting, with people); a
  Decisions tab and a Questions tab (open first) on hubs, meetings and people
- [ ] Backlinks: an index of wiki links; a Linked from tab on resources (and any note later)
- [ ] Home: active projects by area, the Inbox count, open questions, and room for today's tasks
  and meetings
