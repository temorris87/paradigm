// Follow mode in the main window (f, layout/main-keys.js): a key-cap label on every clickable
// thing in view; typing a label activates its target as a click would. The labels' letters and
// matching are ui/follow-hints.js's; this collects the targets, draws the labels on a fixed
// layer over the page (css/follow-hints.css) and reads the keys while it is on.
//
//   const follow = installFollowMode(window, { root?, redraws? });
//     redraws: an EventTarget whose "redraw" event (the app's) means the page was drawn again.
//     Its keydown listener is on the window's capture phase: install it before any other key
//     listener there (main.js puts it before installMainKeys) so that, while on, it takes every
//     key and no page key fires.
//   follow.start()   -> whether it started (false: nothing to label)
//   follow.stop()    removes every label
//   follow.active    whether it is on
//
// Ends with: a label typed (its target activated), Esc, a key that matches no label, Backspace
// with nothing typed, Tab (the focus still moves on; Esc, Backspace and Tab: ui/ui-keys.js's
// "follow" scope), a Ctrl/Alt/Cmd chord or a function key F1–F24 (both still the browser's), a
// pointer press, a scroll or a resize.
// The page drawn again while it is on (a redraw, or a labelled target leaving the page): the
// labels are drawn again for what is on screen now, keeping the letters typed only while they
// still start a label; else it ends. A label never acts on a target no longer on the page.
import { MAX_HINTS, followStep, hintLabels, labelsFor, nextTyped, readingOrder } from "./follow-hints.js";
import { uiAction } from "./ui-keys.js";

// What gets a label: list rows, row buttons and spans, buttons and links, navigator pins and tree
// rows, the Week grid's blocks and the tray's items (their grip takes the press), and the fields
// (following one puts the focus in it, to type or choose).
const TARGETS = ["[role=option]", "[data-action]", "button", "a[href]", "[role=button]", "[role=tab]", "summary",
  ".tree__row", ".cal-task__grip", "input:not([type=hidden])", "select", "textarea"].join(", ");

// Targets a press drives (pointer down and up: Week blocks, tray items), not a click alone.
const PRESSED = ".cal-block, .cal-task__grip";

// What a mouse click would focus: the target or the nearest of these around it.
const FOCUSABLE = "a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]";

// F1 to F24 (and no other F-number): the browser's own keys, never follow mode's.
const FUNCTION_KEY = /^F([1-9]|1\d|2[0-4])$/;

// Keys that only modify another: they neither type nor end follow mode.
const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "AltGraph"]);

