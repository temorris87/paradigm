// Mermaid help (static/js/diagrams/mermaid-types.js, mermaid-syntax.js): the types and their
// templates, the context reading, the rows per position, the status line; the editor's generic
// parts it rides on: ‹blank› jumping (blanks.js, Tab), lines inserted in insert mode, the
// context completion source and Ctrl-Space.
import "../../static/js/editor/pd-editor.js";
import { Completion } from "../../static/js/editor/completion.js";
import { findBlank, nextBlank } from "../../static/js/editor/blanks.js";
import { keyName } from "../../static/js/editor/key-names.js";
import { INSERT_KEYS } from "../../static/js/editor/keys.js";
import { DIAGRAM_TYPES, MOST_USED, detectDiagramType, diagramFence, diagramGroups } from "../../static/js/diagrams/mermaid-types.js";
import { mermaidBlankScope, mermaidBlockAt, mermaidCompletion, mermaidContext, mermaidStatus } from "../../static/js/diagrams/mermaid-syntax.js";
import { insertDiagramDialog } from "../../static/js/diagrams/insert-diagram.js";
import { mermaidEditorHelp, mermaidStatusHint } from "../../static/js/diagrams/mermaid-help.js";
import { noteMenuItems } from "../../static/js/notes/note-menu.js";
import { tableMenuItems } from "../../static/js/notes/selection-menu.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { UI_KEYS } from "../../static/js/ui/ui-keys.js";
import { show, type, vimAt } from "./editor-helpers.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const fence = (...body) => ["# Note", "```mermaid", ...body, "```", "after"];
const SEQUENCE = fence("sequenceDiagram", "    participant NW", "    participant DW", "    NW->>DW: hi", "    ");
const labels = (result) => result?.items.map((item) => item.label) ?? [];

test("mermaid types: every template's keyword line is detected as its own type", () => {
  const ids = DIAGRAM_TYPES.map((type) => type.id);
  assertEqual(new Set(ids).size, ids.length, "one entry per type");
  for (const type of DIAGRAM_TYPES) {
    const first = type.template.split("\n")[0];
    assertEqual(detectDiagramType(first)?.id, type.id, first);
    assertTrue(type.description && type.name, type.id);
    // Inserting puts insert mode at the first blank: with none it would be on the fence line.
    const body = type.template.split("\n");
    const noBlank = ["sankey-beta", "eventmodeling"].includes(type.id); // their lexers take no ‹ ›
    assertEqual(Boolean(findBlank(body, { line: 0, col: 0 }, { line: body.length, col: 0 })), !noBlank, `${type.id}: a ‹blank›`);
  }
  for (const keyword of ["flowchart", "sequenceDiagram", "classDiagram", "stateDiagram-v2", "erDiagram", "journey", "gantt", "pie",
    "quadrantChart", "requirementDiagram", "gitGraph", "C4Context", "mindmap", "timeline", "sankey-beta", "xychart-beta", "block-beta",
    "packet-beta", "kanban", "architecture-beta", "treemap-beta", "radar-beta"]) {
    assertTrue(DIAGRAM_TYPES.some((type) => type.keyword === keyword), `${keyword} has a template`);
  }
  assertTrue(!DIAGRAM_TYPES.some((type) => type.keyword === "info"), "info draws no diagram");
  assertEqual(detectDiagramType("graph LR").id, "flowchart", "the old keyword");
  assertEqual(detectDiagramType("flowchart-elk TD").id, "flowchart-elk", "elk before flowchart, as Mermaid");
  assertEqual(detectDiagramType("railroad-ebnf-beta").id, "railroad-ebnf-beta");
  assertEqual(detectDiagramType("hello"), null);
  assertEqual(diagramFence(DIAGRAM_TYPES[0]).split("\n").at(0), "```mermaid");
  assertEqual(diagramFence(DIAGRAM_TYPES[0]).split("\n").at(-1), "```");
});

