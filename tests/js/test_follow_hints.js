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
  assertEqual(ten.slice(0, 3).join(), "aa,sa,da");
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

test("follow hints: lines are grouped from their first top, so a drift of tops can't chain lines together", () => {
  // Tops 0, 2, 4: 4 is more than 2 below the line's first top (0), so it starts a line, even though
  // it is within 2 of 2. A pairwise 2 px rule would order these differently depending on the sort.
  const boxes = [{ top: 4, left: 1 }, { top: 2, left: 30 }, { top: 0, left: 20 }, { top: 4, left: 0 }];
  assertEqual(readingOrder(boxes).join(), "2,1,3,0");
  const shuffled = [boxes[3], boxes[1], boxes[0], boxes[2]];
  assertEqual(readingOrder(shuffled).map((index) => shuffled[index].left).join(), "20,30,0,1", "the same order whatever the input order");
  assertEqual(readingOrder([{ top: 5, left: 5 }, { top: 5, left: 5 }]).join(), "0,1", "ties keep their order");
});

test("follow hints: over 9, the first letters are spread so the first one typed narrows the labels", () => {
  for (const n of [10, 12, 19, 20, 37, 38, 100, 200, 360, 361]) {
    const labels = hintLabels(n);
    assertEqual(labels.length, n, `${n}: count`);
    assertEqual(new Set(labels).size, n, `${n}: each once`);
    assertTrue(labels.every((label) => label.length === 2), `${n}: two letters each`);
    const firsts = [...new Set(labels.map((label) => label[0]))];
    assertEqual(firsts.length, Math.min(19, n), `${n}: first letters used`);
    const most = Math.ceil(n / 19);
    assertTrue(firsts.every((first) => labelsFor(first, labels).length <= most), `${n}: at most ${most} per first letter`);
    // Contiguous groups in reading order: once a first letter is left it never comes back.
    const runs = labels.map((label) => label[0]).filter((first, index, all) => first !== all[index - 1]);
    assertEqual(runs.length, firsts.length, `${n}: one run per first letter`);
    assertEqual(firsts.join(""), HINT_LETTERS.slice(0, firsts.length), `${n}: first letters in order`);
  }
  assertEqual(hintLabels(12).slice(0, 3).join(), "aa,sa,da");
  assertEqual(hintLabels(20).slice(0, 4).join(), "aa,as,sa,da", "the extra label goes to the first letters");
});

