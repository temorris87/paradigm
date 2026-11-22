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
                         notes.py; images.py (raw-bytes upload, GET /api/image?id=N cached)
  db/                    (migrations: 001 notes, 002 images, 003 notes.kind for PARA hubs,
                         004 notes.area_id: a project's area)
                         connection.py (one locked connection, transactions, VACUUM at start
                         when worth it), migrate.py
                         (migrations/NNN_name.sql, PRAGMA user_version), notes_repo.py,
                         images_repo.py (image bytes in SQLite, deduped per note by sha256;
                         sweep_unused deletes images no note links to, at start and stop only)
  images/                formats.py: PNG/JPEG/GIF/WebP from magic bytes + size (SVG refused)
  notes/                 titles.py (title rules), hubs.py (HUB_KINDS: project, area,
                         resource), seed.py + welcome.md (first-run note)
static/
  index.html
  vendor/katex-0.19.1/   KaTeX exactly as audited (package paths kept; checked against
                         docs/security/katex-0.19.1.sha256 by tests/python/test_vendor.py)
  vendor/mermaid-12.3.0/ Mermaid exactly as audited (same check, mermaid-12.3.0.sha256)
  css/                   nord.css (palette variables), base.css (the page grid; one column
                         under 1400 px), one file per component (topbar.css, navigator.css...)
                         (export.css styles only the exported file, never the app)
                         (editor.css is loaded inside <pd-editor>'s shadow root;
                         markdown.css styles rendered notes under .md-doc)
  js/main.js             wires the page together
  js/layout/navigator.js the panel holding the tree: docked at 1400 px and wider, a drawer
                         over the note below that (inert while closed); NARROW_QUERY is the
                         one breakpoint, kept in step with the CSS
  js/notes/              app.js (tree + breadcrumb + editor on the open note), api.js,
                         note-session.js (autosave, versions, conflicts), resolve.js (wiki
                         links, nearest note wins), tree-model.js, tree-view.js, tree-keys.js
                         (THE tree key table), breadcrumb.js, commands.js (THE note ex
                         commands: :e :new :child :rename :parent :nav :project :area
                         :resource :inbox :inarea :hub :export :trash), hub-groups.js (THE
                         PARA group table: Inbox, Projects, Areas, Resources), headings.js,
                         images.js (editor "files" event -> shrink, upload, insert links)
  js/hubs/               the hub page (shown only while a hub is open): hub-page.js (wiring;
                         data-hub-size on .app__note), hub-line.js ("Project · Area: X"),
                         hub-panel.js (tabs + one-focus-stop listbox), hub-tabs.js (THE hub
                         tab table: Notes, an area's Projects; pure), hub-areas.js (project
                         <-> area; pure), hub-size.js (collapsed/open/expanded, remembered),
                         hub-keys.js (THE section panel key table)
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
  js/connection/         connection.js (event stream + beacon), banner.js, tab-id.js
  js/editor/             the <pd-editor> component:
    pd-editor.js         the custom element (hidden textarea takes keys; events out)
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
    inline.js            inline parser; delimiters.js (emphasis), autolinks.js (bare URLs)
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
- PARA hubs: only top-level notes are hubs (`notes.kind`: project, area, resource; NULL is the
  Inbox). `:project` etc. on a nested note moves it to the top; moving a hub under a note
  unfiles it. Groups never appear in paths or links, and top-level titles stay unique.
  The tree's top level is the four groups (folded state remembered per browser).
- Hub page: a hub shows a hub line under the breadcrumb and a tabbed section panel under the
  note (Notes: the whole subtree; Projects on areas). `:hub` or Tab reaches the panel; its keys
  live in `static/js/hubs/hub-keys.js`. `-`/`+` size it (collapsed, open, expanded; expanded
  hides the editor). New record types become new rows in `hub-tabs.js`. `:inarea {area}` puts
  a project in an area; a note that stops being a project or area loses the link.
- The notes tree is reached with `:nav` or the ☰ button in the top bar. Under 1400 px wide it
  is a drawer: it opens over the note and closes on Enter (opening a note), Escape, a click on
  the backdrop, or the focus leaving it.
- Clicking a rendered image opens `<pd-image-viewer>` (its keys live in
  `static/js/images/viewer-keys.js`).
- An image is deleted from the database once no note (trashed ones included) links to it any
  more, but only when Paradigm starts or stops: while a tab is open, `u` or `p` can bring a
  deleted link back.
- App-level keys are designed fresh with Tyson, one feature at a time. Each scope has one central
  key table, and it is the only source for both the mappings and any help listing.

## Look
- Nord palette, defined as CSS variables in `static/css/nord.css`. Components use the variables,
  never raw hex values.
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
   profile every time, because a reused one serves cached JS.
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
