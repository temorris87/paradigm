# paradigm

A web-based work-notes app with Vim-style keys. A local Python 3 server (standard library only)
serves a vanilla HTML/CSS/JS front end in the browser; notes live in a SQLite database.
User: Tyson. It is a fresh project, independent of `../worknotes` (no shared code, data format or
keybindings).

## Hard rules
- **Python 3 standard library only.** Target 3.9+ until the work PC's version is known.
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
paradigm.py              entry: starts the server, opens the browser (--port, --data, --no-browser)
paradigm/                Python package
  config.py              settings and paths
  server.py              ThreadingHTTPServer + router
  api/                   JSON handlers
  db/                    connection.py, migrations/, repositories
static/
  index.html
  css/                   nord.css (palette variables), one file per component
  js/main.js
  js/editor/             pd-editor.js (Web Component), buffer.js, modes.js, keymap.js,
                         motions.js, operators.js, textobjects.js, registers.js, undo.js,
                         commandline.js, render.js
tests/python/            unittest: python -m unittest discover tests/python
tests/js/                index.html runner + small assert harness; open it in any browser
```
Update this section when the structure changes.

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

## Testing (every feature, before reporting it done)
1. Python: `python -m unittest discover tests/python` passes.
2. JS: `tests/js/index.html` passes in a browser.
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