test("mermaid types: the picker's groups, Most used first; typing filters by name or keyword", () => {
  const [most, all] = diagramGroups("");
  assertEqual(most.label, "Most used");
  assertEqual(most.types.map((type) => type.name).join(), "Flowchart,Sequence,Gantt,State,Entity relationship,Mindmap,Timeline");
  assertEqual(most.types.length, MOST_USED.length);
  assertEqual(most.types.length + all.types.length, DIAGRAM_TYPES.length, "every type once");
  const seq = diagramGroups("seq");
  assertEqual(seq.flatMap((group) => group.types).map((type) => type.name).join(), "Sequence");
  assertEqual(diagramGroups("erDiagram").flatMap((group) => group.types)[0].id, "erDiagram", "by keyword");
  assertEqual(diagramGroups("nothing like it").length, 0);
});

test("mermaid syntax: the block holding a line; fences and other languages are not one", () => {
  const lines = ["a", "```mermaid", "pie", "```", "```js", "x", "```", "~~~~ Mermaid", "gantt"];
  assertEqual(JSON.stringify(mermaidBlockAt(lines, 2)), JSON.stringify({ open: 1, close: 3 }));
  assertEqual(mermaidBlockAt(lines, 1), null, "the fence line");
  assertEqual(mermaidBlockAt(lines, 3), null);
  assertEqual(mermaidBlockAt(lines, 5), null, "a js block");
  assertEqual(mermaidBlockAt(lines, 0), null);
  assertEqual(mermaidBlockAt(lines, 8).close, lines.length, "an open block runs to the end");
  assertEqual(JSON.stringify(mermaidBlankScope(lines, 2)), JSON.stringify({ first: 2, last: 2 }));
  assertEqual(mermaidBlankScope(lines, 0), null);
});

test("mermaid syntax: the context: type after front matter and %% lines, names, the position", () => {
  const lines = fence("---", "title: x", "---", "%% a comment", "sequenceDiagram", "    actor NW as North", "    NW->>DW: hi", "    NW");
  const at = (row, col = lines[row].length) => mermaidContext(lines, row, col);
  assertEqual(at(3), null, "in the front matter");
  assertEqual(at(5), null, "a %% line");
  const context = at(9);
  assertEqual(context.type.id, "sequenceDiagram");
  assertEqual(context.names.join(), "NW,DW");
  assertEqual(context.position, "after-name");
  assertEqual(context.name, "NW");
  assertEqual(mermaidContext(lines, 9, 5).position, "start", "N: a word at the line start");
  assertEqual(mermaidContext(lines, 0, 2), null, "outside the block");
  const empty = fence("");
  assertEqual(mermaidContext(empty, 2, 0).position, "type", "no keyword yet");
  const header = fence("flowchart ");
  assertEqual(mermaidContext(header, 2, 10).position, "header");
});

test("mermaid syntax: a sequence block, typing a participant at a line's start: its messages, the other first", () => {
  const lines = [...SEQUENCE];
  lines[6] = "    NW";
  const result = mermaidCompletion({ lines, row: 6, col: 6 });
  assertEqual(result.head, "Sequence diagram · after a participant");
  assertEqual(result.items[0].insert, "NW->>DW: ‹message›");
  assertEqual(result.replace, 2, "replaces what was typed");
  assertTrue(labels(result).includes("Note right of NW: ‹text›"));
  assertTrue(labels(result).includes("Note over NW,DW: ‹text›"));
  assertTrue(result.foot.includes("C-Space"));
  lines[6] = "    NW-->";
  assertEqual(labels(mermaidCompletion({ lines, row: 6, col: 9 })).join(), "NW-->>DW: ‹message›,NW-->>-DW: ‹message›", "narrowed by the arrow typed");
  lines[6] = "    lo";
  const start = mermaidCompletion({ lines, row: 6, col: 6 });
  assertEqual(start.head, "Sequence diagram · line start");
  assertEqual(start.items[0].label, "loop ‹every minute› …");
  assertEqual(start.items[0].insert, "loop ‹every minute›\n        ‹message›\n    end", "the lines after the first take the line's indent");
  assertEqual(mermaidCompletion({ lines: SEQUENCE, row: 6, col: 4 }), null, "nothing typed: closed");
  assertTrue(labels(mermaidCompletion({ lines: SEQUENCE, row: 6, col: 4, forced: true })).includes("participant ‹Name›"), "Ctrl-Space: all of them");
});

