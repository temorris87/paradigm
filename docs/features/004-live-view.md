# 004 Live view: the main window shows the note as you type it

Status: built (2026-11-26)
Backlog item: "I want to have the popup window that takes up the 1/3 of my screen to be a markdown view
  of any note and the note content should be visible on the main page. The reasoning behind
  this is to get rid of the weird behavior that real time rendering in the vim windows is
  causing. The real time view on the main 2/3 screen page should show where the cursor is so
  when I share my screen with just the 2/3 window, people are able to see where I'm typing while
  I focus on the right 1/3."
Decided with Tyson: 2026-11-26
Lanes: frontend (integrate: false; no route changes)
Migration: none

## Why
The editor's live preview renders Markdown blocks around the cursor while typing, and it behaves
oddly. Tyson wants to type plain Markdown in the note window (the right third), and see the note
rendered live in the main window (the left two-thirds), with a visible caret. Then a screen share
of only the main window lets people follow what he types.

## What it does
- **Note window: plain Markdown only.** The editor's live preview is removed (Tyson,
  2026-11-26). Every note is raw Markdown with its syntax colours, one line per row, in every
  mode. `:set preview` / `:set pv` answers "Unknown option". `syntax="plain"` stays: it still
  turns off the Markdown colouring.
- **Main window: the Live page (`&live`).** It shows the note open in the note window, rendered
  as on a dashboard (`.md-doc`, math, Mermaid, images, links) under its breadcrumb title. It
  updates as he types, on every keystroke and not on save, at most every 50 ms.
- **The caret.** A nord8 caret at the character the cursor is on. It is a thin bar in insert
  and replace mode, and a block in normal, visual and command-line mode. The top-level block
  holding the cursor also gets a band, with a nord8 bar at its left edge (the look the editor's
  preview had), so the place shows from across a shared screen. Where a caret can't sit in
  rendered text, only the band shows: a code-fence line, a table's `|---|` row, a rule, or
  inside a link's URL or an image's path. On a heading, list item or quote line with the cursor
  on its marker, the caret goes to the start of the text after the marker. The view scrolls to
  keep the caret inside its middle third. It doesn't scroll while the caret is there already.
- **When the main window switches to it.** Every note opened in the note window, any way (tree,
  Go to, a link, the main window sending it), switches the main window to its Live page
  (Tyson, 2026-11-26). Typing alone never switches it, so a page he is reading in the main
  window stays put while he types. To come back: `gn` in the main window, Window ▾ "Live note",
  or `:live` in the palette. Hubs and people count too: opening a project in the note window
  shows its live text in the main window, not its dashboard (Tyson, 2026-11-26). Dashboard ↗ or
  `:dashboard` in the note window still shows the dashboard. Opening a hub from the main
  window's own tree still shows its dashboard there.
- **A meeting:** Agenda, then Notes, each under its label, both rendered. The caret is in
  whichever one he is typing in.
- **Capture badges and images move here** (default, approved by Tyson, 2026-11-26). A meeting's
  `T:`/`D:`/`Q:` capture badges and the underline on a record's source text (`highlights.js`)
  only existed in the editor's rendered blocks. They now show on the Live page, and a click
  opens that record as it did in the note window. The note window shows no badges: its raw
  `T:` lines are the mark. A click on an image on the Live page opens `<pd-image-viewer>`.
- **Links** on the Live page open as they do on a dashboard (a plain note opens in the note
  window). The page has no keys of its own: it is for looking at. The main window's keys
  (`:`, `gt`, `gw`, `gp`, `gn`) work as on any page.
- **Edge cases:**
  - The main window opens or reloads after the note window: it asks the note window for its
    current state (`live-ask`) and shows it.
  - No note window, or no note open in it: "No note open in the note window." with an Open
    note window button.
  - The note window is closed: the last view stays, with "The note window is closed" under the
    title.
  - The note is renamed: the title follows. The note is trashed from the note window: "Moved to
    trash" in place of the text.
  - The note changes another way (another tab saved it): whatever the note window reloads is
    what the Live page shows.
  - An empty note: "Empty note".
  - Unchanged math and Mermaid don't redraw on each keystroke (cached by source). Only a block
    whose source changed is drawn again.

