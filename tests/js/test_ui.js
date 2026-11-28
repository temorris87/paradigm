// The shared menu, picker and dialogs (static/js/ui/).
import { confirmDialog, formDialog } from "../../static/js/ui/dialog.js";
import { closeMenu, openMenu, openedMenu } from "../../static/js/ui/menu.js";
import { filterItems, pickFrom } from "../../static/js/ui/picker.js";
import { UI_KEYS, uiAction } from "../../static/js/ui/ui-keys.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const key = (target, name) => target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function withAnchor(body) {
  const anchor = document.createElement("button");
  document.body.append(anchor);
  try {
    return body(anchor);
  } finally {
    closeMenu();
    anchor.remove();
  }
}

test("ui keys: every key is in one scope's table once", () => {
  for (const scope of new Set(UI_KEYS.map((each) => each.scope))) {
    const keys = UI_KEYS.filter((each) => each.scope === scope).flatMap((each) => each.keys);
    assertEqual(new Set(keys).size, keys.length, scope);
  }
  assertEqual(uiAction({ key: "j" }, "menu"), "next");
  assertEqual(uiAction({ key: "j" }, "picker"), null, "j types in a picker");
  assertEqual(uiAction({ key: "j", ctrlKey: true }, "menu"), null);
});

test("ui keys: follow mode's own keys are its table's: Backspace takes back, Esc ends it", () => {
  const follow = UI_KEYS.filter((each) => each.scope === "follow");
  assertEqual(follow.map((each) => `${each.keys.join()} ${each.action}`).join("|"), "Backspace back|Escape close|Tab leave");
  assertTrue(follow.every((each) => !/[()]/.test(each.help)), "help without brackets: f's help wraps them in its own");
  assertTrue(follow.every((each) => each.help), "each has its help");
  assertEqual(uiAction({ key: "Backspace" }, "follow"), "back");
  assertEqual(uiAction({ key: "Escape" }, "follow"), "close");
  assertEqual(uiAction({ key: "Tab" }, "follow"), "leave");
  assertEqual(uiAction({ key: "a" }, "follow"), null, "a label's letters are the labels', not bound keys");
});

test("menu: keys move over enabled items, Enter runs one and closes", () => withAnchor((anchor) => {
  const ran = [];
  openMenu(anchor, [
    { label: "One", run: () => ran.push(1) },
    "separator",
    { group: "Group" },
    { label: "Off", disabled: true, run: () => ran.push(2) },
    { label: "Three", checked: true, run: () => ran.push(3) },
  ]);
  const menu = document.querySelector(".menu");
  assertTrue(menu, "shown");
  assertEqual(anchor.getAttribute("aria-expanded"), "true");
  assertEqual(menu.querySelectorAll("[role=menuitemradio]")[0].getAttribute("aria-checked"), "true");
  key(menu, "j");
  key(document.activeElement, "Enter");
  assertEqual(ran.join(), "3", "the disabled item is skipped");
  assertEqual(document.querySelector(".menu"), null, "closed");
  assertEqual(openedMenu(), null);
}));

test("menu: Escape closes it and gives the focus back to its button", () => withAnchor((anchor) => {
  openMenu(anchor, [{ label: "One", run: () => {} }]);
  key(document.querySelector(".menu"), "Escape");
  assertEqual(document.querySelector(".menu"), null);
  assertEqual(document.activeElement, anchor);
  assertEqual(anchor.getAttribute("aria-expanded"), "false");
}));

test("menu: Escape after the page redrew its button gives the focus to fallbackFocus", () => withAnchor((anchor) => {
  const redrawn = document.createElement("button");
  document.body.append(redrawn);
  try {
    openMenu(anchor, [{ label: "One", run: () => {} }], { fallbackFocus: () => redrawn.focus() });
    anchor.remove();
    key(document.querySelector(".menu"), "Escape");
    assertEqual(document.querySelector(".menu"), null);
    assertEqual(document.activeElement, redrawn);
  } finally {
    redrawn.remove();
  }
}));

test("menu: back() takes the focus on Escape and before a choice runs (a dialog then returns there)", () => withAnchor((anchor) => {
  const home = document.createElement("div");
  home.tabIndex = 0;
  document.body.append(home);
  try {
    const back = () => home.focus();
    openMenu(anchor, [{ label: "One", run: () => {} }], { back });
    key(document.querySelector(".menu"), "Escape");
    assertEqual(document.activeElement, home, "Escape: back(), not the button");
    let focusedWhenRun = null;
    openMenu(anchor, [{ label: "One", run: () => { focusedWhenRun = document.activeElement; } }], { back });
    key(document.activeElement, "Enter");
    assertEqual(focusedWhenRun, home, "the chosen action starts from back()'s focus");
  } finally {
    home.remove();
  }
}));

test("menu: opening another closes the first; a click outside closes it", () => withAnchor((anchor) => {
  openMenu(anchor, [{ label: "One", run: () => {} }]);
  openMenu(anchor, [{ label: "Two", run: () => {} }]);
  assertEqual(document.querySelectorAll(".menu").length, 1);
  document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  assertEqual(document.querySelector(".menu"), null);
}));

test("picker: every word must match; title matches come first", () => {
  const items = [
    { id: 1, title: "Kickoff", detail: "Projects › Acme" },
    { id: 2, title: "Acme", detail: "Projects" },
    { id: 3, title: "Acme kick notes", detail: "Inbox" },
  ];
  assertEqual(filterItems(items, "acme kick").map((item) => item.id).join(), "3,1");
  assertEqual(filterItems(items, "").length, 3);
  assertEqual(filterItems(items, "nothing").length, 0);
});

