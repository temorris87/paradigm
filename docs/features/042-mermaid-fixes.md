# 042 Mermaid help fixes

Status: built (2026-11-28)
Backlog item: Mermaid help fixes (from the browser check of batch 2026-11-27d): a ‹blank› stays in the
  text until it is typed over, so a template left as inserted still draws (15 of 36 types broke
  after Esc); flowchart reads the target of an edge that has a shape (`B -->|yes| C[Do this]`);
  Ctrl-Space after a node written with its shape (`A[Again] `) offers edges; Insert diagram… with
  the cursor inside a mermaid block puts the new block after that block's closing fence.
Decided with Tyson: 2026-11-28
Lanes: frontend
Migration: none

Builds on 038 (`docs/features/038-mermaid-help.md`).

## What it does
1. **Blanks stay until typed over** (default, approved by Tyson, 2026-11-28: not "deleted on
   Esc").
   - Reaching a blank (on insert, on Tab, or when a completion row is taken) no longer deletes it.
     The cursor goes to its start and the blank is remembered as the *current blank*; the first
     character typed replaces the whole `‹…›`. Moving the cursor away, Esc, or Tab forgets it.
     Backspace at a current blank deletes the whole blank.
   - Today the first blank is deleted on insert (`takeBlank`/`takeBlankIn` in
     `static/js/editor/insert.js`, `vim.takeBlankBefore`); that changes to the above.
   - Every blank in all 36 templates (`DIAGRAM_TYPES` in `static/js/diagrams/mermaid-types.js`)
     holds a sample value that is valid Mermaid in its place (e.g. `‹Start›`, `‹Alice›`,
     `‹Title›`, `‹10›`), never an empty or `…` blank. Templates that had none (Sankey, Event
     modeling) are unchanged.
   - **Drawing unwraps blanks** (default, approved by Tyson, 2026-11-28): the Mermaid renderer,
     `:export` and copy-as-image draw `‹x›` as `x` (one shared pure function, e.g.
     `unwrapBlanks` in `static/js/editor/blanks.js` or `diagrams/`). The note's saved text keeps
     the `‹›` marks until each is typed over.
2. **Flowchart edge targets with a shape.** The flag-shape alternative in `flowNames`
   (`static/js/diagrams/mermaid-syntax-tables.js`, around line 37) must not start at the `>` of an
   edge (`-->`, `==>`, `-.->`); `B -->|yes| C[Do this]` names `B` and `C`, and any edge whose
   target has a shape names its target.
3. **Ctrl-Space after a node written with its shape and a space** (`A[Again] `), whether `A` is
   new or used on another line, offers the edges (`FLOW_EDGES`) and the "after a node" rows
   (`FLOWCHART.after`); taking one replaces only the text after the node (the trailing space
   onward), never the node. Context detection is `mermaidContext`/`placeIn`
   (`static/js/diagrams/mermaid-syntax.js`).
4. **Insert diagram… inside a mermaid block** (cursor on any line of it, its opening and closing
   fence lines included) inserts the new block after that block's closing fence, with one empty
   line between them. `pd-editor`'s `insertLines` takes an optional `line`, passed through to
   `vim.insertLinesFromOutside`. A fence-inclusive variant of `mermaidBlockAt` finds the block.
   Outside a block, nothing changes.

## Data
None.

## API contract
None: no route is added or changed.

## Files
- Frontend lane:
  - `static/js/editor/blanks.js`, `static/js/editor/insert.js`, `static/js/editor/vim.js`,
    `static/js/editor/pd-editor.js` (current blank, `insertLines` `line` option);
  - `static/js/diagrams/mermaid-types.js` (blank values), `mermaid-syntax.js`,
    `mermaid-syntax-tables.js`, `insert-diagram.js`;
  - the renderer and export paths that hand text to Mermaid (unwrap);
  - tests: `tests/js/test_mermaid_help.js` (changes the insert test at ~:202 and ~:317, which
    asserted the deleted first blank), plus a test that every template, unwrapped, parses with
    the vendored Mermaid (`mermaid.parse`), and editor tests for the current blank.

## Acceptance checks
1. In the note window, insert each of the 36 diagram types and press Esc straight away: every one
   draws in the preview.
2. After inserting a flowchart, typing `X` replaces the first blank with `X`; Tab goes to the next
   blank, and typing replaces that one.
3. In a flowchart containing `B -->|yes| C[Do this]`, node completion lists `C`.
4. Ctrl-Space after `A[Again] ` lists edges; taking `-->` gives `A[Again] -->`.
5. With the cursor inside a mermaid block, Insert diagram… puts the new block after that block's
   closing fence; the first block is unchanged.
6. The saved note keeps `‹…›` for blanks not typed over; `:export` draws them without the marks.

## Not in this feature
- Deleting leftover blanks on Esc or on save.
- New diagram types or completion rows.

## As built
- **Current blank:** `insert.js` keeps it on the insert session (`session.blank`); `takeBlank`
  no longer deletes. Typing over it, Backspace (`deleteCurrentBlank`) and a completion row
  taken there (`pd-editor`'s `replaceBeforeCursor` calls `vim.dropCurrentBlank()` first) act on
  it; Tab moves on from its end. `vim.completionWaits()` tells the completion list (it was
  `atCurrentBlank()` until the post-batch fixes, below).
- **Added in the fix round (browser check):** at the current blank the completion list no
  longer opens by itself (`completion.js`'s `update()` skips it unless Ctrl-Space forced it).
  Without this, Flowchart's `A[|‹Start›]` and Mindmap's `root((|‹Topic›` read as a line start,
  so a "line start" list opened on insert: Tab or Enter took a row (`A[‹text›]] --> …`, which
  then failed to draw) and Esc had to be pressed twice. Now Tab goes to the next blank, Enter is
  the editor's and one Esc leaves insert mode; Ctrl-Space still opens the list there.
- **Templates:** `mermaid-types.js` was not changed: every blank in the 36 templates already
  held a valid sample value. A test parses every template, unwrapped, with the vendored Mermaid.
- **Unwrap:** `unwrapBlanks` is in `static/js/editor/blanks.js` and is applied once, in the
  shared renderer (`diagrams/mermaid.js`), which `:export` also uses (`diagramSvg`). There is no
  separate copy-as-image path in the app, so nothing else needed it.
- **After a node with its shape:** a new `after-node` place (`afterNode`/`afterNodeRows` in the
  flowchart table, checked first in `placeIn`). It offers only the edge rows of
  `FLOWCHART.after`, without the node's id; the shape and `:::class` rows are left out, since
  they need the bare id. The head reads "FLOWCHART · after a node".
- **Insert diagram… in a block:** `diagramPlace(lines, row)` in `insert-diagram.js` uses
  `mermaidBlockAt(lines, row, { fences: true })` and returns `{ line, emptyLine }`. `pd-editor`
  gains `editor.cursor` (a copy) and `insertLines`'s `line` option (`line: -1` with `insert`:
  above the first line, `vim.putLinesAtTop`).
- **Post-batch fixes (after review and the browser check):**
  - A block with no closing fence: the new block goes above its opening fence, followed by one
    empty line, since anything below it would still be inside it (the plan put it after its
    last line).
  - The completion list also waits for a key where a current blank was just deleted with
    Backspace (`B -->|‹label›|` became `B -->||`, which read as "after a node" and opened a list
    that took Tab and Esc) and where a completion row just went in (gitGraph's `commit` offered
    `commit id:` again). `insert.js` keeps the spot as `session.quiet` (`quietHere`), cleared by
    the next key or a click; `vim.completionWaits()` replaces `vim.atCurrentBlank()`, and
    `pd-editor`'s `replaceBeforeCursor` ends with `vim.quietCompletion()`.
  - After a node, every flowchart shape Mermaid draws counts, not only the nine the rows offer:
    `[ ]`, `( )`, `(( ))`, `((( )))`, `[[ ]]`, `[( )]`, `[/ /]`, `[\ \]`, `[/ \]`, `[\ /]`, `{ }`,
    `{{ }}`, `> ]`, `([ ])` and `@{ shape: …, label: "…" }`, each optionally followed by
    `:::class`, and a class alone (`A:::warn `). The shapes are one pattern in
    `mermaid-syntax-tables.js` (`FLOW_SHAPE`, text in a shape holds no bracket unless quoted),
    shared by `afterNode` and `flowNames`, so a node in any of them is also read as a name.
