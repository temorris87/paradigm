# static/js/editor/ (the <pd-editor> component)

## Layout
Paths from the repo root. Update this layout when the structure here changes.
```
  js/editor/             the <pd-editor> component:
    pd-editor.js         the custom element (hidden textarea takes keys; events out: change,
                         save, quit, ex, mode, cursor {line, col, mode}, menu, files)
    completion.js        a list under the cursor in insert mode ("@" offers people; the
                         host gives the items)
    render.js            draws visible lines, cursor, selection, matches, status line
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