test("picker: typing narrows, arrows move, Enter takes; a create row for new text", async () => {
  const items = [{ id: 1, title: "Jane Doe" }, { id: 2, title: "Bob Lee" }];
  let result = pickFrom({ title: "Person", items, create: (text) => `Add "${text}"` });
  let box = document.querySelector(".picker__box");
  assertEqual(document.querySelectorAll(".picker [role=option]").length, 2);
  key(box, "ArrowDown");
  key(box, "Enter");
  assertEqual((await result).item.id, 2);
  result = pickFrom({ title: "Person", items, create: (text) => `Add "${text}"` });
  box = document.querySelector(".picker__box");
  box.value = "Ann";
  box.dispatchEvent(new Event("input"));
  assertEqual(document.querySelector(".picker__row--create").textContent, 'Add "Ann"');
  key(box, "Enter");
  assertEqual((await result).create, "Ann");
  result = pickFrom({ title: "Person", items });
  key(document.querySelector(".picker__box"), "Escape");
  assertEqual(await result, null);
  assertEqual(document.querySelector(".picker"), null, "gone");
});

test("form dialog: an error from run shows and keeps it open; then it closes with the answer", async () => {
  let tries = 0;
  const result = formDialog({
    title: "Rename",
    fields: [{ key: "title", label: "Title", value: "Old" }],
    submit: (values) => (values.title === "Old" ? "Keep" : "Rename"),
    run: async ({ title }) => {
      tries += 1;
      if (tries === 1) throw new Error("There is already a note called 'Old' there");
      return title;
    },
  });
  const dialog = document.querySelector("dialog.dialog");
  const input = dialog.querySelector("input");
  const ok = dialog.querySelector(".dialog__button--ok");
  assertEqual(ok.textContent, "Keep");
  dialog.querySelector("form").requestSubmit();
  await tick();
  assertTrue(dialog.isConnected, "still open");
  assertTrue(!dialog.querySelector(".dialog__error").hidden, "the error shows");
  input.value = "New";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  assertEqual(ok.textContent, "Rename", "the label follows the field");
  dialog.querySelector("form").requestSubmit();
  assertEqual(await result, "New");
  assertTrue(!dialog.isConnected);
});

test("form dialog: an empty required field is refused; Escape cancels with null", async () => {
  let ran = false;
  const result = formDialog({ title: "New", fields: [{ key: "title", label: "Title" }], run: () => { ran = true; } });
  const dialog = document.querySelector("dialog.dialog");
  dialog.querySelector("form").requestSubmit();
  await tick();
  assertEqual(dialog.querySelector(".dialog__error").textContent, "Title is needed");
  key(dialog.querySelector("input"), "Escape");
  assertEqual(await result, null);
  assertTrue(!ran);
});

test("confirm dialog: safeFocus opens it on Cancel", async () => {
  let ran = false;
  const result = confirmDialog({ title: "Delete?", text: "Really", confirm: "Delete", danger: true, safeFocus: true,
    run: async () => { ran = true; } });
  const dialog = document.querySelector("dialog.dialog");
  assertEqual(document.activeElement?.textContent, "Cancel");
  document.activeElement.click();
  assertEqual(await result, null);
  assertTrue(!ran);
  assertTrue(!dialog.isConnected);
});

test("confirm dialog: a red confirm opens on Cancel without safeFocus", async () => {
  let ran = false;
  const result = confirmDialog({ title: "Trash?", text: "Really", confirm: "Move to trash", danger: true,
    run: async () => { ran = true; } });
  const dialog = document.querySelector("dialog.dialog");
  assertEqual(document.activeElement?.textContent, "Cancel");
  document.activeElement.click();
  assertEqual(await result, null);
  assertTrue(!ran);
  assertTrue(!dialog.isConnected);
});

test("confirm dialog: a red confirm still confirms with Ctrl-Enter", async () => {
  let ran = false;
  const result = confirmDialog({ title: "Trash?", text: "Really", confirm: "Move to trash", danger: true,
    run: async () => { ran = true; } });
  document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true }));
  assertEqual(await result, true);
  assertTrue(ran);
});

test("confirm dialog: the safe button takes a label; a plain confirm opens on OK", async () => {
  const kept = confirmDialog({ title: "Cancel?", text: "Really", confirm: "Cancel the meeting", cancel: "Keep the meeting", danger: true });
  assertEqual(document.activeElement?.textContent, "Keep the meeting");
  document.activeElement.click();
  assertEqual(await kept, null);
  const plain = confirmDialog({ title: "Plain?", text: "Really", confirm: "Make it a plain note" });
  assertEqual(document.activeElement?.textContent, "Make it a plain note");
  document.activeElement.click();
  assertEqual(await plain, true);
});

test("confirm dialog: the button runs the action", async () => {
  let ran = false;
  const result = confirmDialog({ title: "Sure?", text: "Really", confirm: "Do it", run: async () => { ran = true; } });
  const dialog = document.querySelector("dialog.dialog");
  assertEqual(dialog.querySelector(".dialog__button--ok").textContent, "Do it");
  dialog.querySelector("form").requestSubmit();
  assertEqual(await result, true);
  assertTrue(ran);
});
