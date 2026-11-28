# 038 Mermaid: insert a diagram, and syntax as you type

Status: built (2026-11-27)
Backlog item: I need a solution for mermaid diagrams on notes to insert preformatted text for all
  supported diagram types. I also need some solution for showing me possible syntax within that
  diagram type -- must be context sensitive -- to help me write diagrams quickly.
Decided with Tyson: 2026-11-27
Lanes: frontend
Migration: none

Figma "Paradigm UI" (fileKey WiWq1ftWbEclRLbUyhcwKi): "Note window · Insert diagram… · 1600"
52:1283 and "Note window · mermaid syntax as you type · 1600" 53:921.

## What it does
### Insert diagram…
1. **Opening it:** `:diagram` in the note window (a note ex command, noteOnly), **Insert
   diagram…** in the note menu and in the text's right-click menu (beside Insert table…).
2. **The picker** (52:1283, overlay surface): heading **Insert diagram** with a filter box ("Type to
   filter · n types"); on the left the types, **Most used** first (Flowchart, Sequence, Gantt,
   State, Entity relationship, Mindmap, Timeline), then **All** (every other type), each with its
   keyword in mono on the right; on the right the chosen type's one-line description and the exact
   text it will insert. `j`/`k` or Up/Down move, typing filters (by name or keyword), Enter
   inserts, Esc cancels (the picker's own keys, `ui/ui-keys.js`).
3. **Every type the vendored Mermaid 12.3.0 detects** gets a template (pure table in
   `static/js/diagrams/mermaid-syntax.js`), the beta ones under their `-beta` keywords: flowchart,
   sequenceDiagram, classDiagram, stateDiagram-v2, erDiagram, journey, gantt, pie, quadrantChart,
   requirementDiagram, gitGraph, C4Context, mindmap, timeline, sankey-beta, xychart-beta,
   block-beta, packet-beta, kanban, architecture-beta, treemap-beta, radar-beta, and any other
   keyword the vendored detectors accept that renders a diagram (not `info`). Each template is a
   small, valid example that draws without an error in the vendored Mermaid.
4. **Inserting:** the fenced block (```` ```mermaid ```` … ```` ``` ````) goes in below the cursor
   line as one undo step (`editor.insertLines`), the editor in insert mode at the first blank.
5. **Blanks.** Template words to replace are written `‹First›`. In insert mode, **Tab** inside a
   mermaid block that holds a `‹…›` after the cursor (or, wrapping, before it) deletes the next
   one and leaves the cursor there, so typing replaces it. With no blank left, Tab does what it did.
   Blanks are plain text: saved as typed if left (default, approved by Tyson, 2026-11-27).

### Syntax as you type
6. **Where:** in the note window's editor, in insert mode, with the cursor inside a ```mermaid
   fence. The diagram type is the block's first keyword line (after `---` front matter and `%%`
   lines, as Mermaid reads it).