test("mermaid syntax: a flowchart: shapes, edges, subgraph at a line's start; directions after the keyword", () => {
  const lines = fence("flowchart ", "    A[Start] --> B", "    s");
  const header = labels(mermaidCompletion({ lines, row: 2, col: 10 }));
  assertEqual(header.slice(0, 4).join(), "TD,LR,BT,RL");
  const start = labels(mermaidCompletion({ lines, row: 4, col: 5 }));
  assertEqual(start[0], "subgraph ‹title› …", "the keyword typed comes first");
  assertTrue(start.includes("s[‹text›]") && start.includes("s{‹text›}") && start.includes("s((‹text›))"), "shapes");
  assertTrue(start.includes("s --> ‹node›"), "edges");
  const forced = labels(mermaidCompletion({ lines: fence("flowchart TD", "    A --> B", "    "), row: 4, col: 4, forced: true }));
  assertTrue(forced.includes("C[‹text›]") && forced.includes("C[(‹db›)]"), "a free id");
  assertTrue(forced.includes("subgraph ‹title› …"));
  const after = labels(mermaidCompletion({ lines: fence("flowchart TD", "    A --> B", "    A"), row: 4, col: 5 }));
  assertEqual(after[0], "A --> B", "the block's other nodes first");
  assertTrue(after.includes("A -.-> ‹node›") && after.includes("A ==> ‹node›") && after.includes("A -->|‹label›| ‹node›"));
  assertEqual(mermaidStatus(lines, 3), "mermaid · flowchart · 3 nodes", "A, B and s");
});

test("mermaid syntax: Ctrl-Space in a gantt block: section, dateFormat, task forms; in a task: tags and durations", () => {
  const lines = fence("gantt", "    dateFormat YYYY-MM-DD", "    Plan :a1, 2026-01-05, 3d", "    ");
  const rows = labels(mermaidCompletion({ lines, row: 5, col: 4, forced: true }));
  for (const wanted of ["section ‹name›", "dateFormat YYYY-MM-DD", "‹Task› :active, ‹id›, ‹YYYY-MM-DD›, ‹3d›", "‹Task› :after a1, ‹3d›"]) {
    assertTrue(rows.includes(wanted), wanted);
  }
  const task = fence("gantt", "    Plan :a1, 2026-01-05, 3d", "    Build :");
  const inline = mermaidCompletion({ lines: task, row: 4, col: 11, forced: true });
  assertEqual(inline.head, "Gantt chart · in a task");
  assertTrue(labels(inline).includes("active, ") && labels(inline).includes("after a1") && labels(inline).includes("1w"));
  assertEqual(mermaidStatus(task, 3), "mermaid · gantt · 1 task");
});

test("mermaid syntax: outside a mermaid block nothing opens; the status line says the type and its names", () => {
  const lines = ["participant", "```js", "loop", "```", ...SEQUENCE];
  assertEqual(mermaidCompletion({ lines, row: 0, col: 4 }), null);
  assertEqual(mermaidCompletion({ lines, row: 2, col: 4, forced: true }), null, "a js block");
  assertEqual(mermaidStatus(lines, 0), "");
  assertEqual(mermaidStatus(lines, 7), "mermaid · sequenceDiagram · 2 participants");
  assertEqual(mermaidStatus(fence(""), 2), "mermaid", "no type yet");
  assertEqual(mermaidStatus(fence("pie", "  \"a\" : 1"), 3), "mermaid · pie");
  const typed = labels(mermaidCompletion({ lines: fence("seq"), row: 2, col: 3 }));
  assertEqual(typed[0], "sequenceDiagram", "the type's keyword, while it is typed");
});

test("mermaid syntax: a keyword typed in full on the first line opens no list (Enter is a new line)", () => {
  for (const keyword of ["flowchart", "block", "requirement"]) {
    const lines = ["```mermaid", keyword, "```"];
    const result = mermaidCompletion({ lines, row: 1, col: keyword.length });
    if (keyword === "flowchart") assertEqual(result, null, keyword);
    else assertTrue(result?.items.length, `${keyword}: not a keyword yet, so the list shows`);
  }
  assertTrue(labels(mermaidCompletion({ lines: ["```mermaid", "flow", "```"], row: 1, col: 4 })).includes("flowchart-elk"));
  assertTrue(labels(mermaidCompletion({ lines: ["```mermaid", "flowchart", "```"], row: 1, col: 9, forced: true })).includes("flowchart-elk"),
    "Ctrl-Space still shows them");
});

