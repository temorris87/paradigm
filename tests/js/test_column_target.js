// h and l across a page's columns (ui/column-target.js): the nearest column that way with rows,
// its row nearest in height; nothing past the first or last.
import { columnTarget, laneColumns } from "../../static/js/ui/column-target.js";
import { HubPanel } from "../../static/js/hubs/hub-panel.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const ROWS = [
  { column: 0, top: 0 }, { column: 0, top: 40 }, { column: 0, top: 80 },
  { column: 1, top: 10 }, { column: 1, top: 70 },
  { column: 2, top: 200 },
];

test("column target: l to the right column's row nearest in height, h back", () => {
  assertEqual(columnTarget(ROWS, 0, 1), 3, "top row: the right column's top row");
  assertEqual(columnTarget(ROWS, 2, 1), 4, "80 is nearest 70");
  assertEqual(columnTarget(ROWS, 4, -1), 2, "70 is nearest 80");
  assertEqual(columnTarget(ROWS, 3, -1), 0, "10 is nearest 0");
  assertEqual(columnTarget(ROWS, 4, 1), 5, "the only row of the third column");
});

test("column target: no wrap past the first or last column; a tie keeps the row listed first", () => {
  assertEqual(columnTarget(ROWS, 1, -1), 1, "h in the first column does nothing");
  assertEqual(columnTarget(ROWS, 5, 1), 5, "l in the last column does nothing");
  assertEqual(columnTarget([{ column: 0, top: 50 }, { column: 1, top: 30 }, { column: 1, top: 70 }], 0, 1), 1, "a tie: the first");
  assertEqual(columnTarget([], 0, 1), 0, "no rows");
});

test("column target: a column with no rows is skipped", () => {
  const rows = [{ column: 0, top: 0 }, { column: 2, top: 5 }, { column: 2, top: 90 }];
  assertEqual(columnTarget(rows, 0, 1), 1, "column 1 has none: on to column 2");
  assertEqual(columnTarget(rows, 2, -1), 0);
});

// A person's page: three cards in a row, then Notes (two widths) and Together (one) under them.
const box = (left, right, top, bottom) => ({ left, right, top, bottom });
const PERSON = [box(0, 100, 0, 50), box(110, 210, 0, 50), box(220, 320, 0, 50), box(0, 210, 60, 200), box(220, 320, 60, 120)];
const shown = (columns) => columns.map((column) => (Number.isNaN(column) ? "-" : column)).join();

test("lane columns: only the lanes beside on screen, by their left edge", () => {
  assertEqual(shown(laneColumns(PERSON, 2)), "0,110,220,-,-", "the last card: the cards, not Notes under them");
  assertEqual(shown(laneColumns(PERSON, 3)), "-,-,-,0,220", "Notes: Together beside it");
  assertEqual(shown(laneColumns(PERSON, 4)), "-,-,-,0,220");
});

test("lane columns: lanes stacked in one column keep their order", () => {
  assertEqual(laneColumns([box(0, 300, 0, 50), box(0, 300, 60, 90)], 0).join(), "0,1");
  assertEqual(laneColumns([], 0).join(), "");
});

test("column target: on a person's page l stops at the last card; h and l cross between Notes and Together", () => {
  const root = document.createElement("section");
  document.body.append(root);
  try {
    const panel = new HubPanel(root, { onRow() {}, onToggle() {}, onMore() {}, onAdd() {}, onRowAction() {} });
    const card = (key, title) => ({ key, label: key, detail: "", folded: false, rows: [{ id: key, title, actions: [] }],
      empty: "", add: null, addPlain: false, menu: null, more: 0, footer: null, history: null });
    panel.draw({ wide: [], cards: [card("waiting", "W"), card("owe", "O"), card("raise", "R")],
      act: [card("personNotes", "N")], know: [card("together", "T")], page: "person" });
    // The grid of person-cards.css, which the test page does not load.
    const list = root.querySelector(".hub__list");
    Object.assign(list.style, { display: "grid", gridTemplateColumns: "repeat(3, 100px)", width: "320px" });
    root.querySelector(".hub__lane--act").style.gridColumn = "span 2";
    const title = () => root.querySelector("[aria-selected=true]")?.textContent ?? "";
    const at = (text) => panel.options.findIndex((option) => option.row?.title === text);
    panel.moveTo(at("R"));
    panel.perform("nextLane");
    assertTrue(title().startsWith("R"), "l on To raise stays: Notes is below");
    panel.perform("previousLane");
    assertTrue(title().startsWith("O"), "h on To raise: I owe");
    panel.moveTo(at("N"));
    panel.perform("nextLane");
    assertTrue(title().startsWith("T"), "l on Notes: Together");
    panel.perform("previousLane");
    assertTrue(title().startsWith("N"), "h on Together: Notes, not the card above");
    panel.perform("previousLane");
    assertTrue(title().startsWith("N"), "h on Notes does nothing");
  } finally {
    root.remove();
  }
});