export function installFollowMode(target, { root = document, redraws = null } = {}) {
  let session = null; // { entries: [{ node, label, cap }], typed, layer }
  // Watches the page for a labelled target taken out of it (the page drawn again under the labels).
  const observer = new MutationObserver(() => {
    if (stale()) redraw();
  });

  const stale = () => Boolean(session) && session.entries.some((entry) => !entry.node.isConnected);

  const stop = () => {
    if (!session) return;
    session.layer.remove();
    session = null;
    observer.disconnect();
    target.removeEventListener("pointerdown", stop, true);
    target.removeEventListener("scroll", stop, true);
    target.removeEventListener("resize", stop);
    redraws?.removeEventListener("redraw", onRedraw);
  };

  /** The labels for what is on screen now, with these letters typed; false when nothing is. */
  const draw = (typed) => {
    const entries = collectTargets(root);
    if (!entries.length) return false;
    const labels = hintLabels(entries.length);
    if (typed && !labels.some((label) => label.startsWith(typed) && label !== typed)) return false;
    const layer = document.createElement("div");
    layer.className = "follow-hints";
    layer.setAttribute("aria-hidden", "true");
    entries.forEach((entry, index) => {
      entry.label = labels[index];
      entry.cap = drawCap(entry, labels[index]);
      layer.append(entry.cap);
    });
    for (const [name, value] of [["position", "fixed"], ["inset", "0"], ["pointer-events", "none"]]) {
      layer.style.setProperty(name, value);
    }
    session?.layer.remove();
    document.body.append(layer);
    keepApart(entries.map((entry) => entry.cap));
    session = { entries, typed, layer };
    if (typed) show();
    return true;
  };

  // Letters typed that are now a whole label end it too: a redraw must not act for the user.
  const redraw = () => {
    if (!draw(session.typed)) stop();
  };

  const onRedraw = () => {
    if (session) redraw();
  };

  const start = () => {
    stop();
    if (!draw("")) return false;
    observer.observe(root === document ? document.documentElement : root, { childList: true, subtree: true });
    target.addEventListener("pointerdown", stop, true);
    target.addEventListener("scroll", stop, true);
    target.addEventListener("resize", stop);
    redraws?.addEventListener("redraw", onRedraw);
    return true;
  };

  const show = () => {
    const left = new Set(labelsFor(session.typed, session.entries.map((entry) => entry.label)));
    for (const entry of session.entries) {
      entry.cap.hidden = !left.has(entry.label);
      markTyped(entry.cap, entry.label, session.typed);
    }
  };

  const onKey = (event) => {
    if (!session) return;
    if (MODIFIERS.has(event.key)) return;
    event.stopImmediatePropagation();
    // A browser shortcut (Ctrl-W..., or a function key: F5 reloads, F12 the dev tools) is the
    // browser's: follow mode just ends.
    if (event.ctrlKey || event.altKey || event.metaKey || FUNCTION_KEY.test(event.key)) return stop();
    // Its own keys are ui/ui-keys.js's "follow" scope (Shift ignored, as for a label's letters).
    const action = uiAction({ key: event.key }, "follow");
    // Tab ends it and still moves the focus on, as everywhere.
    if (action === "leave") return stop();
    event.preventDefault();
    // A held f repeats once follow mode is on: a repeat is never a letter typed.
    if (event.repeat) return;
    // The page was drawn again before the observer saw it: the labels shown are for what is gone,
    // so the key is taken and the labels drawn again.
    if (stale()) return redraw();
    // A label's letters type it; any other key ends it.
    if (action === "close") return stop();
    if (action === "back") {
      if (!session.typed) return stop();
      session.typed = session.typed.slice(0, -1);
      return show();
    }
    const typed = nextTyped(session.typed, event.key);
    const labels = session.entries.map((entry) => entry.label);
    const step = typed === null ? { state: "none" } : followStep(typed, labels);
    if (step.state === "none") return stop();
    if (step.state === "more") {
      session.typed = typed;
      return show();
    }
    const chosen = session.entries.find((entry) => entry.label === step.label);
    stop();
    return activate(chosen.node);
  };

  target.addEventListener("keydown", onKey, { capture: true });

  return {
    start,
    stop,
    get active() {
      return session !== null;
    },
  };
}

/** Every target in view, in reading order, at most MAX_HINTS: [{ node, top, left }]. */
export function collectTargets(root = document) {
  const view = { width: window.innerWidth, height: window.innerHeight };
  const boxes = [...root.querySelectorAll(TARGETS)].map((node) => visibleBox(node, view)).filter(Boolean);
  return readingOrder(boxes).slice(0, MAX_HINTS).map((index) => boxes[index]);
}

/** Where a target's label goes (the top-left of the part of it in view), or null when it can't
 *  be clicked now: hidden, inert, disabled, out of view, or under something else. */
function visibleBox(node, view) {
  if (node.closest("[hidden], [inert], [aria-hidden=true], .follow-hints")) return null;
  if (node.matches(":disabled, [aria-disabled=true]")) return null;
  if (!shown(node)) return null;
  const { left, top, right, bottom } = inView(node, view);
  if (right - left < 1 || bottom - top < 1) return null;
  // A point of it that a click would reach: its middle, or just inside its top-left corner.
  const points = [[(left + right) / 2, (top + bottom) / 2], [left + 1, top + 1]];
  if (!points.some(([x, y]) => reaches(node, document.elementFromPoint(x, y)))) return null;
  return { node, top, left };
}

/** The part of a target's box in view: inside the window and inside every box around it that
 *  clips what scrolls (a list scrolled part way shows only part of a row, and its label goes on
 *  that part, not over the bar above the list). */
