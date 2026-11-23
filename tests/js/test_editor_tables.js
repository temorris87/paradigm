// Markdown tables in the editor: the pure line logic (tables.js), pasted cells
// (table-paste.js), the copy (table-copy.js) and the keys through the Vim engine.
import { parseKeys } from "../../static/js/editor/key-names.js";
import { Vim } from "../../static/js/editor/vim.js";
import { alignTable, cellAt, cellsOf, cellStart, inFence, newTableLines, setColumnAlign, sortKey, sortRows,
  visibleText } from "../../static/js/editor/tables.js";
import { cellsFromPaste, pasteAsTable } from "../../static/js/editor/table-paste.js";
import { tableClip } from "../../static/js/editor/table-copy.js";
import { tableInfo } from "../../static/js/editor/table-edit.js";
import { tableMenuItems } from "../../static/js/notes/selection-menu.js";
import { assertEqual, assertTrue, test } from "./harness.js";

// "^" marks the cursor here ("|" is a table border).
function at(textWithCursor) {
  const index = textWithCursor.indexOf("^");
  const text = textWithCursor.slice(0, index) + textWithCursor.slice(index + 1);
  const vim = new Vim({ text });
  const before = textWithCursor.slice(0, index).split("\n");
  vim.cursor = { line: before.length - 1, col: before[before.length - 1].length };
  vim.want = vim.cursor.col;
  return vim;
}

function keys(vim, sequence) {
  for (const key of parseKeys(sequence)) vim.feed(key);
  return vim;
}

function show(vim) {
  const lines = vim.buf.lines.slice();
  const { line, col } = vim.cursor;
  lines[line] = lines[line].slice(0, col) + "^" + lines[line].slice(col);
  return lines.join("\n");
}

const RAGGED = ["| Name | Qty |", "|---|--:|", "| Apple pie | 3 |", "| Fig | 12 |"];

test("tables: cells, escaped pipes, where the cursor is", () => {
  assertEqual(JSON.stringify(cellsOf("| a | b \\| c |  |")), JSON.stringify(["a", "b \\| c", ""]));
  const row = "| ab | cd |";
  assertEqual(cellAt(row, 0), 0);
  assertEqual(cellAt(row, 4), 0, "just after the text, before the border");
  assertEqual(cellAt(row, 6), 1);
  assertEqual(cellStart(row, 1), 7);
  assertEqual(cellStart("|   |   |", 1), 6, "an empty cell: one space in");
});

test("tables: align pads to the widest cell, right and center columns too", () => {
  assertEqual(alignTable(RAGGED).join("\n"), [
    "| Name      | Qty |",
    "|-----------|----:|",
    "| Apple pie |   3 |",
    "| Fig       |  12 |",
  ].join("\n"));
  assertEqual(alignTable(["| a | b |", "|:-:|---|", "| xxxxx | y |", "| z |"]).join("\n"), [
    "|   a   | b |",
    "|:-----:|---|",
    "| xxxxx | y |",
    "|   z   |   |",
  ].join("\n"), "a short row gets empty cells");
  assertEqual(alignTable(["  | a |b|"]).join("\n"), "  | a | b |", "the indent stays");
});

test("tables: a new table, and fences", () => {
  assertEqual(newTableLines(2, 3).join("\n"), "|   |   |\n|---|---|\n|   |   |\n|   |   |");
  assertEqual(newTableLines(1, 1).length, 3, "always one body row");
  assertTrue(inFence(["```", "| a |", "```"], 1));
  assertTrue(!inFence(["```", "x", "```", "| a |"], 3));
});

test("tables: sort keys and sorting (numbers, text, empty last, again turns it round)", () => {
  assertEqual(sortKey("$1,234.5").value, 1234.5);
  assertEqual(sortKey("12%").kind, 0);
  assertEqual(sortKey("2h").value, 2);
  assertEqual(sortKey("2026-11-23").kind, 1, "dates sort as text");
  assertEqual(sortKey("").kind, 2);
  assertEqual(visibleText("**[[Plan\\|The plan]]** `x`"), "The plan x");
  const lines = ["| N |", "|---|", "| 10 |", "|  |", "| b |", "| 9 |", "| A |"];
  const up = sortRows(lines, 0);
  assertEqual(up.lines.slice(2).map((line) => cellsOf(line)[0]).join(","), "9,10,A,b,");
  assertEqual(up.dir, 1);
  const down = sortRows(up.lines, 0);
  assertEqual(down.dir, -1, "sorted up already: down");
  assertEqual(down.lines.slice(2).map((line) => cellsOf(line)[0]).join(","), "b,A,10,9,");
  assertEqual(sortRows(["| b |", "| a |"], 0).lines.join(","), "| a |,| b |", "no header: every row");
});