test("mermaid syntax: every type offers something at a line's start (Ctrl-Space)", () => {
  for (const type of DIAGRAM_TYPES) {
    const lines = fence(...type.template.split("\n"), "    ");
    const row = lines.length - 3;
    const result = mermaidCompletion({ lines, row, col: 4, forced: true });
    assertTrue(result && result.items.length > 1, type.id);
    assertTrue(result.head.endsWith("line start"), `${type.id}: ${result.head}`);
  }
});

test("blanks: the next ‹blank› after a place, wrapping inside the lines given", () => {
  const lines = ["a ‹one› b", "‹two› and ‹three›", "‹out›"];
  assertEqual(JSON.stringify(findBlank(lines, { line: 0, col: 0 }, { line: 1, col: 5 })), JSON.stringify({ line: 0, start: 2, end: 7 }));
  assertEqual(JSON.stringify(nextBlank(lines, { line: 1, col: 1 }, 0, 1)), JSON.stringify({ line: 1, start: 10, end: 17 }));
  assertEqual(JSON.stringify(nextBlank(lines, { line: 1, col: 17 }, 0, 1)), JSON.stringify({ line: 0, start: 2, end: 7 }), "wraps, never past the last line");
  assertEqual(findBlank(lines, { line: 0, col: 3 }, { line: 0, col: 9 }), null);
});

test("blanks: Tab in insert mode takes the next ‹blank› where the host has them on; else Tab as before", () => {
  const scope = (lines, line) => (line > 0 ? { first: 1, last: 2 } : null);
  const vim = vimAt("x ‹no›\n|A[‹text›] --> ‹B›\nC");
  vim.blankScope = scope;
  type(vim, "i<Tab>");
  assertEqual(show(vim), "x ‹no›\nA[|] --> ‹B›\nC");
  type(vim, "go<Tab>");
  assertEqual(show(vim), "x ‹no›\nA[go] --> |\nC");
  type(vim, "D<Tab>");
  assertEqual(show(vim), "x ‹no›\nA[go] --> D |\nC", "no blank left: Tab indents");
  const outside = vimAt("|a ‹no›");
  outside.blankScope = scope;
  type(outside, "i<Tab>");
  assertEqual(show(outside), "  |a ‹no›", "outside the host's lines: Tab indents");
});

test("blanks: lines inserted from the host open insert mode at their first ‹blank›, one undo step", () => {
  const vim = vimAt("|top\nend");
  vim.insertLinesFromOutside("```mermaid\npie title ‹Title›\n    \"‹A›\" : 1\n```");
  assertEqual(vim.mode, "insert");
  assertEqual(show(vim), "top\n```mermaid\npie title |\n    \"‹A›\" : 1\n```\nend");
  type(vim, "Time<Esc>u");
  assertEqual(vim.text, "top\nend", "the block and what was typed go in one undo");
  const plain = vimAt("|top");
  plain.insertLinesFromOutside("no blanks");
  assertEqual(show(plain), "top\n|no blanks");
  const fenced = vimAt("|top");
  fenced.insertLinesFromOutside("```mermaid\nsankey-beta\na,b,1\n```", null, { cursorAt: 2 });
  assertEqual(show(fenced), "top\n```mermaid\nsankey-beta\na,b,1|\n```", "no blank: the end of line cursorAt");
  assertEqual(fenced.mode, "insert");
  const both = vimAt("|top");
  both.insertLinesFromOutside("a\n‹b›\nc", null, { cursorAt: 2 });
  assertEqual(show(both), "top\na\n|\nc", "a blank wins");
});

