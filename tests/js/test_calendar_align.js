// The week grid's heading and all-day row line up with the hour grid's columns, even with a
// classic scroll bar on the scroller (Windows). Drawn with the real calendar.css in a shadow
// root, so its rules never touch the test page.
import { GridView } from "../../static/js/calendar/grid-view.js";
import { assertEqual as same, assertTrue, test } from "./harness.js";

const DAYS = ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"];
const SHEETS = ["../../static/css/nord.css", "../../static/css/calendar.css"];
// A Windows-like scroll bar, 17 px and always shown. Every box that keeps the scroll bar's room
// gets it, as the system's scroll bar would be on all of them. Chrome only: Firefox has no way
// to force a width, so there the check runs on whatever scroll bar it draws.
const CLASSIC_BAR = `
  .cal-head::-webkit-scrollbar, .cal-allday::-webkit-scrollbar, .cal-scroll::-webkit-scrollbar { width: 17px; }
  .cal-scroll::-webkit-scrollbar-thumb { background: grey; }`;
const canForceBar = () => CSS.supports("selector(::-webkit-scrollbar)");

/** A week grid in a 900 x 420 box; extra CSS lands after calendar.css. */
async function drawGrid(extraCss = "") {
  const host = document.createElement("div");
  host.style.setProperty("position", "fixed");
  host.style.setProperty("left", "0");
  host.style.setProperty("top", "0");
  document.body.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  const loads = SHEETS.map((path) => new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL(path, import.meta.url).href;
    link.addEventListener("load", resolve);
    link.addEventListener("error", () => reject(new Error(`could not load ${path}`)));
    shadow.append(link);
  }));
  const style = document.createElement("style");
  style.textContent = `.cal-view { width: 900px; height: 420px; min-height: 0; } .cal-week { height: 100%; }${extraCss}`;
  const view = document.createElement("div");
  view.className = "cal-view";
  const week = document.createElement("div");
  week.className = "cal-week";
  view.append(week);
  shadow.append(style, view);
  await Promise.all(loads);
  const grid = new GridView(week, { onBlockDown() {}, onSlotClick() {}, onBlockMenu() {}, onChip() {} });
  const capacity = Object.fromEntries(DAYS.map((day) => [day, { workMin: 480, meetingMin: 60, focusMin: 0, freeMin: 420 }]));
  grid.draw({
    days: DAYS,
    today: DAYS[2],
    now: 600,
    selected: "allday",
    capacity,
    chips: {},
    blocks: [
      { key: "allday", kind: "meeting", title: "Offsite", day: DAYS[4], timed: false },
      { key: "standup", kind: "meeting", title: "Standup", day: DAYS[0], timed: true, start: 540, end: 570 },
    ],
  });
  return { host, shadow, grid };
}

function assertAligned(shadow, selector) {
  const columns = [...shadow.querySelectorAll(".cal-col")].map((node) => node.getBoundingClientRect());
  const cells = [...shadow.querySelectorAll(selector)].map((node) => node.getBoundingClientRect());
  same(columns.length, DAYS.length, "columns");
  same(cells.length, DAYS.length, selector);
  cells.forEach((cell, index) => {
    const column = columns[index];
    assertTrue(Math.abs(cell.left - column.left) <= 1 && Math.abs(cell.right - column.right) <= 1,
      `${selector} ${index}: ${cell.left}-${cell.right} vs column ${column.left}-${column.right}`);
  });
}

async function withGrid(extraCss, check) {
  const drawn = await drawGrid(extraCss);
  try {
    check(drawn);
  } finally {
    drawn.host.remove();
  }
}

test("calendar align: headings and all-day cells match their columns", () => withGrid("", ({ shadow }) => {
  assertAligned(shadow, ".cal-dayhead");
  assertAligned(shadow, ".cal-allday__cell");
}));

test("calendar align: still matches with a classic 17 px scroll bar", () => withGrid(CLASSIC_BAR, ({ shadow }) => {
  const scroller = shadow.querySelector(".cal-scroll");
  if (canForceBar()) assertTrue(scroller.offsetWidth - scroller.clientWidth > 0, "the scroller has a scroll bar");
  assertAligned(shadow, ".cal-dayhead");
  assertAligned(shadow, ".cal-allday__cell");
}));

test("calendar align: the room is kept when the day does not scroll", () => withGrid(`${CLASSIC_BAR} .cal-body { height: 100px; overflow: hidden; }`, ({ shadow }) => {
  const scroller = shadow.querySelector(".cal-scroll");
  same(scroller.scrollHeight <= scroller.clientHeight, true, "the day fits");
  assertAligned(shadow, ".cal-dayhead");
  assertAligned(shadow, ".cal-allday__cell");
}));

test("calendar align: the selected all-day block's outline is not clipped", () => withGrid(CLASSIC_BAR, ({ shadow }) => {
  // The row clips to its padding box, less the scroll bar's room on the right.
  const rowNode = shadow.querySelector(".cal-allday");
  const box = rowNode.getBoundingClientRect();
  const row = { left: box.left + rowNode.clientLeft, top: box.top + rowNode.clientTop };
  Object.assign(row, { right: row.left + rowNode.clientWidth, bottom: row.top + rowNode.clientHeight });
  const block = shadow.querySelector(".cal-allday .cal-block--selected").getBoundingClientRect();
  const outline = 2;
  assertTrue(block.left - outline >= row.left - 0.5 && block.right + outline <= row.right + 0.5
    && block.top - outline >= row.top - 0.5 && block.bottom + outline <= row.bottom + 0.5,
  `outline inside the row: block ${block.left},${block.top}-${block.right},${block.bottom} row ${row.left},${row.top}-${row.right},${row.bottom}`);
}));

test("calendar align: the heading and all-day rows keep their full height", () => withGrid(CLASSIC_BAR, ({ shadow }) => {
  // They clip their overflow, so a row that shrank in the flex column would cut its contents.
  for (const selector of [".cal-head", ".cal-allday"]) {
    const row = shadow.querySelector(selector);
    assertTrue(row.scrollHeight <= row.clientHeight, `${selector} not clipped: ${row.scrollHeight} > ${row.clientHeight}`);
  }
}));

test("calendar align: a slot click still finds Friday 14:00", () => withGrid(CLASSIC_BAR, ({ shadow, grid }) => {
  grid.scrollToMinute(13 * 60);
  const friday = shadow.querySelector(`.cal-col[data-day="${DAYS[4]}"]`).getBoundingClientRect();
  const y = friday.top + 14 * grid.hourPx + 1;
  const slot = grid.slotAt(friday.left + 5, y);
  same(slot?.day, DAYS[4], "day");
  same(Math.floor(slot.minute / 60), 14, "hour");
}));