test("tables: align a column, adding the separator when missing", () => {
  const { lines, added } = setColumnAlign(["| a | b |", "| 1 | 2 |"], 1, "right");
  assertTrue(added);
  assertEqual(lines.join("\n"), "| a | b |\n|---|--:|\n| 1 | 2 |");
  assertEqual(setColumnAlign(lines, 1, "left").lines[1], "|---|---|");
});

test("table paste: Excel cells with quotes, CRLF and blank lines", () => {
  const excel = 'Item\tNotes\tCost\r\nPens\t"two\nlines"\t$4\r\n\r\nInk\t"say ""hi"""\t12\r\n';
  assertEqual(JSON.stringify(cellsFromPaste(excel)[1]), JSON.stringify(["Pens", "two\nlines", "$4"]));
  assertEqual(pasteAsTable(excel).join("\n"), [
    "| Item | Notes     | Cost |",
    "|------|-----------|-----:|",
    "| Pens | two lines |   $4 |",
    '| Ink  | say "hi"  |   12 |',
  ].join("\n"));
  assertEqual(pasteAsTable("a|b\tc\nd\te\t\t")[0], "| a\\|b | c |", "pipes escaped, empty columns dropped");
  assertEqual(pasteAsTable("just text"), null);
  assertEqual(pasteAsTable("one\trow"), null, "one row is not a table");
  assertEqual(pasteAsTable("\tcode\n\tmore"), null, "tab-indented code stays");
});

test("table copy: HTML with borders and alignment, Tab text for Excel", () => {
  const clip = tableClip(["| Name | **Qty** |", "|---|--:|", "| [[Fig]] | 3 |"]);
  assertEqual(clip.text, "Name\tQty\nFig\t3");
  assertTrue(clip.html.startsWith('<table border="1"'), clip.html);
  assertTrue(clip.html.includes("text-align:right"), "the right column");
  assertTrue(clip.html.includes("<strong>Qty</strong>"));
  assertTrue(!clip.html.includes("<a "), "wiki links go out as words");
  assertEqual(clip.columns, 2);
  assertEqual(clip.rows, 2);
});

test("table keys: Tab goes cell to cell and lines the table up", () => {
  const vim = keys(at("| a | b |\n|---|---|\n| ^ |   |"), "ixyz<Tab>");
  assertEqual(show(vim), "| a   | b |\n|-----|---|\n| xyz | ^  |");
  keys(vim, "q<Tab>");
  assertEqual(show(vim), "| a   | b |\n|-----|---|\n| xyz | q |\n| ^    |   |", "a new row at the end");
  keys(vim, "<S-Tab>");
  assertEqual(show(vim), "| a   | b |\n|-----|---|\n| xyz | ^q |\n|     |   |", "back to the row above's last cell");
  keys(vim, "<S-Tab><S-Tab>");
  assertEqual(show(vim), "| a   | ^b |\n|-----|---|\n| xyz | q |\n|     |   |", "over the |---| line");
});

test("table keys: Enter and Shift-Enter go down and up a column", () => {
  const vim = keys(at("| a | ^b |\n|---|---|\n| c | d |"), "i<CR>");
  assertEqual(show(vim), "| a | b |\n|---|---|\n| c | ^d |");
  keys(vim, "<CR>");
  assertEqual(show(vim), "| a | b |\n|---|---|\n| c | d |\n|   | ^  |");
  keys(vim, "<S-CR><S-CR><S-CR>");
  assertEqual(show(vim), "| a | ^b |\n|---|---|\n| c | d |\n|   |   |", "stays at the top");
});

