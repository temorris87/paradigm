// The calendar's dialogs give the focus back to the block they were opened for: a menu's choice
// removed the menu, so before the dialog the focus was on the page body. If the block was
// redrawn away, the calendar gets it.
import { CalendarPage } from "../../static/js/calendar/calendar-page.js";
import { assertEqual as same, test } from "./harness.js";

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

test("calendar focus: Cancel in Cancel the meeting puts the focus on the block", async () => {
  const { page, root, nodes } = calendarWith("m1");
  const closed = page.cancelMeeting(BLOCK, true);
  [...document.querySelectorAll("dialog .dialog__button")].find((button) => button.textContent === "Cancel").click();
  same(await closed, null, "nothing changed");
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