test("follow hints: what typed letters reach", () => {
  const labels = hintLabels(12);
  assertEqual(labelsFor("a", labels).join(), "aa", "a first letter narrows to its group");
  assertEqual(labelsFor("sa", labels).join(), "sa");
  assertEqual(followStep("a", labels).state, "more");
  assertEqual(followStep("da", labels).state, "match");
  assertEqual(followStep("da", labels).label, "da");
  assertEqual(followStep("z", labels).state, "none");
  assertEqual(followStep("as", labels).state, "none");
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
    press(root.firstChild, "F", { shiftKey: true });
    assertEqual(shownLabels().join(), "fa", "the first letter hides the rest");
    press(root.firstChild, "Backspace");
    assertTrue(follow.active, "Backspace with a letter typed takes it back");
    assertEqual(shownLabels().length, 12, "all shown again");
    press(root.firstChild, "f");
    press(root.firstChild, "a");
    assertEqual(clicked.join(), "B3", "fa is the fourth");
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

/** Buttons into a fixture, each recording its name when clicked. */
function addButtons(root, names, clicked) {
  for (const name of names) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = name;
    button.addEventListener("click", () => clicked.push(name));
    root.append(button);
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("follow overlay: the app's redraw draws labels for the targets now on screen", () => {
  const { root, clicked } = fixture(3);
  const redraws = new EventTarget();
  const follow = installFollowMode(root, { root, redraws });
  try {
    follow.start();
    const old = [...root.querySelectorAll("button")].slice(0, 3);
    old.forEach((button) => button.remove());
    addButtons(root, ["N0", "N1", "N2", "N3"], clicked);
    redraws.dispatchEvent(new Event("redraw"));
    assertTrue(follow.active, "still on");
    assertEqual(shownLabels().join(), "a,s,d,f", "a label per new button");
    assertEqual(document.querySelectorAll(".follow-hints").length, 1, "one layer");
    press(root, "f");
    assertEqual(clicked.join(), "N3", "the new fourth button");
  } finally {
    follow.stop();
    root.remove();
  }
});

test("follow overlay: a labelled target leaving the page redraws the labels", async () => {
  const { root, clicked } = fixture(3);
  const follow = installFollowMode(root, { root });
  try {
    follow.start();
    root.querySelector("button").remove();
    addButtons(root, ["N0"], clicked);
    await settle();
    assertTrue(follow.active, "still on");
    assertEqual(shownLabels().join(), "a,s,d", "B1, B2 and the new one");
    press(root, "d");
    assertEqual(clicked.join(), "N0");
  } finally {
    follow.stop();
    root.remove();
  }
});

test("follow overlay: a redraw keeps the letters typed while they still start a label, else ends", () => {
  const { root, clicked } = fixture(12);
  const redraws = new EventTarget();
  const follow = installFollowMode(root, { root, redraws });
  const swap = (count) => {
    root.querySelectorAll("button:not([disabled]):not([hidden])").forEach((button) => button.closest("[inert]") || button.remove());
    addButtons(root, Array.from({ length: count }, (_, i) => `N${i}`), clicked);
    redraws.dispatchEvent(new Event("redraw"));
  };
  try {
    follow.start();
    press(root, "f");
    swap(12);
    assertTrue(follow.active, "f still starts a label");
    assertEqual(shownLabels().join(), "fa", "and only its labels are shown");
    press(root, "a");
    assertEqual(clicked.join(), "N3", "the new fourth button");
    follow.start();
    press(root, "q");
    swap(3);
    assertTrue(!follow.active, "q starts no label of three: follow mode ends");
    assertTrue(!document.querySelector(".follow-hints"), "and its labels go");
  } finally {
    follow.stop();
    root.remove();
  }
});

test("follow overlay: a label whose target left the page acts on nothing", () => {
  const { root, clicked } = fixture(3);
  const follow = installFollowMode(root, { root });
  try {
    follow.start();
    const second = root.querySelectorAll("button")[1];
    second.click = () => clicked.push("detached click");
    second.remove();
    press(root, "s"); // before any observer has run
    assertEqual(clicked.join(), "", "nothing was clicked");
    assertTrue(follow.active, "the labels are redrawn instead");
    assertEqual(shownLabels().join(), "a,s", "for B0 and B2");
    press(root, "s");
    assertEqual(clicked.join(), "B2");
  } finally {
    follow.stop();
    root.remove();
  }
});

test("follow overlay: a Week block and a tray item are pressed near their top, then clicked", () => {
  const root = document.createElement("div");
  for (const [name, value] of [["position", "fixed"], ["left", "0"], ["top", "0"], ["z-index", "1000"], ["width", "300px"],
    ["background", "white"]]) root.style.setProperty(name, value);
  const block = document.createElement("div");
  block.className = "cal-block";
  block.setAttribute("role", "button");
  block.textContent = "Standup";
  block.style.setProperty("height", "60px");
  const tray = document.createElement("div");
  tray.className = "cal-task";
  const grip = document.createElement("div");
  grip.className = "cal-task__grip";
  grip.textContent = "Write report";
  grip.style.setProperty("height", "30px");
  tray.append(grip);
  const row = document.createElement("div");
  row.className = "tree__row";
  row.textContent = "Projects";
  root.append(block, tray, row);
  document.body.append(root);
  const events = [];
  for (const node of [block, grip, row]) {
    for (const type of ["pointerdown", "pointerup", "click"]) {
      node.addEventListener(type, (event) => {
        const top = node.getBoundingClientRect().top;
        events.push(type === "click" ? `${node.textContent} click` : `${node.textContent} ${type} ${event.buttons} ${event.clientY - top <= 6}`);
      });
    }
  }
  const follow = installFollowMode(root, { root });
  try {
    assertTrue(follow.start());
    assertEqual(shownLabels().join(), "a,s,d", "the block, the tray item's grip and the tree row");
    press(root, "a");
    assertEqual(events.join("|"), "Standup pointerdown 1 true|Standup pointerup 0 true|Standup click", "the block");
    events.length = 0;
    follow.start();
    press(root, "s");
    assertEqual(events.join("|"), "Write report pointerdown 1 true|Write report pointerup 0 true|Write report click", "the tray item");
    events.length = 0;
    follow.start();
    press(root, "d");
    assertEqual(events.join("|"), "Projects click", "a navigator tree row is clicked, not pressed");
  } finally {
    follow.stop();
    root.remove();
  }
});

test("follow overlay: a real scroll ends it, and so does a resize", async () => {
  const { root } = fixture(2);
  const scroller = document.createElement("div");
  scroller.style.setProperty("height", "40px");
  scroller.style.setProperty("overflow", "auto");
  const tall = document.createElement("div");
  tall.style.setProperty("height", "400px");
  scroller.append(tall);
  root.append(scroller);
  const follow = installFollowMode(root, { root });
  try {
    follow.start();
    const scrolled = new Promise((resolve) => scroller.addEventListener("scroll", resolve, { once: true }));
    scroller.scrollTop = 100;
    await Promise.race([scrolled, new Promise((resolve) => setTimeout(resolve, 500))]);
    assertTrue(scroller.scrollTop > 0, "it scrolled");
    assertTrue(!follow.active, "a scroll ends it");
    follow.start();
    root.dispatchEvent(new Event("resize"));
    assertTrue(!follow.active, "a resize ends it");
  } finally {
    follow.stop();
    root.remove();
  }
});

test("follow overlay: off-screen, inert and disabled things get no label", () => {
  const { root } = fixture(1);
  const place = (text, side, value) => {
    const button = document.createElement("button");
    button.textContent = text;
    button.style.setProperty("position", "fixed");
    button.style.setProperty(side, value);
    root.append(button);
  };
  place("left of the window", "left", "-500px");
  place("below the window", "top", `${window.innerHeight + 100}px`);
  const disabled = document.createElement("a");
  disabled.href = "#x";
  disabled.textContent = "aria-disabled";
  disabled.setAttribute("aria-disabled", "true");
  root.append(disabled);
  const follow = installFollowMode(root, { root });
  try {
    follow.start();
    assertEqual(shownLabels().join(), "a", "only B0: not the disabled, hidden, inert or off-screen ones");
  } finally {
    follow.stop();
    root.remove();
  }
});
