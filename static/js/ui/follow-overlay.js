// Follow mode in the main window (f, layout/main-keys.js): a key-cap label on every clickable
// thing in view; typing a label activates its target as a click would. The labels' letters and
// matching are ui/follow-hints.js's; this collects the targets, draws the labels on a fixed
// layer over the page (css/follow-hints.css) and reads the keys while it is on.
//
//   const follow = installFollowMode(window, { root? });
//     Its keydown listener is on the window's capture phase: install it before any other key
//     listener there (main.js puts it before installMainKeys) so that, while on, it takes every
//     key and no page key fires.
//   follow.start()   -> whether it started (false: nothing to label)
//   follow.stop()    removes every label
//   follow.active    whether it is on
//
// Ends with: a label typed (its target activated), Esc, a key that matches no label, Backspace
// with nothing typed, a pointer press, a scroll or a resize.
import { MAX_HINTS, followStep, hintLabels, labelsFor, nextTyped, readingOrder } from "./follow-hints.js";

// What gets a label: list rows, row buttons and spans, buttons and links, navigator pins and tree
// rows, the Week grid's blocks and the tray's items (their grip takes the press).
const TARGETS = ["[role=option]", "[data-action]", "button", "a[href]", "[role=button]", "[role=tab]", "summary",
  ".tree__row", ".cal-task__grip"].join(", ");

// Targets a press drives (pointer down and up: Week blocks, tray items), not a click alone.
const PRESSED = ".cal-block, .cal-task__grip";

// Keys that only modify another: they neither type nor end follow mode.
const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "AltGraph"]);

export function installFollowMode(target, { root = document } = {}) {
  let session = null; // { entries: [{ node, label, cap }], typed, layer }

  const stop = () => {
    if (!session) return;
    session.layer.remove();
    session = null;
    target.removeEventListener("pointerdown", stop, true);
    target.removeEventListener("scroll", stop, true);
    target.removeEventListener("resize", stop);
  };

  const start = () => {
    stop();
    const entries = collectTargets(root);
    if (!entries.length) return false;
    const labels = hintLabels(entries.length);
    const layer = document.createElement("div");
    layer.className = "follow-hints";
    layer.setAttribute("aria-hidden", "true");
    entries.forEach((entry, index) => {
      entry.label = labels[index];
      entry.cap = drawCap(entry, labels[index]);
      layer.append(entry.cap);
    });
    document.body.append(layer);
    session = { entries, typed: "", layer };
    target.addEventListener("pointerdown", stop, true);
    target.addEventListener("scroll", stop, true);
    target.addEventListener("resize", stop);
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
    // A browser shortcut (Ctrl-W...) is the browser's: follow mode just ends.
    if (event.ctrlKey || event.altKey || event.metaKey) return stop();
    event.preventDefault();
    if (event.key === "Backspace") {
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

/** Where a target's label goes (its top-left, inside the window), or null when it can't be
 *  clicked now: hidden, inert, disabled, out of view, or under something else. */
function visibleBox(node, view) {
  if (node.closest("[hidden], [inert], [aria-hidden=true], .follow-hints")) return null;
  if (node.matches(":disabled, [aria-disabled=true]")) return null;
  if (!shown(node)) return null;
  const rect = node.getBoundingClientRect();
  const left = Math.max(rect.left, 0);
  const top = Math.max(rect.top, 0);
  const right = Math.min(rect.right, view.width);
  const bottom = Math.min(rect.bottom, view.height);
  if (right - left < 1 || bottom - top < 1) return null;
  // A point of it that a click would reach: its middle, or just inside its top-left corner.
  const points = [[(left + right) / 2, (top + bottom) / 2], [left + 1, top + 1]];
  if (!points.some(([x, y]) => reaches(node, document.elementFromPoint(x, y)))) return null;
  return { node, top, left };
}

function shown(node) {
  if (typeof node.checkVisibility === "function") return node.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  const style = getComputedStyle(node);
  return style.visibility !== "hidden" && style.display !== "none";
}

function reaches(node, hit) {
  return Boolean(hit) && (hit === node || node.contains(hit));
}

function drawCap(entry, label) {
  const cap = document.createElement("span");
  cap.className = "key follow-hints__label";
  // CSSOM, not a style attribute: the CSP forbids inline styles.
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