test("completion: a context source opens without a trigger; Ctrl-Space forces it; Esc closes it", () => {
  const frame = document.createElement("div");
  document.body.append(frame);
  const taken = [];
  try {
    const completion = new Completion(frame, { accept: (length, text) => taken.push(`${length}:${text}`) });
    completion.sources = { "@": () => [{ label: "person", insert: "@P " }] };
    completion.context = ({ lines, row, col, forced }) => {
      const word = /\w*$/.exec(lines[row].slice(0, col))[0];
      if (!word && !forced) return null;
      return { replace: word.length, items: [{ label: `${word}x`, insert: `${word}x‹b›` }], head: "HEAD", foot: "FOOT" };
    };
    const vim = vimAt("ab|");
    type(vim, "a");
    completion.update(vim, () => null, { left: 0, top: 0 });
    assertTrue(completion.open);
    assertEqual(frame.querySelector(".pd-complete__head").textContent, "HEAD");
    assertEqual(frame.querySelector(".pd-complete__foot").textContent, "FOOT");
    assertTrue(completion.onKey("<Tab>"));
    assertEqual(taken.join(), "2:abx‹b›");
    const blank = vimAt("ab |");
    type(blank, "a");
    completion.update(blank, () => null, { left: 0, top: 0 });
    assertTrue(!completion.open, "nothing typed: the source says no");
    completion.force(blank, () => null, { left: 0, top: 0 });
    assertTrue(completion.open, "Ctrl-Space");
    assertTrue(completion.onKey("<Esc>"));
    assertTrue(!completion.open);
    const at = vimAt("hi @p|");
    type(at, "a");
    completion.update(at, () => null, { left: 0, top: 0 });
    assertEqual(frame.querySelector(".pd-complete__item").textContent, "person", "a trigger still wins");
    assertTrue(frame.querySelector(".pd-complete__head").hidden, "no head for it");
  } finally {
    frame.remove();
  }
});

test("completion: Ctrl-Space is named, insert mode's only, and sends complete", () => {
  assertEqual(keyName({ key: " ", ctrlKey: true }), "<C-Space>");
  assertTrue(INSERT_KEYS.some((entry) => entry.keys === "<C-Space>"));
  const vim = vimAt("a|");
  type(vim, "a<C-Space>");
  assertEqual(vim.takeEvents().map((event) => event.type).join(), "complete");
  assertEqual(vim.text, "a", "types nothing");
});

test("insert diagram: in the note menu and the text's menu beside Insert table…; its keys in ui-keys", () => {
  const tree = new NoteTree([{ id: 1, parent_id: null, title: "Plain", updated_at: "2026-11-21T12:00:00.000Z" }]);
  const keys = noteMenuItems(tree, 1, { window: "note" }).map((item) => item.key);
  assertEqual(keys[keys.indexOf("insertTable") + 1], "insertDiagram");
  assertTrue(!noteMenuItems(tree, 1, { window: "main" }).some((item) => item.key === "insertDiagram"), "the note window's only");
  assertEqual(tableMenuItems(null, { diagram: true }).map((item) => item.label).join(), "Insert table…,Insert diagram…");
  assertEqual(tableMenuItems(null).map((item) => item.label).join(), "Insert table…", "not in the main window's or the agenda's");
  const actions = UI_KEYS.filter((entry) => entry.scope === "diagram").map((entry) => entry.action).join();
  assertEqual(actions, "next,previous,choose,close");
});

test("element: in a mermaid block typing opens the list; Enter takes a row and its first ‹blank›; Esc closes, then leaves insert", () => {
  const editor = document.createElement("pd-editor");
  document.body.append(editor);
  const press = (key, mods = {}) => editor.shadowRoot.querySelector(".pd-input")
    .dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, composed: true, ...mods }));
  const typeText = (text) => [...text].forEach((key) => press(key));
  try {
    editor.value = "```mermaid\nsequenceDiagram\n    participant NW\n    participant DW\n```";
    mermaidEditorHelp(editor);
    editor.hints = { status: mermaidStatusHint };
    editor.goToLine(3);
    typeText("oNW");
    const box = editor.shadowRoot.querySelector(".pd-complete");
    assertTrue(!box.hidden, "open after the name");
    assertEqual(box.querySelector(".pd-complete__head").textContent, "Sequence diagram · after a participant");
    assertEqual(box.querySelector(".pd-complete__label").textContent, "NW->>DW: ‹message›");
    assertTrue(editor.shadowRoot.querySelector(".pd-status").textContent.includes("mermaid · sequenceDiagram · 2 participants"));
    press("Enter");
    typeText("hi");
    assertEqual(editor.value.split("\n")[4], "    NW->>DW: hi", "the blank went, typing replaced it");
    press("Enter");
    typeText("N");
    assertTrue(!box.hidden);
    press("Escape");
    assertTrue(box.hidden, "Esc closes the list");
    assertEqual(editor.mode, "insert", "and stays in insert mode");
    press("Escape");
    assertEqual(editor.mode, "normal");
    press(" ", { ctrlKey: true });
    assertTrue(box.hidden, "Ctrl-Space is insert mode's only");
    typeText("o");
    press(" ", { ctrlKey: true });
    assertTrue(!box.hidden, "Ctrl-Space shows all for the place");
  } finally {
    editor.remove();
  }
});

