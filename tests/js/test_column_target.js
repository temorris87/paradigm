// h and l across a page's columns (ui/column-target.js): the nearest column that way with rows,
// its row nearest in height; nothing past the first or last.
import { columnTarget, laneColumns, sideBySide } from "../../static/js/ui/column-target.js";
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

test("lane columns: lanes stacked in one column (under 1400 px) reach nothing, so h and l never go up or down", () => {
  assertEqual(shown(laneColumns([box(0, 300, 0, 50), box(0, 300, 60, 90)], 0)), "0,-");
  assertEqual(shown(laneColumns([box(0, 300, 0, 50), box(0, 300, 60, 90)], 1)), "-,0");
  assertEqual(laneColumns([], 0).join(), "");
});

test("side by side: two boxes sharing some height, one fully left of the other; a box with no size never is", () => {
  assertTrue(sideBySide(PERSON), "a person's cards");
  assertTrue(!sideBySide([box(0, 300, 0, 50), box(0, 300, 60, 90)]), "stacked");
  assertTrue(!sideBySide([box(0, 0, 0, 0), box(0, 0, 0, 0)]), "display: contents has no box");
  assertTrue(!sideBySide([box(0, 300, 0, 50)]) && !sideBySide([]));
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

// The panel without the app's CSS (the test page loads none): each test lays its lanes out
// as dashboard.css, person-cards.css or hub.css does at that width.
const card = (key, ...titles) => ({ key, label: key, detail: "", folded: false, rows: titles.map((title) => ({ id: `${key}-${title}`, title, actions: [] })),
  empty: "", add: null, addPlain: false, menu: null, more: 0, footer: null, history: null });

function withPanel(layout, style, body) {
  const root = document.createElement("section");
  document.body.append(root);
  try {
    const panel = new HubPanel(root, { onRow() {}, onToggle() {}, onMore() {}, onAdd() {}, onRowAction() {} });
    panel.draw(layout);
    style(root);
    const title = () => {
      const node = root.querySelector("[aria-selected=true]");
      return node?.querySelector(".hub__title, .hub__label, .hub__empty-label")?.textContent ?? "";
    };
    const at = (text) => panel.options.findIndex((option) => option.row?.title === text);
    body({ panel, root, title, at });
  } finally {
    root.remove();
  }
}

const lanesGrid = (columns) => (root) => Object.assign(root.querySelector(".hub__list").style,
  { display: "grid", gridTemplateColumns: columns, alignItems: "start", width: "500px" });

test("column target: an area page's full-width top lane has nothing beside it; l there does nothing", () => {
  const layout = { wide: [card("projects", "Pilot", "Rollout")], act: [card("tasks", "A1", "A2")], know: [card("notes", "K1")], page: "area" };
  withPanel(layout, (root) => {
    lanesGrid("300px 200px")(root);
    root.querySelector(".hub__lane--wide").style.gridColumn = "1 / -1";
  }, ({ panel, title, at }) => {
    panel.moveTo(at("Rollout"));
    panel.perform("nextLane");
    assertEqual(title(), "Rollout", "l on the Projects table: the lanes are below it, not beside");
    panel.perform("previousLane");
    assertEqual(title(), "Rollout", "h there neither");
    panel.moveTo(at("A1"));
    panel.perform("nextLane");
    assertEqual(title(), "K1", "l between the lanes under it");
    panel.perform("previousLane");
    assertEqual(title(), "A1", "h back, not up into the table");
    panel.perform("previousLane");
    assertEqual(title(), "A1");
  });
});

test("column target: under 1400 px the lanes stack in one column; h and l do nothing there", () => {
  for (const page of ["project", "area", null]) {
    const layout = { act: [card("tasks", "A1", "A2")], know: [card("notes", "K1")], page };
    withPanel(layout, lanesGrid("minmax(0, 1fr)"), ({ panel, title, at }) => {
      panel.moveTo(at("A2"));
      panel.perform("nextLane");
      assertEqual(title(), "A2", `${page}: l does not drop to the lane below`);
      panel.moveTo(at("K1"));
      panel.perform("previousLane");
      assertEqual(title(), "K1", `${page}: h does not climb to the lane above`);
    });
  }
  const person = { wide: [], cards: [card("waiting", "W"), card("owe", "O"), card("raise", "R")], act: [card("personNotes", "N")],
    know: [card("together", "T")], page: "person" };
  withPanel(person, lanesGrid("minmax(0, 1fr)"), ({ panel, title, at }) => {
    panel.moveTo(at("O"));
    panel.perform("nextLane");
    assertEqual(title(), "O", "a person's cards stacked: l does nothing");
    panel.perform("previousLane");
    assertEqual(title(), "O");
  });
});

test("column target: a project's shared Nothing yet line under both lanes is not a lane beside", () => {
  const empty = (key) => ({ ...card(key), rows: [], empty: `No ${key}` });
  const layout = { act: [card("openTasks", "T1", "T2", "T3", "T4", "T5", "T6")], know: [card("notes", "K1"), empty("files")],
    emptyLine: "foot", page: "project" };
  withPanel(layout, lanesGrid("300px 200px"), ({ panel, root, title, at }) => {
    assertTrue(root.querySelector(".hub__empties--foot"), "the foot line is drawn");
    panel.moveTo(at("T6"));
    panel.perform("nextLane");
    assertEqual(title(), "K1", "l from the last task: the other lane's row, not the line under both");
    panel.moveTo(panel.options.findIndex((option) => option.type === "empty"));
    panel.perform("previousLane");
    assertEqual(title(), "files", "h on the foot line does nothing");
    panel.perform("nextLane");
    assertEqual(title(), "files", "l neither");
  });
});

test("column target: a phase's page draws Tasks and Milestones side by side; h l (← →) cross them, nothing else", () => {
  const sections = [card("tasks", "Draft", "Review", "Ship"), card("milestones", "◆ Sign-off"), card("files", "spec.pdf"), card("notes", "Kickoff")];
  // hub.css: [data-page="phase"] .hub__lane--page, two columns.
  const phaseGrid = (root) => Object.assign(root.querySelector(".hub__lane--page").style,
    { display: "grid", gridTemplateColumns: "250px 250px", alignItems: "start" });
  withPanel(sections, phaseGrid, ({ panel, title, at }) => {
    panel.moveTo(at("Review"));
    panel.perform("nextLane");
    assertEqual(title(), "◆ Sign-off", "l from a task: the milestone beside it");
    panel.perform("nextLane");
    assertEqual(title(), "◆ Sign-off", "no wrap past Milestones");
    panel.perform("previousLane");
    assertEqual(title(), "Draft", "h back to Tasks, the row nearest in height");
    panel.perform("previousLane");
    assertEqual(title(), "Draft", "no wrap past Tasks");
    panel.moveTo(at("spec.pdf"));
    panel.perform("nextLane");
    assertEqual(title(), "Kickoff", "the row under them: Files and Notes side by side too");
    panel.moveTo(at("Ship"));
    panel.perform("nextLane");
    assertEqual(title(), "◆ Sign-off", "never down to Notes");
  });
  // A meeting's (or any note's) sections stack: h and l do nothing.
  withPanel(sections, () => {}, ({ panel, title, at }) => {
    panel.moveTo(at("Ship"));
    panel.perform("nextLane");
    assertEqual(title(), "Ship", "stacked sections: l stays");
  });
});

test("column target: in the note window's panel, h l and ← → are the keys that cross the columns", () => {
  const sections = [card("tasks", "Draft"), card("milestones", "◆ Sign-off")];
  withPanel(sections, (root) => Object.assign(root.querySelector(".hub__lane--page").style,
    { display: "grid", gridTemplateColumns: "250px 250px", alignItems: "start" }), ({ panel, title, at }) => {
    const key = (k) => panel.list.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    panel.moveTo(at("Draft"));
    key("l");
    assertEqual(title(), "◆ Sign-off");
    key("h");
    assertEqual(title(), "Draft");
    key("ArrowRight");
    assertEqual(title(), "◆ Sign-off", "→ as l");
    key("ArrowLeft");
    assertEqual(title(), "Draft", "← as h");
  });
});
