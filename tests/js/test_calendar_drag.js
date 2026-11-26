// A drag on the calendar ends with a click on the grid's body, which reads as a click on an empty
// slot and opens New meeting. trackDrag swallows that one click, and only that one.
import { trackDrag } from "../../static/js/calendar/drag.js";
import { assertEqual as same, test } from "./harness.js";

const POINTER = 7;
const pointer = (type, x, y) => new PointerEvent(type, { pointerId: POINTER, clientX: x, clientY: y, bubbles: true, cancelable: true });
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A grid body with one block and one empty column; counts the clicks the body sees. */
function grid() {
  const body = document.createElement("div");
  const block = document.createElement("div");
  const column = document.createElement("div");
  body.append(block, column);
  document.body.append(body);
  const seen = { slotClicks: 0, calls: [] };
  body.addEventListener("click", () => { seen.slotClicks += 1; });
  return { body, block, column, seen };
}

function press(block, seen) {
  const down = pointer("pointerdown", 100, 100);
  block.dispatchEvent(down);
  trackDrag(down, {
    onStart: () => seen.calls.push("start"),
    onDrop: () => seen.calls.push("drop"),
    onClick: () => seen.calls.push("click"),
    onCancel: () => seen.calls.push("cancel"),
  });
}

/** What the browser does when the button goes up: pointerup, then click on the common ancestor. */
function release(target, x, y) {
  target.dispatchEvent(pointer("pointerup", x, y));
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

test("calendar drag: a drop does not click the slot under it", async () => {
  const { body, block, column, seen } = grid();
  press(block, seen);
  window.dispatchEvent(pointer("pointermove", 100, 160));
  release(column, 100, 160);
  same(seen.calls.join(","), "start,drop");
  same(seen.slotClicks, 0, "slot clicks after the drop");
  await nextTick();
  column.click();
  same(seen.slotClicks, 1, "a later click on an empty slot still counts");
  body.remove();
});

test("calendar drag: a press without a move is still a click", async () => {
  const { body, block, seen } = grid();
  press(block, seen);
  window.dispatchEvent(pointer("pointermove", 102, 101));
  release(block, 102, 101);
  same(seen.calls.join(","), "click");
  same(seen.slotClicks, 1, "the click reaches the grid as before");
  body.remove();
});

test("calendar drag: Escape mid-drag cancels, and the release clicks nothing", async () => {
  const { body, block, column, seen } = grid();
  press(block, seen);
  window.dispatchEvent(pointer("pointermove", 100, 160));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  same(seen.calls.join(","), "start,cancel");
  release(column, 100, 160);
  same(seen.slotClicks, 0, "slot clicks after the release");
  same(seen.calls.join(","), "start,cancel", "no drop after a cancel");
  await nextTick();
  column.click();
  same(seen.slotClicks, 1, "a later click on an empty slot still counts");
  body.remove();
});