function inView(node, view) {
  const rect = node.getBoundingClientRect();
  let box = { left: Math.max(rect.left, 0), top: Math.max(rect.top, 0),
    right: Math.min(rect.right, view.width), bottom: Math.min(rect.bottom, view.height) };
  for (let around = node.parentElement; around && around !== document.body; around = around.parentElement) {
    const style = getComputedStyle(around);
    if (style.overflowX === "visible" && style.overflowY === "visible") continue;
    const clip = around.getBoundingClientRect();
    box = { left: Math.max(box.left, clip.left), top: Math.max(box.top, clip.top),
      right: Math.min(box.right, clip.right), bottom: Math.min(box.bottom, clip.bottom) };
  }
  return box;
}

/** Drawn, and not transparent; a button that is itself transparent in a box that isn't (a row's
 *  Remove or Change, shown on hover or focus) still counts: it can be clicked, and following it
 *  focuses it, which shows it. */
function shown(node) {
  if (typeof node.checkVisibility === "function") {
    if (!node.checkVisibility({ visibilityProperty: true })) return false;
    const around = node.parentElement;
    return !around || around.checkVisibility({ opacityProperty: true });
  }
  const style = getComputedStyle(node);
  return style.visibility !== "hidden" && style.display !== "none";
}

function reaches(node, hit) {
  return Boolean(hit) && (hit === node || node.contains(hit));
}

/** A label that would sit on one drawn before it (a row's and the button at its corner) moves
 *  right until it is clear, so every label can be read. */
function keepApart(caps) {
  const placed = [];
  for (const cap of caps) {
    let box = cap.getBoundingClientRect();
    for (let tries = 0; tries < caps.length; tries += 1) {
      const hit = placed.find((other) => box.left < other.right && other.left < box.right && box.top < other.bottom && other.top < box.bottom);
      if (!hit) break;
      cap.style.setProperty("left", `${Math.round(hit.right + 2)}px`);
      box = cap.getBoundingClientRect();
    }
    placed.push(box);
  }
}

function drawCap(entry, label) {
  const cap = document.createElement("span");
  cap.className = "key follow-hints__label";
  // CSSOM, not a style attribute: the CSP forbids inline styles.
  // Placed here as well as in follow-hints.css: the labels are laid out against each other
  // (apart) as soon as they are drawn.
  cap.style.setProperty("position", "absolute");
  cap.style.setProperty("left", `${Math.round(entry.left)}px`);
  cap.style.setProperty("top", `${Math.round(entry.top)}px`);
  markTyped(cap, label, "");
  return cap;
}

/** The letters typed so far shown apart from the ones still to type. */
function markTyped(cap, label, typed) {
  const done = label.startsWith(typed) ? typed.length : 0;
  const head = document.createElement("span");
  head.className = "follow-hints__typed";
  head.textContent = label.slice(0, done);
  cap.replaceChildren(...(done ? [head] : []), label.slice(done));
}

/** Does what a click on the target would. A list row: the click moves its listbox's cursor
 *  there and opens it; a listbox whose click only moves the cursor (data-follow="enter") is
 *  sent Enter after. Week blocks and tray items act on a press (calendar/drag.js). */
export function activate(node) {
  if (!node?.isConnected) return;
  // A click focuses what it lands on, or the nearest focusable thing around it (a tree row: its
  // item), even when the click itself does nothing; a list row's listbox takes the focus itself.
  if (!node.matches("[role=option]")) node.closest(FOCUSABLE)?.focus({ preventScroll: true });
  if (node.matches(PRESSED)) press(node);
  node.click();
  const listbox = node.matches("[role=option]") ? node.closest("[role=listbox]") : null;
  if (listbox?.dataset.follow === "enter" && listbox.isConnected) {
    listbox.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  }
}

function press(node) {
  const rect = node.getBoundingClientRect();
  // Near the top: a timed block's bottom edge is its resize handle.
  const at = { clientX: rect.left + rect.width / 2, clientY: rect.top + Math.min(rect.height / 2, 6) };
  const init = { ...at, bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0 };
  node.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
  node.dispatchEvent(new PointerEvent("pointerup", { ...init, buttons: 0 }));
}