7. **The list** (53:921): a completion popup under the cursor (the editor's existing popup look,
   `pd-complete`), headed with the type and the position ("SEQUENCE DIAGRAM · after a
   participant"), rows of mono snippet + a few words, then a foot "Tab or Enter takes it ·
   ‹blanks› next with Tab · C-Space shows all for this type · Esc closes".
   - It opens by itself as a word is typed at a line's start or after a name the block already
     uses, filtered by what is typed; **Ctrl-Space** opens it with everything for the type and
     position. Up/Down move; **Enter** or **Tab** takes the row (replacing what was typed);
     **Esc** closes it without leaving insert mode.
   - What it offers depends on the type and the position (context sensitive, Tyson): e.g.
     - sequenceDiagram, after a participant name: `NW->>DW: ‹message›`, `-->>`, `-)`, `-x`,
       `->>+`, `Note right of NW: ‹text›`, `Note over NW,DW: ‹text›`, using the participants the
       block declares or uses; at a line's start: `participant`, `actor`, `loop … end`,
       `alt … else … end`, `opt`, `par`, `rect`, `activate`, `autonumber`;
     - flowchart: node shapes (`A[‹text›]`, `A(‹text›)`, `A{‹text›}`, `A((‹text›))`, `A[(‹db›)]`),
       edges (`-->`, `---`, `-.->`, `==>`, `-->|‹label›|`), `subgraph … end`, `classDef`,
       `style`, with the block's node ids; directions after the keyword (`TD`, `LR`, `BT`, `RL`);
     - gantt: `title`, `dateFormat YYYY-MM-DD`, `section ‹name›`, task lines with `:active`,
       `:done`, `:crit`, `after ‹id›`, durations;
     - every other type: its keywords and line forms from Mermaid's docs for 12.3, at least the
       line starts.
   - The tables are pure data in `mermaid-syntax.js`; the context reading (type, position, names
     in the block) is a pure function with tests.
8. **The status line** shows the type while the cursor is in a mermaid block: "mermaid ·
   sequenceDiagram · 2 participants".
9. **The editor stays generic** (static/js/editor/CLAUDE.md): it learns two generic things only
   — completion sources may read the cursor's context (`{lines, row, col}`) and may open without a
   trigger character (with Ctrl-Space to force), and `‹…›` blank jumping on Tab is an option the
   host turns on. Everything about Mermaid lives in `static/js/diagrams/` and is wired by the
   notes app.

## Data
None.

## API contract
None.

## Files
- Frontend lane: new `static/js/diagrams/mermaid-syntax.js` (types, templates, completions per
  type and position, `mermaidContext(lines, row, col)`; pure), `static/js/diagrams/insert-diagram.js`
  (the picker), `static/js/editor/completion.js` (context-aware, triggerless sources, Ctrl-Space),
  `static/js/editor/pd-editor.js` (blank jumping option; the status line text hook if needed),
  `static/js/editor/markdown-tokens.js` (only if the fence's language must be read there),
  `static/js/notes/commands.js` (`:diagram`), `static/js/notes/note-menu.js`,
  `static/js/notes/note-actions.js`, `static/js/notes/selection-menu.js`,
  `static/js/notes/app.js` (wiring the source), CSS for the picker's two columns
  (`static/css/`), tests in `tests/js/` (every template's first keyword is detected; context
  reading; completion rows per position; blank jumping) imported in `tests/js/index.html`.

## Acceptance checks
1. `:diagram` opens the picker listing every type; filtering "seq" leaves Sequence; Enter inserts
   its block below the cursor in insert mode at the first ‹blank›.
2. Each template, inserted in a note and shown on the main window (dashboard or Live), draws as a
   diagram with no error (browser check over every type).
3. Tab inside the inserted block jumps to the next ‹blank›; typing replaces it; with none left,
   Tab behaves as before.
4. In a sequence block with participants NW and DW, typing `NW` at a new line's start shows the
   list headed "after a participant" with `NW->>DW: ‹message›` first; Enter takes it.
5. At a line's start in a flowchart block, the list offers node shapes, edges and `subgraph`;
   after `flowchart ` it offers `TD LR BT RL`.
6. Ctrl-Space in a gantt block shows `section`, `dateFormat`, task forms.
7. Outside a mermaid block, typing never opens the list; `@` completion still works everywhere.
8. Esc closes the list and stays in insert mode; a second Esc leaves insert mode.
9. The status line shows "mermaid · sequenceDiagram · 2 participants" inside the block.
10. Undo after inserting removes the whole block in one step.

## Not in this feature
- Drawing diagrams inside the editor (the main window draws them, as now).
- Checking a diagram's syntax as it is typed.

## As built
- 36 types (`mermaid-types.js`): the 22 named above plus flowchart-elk, agentflow-beta,
  swimlane-beta, eventmodeling, treeView-beta, ishikawa, venn-beta, wardley-beta, cynefin-beta,
  usecase-beta and the railroad family (railroad-beta, -ebnf-, -abnf-, -peg-beta). The types,
  templates and picker groups live in `mermaid-types.js`, not `mermaid-syntax.js`.
- `mermaid-syntax.js` was split: it keeps the context reading (`mermaidContext`,
  `mermaidBlockAt`), completion, the status line and the blank scope; the per-type tables, the
  name readers and `syntaxFor` are in `mermaid-syntax-tables.js`. `mermaid-help.js` wires them
  into the note window's editor (`editor.contextCompletion`, `editor.blankScope`,
  `hints.status`); the blank finder is the editor's new pure `blanks.js`. Picker CSS:
  `static/css/diagram-picker.css`; its keys are the "diagram" scope in `ui/ui-keys.js`.
- Sankey and Event modeling have no `‹blank›`: their parsers in the vendored Mermaid reject
  `‹ ›`. For them `editor.insertLines(..., { insert: true, cursorAt })` (new option) starts
  insert mode at the end of the template's last body line, not on the fence line.
- Insert diagram… is in the right-click menu only for the note window's own note editor
  (`tableMenuItems(table, { readOnly, diagram })`), not the main window or an agenda editor.
- Picker: `j`/`k` move only while the box is empty, and a `j`/`k` plus a letter that together
  start a match are taken as the filter ("kan", "jou"); Enter with no match keeps it open.
- On the block's first line, a keyword typed in full ("flowchart") opens no list unless
  Ctrl-Space, so Enter starts a new line instead of taking a longer keyword (flowchart-elk).
- Test only: `tests/js/test_capture_sheet.js` waits for the editor's stylesheets and measures
  before reading a mark (a flaky test from before this feature).