test("table keys: outside a table Tab indents and Enter breaks the line", () => {
  assertEqual(show(keys(at("^x"), "i<Tab>")), "  ^x");
  assertEqual(show(keys(at("a^b"), "i<CR>")), "a\n^b");
  assertEqual(show(keys(at("a^b"), "i<S-CR>")), "a\n^b");
  assertEqual(show(keys(at("```\n| a ^|\n```"), "i<Tab>")), "```\n| a   ^|\n```", "a fence holds code, not a table");
});

test("table keys: Escape and normal-mode changes realign; one u undoes it all", () => {
  const vim = keys(at("| a | b |\n|---|---|\n| ^c | d |"), "ilong<Esc>");
  assertEqual(show(vim), "| a     | b |\n|-------|---|\n| lon^gc | d |");
  keys(vim, "u");
  assertEqual(vim.text, "| a | b |\n|---|---|\n| c | d |", "the typing and the realign go together");
  keys(vim, "<C-r>");
  keys(vim, "0wdw");
  assertEqual(vim.text, "| a | b |\n|---|---|\n|   | d |", "dw on a cell realigns");
});

test("table commands: :table, :tsort, :talign, :tcopy", () => {
  const vim = keys(at("Intro^\nmore"), ":table 2 2<CR>");
  assertEqual(vim.mode, "insert");
  assertEqual(show(vim), "Intro\n\n| ^  |   |\n|---|---|\n|   |   |\n\nmore", "blank lines around it");
  const sort = keys(at("| N | Qty |\n|---|---|\n| b | ^10 |\n| a | 2 |"), ":tsort<CR>");
  assertEqual(sort.text, "| N | Qty |\n|---|-----|\n| a | 2   |\n| b | 10  |");
  assertEqual(sort.message.text, "Sorted by Qty, up");
  keys(sort, ":tsort N<CR>");
  assertEqual(sort.text.split("\n")[2], "| b | 10  |", "N was up already: down");
  keys(sort, ":tsort 2<CR>");
  assertEqual(sort.text.split("\n")[2], "| a | 2   |", "by number");
  keys(sort, ":tsort! 2<CR>");
  assertEqual(sort.text.split("\n")[2], "| b | 10  |", "! sorts down");
  keys(sort, ":talign right<CR>");
  assertEqual(sort.text.split("\n")[1], "|---|----:|");
  assertEqual(tableInfo(sort).align, "right");
  keys(sort, ":tcopy<CR>");
  const event = sort.takeEvents().find((each) => each.type === "copytable");
  assertEqual(event?.message, "Table copied (2 columns, 3 rows)");
  const outside = keys(at("^plain"), ":tsort<CR>");
  assertEqual(outside.message.text, "Not in a table");
});

test("table paste: insert mode and \"+p make a table; inside a fence or a table it stays raw", () => {
  const cells = "Item\tCost\nPens\t4";
  const vim = at("Notes:^");
  keys(vim, "A");
  vim.feed({ paste: cells });
  assertEqual(show(vim), "Notes:\n\n| Item | Cost |\n|------|-----:|\n| Pens |    4 |\n^");
  const fenced = at("```\n^\n```");
  keys(fenced, "i");
  fenced.feed({ paste: cells });
  assertEqual(fenced.text, "```\nItem\tCost\nPens\t4\n```");
  const put = new Vim({ text: "above\nbelow" });
  put.registers.setClipboardText(cells);
  keys(put, '"+p');
  assertEqual(put.text, "above\n\n| Item | Cost |\n|------|-----:|\n| Pens |    4 |\n\nbelow");
});

test("table menu: sort, align and copy name the column; Insert table… outside one", () => {
  assertEqual(tableMenuItems(null)[0].label, "Insert table…");
  const items = tableMenuItems({ column: 1, columns: 2, title: "Qty", align: "right" });
  assertEqual(items.filter((item) => item.label).map((item) => item.label).join(" / "),
    'Sort by "Qty" / Align "Qty" left / Align "Qty" center / Align "Qty" right / Copy table');
  assertTrue(items.find((item) => item.label === 'Align "Qty" right').checked);
  assertTrue(tableMenuItems(null, { readOnly: true })[0].disabled);
});
