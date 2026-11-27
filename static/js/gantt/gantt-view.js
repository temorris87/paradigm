// A Gantt chart: a label column and a track per row, bars for phases (and projects), diamonds
// for milestones, the baseline as a ghost behind a bar that moved, today as a line. It draws
// what it is given and reports what the pointer and keys did; the page decides the rest.
//
//   const chart = new GanttView(element, { label, onOpen(row, mark?), onDrop(row, mark, { start, end }),
//                                          onAction(action, row), onActive(row) });
//     row.note: a second line under its label, in its tone (row.noteTone: done | late | warn)
//   chart.draw({ rows, mode: "dates" | "offsets", today, tools: [button nodes], empty })
//   chart.focus()
//
// Dragging a bar moves it, dragging either end changes that end, by whole days; dragging a
// diamond moves the milestone. Each drop is one change (the page records it). A click with no
// drag opens the row. The chart is one focus stop (a listbox of its rows); its keys are in
// gantt-keys.js.
import { barBox, chartAxis, dayAt, dragged, fitDayPx, markLeft, ticksFor } from "./gantt-model.js";
import { chip } from "../ui/chip.js";
import { toneOf } from "../ui/chip-tones.js";
import { ganttAction } from "./gantt-keys.js";

const LABEL_PX = 220;
const EDGE_PX = 6;
const DRAG_THRESHOLD_PX = 4;

// About how wide one character of a milestone's label is, in pixels (--fs-xs).
const LABEL_CHARS_PX = 6.5;

export class GanttView {
  constructor(root, { label = "Plan", onOpen = () => {}, onDrop = () => {}, onAction = () => {}, onActive = () => {} } = {}) {
    this.root = root;
    this.handlers = { onOpen, onDrop, onAction, onActive };
    this.rows = [];
    this.active = 0;
    root.classList.add("gantt");
    this.tools = element("div", "gantt__tools");
    this.scroll = element("div", "gantt__scroll");
    this.list = element("div", "gantt__grid");
    this.list.setAttribute("role", "listbox");
    this.list.setAttribute("aria-label", label);
    this.list.tabIndex = 0;
    this.scroll.append(this.list);
    root.replaceChildren(this.tools, this.scroll);
    this.list.addEventListener("keydown", (event) => this.onKey(event));
  }

  draw({ rows, mode = "dates", today = null, tools = [], empty = "Nothing planned yet" }) {
    const hadFocus = this.root.contains(document.activeElement);
    const activeKey = this.rows[this.active]?.key;
    this.rows = rows;
    this.tools.replaceChildren(...tools);
    this.axis = chartAxis(rows, { mode, today });
    const width = Math.max((this.scroll.clientWidth || this.root.clientWidth || 900) - LABEL_PX - 16, 200);
    this.dayPx = fitDayPx(this.axis, width);
    const trackWidth = `${this.axis.days * this.dayPx}px`;
    this.list.style.setProperty("--gantt-track", trackWidth);
    this.list.style.setProperty("--gantt-label", `${LABEL_PX}px`);
    const head = [element("div", "gantt__corner"), this.axisNode()];
    if (!rows.length) {
      this.list.replaceChildren(...head, element("div", "gantt__empty", empty));
      this.list.removeAttribute("aria-activedescendant");
      return;
    }
    this.list.replaceChildren(...head, ...rows.flatMap((row, index) => this.rowNodes(row, index)));
    const again = rows.findIndex((row) => row.key === activeKey);
    this.active = Math.max(0, Math.min(again >= 0 ? again : this.active, rows.length - 1));
    this.markActive();
    if (hadFocus) this.focus();
  }

  axisNode() {
    const axis = element("div", "gantt__axis");
    for (const tick of ticksFor(this.axis, this.dayPx)) {
      const node = element("span", `gantt__tick${tick.major ? " gantt__tick--major" : ""}`, tick.label);
      node.style.setProperty("left", `${(tick.at - this.axis.first) * this.dayPx}px`);
      axis.append(node);
    }
    if (this.axis.today !== null) axis.append(this.todayLine("gantt__today gantt__today--head"));
    return axis;
  }

  todayLine(className) {
    const line = element("span", className);
    line.style.setProperty("left", `${markLeft(this.axis, this.axis.today, this.dayPx)}px`);
    return line;
  }

