// The navigator's pinned rows and its save state (the tree itself is notes/tree-view.js).
//   Pinned: Today ("2 overdue") and Week ("24 h free"), over the tree, the page shown lit.
//   Save state (the note window): Saved · Saving… · Unsaved · Offline · Not saved.
//
//   drawPins(root, { overdue, freeMin, active, onToday, onWeek })   active: "home" | "week" | null
//   saveStateOf({ dirty, saving, failed, offline, conflict })      -> { key, text } (pure)
//   drawSaveState(node, state)
import { hoursText } from "../week/capacity.js";

export function drawPins(root, { overdue = 0, freeMin = 0, active = null, onToday, onWeek }) {
  if (!root) return;
  const pin = (key, label, detail, tone, run, title) => {
    const node = document.createElement("button");
    node.type = "button";
    node.className = `navigator__pin${active === key ? " navigator__pin--active" : ""}`;
    node.title = title;
    if (active === key) node.setAttribute("aria-current", "page");
    const name = document.createElement("span");
    name.className = "navigator__pin-name";
    name.textContent = label;
    const extra = document.createElement("span");
    extra.className = `navigator__pin-detail${tone ? ` navigator__pin-detail--${tone}` : ""}`;
    extra.textContent = detail;
    node.append(name, extra);
    node.addEventListener("click", run);
    return node;
  };
  root.replaceChildren(
    pin("home", "Today", overdue ? `${overdue} overdue` : "", overdue ? "late" : "", onToday, "Today (gt)"),
    pin("week", "Week", `${hoursText(freeMin)} free`, "", onWeek, "The week: plan it, the timesheet (gw)"),
  );
}

export function saveStateOf({ dirty = false, saving = false, failed = false, offline = false, conflict = false }) {
  if (conflict) return { key: "failed", text: "Changed elsewhere" };
  if (saving) return { key: "saving", text: "Saving…" };
  if (offline && dirty) return { key: "offline", text: "Offline · kept here" };
  if (offline) return { key: "offline", text: "Offline" };
  if (failed && dirty) return { key: "failed", text: "Not saved" };
  if (dirty) return { key: "unsaved", text: "Unsaved" };
  return { key: "saved", text: "Saved" };
}

export function drawSaveState(node, state) {
  if (!node) return;
  node.className = `navigator__save navigator__save--${state.key}`;
  node.textContent = `● ${state.text}`;
}
