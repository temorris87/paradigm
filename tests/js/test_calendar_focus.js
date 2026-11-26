// The calendar's dialogs and menu choices give the focus back to the block they were opened
// for: a menu's choice removed the menu, so the focus was on the page body. If the block was
// redrawn away, the calendar gets it. A redraw keeps a focused block focused.
import { CalendarPage } from "../../static/js/calendar/calendar-page.js";
import { GridView } from "../../static/js/calendar/grid-view.js";
import { assertEqual as same, assertTrue, test } from "./harness.js";

const key = (target, name) => target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));

/** A page with only what its dialogs use: the grid's block nodes and the calendar's root. */
function calendarWith(...keys) {
  const root = document.createElement("div");
  root.tabIndex = -1;
  const nodes = new Map(keys.map((each) => {
    const node = document.createElement("div");
    node.tabIndex = -1;
    root.append(node);
    return [each, node];
  }));
  document.body.append(root);
  const page = Object.create(CalendarPage.prototype);
  Object.assign(page, { root, grid: { blockNodeFor: (each) => nodes.get(each) ?? null } });
  document.activeElement?.blur();
  return { page, root, nodes };
}

const BLOCK = { key: "m1", kind: "meeting", id: 1, title: "Standup", day: "2026-11-23", timed: true, start: 540, end: 570 };

test("calendar focus: Esc in Edit time… puts the focus on the block", async () => {
  const { page, root, nodes } = calendarWith("m1");
  const closed = page.editTime(BLOCK);
  key(document.activeElement, "Escape");
  same(await closed, null, "cancelled");
  same(document.activeElement, nodes.get("m1"));
  root.remove();
});

test("calendar focus: Keep the meeting in Cancel the meeting puts the focus on the block", async () => {
  const { page, root, nodes } = calendarWith("m1");
  const closed = page.cancelMeeting(BLOCK, true);
  same(document.activeElement?.textContent, "Keep the meeting", "opens on the safe button");
  // Enter on a focused button clicks it, as the browser does.
  document.activeElement.click();
  same(await closed, null, "nothing changed");
  same(document.activeElement, nodes.get("m1"));
  root.remove();
});

test("calendar focus: Cancel the meeting, confirmed, cancels it and puts the focus on the block", async () => {
  const { page, root, nodes } = calendarWith("m1");
  const calls = [];
  Object.assign(page, { api: { meetings: { cancel: async (...args) => { calls.push(args); } } }, changed: async () => {} });
  const closed = page.cancelMeeting(BLOCK, true);
  document.querySelector("dialog .dialog__button--ok").click();
  same(await closed, true, "confirmed");
  same(JSON.stringify(calls), JSON.stringify([[1, true]]), "the meeting is cancelled");
  same(document.activeElement, nodes.get("m1"));
  root.remove();
});

test("calendar focus: Not cancelled, with no dialog, puts the focus on the block", async () => {
  const { page, root, nodes } = calendarWith("m1");
  const calls = [];
  Object.assign(page, { api: { meetings: { cancel: async (...args) => { calls.push(args); } } }, changed: async () => {} });
  await page.cancelMeeting({ ...BLOCK, cancelled: true }, false);
  same(JSON.stringify(calls), JSON.stringify([[1, false]]), "the meeting is no longer cancelled");
  same(document.activeElement, nodes.get("m1"));
  root.remove();
});

test("calendar focus: a block redrawn away leaves the focus on the calendar", async () => {
  const { page, root } = calendarWith();
  const closed = page.editTime(BLOCK);
  key(document.activeElement, "Escape");
  await closed;
  same(document.activeElement, root);
  root.remove();
});

// ---- a redraw while a block has the focus (the import on window focus, another window's change)

const DAY = "2026-11-23";
const STANDUP = { key: "m1", kind: "meeting", title: "Standup", day: DAY, timed: true, start: 540, end: 570 };
const REVIEW = { key: "m2", kind: "meeting", title: "Review", day: DAY, timed: true, start: 600, end: 630 };

/** A week grid of one day in the page; lost counts the onFocusLost calls. */
function gridWith(...blocks) {
  const week = document.createElement("div");
  document.body.append(week);
  const counts = { lost: 0 };
  const grid = new GridView(week, { onBlockDown() {}, onSlotClick() {}, onBlockMenu() {}, onChip() {},
    onFocusLost: () => { counts.lost += 1; } });
  const draw = (...shown) => grid.draw({ days: [DAY], blocks: shown, today: DAY, now: null, selected: null });
  draw(...blocks);
  return { week, grid, draw, counts };
}

test("calendar focus: a redraw keeps the focus on the block's new node", () => {
  const { week, grid, draw, counts } = gridWith(STANDUP, REVIEW);
  const old = grid.blockNodeFor("m2");
  old.focus();
  draw(STANDUP, REVIEW);
  assertTrue(grid.blockNodeFor("m2") !== old, "the node was rebuilt");
  same(document.activeElement, grid.blockNodeFor("m2"));
  same(counts.lost, 0);
  week.remove();
});

test("calendar focus: a redraw without the focused block calls onFocusLost", () => {
  const { week, grid, draw, counts } = gridWith(STANDUP, REVIEW);
  grid.blockNodeFor("m2").focus();
  draw(STANDUP);
  same(counts.lost, 1);
  week.remove();
});

test("calendar focus: a redraw leaves focus elsewhere alone", () => {
  const { week, grid, draw, counts } = gridWith(STANDUP);
  const input = document.createElement("input");
  document.body.append(input);
  input.focus();
  draw(STANDUP);
  same(document.activeElement, input);
  same(counts.lost, 0);
  document.activeElement?.blur();
  draw(STANDUP);
  same(document.activeElement, document.body, "no focus stays no focus");
  same(counts.lost, 0);
  input.remove();
  week.remove();
});

// ---- a menu choice with no dialog

test("calendar focus: a menu choice with no dialog ends on the block", async () => {
  const { page, root, nodes } = calendarWith("m1");
  let finish;
  page.stayOn(BLOCK, new Promise((resolve) => { finish = resolve; }));
  same(document.activeElement, nodes.get("m1"), "at once");
  document.activeElement.blur();
  finish();
  await new Promise((resolve) => setTimeout(resolve));
  same(document.activeElement, nodes.get("m1"), "once it is done");
  root.remove();
});

test("calendar focus: a menu choice that removed the block ends on the calendar", async () => {
  const { page, root, nodes } = calendarWith("m1");
  const removed = Promise.resolve().then(() => {
    nodes.get("m1").remove();
    nodes.delete("m1");
  });
  page.stayOn(BLOCK, removed);
  await new Promise((resolve) => setTimeout(resolve));
  same(document.activeElement, root);
  root.remove();
});
