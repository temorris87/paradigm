# 016 Note commands act on the note on screen

Status: built (2026-11-27)
Backlog item: "`:trash` in the main window acts on the note behind its view (the dashboard last open behind the Live page, the task page or Today), not on the note on screen: it can trash a whole hub by mistake."
Decided with Tyson: 2026-11-27 (plan approved with no comments: every default stands)
Lanes: frontend (integrate: false; no route added or changed)
Migration: none
Batch: 2026-11-27 (built side by side with 017-theme-tokens, merged on `batch/2026-11-27`)

## Cause
Every "this note" command reads `app.currentId` (or `app.session.note`). In the main window a
page view (`views.shown`: home, people, meetings, trash, week, template, folder, task, plan,
live; `static/js/notes/page-views.js`) is drawn over the dashboard, which stays open under it,
so `currentId` is still that dashboard's hub. The breadcrumb (and so the note menu) is hidden on
views, but the palette (`:`, `static/js/layout/main-keys.js`) still runs every note command
through `runNoteCommand` (`static/js/notes/commands.js`), and its "on {title}" label
(`static/js/palette/palette.js:57-58`) names the hidden hub. `:trash!` on Today trashes a whole
hub.

## What it does
One helper on the app, `screenNoteId()`, says which note is on screen in the main window, and
every command that acts on "this note" uses it instead of `currentId` / `session.note`
(default, approved by Tyson, 2026-11-27):

| Main window shows | `screenNoteId()` | A note command |
|---|---|---|
| a bare dashboard (`views.shown` null) | the hub (`currentId`) | works as today |
| Plan | the hub (`currentId`) | works as today |
| Live | the Live page's note (`views.pages.live.state.id`, the note window's note) | acts on that note |
| the task page | none | "E: this page shows a task: x deletes it" |
| Today, Week, People, Meetings, Trash, a template, a Resources folder | none | "E: no note on this page" |

- The note window is unchanged: there `currentId` is the note on screen.
- On Live, `:trash` trashes the Live note. The main window then goes to the dashboard of the
  note's parent (else its hub, else the first top-level one), as `docs/spec/navigation.md`
  already says for trashing from the main window; it never opens a plain note. The note window
  leaves its trashed note as it does today (015 live-trash-stay: `leaveTrashed`, quiet).
- The palette's "on {title}" label uses `screenNoteId()`: no label on a page with no note; on
  Live it names the Live note.
- Commands covered (all that read `currentId` / `session.note` as "this note"): `:trash`,
  `:rename`, `:parent` / move, `:kind`, `:in` (area), `:archive`, `:restore`, `:export`,
  `:timecode`, `:date`, the person fields (`:addperson`, `:dropperson`, `:org`, `:job`, `:email`,
  `:phone`), `:meeting`, `:attendee`, `:decision`, `:question`, `:answered`, `:reopen`, `:with`,
  `:task`, `:t`, `:log`, `:dashboard`. The frontend lane lists each in the tests. Commands that
  act on the view itself (Plan's keys, the task page's own keys) are unchanged; `planKey`'s
  existing view guard (`static/js/notes/app.js:926-930`) is the pattern.
- Task page: note commands refuse rather than act on the task's note (default, approved by
  Tyson, 2026-11-27): a task's note is easy to mistake for the task. `x` / Delete on the task page
  still deletes the task.

## Data
None.

## API contract
No route added or changed. `:trash` still posts `/api/note/delete {id, recursive}`.

## Files
- Frontend lane: `static/js/notes/app.js` (`screenNoteId()`, and the commands from about :789 to
  :1118), `static/js/notes/commands.js` (`runNoteCommand`), `static/js/palette/palette.js`, and
  the person, meeting, record, task and status-log command modules that read `currentId` as
  "this note". Tests: `tests/js/test_live_page.js` (extend `trashApp()` with `views.shown` =
  "live", "task", "home", "week"), `tests/js/test_palette.js` (the label), plus a table test
  that every command in the list refuses on Today with "E: no note on this page".

## Acceptance checks
1. Open a project, then a plain note under it (the main window shows Live). In the main window,
   `:trash`: that note is in the Trash, the project and its other notes are not, and the main
   window shows the project's dashboard.
2. On Today, `:trash` and `:trash!` say "E: no note on this page"; the Trash is unchanged. Same on
   Week and People. `:rename x` on Today says the same and renames nothing.
3. On a task page, `:trash` says "E: this page shows a task: x deletes it"; the hub and the task
   are unchanged.
4. On a bare project dashboard, `:trash` (on a project with no notes under it) still trashes it
   and goes to the next dashboard, as before.
5. The palette opened on Today shows no "on {hub}" label; opened on Live it names the Live note.
6. In the note window, `:trash` still trashes its note, as before.

## Not in this feature
- Making the note menu reachable on views.
- Sending `:trash` on the task page to the task's delete.

## As built
- `static/js/notes/screen-note.js` (new, pure): `screenNote(app)` gives `{ id, refusal }`,
  with `screenNoteId`, `refusalOf` and `liveBodyOf(app, id)`. On Live the id is the Live page's
  note only while it is in the tree and not trashed; else "E: no note on this page".
  `NotesApp.screenNoteId()` wraps it.
- `commands.js` marks each "this note" command `onNote: true`; `runNoteCommand` refuses those
  with `refusalOf(app)` before running them. The palette label comes from a new pure
  `commandContext(query, note)` in `palette-model.js`.
- Not in the plan, added in the fix rounds:
  - On Live the note changed is the note window's, so the commands now tell it:
    `NotesApp.noteChanged(what)` refreshes this window's tree and sends
    `{type: "changed", what}` (rename, `:parent`, the kind commands, `:inarea`, `:archive`,
    `:restore`); the person fields send "changed" too, and the record commands (`:date` on a
    record, `:answered`, `:reopen`) send `what: ["notes", "records"]`. The session's fields
    change only when the note is this window's own (`updateMetaIfOpen`).
  - `:trash` on Live opens the next dashboard with `discard` only when the trashed note is the
    open one, so the hub under Live keeps its unsaved edits.
  - `:export` on Live exports the body the Live page shows (`liveBodyOf`), falling back to the
    last saved body.
  - `main.js` gives the Live entry of `PageViews.pages` a `state` getter (it held a wrapper, so
    `.state` was undefined and every command on Live refused).
  - `NotesApp.open` with `history: "replace"` onto the note already open now rewrites the URL,
    so after `:trash` on Live the `&live` flag leaves it and a reload shows the dashboard.
- API contract unchanged: no route added or changed.
- Tests: `tests/js/test_screen_note.js` (new), `test_live_page.js`, `test_palette.js`.
