// Follow mode (f in the main window): the labels and matching (ui/follow-hints.js), and the
// overlay on a small fixture (ui/follow-overlay.js): labels drawn, typing activates, Esc clears.
import { HINT_LETTERS, MAX_HINTS, followStep, hintLabels, labelsFor, nextTyped, readingOrder } from "../../static/js/ui/follow-hints.js";
import { installFollowMode } from "../../static/js/ui/follow-overlay.js";
import { assertEqual, assertTrue, test } from "./harness.js";

test("follow hints: one home-row letter for 9 or fewer, else two letters; none starts another", () => {
  assertEqual(hintLabels(0).join(), "");
  assertEqual(hintLabels(3).join(), "a,s,d");
  assertEqual(hintLabels(9).join(), "a,s,d,f,g,h,j,k,l");
  const ten = hintLabels(10);
  assertEqual(ten.length, 10);
  assertTrue(ten.every((label) => label.length === 2), "10: two letters each");
  assertEqual(ten.slice(0, 3).join(), "aa,as,ad");
  assertEqual(HINT_LETTERS, "asdfghjklqwertyuiop");
  assertEqual(MAX_HINTS, 361);
  const all = hintLabels(500);
  assertEqual(all.length, 361, "never more than 361");
  assertEqual(new Set(all).size, 361, "each once");
  assertTrue(all.every((label) => !all.some((other) => other !== label && other.startsWith(label))), "no label is the start of another");
});

test("follow hints: reading order is top to bottom, then left to right; a pixel off is the same line", () => {
  const boxes = [{ top: 100, left: 10 }, { top: 10, left: 300 }, { top: 11, left: 20 }, { top: 100, left: 5 }];
  assertEqual(readingOrder(boxes).join(), "2,1,3,0");
});

test("follow hints: what typed letters reach", () => {
  const labels = hintLabels(12);
  assertEqual(labelsFor("a", labels).length, 12, "all start with a under 20");
  assertEqual(labelsFor("as", labels).join(), "as");
  assertEqual(followStep("a", labels).state, "more");
  assertEqual(followStep("ad", labels).state, "match");
  assertEqual(followStep("ad", labels).label, "ad");
  assertEqual(followStep("s", labels).state, "none");
  assertEqual(followStep("d", hintLabels(4)).label, "d");
  assertEqual(nextTyped("", "A"), "a", "Shift is ignored");
  assertEqual(nextTyped("a", "s"), "as");
  assertEqual(nextTyped("", "z"), null, "not a label letter");
  assertEqual(nextTyped("", "Enter"), null);
});

/** A fixture fixed over the test page: buttons, a listbox of rows, and things that get no label. */
function fixture(buttons) {
  const root = document.createElement("div");
  root.className = "follow-fixture";
  for (const [name, value] of [["position", "fixed"], ["left", "0"], ["top", "0"], ["z-index", "1000"], ["width", "600px"],
    ["background", "white"]]) root.style.setProperty(name, value);
  const clicked = [];
  for (let i = 0; i < buttons; i += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `B${i}`;
    button.addEventListener("click", () => clicked.push(`B${i}`));
    root.append(button);
  }
  const off = document.createElement("button");
  off.textContent = "off";
  off.disabled = true;
  const hidden = document.createElement("button");
  hidden.textContent = "hidden";
  hidden.hidden = true;
  const asleep = document.createElement("div");
  asleep.inert = true;
  asleep.append(Object.assign(document.createElement("button"), { textContent: "inert" }));
  root.append(off, hidden, asleep);
  document.body.append(root);
  return { root, clicked };
}

const press = (node, key, more = {}) => node.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...more }));
const shownLabels = () => [...document.querySelectorAll(".follow-hints__label")].filter((cap) => !cap.hidden).map((cap) => cap.textContent);

test("follow overlay: labels on what can be clicked; its label typed clicks it; Esc clears", () => {
  const { root, clicked } = fixture(3);
  const follow = installFollowMode(root, { root });
  const reached = [];
  root.addEventListener("keydown", (event) => reached.push(event.key));
  try {
    assertTrue(follow.start(), "started");
    assertTrue(follow.active);
    assertEqual(shownLabels().join(), "a,s,d", "the three buttons only: not the disabled, hidden or inert ones");
    const layer = document.querySelector(".follow-hints");
    assertTrue(layer && layer.parentElement === document.body, "a layer over the page");
    assertTrue(document.querySelector(".follow-hints__label").classList.contains("key"), "drawn as key caps");
    press(root.firstChild, "s");
    assertEqual(clicked.join(), "B1", "s clicks the second button");
    assertTrue(!follow.active && !document.querySelector(".follow-hints"), "and the labels go");
    assertEqual(reached.join(), "", "follow mode took the key");
    follow.start();
    press(root.firstChild, "Escape");
    assertTrue(!document.querySelector(".follow-hints"), "Esc removes every label");
    press(root.firstChild, "x");
    assertEqual(reached.join(), "x", "the next key works as normal");
    follow.start();
    press(root.firstChild, "z");
    assertTrue(!follow.active, "a key matching no label ends it");
    follow.start();
    press(root.firstChild, "Backspace");
    assertTrue(!follow.active, "Backspace with nothing typed ends it");
    follow.start();
    root.firstChild.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    assertTrue(!follow.active, "a click ends it");
    assertEqual(clicked.join(), "B1", "nothing else was clicked");
  } finally {
    follow.stop();
    root.remove();
  }
});

test("follow overlay: over 9 targets, two letters; the first hides the rest; Backspace takes it back", () => {
  const { root, clicked } = fixture(12);
  const follow = installFollowMode(root, { root });
  try {
    follow.start();
    const labels = shownLabels();
    assertEqual(labels.length, 12);
    assertTrue(labels.every((label) => label.length === 2), labels.join());
    press(root.firstChild, "A", { shiftKey: true });
    assertEqual(shownLabels().length, 12, "all twelve start with a");
    press(root.firstChild, "Backspace");
    assertTrue(follow.active, "Backspace with a letter typed takes it back");
    press(root.firstChild, "a");
    press(root.firstChild, "f");
    assertEqual(clicked.join(), "B3", "af is the fourth");
  } finally {
    follow.stop();
    root.remove();
  }
});

test("follow overlay: a list row is focused and opened; a listbox whose click only selects gets Enter", () => {
  const root = document.createElement("div");
  for (const [name, value] of [["position", "fixed"], ["left", "0"], ["top", "0"], ["z-index", "1000"], ["background", "white"]]) {
    root.style.setProperty(name, value);
  }
  const list = document.createElement("div");
  list.setAttribute("role", "listbox");
  list.tabIndex = 0;
  list.dataset.follow = "enter";
  const events = [];
  for (const name of ["one", "two"]) {
    const row = document.createElement("div");
    row.setAttribute("role", "option");
    row.id = `follow-row-${name}`;
    row.textContent = name;
    list.append(row);
  }
  list.addEventListener("click", (event) => {
    list.setAttribute("aria-activedescendant", event.target.closest("[role=option]").id);
    list.focus();
    events.push(`select ${event.target.textContent}`);
  });
  list.addEventListener("keydown", (event) => events.push(`${event.key} ${list.getAttribute("aria-activedescendant")}`));
  root.append(list);
  document.body.append(root);
  const follow = installFollowMode(root, { root });
  try {
    follow.start();
    assertEqual(shownLabels().join(), "a,s", "a label per row");
    press(list, "s");
    assertEqual(events.join("|"), "select two|Enter follow-row-two");
    assertTrue(document.activeElement === list, "the listbox has the focus");
  } finally {
    follow.stop();
    root.remove();
  }
});
