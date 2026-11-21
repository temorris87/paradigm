# paradigm

A web-based work-notes app with Vim-style keys. A local Python 3 server (standard library only)
serves a vanilla HTML/CSS/JS front end in the browser; notes live in a SQLite database.
User: Tyson. It is a fresh project, independent of `../worknotes` (no shared code, data format or
keybindings).

## Hard rules
- **Python 3 standard library only.** Target 3.9+ until the work PC's version is known:
  no `match`, no `X | Y` type hints. Check with `ast.parse(src, feature_version=(3, 9))`.
  No pip packages.
- **Vanilla HTML/CSS/JS only:** ES modules loaded straight from `static/`. No npm, no CDN, no
  frameworks, no build step, no calls to outside networks.
- **Runs on Windows, Mac and Linux.** The main machine is a Windows work PC. Use `pathlib` for
  paths, pass `encoding="utf-8"` explicitly, write `\n` line endings, and never assume a shell.
  Launch with `python paradigm.py` (`py paradigm.py` on Windows). `.bat` files are not allowed.
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
paradigm.py              entry: python paradigm.py [--port N] [--data DIR] [--no-browser]
paradigm/                Python package
  app.py                 startup / shutdown wiring (main, run, build_server)
  config.py              Config + argparse (port 8765, data ~/paradigm-notes)
  instance.py            probe the port: free / a running Paradigm / another program
  presence.py            open tabs and the shutdown rule (pure logic, injected clock)
  logging_setup.py       console + <data>/paradigm.log
  web/                   server.py (ThreadingHTTPServer), handler.py, router.py,
                         static.py (serves static/), responses.py
  api/                   JSON endpoints; session.py = /api/ping, /api/events, /api/closing
  db/                    (to come) connection.py, migrations/, repositories
static/
  index.html
  css/                   nord.css (palette variables), base.css, one file per component
  js/main.js             wires the page together
  js/connection/         connection.js (event stream + beacon), banner.js, tab-id.js
  js/editor/             (to come) the <pd-editor> component
tests/python/            unittest; helpers.py runs a real server on a free port
tests/js/                index.html runner, harness.js, fakes.js, test_*.js
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
- **Tab / Shift-Tab leave the editor and move focus like on any web page.** They are never
  editor keys.
- Keys the browser owns (Ctrl-W, Ctrl-T, Ctrl-N, Ctrl-Tab, ...) are given up. Don't fight the browser.
- App-level keys are designed fresh with Tyson, one feature at a time. Each scope has one central
  key table, and it is the only source for both the mappings and any help listing.

## Look
- Nord palette, defined as CSS variables in `static/css/nord.css`. Components use the variables,
  never raw hex values.
- Links are nord8 (frost cyan). Each heading level gets its own colour, never nord8.

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
- (unknown yet)