## Data
None. Nothing is stored. Trash, restore and archive are unchanged.

## API contract
No HTTP routes change. The windows' BroadcastChannel (`static/js/connection/changes.js`, the
"paradigm" channel) gains three messages:

| Message | From → to | Fields |
|---|---|---|
| `live` | note → main | `{type: "live", id, title, kind, crumbs, fields: [{name, label, text}], active, line, col, mode, trashed}`: `active` is the field `name` the cursor is in; `line`/`col` are 0-based in that field's text; `mode` is the editor mode name |
| `live-ask` | main → note | `{type: "live-ask"}`; the note window answers with a `live` |
| `live-closed` | note → main | `{type: "live-closed"}`, sent on `pagehide` |

`<pd-editor>` gains a generic `cursor` event, `detail: {line, col, mode}`. It fires after a key
whenever the cursor or mode changed. The editor still knows nothing about notes.

## Files (frontend lane)
- New `static/js/live/`:
  - `caret.js`: pure. Given a field's text, the line, the column and the mode, it returns the
    text with a private-use sentinel where the caret goes, or with none (band only). It also
    returns the cursor's line, so the page can find its block.
  - `live-sender.js`: the note window. The editors' `change`, `cursor` and `mode` events, the
    open note and the agenda become a throttled `live` message. It answers `live-ask` and sends
    `live-closed`.
  - `live-page.js`: the main window's Live page. It renders each field with `renderBlocks`,
    tagging each block with its line range. It swaps the sentinel for the caret in text nodes
    only and strips it from any attribute. It sets the band and scrolls, shows the empty,
    closed and trashed lines, and handles link, highlight and image clicks.
  - `highlights.js`: moved here from `static/js/editor/`, unchanged in what it does.
- New `static/css/live.css`: the page, the caret (bar and block) and the band.
- Removed: `static/js/editor/preview-layout.js`, `preview-units.js`, `preview-measure.js` and
  `preview-view.js`. Also the preview half of `text-layout.js`, `view.js`, `render.js` and
  `pd-editor.js`: the Mermaid, KaTeX and image drawing in the shadow root, and the `highlights`
  property. The `preview` option goes from `options.js` and `cmdline.js`, and the band styles
  from `editor.css`. Tests removed: `tests/js/test_editor_preview.js`,
  `test_editor_preview_element.js` and `preview-sample.{html,css,js}`, also dropped from
  `tests/js/index.html`. Tests that set or assume preview (`test_editor_engine.js`,
  `test_editor_element.js`) are updated. The Markdown renderer (`static/js/markdown/`) stays.
- Changed:
  - `editor/pd-editor.js`: the `cursor` event.
  - `notes/page-views.js`: `&live`.
  - `layout/main-keys.js`: `gn`.
  - `notes/commands.js`: `:live`.
  - `main.js`: Window ▾ Live note, and switching on `live` for a newly opened note.
  - `note-main.js` / `notes/app.js`: start the sender; nothing sets `editor.highlights` any
    more. The meeting's highlights go to the Live page in the `live` message as
    `highlights: [...]` on the field.
  - `hubs/dashboard.js`: its render steps (render, math, Mermaid, links) become one helper that
    both it and `live-page.js` use, instead of a copy.
  - `index.html`: the Live page's container and `live.css`.
- Tests: `tests/js/test_live_caret.js` (pure) and `test_live_page.js` (the DOM: sentinel never
  in an `href`, band on the right block, empty/closed/trashed lines), both added to
  `tests/js/index.html`.

## Acceptance checks
1. Note window: a note with a heading, a list, a table, `$x^2$` and a Mermaid fence shows raw
   Markdown lines in normal and insert mode. Nothing renders in the editor.
2. `:set preview` in the note window gives "Unknown option".
3. Opening a note in the note window switches the main window to its Live page, rendered.
4. Typing `abc` in insert mode shows `abc` on the Live page within a second, before any save.
   The caret bar sits after `c`.
5. `Esc` then `0`: the caret becomes a block at the start of the line. `j` moves the band to the
   next block.