test("element: insertLines with insert opens insert mode at the first ‹blank›; Tab goes to the next", () => {
  const editor = document.createElement("pd-editor");
  document.body.append(editor);
  try {
    editor.value = "top";
    mermaidEditorHelp(editor);
    editor.insertLines(diagramFence(DIAGRAM_TYPES.find((type) => type.id === "sequenceDiagram")), { insert: true });
    assertEqual(editor.mode, "insert");
    [..."Ann"].forEach((key) => editor.shadowRoot.querySelector(".pd-input").dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, composed: true })));
    editor.shadowRoot.querySelector(".pd-input").dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true, composed: true }));
    const lines = editor.value.split("\n");
    assertEqual(lines[3], "    participant A as Ann");
    assertEqual(lines[4], "    participant B as ", "Tab took the next blank");
  } finally {
    editor.remove();
  }
});

test("insert diagram: the picker lists every type; j k move while nothing is typed; seq + Enter inserts Sequence", async () => {
  const inserted = [];
  const editor = { insertLines: (text, options) => inserted.push([text, options]), focus() {} };
  const done = insertDiagramDialog(editor);
  const dialog = document.querySelector(".diagram-picker");
  const box = dialog.querySelector(".diagram-picker__box");
  const key = (name) => box.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
  const chosen = () => dialog.querySelector("[aria-selected=true] .diagram-picker__name").textContent;
  assertEqual(dialog.querySelectorAll("[role=option]").length, DIAGRAM_TYPES.length);
  assertEqual(box.placeholder, `Type to filter · ${DIAGRAM_TYPES.length} types`);
  assertEqual([...dialog.querySelectorAll(".diagram-picker__group")].map((group) => group.textContent).join(), "Most used,All");
  key("j");
  assertEqual(chosen(), "Sequence");
  assertTrue(dialog.querySelector(".diagram-picker__code").textContent.startsWith("```mermaid\nsequenceDiagram"), "the exact text");
  key("k");
  assertEqual(chosen(), "Flowchart");
  box.value = "seq";
  box.dispatchEvent(new Event("input"));
  assertEqual([...dialog.querySelectorAll("[role=option]")].map((row) => row.textContent).join(), "SequencesequenceDiagram");
  assertTrue(key("k"), "k types once something is typed (not prevented)");
  key("Enter");
  await done;
  assertEqual(inserted.length, 1);
  assertTrue(inserted[0][0].startsWith("```mermaid\nsequenceDiagram\n"));
  assertEqual(inserted[0][1].insert, true);
  assertTrue(!document.querySelector(".diagram-picker"), "closed");
});

test("insert diagram: a word starting with k or j still filters; Enter with no match stays open", async () => {
  const inserted = [];
  const editor = { insertLines: (text) => inserted.push(text), focus() {} };
  const done = insertDiagramDialog(editor);
  const dialog = document.querySelector(".diagram-picker");
  const box = dialog.querySelector(".diagram-picker__box");
  const key = (name) => box.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
  const typeText = (text) => [...text].forEach((each) => {
    if (key(each)) {
      box.value += each;
      box.dispatchEvent(new Event("input"));
    }
  });
  typeText("kan");
  assertEqual(box.value, "kan");
  assertEqual([...dialog.querySelectorAll(".diagram-picker__name")].map((row) => row.textContent).join(), "Kanban");
  box.value = "";
  box.dispatchEvent(new Event("input"));
  typeText("jou");
  assertEqual(box.value, "jou", "journey");
  box.value = "";
  box.dispatchEvent(new Event("input"));
  key("j");
  key("j");
  assertEqual(box.value, "", "j j still moves");
  assertEqual(dialog.querySelector("[aria-selected=true] .diagram-picker__name").textContent, "Gantt");
  box.value = "zzz";
  box.dispatchEvent(new Event("input"));
  key("Enter");
  assertTrue(document.querySelector(".diagram-picker"), "no match: still open");
  key("Escape");
  await done;
  assertEqual(inserted.length, 0);
  assertTrue(!document.querySelector(".diagram-picker"), "closed");
});
