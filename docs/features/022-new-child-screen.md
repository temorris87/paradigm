# 022 `:new` and `:child` by the note on screen

Status: built (2026-11-27)
Backlog item: `:new` and `:child` in the main window place the new note beside or under the note on
  screen (016's `screenNoteId()`), not the hub hidden behind a page: on Today, Week or People
  they say "E: no note on this page"; on Live they use the Live note.
Decided with Tyson: 2026-11-27
Lanes: frontend
Migration: none

## What it does
In the main window, `:new <title>` (beside) and `:child <title>` (under) take their place from
the note on screen: `screenNote(app)` in `static/js/notes/screen-note.js`, from 016. Before this
feature they used the session's open note, which is the hub hidden behind a page.
`createCommand` is in `static/js/notes/app.js`, near line 766.

| What the main window shows | `:new` | `:child` |
|---|---|---|
| A dashboard (hub or person), or Plan | beside that note, as now | under that note, as now |
| Live | beside the Live note | under the Live note |
| The task page | `E: this page shows a task: x deletes it` | same |
| Today, Week, People, Meetings, Trash, a template or folder page, Home | `E: no note on this page` | same |
| No note open at all (empty database) | `E: no note on this page`, with no exception | same |

Further rules:
- When the note on screen is top-level, `:new` makes a top-level note, as in the note window
  (default, approved by Tyson, 2026-11-27).
- The note window is unchanged: there `:new` and `:child` use its open note.
- The note menu's newBeside and newUnder (`static/js/notes/note-actions.js`) pass an explicit id
  and are unchanged.
- After the note is made, what happens next is the same as now for the main window. A plain note
  opens in the note window and a hub opens its dashboard.

## Data
None.

## API contract
None. It uses `POST /api/note/create {parent_id, title}` as it is.

## Files
Frontend lane only (`integrate: false`):
- `static/js/notes/app.js` (`createCommand`);
- possibly `static/js/notes/commands.js` (marking `:new`/`:child` so `runNoteCommand` refuses
  them the way it refuses the other note commands);
- `static/js/notes/screen-note.js`, only if a helper is needed;
- a test in `tests/js/`, with a fake app, for each row of the table above.

## Acceptance checks
1. With Week shown over a project, `:new X` says `E: no note on this page` and no note is made.
   The tree and the database are unchanged.
2. On Live, showing a plain note under Team, `:child Y` makes Y under that note, not under Team's
   hub. `:new Z` makes Z beside it.
3. On a project dashboard, `:new` and `:child` work as before.
4. On the task page, `:new` gives the task-page refusal.
5. With an empty database, `:new A` in the main window says `E: no note on this page`, and the
   console shows no error.
6. In the note window, `:new` and `:child` still use its open note.

## Not in this feature
- Choosing a position among siblings: siblings are ordered by title.
- New commands.

## As built
- `createCommand` (`static/js/notes/app.js`) takes the id from `screenNoteId()` and throws
  `NO_NOTE` when it is `null`, which covers both a page with no note and an empty database.
- `:new` and `:child` are marked `onNote: true` in `static/js/notes/commands.js`, so
  `runNoteCommand` gives the task-page and no-note refusals before `createCommand` runs, as for
  the other note commands; `test_screen_note.js` lists them among the on-note commands.
- No helper was added to `screen-note.js`. Tests: `tests/js/test_new_child_screen.js`, a fake app
  per row of the table. No fix rounds.
