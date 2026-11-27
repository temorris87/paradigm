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

## Privacy and safety
- Notes are work data: colleagues' names, emails and meetings. Never commit `~/paradigm-notes`
  or any `.db` file, and never echo real names or emails.
- Test only on generated sample data in a temporary folder (`--data`), never on `~/paradigm-notes`.
- **Never name Tyson's employer** anywhere in the repo: code, comments, docs, CLAUDE.md, commit
  messages, tests or sample data. This holds **even when a prompt names it**. Use generic wording
  ("the company", "work") and made-up names (Acme, Northwind) instead. The repo is public.

## Working with Tyson
- One feature at a time, or one batch of them (`/features`). Discuss the design in prose in
  plan mode. He answers by rejecting ExitPlanMode with comments, so don't use multiple-choice
  popups for open design questions.
- Commit or push only when asked, straight to `main`. The work PC only pulls and never pushes.
- **A push is done only when CI on it is green.** After every `git push`, the `ci-check` hook
  (`tools/claude_hooks.py`, `tools/ci_check.py`) waits for the GitHub Actions run on the pushed
  commit. A red run comes back with its failing jobs and error lines: diagnose it, fix it, commit
  and push again, and tell Tyson what failed. If CI could not be verified (no `gh`, signed out, no
  run), say so. By hand: `python tools/ci_check.py [SHA]`.

## Feature pipeline
- `backlog.md` lists features as `- [ ] Feature`. Tyson writes and orders it.
- When Tyson types **"build feature"** (or `/feature`): take the first unchecked item through
  the pipeline in `.claude/skills/feature/SKILL.md`. Plan it in plan mode and write its spec to
  `docs/features/NNN-slug.md`. The `feature-build` workflow then builds it:
  1. gates the untouched tree;
  2. builds the backend and frontend lanes in parallel, and integrates them;
  3. gates and reviews: one full pass, then re-checks of the fixes;
  4. fixes;
  5. checks it in a browser (`tools/browser_drive.py`);
  6. documents it;
  7. marks it `- [x] Feature (done YYYY-MM-DD)`.
- Each phase records its result in `.pipeline/<slug>/state.json` (not in git). A commit needs
  `python tools/pipeline_gate.py` to pass; the hooks in `.claude/settings.json` and
  `tools/githooks/pre-commit` enforce it. While a feature is in progress, the hook also refuses
  `git stash`, `reset`, `restore`, `checkout`, `switch` and `clean`: the lanes share the
  working tree.
- Lanes own files, so they can run side by side: the backend lane `paradigm/` and `tests/python/`
  (`paradigm/app.py` and the spec's migration number included), the frontend lane `static/` and
  `tests/js/` (`main.js`, `commands.js`, `page-views.js`, `hub-sections.js`, the key tables,
  `index.html`, `note.html` and `tests/js/index.html` included). The integration step joins them
  against the spec's API contract; docs are the docs step's.
- When Tyson types **"build features"** (or `/features`): up to 10 open items at once, each
  built in its own git worktree (`../paradigm-wt/<slug>`), then joined by the `feature-merger`
  into one `batch/<date>` branch that `main` is fast-forwarded to when he says commit. See
  `docs/pipeline.md` and `.claude/skills/features/SKILL.md`. While a batch runs, the main tree's
  code is left alone (the `edit-guard` hook).
- On the Mac, both skills, their workflows and agents are linked into `~/.claude`, so they show up
  in every project. The setup is in `docs/pipeline.md`.
- Never reorder, reword or delete his items. Suggest new items in chat, and add them only when
  he agrees.

## Testing (every feature, before reporting it done)
- `python tools/pipeline_gate.py` runs every automatic check: the Python and JS tests, the 3.11
  syntax check, the vendor checksums, stdlib-only imports, no outside URLs, every JS test
  imported, migration numbers. `--no-js` skips the browser tests.
- The test commands by hand, the browser check on sample data and the report: `tests/CLAUDE.md`.

## Where things live
Each folder's `CLAUDE.md` holds its layout and rules; update it when the structure there
changes. How the app behaves, by area, is in `docs/spec/`: read the area's file before changing it.
- `paradigm/CLAUDE.md`: the Python package's layout, how it launches and stops, migrations.
- `paradigm/web/CLAUDE.md`: web security.
- `static/CLAUDE.md`: the front end's layout, the look (design tokens), key-table rules.
- `static/js/editor/CLAUDE.md`: the `<pd-editor>` component and its Vim keys, tables.
- `tests/CLAUDE.md`: how to test.
- `docs/spec/hubs.md` (PARA hubs, resources and folders, archive, pages, cards, dashboards,
  templates, files, time codes, page refresh), `people.md` (people, @mentions, 1:1 prep),
  `meetings.md` (meetings, capture, decisions and questions), `tasks.md` (tasks, next action,
  the note window strip, plan, status log), `week.md` (week, Outlook import, on call,
  timesheet), `navigation.md` (navigator, tree, backlinks, Today, note menu, top bar and
  palette, main-window keys, two windows, trash, images).
- `docs/windows.md`: what we learned on the Windows work PC.
- `docs/ui-audit.md`: the usability audit (2026-11-26) behind the light-theme redesign: findings
  by severity, and the role-named color tokens. The designs are in the Figma file "Paradigm UI".
- `docs/features/`: one build spec per feature, written by the pipeline; `batch-<date>.md`, one
  merge report per batch.
- `docs/pipeline.md`: how the pipeline's tools, hooks and ledgers fit together, batches included.
- `docs/security/`: vendor-audit.md (KaTeX + Mermaid go/no-go, conditions for use) and one
  .sha256 manifest per audited vendor version.
