// The navigator: a drawer on narrow windows, docked on wide ones (static/js/layout/navigator.js).
import { NARROW_QUERY, Navigator } from "../../static/js/layout/navigator.js";
import { NOTE_COMMANDS, runNoteCommand } from "../../static/js/notes/commands.js";
import { assertEqual, assertTrue, test } from "./harness.js";

// Real focus moves need a focused window, which a headless run may not have.
function moveFocus(from, to) {
  from.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: to }));
}

class FakeMedia extends EventTarget {
  constructor(matches) {
    super();
    this.matches = matches;
  }

  set(matches) {
    this.matches = matches;
    this.dispatchEvent(new Event("change"));
  }
}

function withNavigator(narrow, body) {
  const root = document.createElement("div");
  root.innerHTML = `<button class="b">☰</button><div class="bd"></div>
    <nav class="p"><a href="#" class="in">x</a></nav><input class="out">`;
  document.body.append(root);
  const calls = [];
  const media = new FakeMedia(narrow);
  const nav = new Navigator({
    panel: root.querySelector(".p"),
    button: root.querySelector(".b"),
    backdrop: root.querySelector(".bd"),
    onShow: () => calls.push("show"),
    onHide: () => calls.push("hide"),
    media,
  });
  try {
    body({ nav, media, calls, root, panel: root.querySelector(".p"), button: root.querySelector(".b"), backdrop: root.querySelector(".bd") });
  } finally {
    root.remove();
  }
}

test("navigator: the query is the 1400 px breakpoint", () => {
  assertEqual(NARROW_QUERY, "(max-width: 1399.98px)");
});

test("navigator: narrow starts closed and inert", () => withNavigator(true, ({ panel, button, backdrop }) => {
  assertTrue(panel.inert, "inert");
  assertEqual(panel.dataset.open, "false");
  assertTrue(backdrop.hidden, "backdrop hidden");
  assertEqual(button.getAttribute("aria-expanded"), "false");
}));

test("navigator: the button opens and closes the drawer", () => withNavigator(true, ({ nav, calls, panel, button, backdrop }) => {
  button.click();
  assertTrue(nav.isOpen, "open");
  assertTrue(!panel.inert, "not inert");
  assertTrue(!backdrop.hidden, "backdrop shown");
  assertEqual(button.getAttribute("aria-expanded"), "true");
  button.click();
  assertTrue(!nav.isOpen, "closed");
  assertTrue(panel.inert, "inert again");
  assertEqual(calls.join(" "), "show hide");
}));

test("navigator: a click on the backdrop closes it", () => withNavigator(true, ({ nav, calls, backdrop }) => {
  nav.show();
  backdrop.click();
  assertTrue(!nav.isOpen, "closed");
  assertEqual(calls.join(" "), "show hide");
}));

test("navigator: focus leaving the drawer closes it without moving the focus", () => withNavigator(true, ({ nav, calls, root }) => {
  nav.show();
  moveFocus(root.querySelector(".in"), root.querySelector(".out"));
  assertTrue(!nav.isOpen, "closed");
  assertEqual(calls.join(" "), "show");
}));

test("navigator: focus moving inside it, or to the button, keeps it open", () => withNavigator(true, ({ nav, root, button }) => {
  nav.show();
  moveFocus(root.querySelector(".in"), button);
  moveFocus(root.querySelector(".in"), root.querySelector(".p"));
  moveFocus(root.querySelector(".in"), null);
  assertTrue(nav.isOpen, "still open");
}));

test("navigator: wide is docked, never inert, and the button only shows the tree", () => withNavigator(false, ({ nav, calls, panel, button, backdrop }) => {
  assertTrue(!panel.inert, "not inert");
  assertEqual(button.getAttribute("aria-expanded"), null);
  button.click();
  assertTrue(!nav.isOpen, "no drawer");
  assertTrue(backdrop.hidden, "no backdrop");
  assertEqual(calls.join(" "), "show");
}));

test("navigator: crossing the breakpoint closes the drawer", () => withNavigator(true, ({ nav, media, panel }) => {
  nav.show();
  media.set(false);
  assertTrue(!panel.inert, "docked");
  media.set(true);
  assertTrue(!nav.isOpen, "closed");
  assertTrue(panel.inert, "inert");
}));

test("navigator: going narrow with the focus in the docked tree hands it back", () => withNavigator(false, ({ media, calls, root }) => {
  root.querySelector(".in").focus();
  const focused = root.contains(document.activeElement);
  media.set(true);
  // Without a focused window nothing has the focus, and then nothing needs handing back.
  assertEqual(calls.join(" "), focused ? "hide" : "");
}));

test("note commands: :nav shows the navigator", () => {
  const nav = NOTE_COMMANDS.find((command) => command.name === "nav");
  assertEqual(nav.min, 3);
  let shown = 0;
  runNoteCommand({ navCommand: () => { shown += 1; } }, { name: "nav" });
  assertEqual(shown, 1);
});