6. Cursor on a heading line, a list item's marker, inside a table cell, on a code-fence line,
   and inside `[x](url)`: the caret lands in the text, or only the band shows. Every link still
   works, with no sentinel in any `href` or `src`.
7. A long note: `G` in the note window scrolls the Live page to keep the caret in view. Small
   moves inside the middle third don't scroll it.
8. A meeting: Agenda and Notes both show under their labels. Typing in the agenda moves the
   caret there.
9. A meeting with a `D:` capture line: the decision badge shows on the Live page, and a click
   opens the decision. The note window shows the raw line with no badge.
10. Clicking an image on the Live page opens the image viewer.
11. The main window reloaded with the note window open shows the Live page again, via
    `live-ask`.
12. Main window on Today: typing in the note window doesn't switch it. `gn`, Window ▾ Live note
    and `:live` all do.
13. A project opened in the note window: the main window shows its live text. Dashboard ↗ in the
    note window shows the dashboard, and `gn` returns to Live. A project opened from the main
    window's tree still shows its dashboard.
14. Closing the note window: the last view stays, with "The note window is closed". With no
    note window at all: the "No note open" line and its button.
15. An empty note shows "Empty note". A note trashed from the note window shows "Moved to
    trash". A renamed note's title follows.
16. Math and Mermaid render on the Live page and don't redraw on keystrokes that leave them
    unchanged.
17. A hub's dashboard text still renders as before, through the shared helper.
18. The editor's other tests still pass: Vim keys, tables, completion, the right-click menu.
19. A project whose text has a Mermaid `X-->Y`: after its dashboard was shown in the main
    window, its Live page still draws the arrowhead. Each drawn copy of a diagram has its own
    ids, so no id is in the page twice.
20. With the cursor on a link's `[` in normal mode, the block caret covers the link's first
    letter inside the link, and the link keeps its text and stays clickable. The same holds
    for bold or italic text.

## Not in this feature
- Showing a visual selection or search matches on the Live page.
- Scrolling or clicking on the Live page to move the note window's cursor.
- Making the dashboard's text block live (option B in the plan).
- A mode that switches the main window to Live on every keystroke.
- Capture badges in the note window.

## As built
- **The `live` message gained two fields.** Each field carries `highlights: [...]` (a
  meeting's records, for the badges), and a message may carry `reply: true`. `reply` marks a
  message the main window must not take for a newly opened note: the answer to `live-ask`,
  and (fix round 1) the first message after a trash's hold ends, so the first key typed in the
  note that opens after a trash doesn't switch the main window to Live. While held, the note
  that opens by itself after a trash sends nothing.
- **No caret in more places** than planned: maths, a diagram's source and a blank line
  between blocks show the band only, as fences, `|---|` rows, rules and URLs do.
- **The shared render helper** is `static/js/ui/rendered-text.js` (render, maths, Mermaid,
  links to notes), used by `hubs/dashboard.js` and `live/live-page.js`.
- **`<pd-editor>` events** are now change, save, quit, ex, mode, cursor, menu and files: link,
  mention, highlight and image went with the preview.
- Fix round 1 (review):
  - Emphasis with `_`: the caret's sentinel counts as neither space nor punctuation, so beside
    an underscore run it broke `_italic_` / `__bold__`. `caret.js` moves it after an opening
    run and before a closing one (the markers are hidden, so the caret shows in the same
    place); snake_case is unchanged.
  - Reference links: with the cursor in a shortcut `[label]` or collapsed `[label][]` whose
    label is defined in the note, `caret.js` rewrites it to the full form so the link keeps
    its text and the caret sits in it. In a full `[x][ref]` the caret may sit in the text;
    inside `[ref]` only the band shows.
  - Ids: heading and footnote ids are prefixed per field (`live-agenda-`, `live-body-`), so a
    meeting's Agenda and Notes don't clash.
  - Startup: `NotesApp.start()` keeps its promise as `app.started`; `LivePage` takes
    `ready: () => app()?.started`, and a newly opened note waits for it before switching, so
    the page from the URL no longer replaces Live when a `live` message arrives early.