  rowNodes(row, index) {
    const label = element("div", `gantt__label gantt__label--${row.kind}${row.muted ? " gantt__label--muted" : ""}`);
    label.id = `${this.root.id || "gantt"}-row-${index}`;
    label.setAttribute("role", "option");
    label.dataset.index = String(index);
    label.append(element("span", "gantt__name", row.label));
    // A row that keeps slipping says so in a danger chip; any other slip stays a quiet line.
    if (row.badge) label.append(row.late ? chip(row.badge, toneOf("late")) : element("span", "gantt__badge", row.badge));
    if (row.note) label.append(element("span", `gantt__note-line gantt__note-line--${row.noteTone ?? "dim"}`, row.note));
    label.title = [row.label, row.detail, row.badge].filter(Boolean).join("\n");
    label.addEventListener("click", () => {
      this.active = index;
      this.markActive();
      this.focus();
      this.handlers.onOpen(row);
    });
    const track = element("div", `gantt__track gantt__track--${row.kind}`);
    if (row.baseline && (row.baseline.start !== row.start || row.baseline.end !== row.end)) {
      const ghost = element("div", "gantt__ghost");
      place(ghost, barBox(this.axis, { start: row.baseline.start, end: row.baseline.end }, this.dayPx));
      ghost.title = "The first dates set (the baseline)";
      track.append(ghost);
    }
    if (row.kind !== "milestone" && Number.isFinite(row.start)) {
      const bar = element("div", `gantt__bar gantt__bar--${row.kind}${row.muted ? " gantt__bar--muted" : ""}${row.late ? " gantt__bar--late" : ""}`);
      place(bar, barBox(this.axis, row, this.dayPx));
      bar.title = [row.label, row.detail].filter(Boolean).join("\n");
      bar.append(element("span", "gantt__bar-text", row.label));
      if (row.draggable) {
        bar.append(element("span", "gantt__edge gantt__edge--start"), element("span", "gantt__edge gantt__edge--end"));
        bar.addEventListener("pointerdown", (event) => this.startDrag(event, row, null, bar));
      } else {
        bar.addEventListener("click", () => this.handlers.onOpen(row));
      }
      track.append(bar);
    }
    for (const mark of row.marks) {
      const node = element("div", `gantt__mark${mark.done ? " gantt__mark--done" : ""}${mark.late ? " gantt__mark--late" : ""}`);
      node.style.setProperty("left", `${markLeft(this.axis, mark.at, this.dayPx)}px`);
      node.title = [mark.label, mark.detail].filter(Boolean).join("\n");
      node.setAttribute("aria-hidden", "true");
      const name = element("span", "gantt__mark-label", mark.label);
      node.append(name);
      // A label that would run past the chart's right edge goes on the diamond's left.
      const left = markLeft(this.axis, mark.at, this.dayPx);
      if (left + LABEL_CHARS_PX * mark.label.length + 24 > this.axis.days * this.dayPx) node.classList.add("gantt__mark--flip");
      if (mark.draggable) node.addEventListener("pointerdown", (event) => this.startDrag(event, row, mark, node));
      else node.addEventListener("click", () => this.handlers.onOpen(row, mark));
      track.append(node);
    }
    if (this.axis.today !== null) track.append(this.todayLine("gantt__today"));
    return [label, track];
  }

  startDrag(event, row, mark, node) {
    if (event.button !== 0) return;
    event.preventDefault();
    const rect = node.getBoundingClientRect();
    const part = mark ? "body" : event.clientX - rect.left <= EDGE_PX ? "start" : rect.right - event.clientX <= EDGE_PX ? "end" : "body";
    const from = mark ? { start: mark.at, end: mark.at } : { start: row.start, end: row.end };
    const x0 = event.clientX;
    let moved = false;
    let span = from;
    node.setPointerCapture?.(event.pointerId);
    const move = (each) => {
      if (Math.abs(each.clientX - x0) >= DRAG_THRESHOLD_PX) moved = true;
      if (!moved) return;
      const delta = Math.round((each.clientX - x0) / this.dayPx);
      span = dragged(from, part, delta);
      if (mark) node.style.setProperty("left", `${markLeft(this.axis, span.start, this.dayPx)}px`);
      else place(node, barBox(this.axis, span, this.dayPx));
      node.classList.add("gantt--dragging");
    };
    const up = () => {
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", up);
      node.classList.remove("gantt--dragging");
      if (!moved) return this.handlers.onOpen(row, mark);
      if (span.start === from.start && span.end === from.end) return undefined;
      return this.handlers.onDrop(row, mark, span);
    };
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", up);
    node.addEventListener("pointercancel", up);
  }

  onKey(event) {
    const action = ganttAction(event);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    const last = this.rows.length - 1;
    const moves = { next: Math.min(this.active + 1, last), previous: Math.max(this.active - 1, 0), first: 0, last };
    if (action in moves) {
      this.active = Math.max(0, moves[action]);
      this.markActive();
      return;
    }
    const row = this.rows[this.active] ?? null;
    if (action === "open") {
      if (row) this.handlers.onOpen(row);
      return;
    }
    this.handlers.onAction(action, row);
  }

  markActive() {
    const nodes = this.list.querySelectorAll("[role=option]");
    nodes.forEach((node, index) => node.setAttribute("aria-selected", String(index === this.active)));
    const node = nodes[this.active];
    if (node) {
      this.list.setAttribute("aria-activedescendant", node.id);
      node.scrollIntoView?.({ block: "nearest" });
    }
    this.handlers.onActive(this.rows[this.active] ?? null);
  }

  /** The row under the keyboard (the page's Edit dates… uses it). */
  get activeRow() {
    return this.rows[this.active] ?? null;
  }

  focus() {
    this.list.focus({ preventScroll: true });
  }

  /** The day under a pointer x (for a drop from outside); null outside the tracks. */
  dayUnder(clientX) {
    const track = this.list.querySelector(".gantt__track");
    if (!track) return null;
    const rect = track.getBoundingClientRect();
    return dayAt(this.axis, clientX - rect.left, this.dayPx);
  }
}

function place(node, { left, width }) {
  node.style.setProperty("left", `${left}px`);
  node.style.setProperty("width", `${width}px`);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
