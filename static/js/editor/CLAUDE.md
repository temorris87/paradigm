# static/js/editor/ (the <pd-editor> component)

## Layout
Paths from the repo root. Update this layout when the structure here changes.
```
  js/editor/             the <pd-editor> component:
    pd-editor.js         the custom element (hidden textarea takes keys; events out: change,
                         save, quit, ex, mode, cursor {line, col, mode}, menu, files, capture
                         {kind, line, text}, uncapture {line, text}); setLineMarks; the "dock"
                         slot for a host's panel between the text and the status line
    completion.js        a list under the cursor in insert mode ("@" offers people; the
                         host gives the items); a host's context source opens with no
                         trigger ({lines, row, col, forced}; Ctrl-Space forces it), with a
                         head and a foot line
    blanks.js            ‹blanks›: the next one from a place, wrapping; unwrapBlanks (‹x›
                         as x, for Mermaid) (pure); with editor.blankScope on, Tab in
                         insert mode goes to it (insert.js keeps it as the current blank)
    render.js            draws visible lines, cursor, selection, matches, status line, the
                         host's line marks (a gutter glyph, a chip at the line's right)
    view.js              viewport math in steps: top line + skip rows, scrolloff, H/M/L
    text-layout.js       how many rows a raw line takes (wraps at the view's width)
    vim.js               the engine: state + feed(key); no DOM
    keys.js              THE editor key table (normal, visual, insert, cmdline)
    parser.js            keys -> command (register, counts, operator, motion)
    command.js           runs normal/visual commands, records "." changes
    motions.js text-objects.js operators.js actions.js visual.js insert.js
    cmdline.js ex.js options.js put.js lines.js scroll.js
    buffer.js position.js words.js sentences.js brackets.js search.js
    registers.js undo.js marks.js key-names.js markdown-tokens.js errors.js
    tables.js            Markdown tables as lines: rows, cells, align, sort, a column's
                         alignment (pure); table-paste.js (Excel / Word cells -> a table;
                         pure), table-copy.js (HTML + Tab text for the clipboard; pure),
                         table-edit.js (cell moves, realign, :table :tsort :talign :tcopy)
```

## Keys
- The editor is a real modal Vim on raw Markdown: normal, insert, visual and command-line modes,
  counts, operators + motions, text objects, `.`, registers and undo. Vim itself is the reference
  for its keys.
- Plain Markdown only (Tyson, 2026-11-26): every line is raw Markdown with its syntax colours,
  one line per wrapped row, in every mode; nothing renders inside the editor. The old live
  preview is gone (`:set preview` answers "Unknown option"); the rendered view is the main
  window's Live page (`static/js/live/`), fed by the `cursor` and `change` events.
  `syntax="plain"` turns off the Markdown colouring.
- **Tab / Shift-Tab: in insert mode they indent (spaces to the next shiftwidth stop) and
  unindent. In every other mode they leave the editor and move focus like on any web page**,
  so they are never bound there (Tyson's choice, 2026-11-21).
- The leader `\` (Tyson, 2026-11-27; 028): in normal mode `\t` `\q` `\d` send "capture"
  {kind: task | question | decision, line, text} for the cursor's line, and `\u` sends
  "uncapture" {line, text}; in visual mode `\t` `\q` `\d` send the selection's text joined to one
  line (detail.selection), and visual mode ends. The editor only reports them: the host (the
  note window, `static/js/notes/capture-actions.js`) opens its sheet. After `\`, any other key,
  or none within `LEADER_TIMEOUT_MS` (1 s, the element's timer), cancels quietly (no bell).
  Insert mode types `\` as always.
- Line marks: `editor.setLineMarks([{line, glyph, label, tone}])` draws the glyph in a gutter left
  of the text (its room is padding, taken only while some line has a mark) and the label as the
  shared chip (`ui/chip.js`, `chip.css` loaded in the shadow root) at the line's right. The marks
  are data: the host sets them again after each change; they never move with an edit.
- The dock: a host's child with `slot="dock"` shows between the text and the status line; it
  pushes the text up (the view measures again) and never covers it. A right-click there is the
  host's own.
- Tables (Tyson, 2026-11-23; worknotes' behaviour): a table row is a line starting and ending
  with `|`, outside a code fence. In insert mode on one, Tab / Shift-Tab go to the next /
  previous cell and Enter / Shift-Enter the same cell a row down / up (past the last row: a new
  row); the table lines itself up then, on Escape, and after a normal-mode change on a row (in
  the same undo step; never on undo or redo). Cells pasted from Excel, Word or a web page (2+
  rows, Tab-split) become a table, in insert mode or with `"+p`; not in a fence or a table.
  The right-click menu in the text: Sort by "Column" (again: the other way; empty cells last,
  numbers by value), Align "Column" left / center / right, Copy table (HTML for Word, Outlook,
  Teams + Tab text for Excel); outside a table, Insert table… (also the note menu). The
  editor's own commands `:table [cols [rows]]`, `:tsort[!] [col]`, `:talign {how}`, `:tcopy`.
  No normal-mode keys for them.
- Blanks and context completion (Tyson, 2026-11-27; 038): the host may hand the editor a
  completion source that reads the cursor's place (`editor.contextCompletion`) and the lines
  Tab looks for a `‹blank›` in (`editor.blankScope`); Ctrl-Space (insert mode only) asks the
  source for everything there. `editor.insertLines(text, { insert: true, cursorAt, line })`
  starts insert mode at the text's first `‹blank›`, else at the end of line `cursorAt` (`line`:
  below that line, not the cursor's; `-1`: above the first line). A blank reached (inserted
  lines, Tab, a taken completion row) stays in the text as the *current blank*, the cursor at its start: the first character typed
  replaces it whole, Backspace deletes it, a completion row goes in its place; a move, a click,
  Tab or Esc forgets it and leaves it as it is (042). At the current blank, and where one was
  just deleted or a completion row just went in (`vim.completionWaits()`), the completion list
  does not open by itself (only Ctrl-Space opens it), so Tab, Enter and Esc there are the
  editor's. The editor
  knows nothing about what they are for: the note window's Mermaid help lives in
  `static/js/diagrams/`.
