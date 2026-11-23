// The calendar's week grid: a column per day shown, each headed by its day, its free hours and
// a capacity bar (meetings, then focus blocks, as parts of the working day); a "due" strip
// for what is due that day (tasks, milestones) and meetings with no time; and the blocks
// placed by time. It draws what it is given and reports what the pointer did; CalendarPage
// decides the rest.
//
//   const grid = new GridView(element, { onBlockDown(block, event, part), onSlotClick(day, minute),
//                                        onBlockMenu(block, node), onChip(chip) });
//   grid.draw({ days, blocks, today, now, selected, capacity?, chips? })
//     part: "body" | "end" (the bottom edge); capacity: { day: { workMin, meetingMin, focusMin,
//     freeMin } }; chips: { day: [{ key, kind, label, noteId }] } (week/tray-model.js dueChips)
//   grid.slotAt(clientX, clientY)  -> { day, minute } over the timed grid, or null
//   grid.showGhost(day, start, end, title) / grid.hideGhost()
//   grid.scrollToMinute(minute)
//   grid.blockNode(key)
import { dateOf } from "../meetings/meeting-days.js";
import { DAY_MINUTES, clock, layoutDay } from "./week-model.js";
import { hoursText } from "../week/capacity.js";

// Pixels per hour: at least this, more when the window is tall, so that FIT_FROM to FIT_TO
// (the working day with an hour either side) fills the grid's height. calendar.css reads the
// same number as --cal-hour, set on the grid's root.
export const MIN_HOUR_PX = 40;
const FIT_FROM = 7;
const FIT_TO = 18;

/** Pixels per hour for a grid this many pixels tall. Pure. */
export function hourPxFor(height) {
  return Math.max(MIN_HOUR_PX, Math.floor(height / (FIT_TO - FIT_FROM)));
}
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// The bottom edge of a block that drags its end, in pixels.
const EDGE_PX = 7;

export class GridView {
  constructor(root, handlers) {
    this.root = root;
    this.handlers = handlers;
    this.columns = new Map();
    this.nodes = new Map();
    this.ghost = element("div", "cal-block cal-block--ghost");
    this.head = element("div", "cal-head");
    this.allDay = element("div", "cal-allday");
    this.scroller = element("div", "cal-scroll");
    this.body = element("div", "cal-body");
    this.scroller.append(this.body);
    root.replaceChildren(this.head, this.allDay, this.scroller);
    this.body.addEventListener("click", (event) => this.onBodyClick(event));
    this.hourPx = MIN_HOUR_PX;
    this.last = null;
    // A taller or shorter window: hours grow or shrink to keep the working day in view.
    if (typeof ResizeObserver === "function") {
      new ResizeObserver(() => {
        if (this.last && hourPxFor(this.scroller.clientHeight) !== this.hourPx) this.draw(this.last);
      }).observe(this.scroller);
    }
  }

  draw(state) {
    const { days, blocks, today, now, selected = null, capacity = {}, chips = {} } = state;
    this.last = state;
    const minute = this.scroller.scrollTop / this.hourPx * 60;
    if (this.scroller.clientHeight) this.hourPx = hourPxFor(this.scroller.clientHeight);
    this.root.style.setProperty("--cal-hour", `${this.hourPx}px`);
    this.columns.clear();
    this.nodes.clear();
    this.root.style.setProperty("--cal-days", String(days.length));
    this.head.replaceChildren(element("div", "cal-corner"), ...days.map((day) => {
      const date = dateOf(day);
      const node = element("div", `cal-dayhead${day === today ? " cal-dayhead--today" : ""}`);
      const line = element("div", "cal-dayhead__line");
      line.append(element("span", "cal-dayhead__name", WEEKDAYS[date.getDay()]),
        element("span", "cal-dayhead__date", String(date.getDate())));
      const room = capacity[day];
      if (room?.workMin) line.append(element("span", "cal-dayhead__free", `${hoursText(room.freeMin)} free`));
      node.append(line);
      if (room?.workMin) node.append(capacityBar(room));
      node.title = day;
      return node;
    }));
    this.allDay.replaceChildren(element("div", "cal-corner cal-corner--label", "due"), ...days.map((day) => {
      const cell = element("div", "cal-allday__cell");
      for (const chip of chips[day] ?? []) {
        const node = element("button", `cal-chip cal-chip--${chip.kind}`, chip.label);
        node.type = "button";
        node.tabIndex = -1;
        node.title = chip.label;
        node.addEventListener("click", () => this.handlers.onChip?.(chip));
        cell.append(node);
      }
      for (const block of blocks.filter((each) => each.day === day && !each.timed)) cell.append(this.blockNode(block, selected, false));
      return cell;
    }));
    const gutter = element("div", "cal-gutter");
    for (let hour = 1; hour < 24; hour += 1) {
      const label = element("span", "cal-gutter__hour", `${String(hour).padStart(2, "0")}:00`);
      label.style.setProperty("top", `${hour * this.hourPx}px`);
      gutter.append(label);
    }
    const columns = days.map((day) => {
      const column = element("div", `cal-col${day === today ? " cal-col--today" : ""}`);
      column.dataset.day = day;
      for (const block of layoutDay(blocks.filter((each) => each.day === day))) column.append(this.blockNode(block, selected, true));
      if (day === today && now !== null) {
        const line = element("div", "cal-now");
        line.style.setProperty("top", `${(now / 60) * this.hourPx}px`);
        column.append(line);
      }
      this.columns.set(day, column);
      return column;
    });
    this.body.replaceChildren(gutter, ...columns);
    this.scroller.scrollTop = (minute / 60) * this.hourPx;
  }

  blockNode(block, selected, timed) {
    const classes = ["cal-block", `cal-block--${block.kind}`, block.cancelled && "cal-block--cancelled",
      block.done && "cal-block--done", block.muted && "cal-block--muted", block.key === selected && "cal-block--selected"];
    const node = element("div", classes.filter(Boolean).join(" "));
    node.tabIndex = -1;
    node.setAttribute("role", "button");
    node.dataset.key = block.key;
    const time = timed ? `${clock(block.start)}–${clock(block.end)}` : "";
    node.title = [block.title, time, block.sub].filter(Boolean).join("\n");
    node.append(element("span", "cal-block__title", `${block.kind === "task" ? (block.done ? "☑ " : "☐ ") : ""}${block.title}`));
    if (timed) node.append(element("span", "cal-block__time", time));
    if (block.sub) node.append(element("span", "cal-block__sub", block.sub));
    if (timed) {
      const length = Math.max(block.end - block.start, 15);
      node.style.setProperty("top", `${(block.start / 60) * this.hourPx}px`);
      node.style.setProperty("height", `${(length / 60) * this.hourPx - 2}px`);
      node.style.setProperty("left", `calc(${(block.col / block.cols) * 100}% + 2px)`);
      node.style.setProperty("width", `calc(${100 / block.cols}% - 4px)`);
      if (length < 45) node.classList.add("cal-block--short");
    }
    if (block.kind !== "pending") {
      if (timed) node.append(element("span", "cal-block__edge"));
      node.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        const rect = node.getBoundingClientRect();
        const part = timed && rect.bottom - event.clientY <= EDGE_PX ? "end" : "body";
        this.handlers.onBlockDown(block, event, part);
      });
    } else {
      node.addEventListener("click", () => this.handlers.onBlockMenu(block, node));
    }
    node.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.handlers.onBlockMenu(block, node);
    });
    this.nodes.set(block.key, node);
    return node;
  }

  onBodyClick(event) {
    if (event.target.closest(".cal-block")) return;
    const slot = this.slotAt(event.clientX, event.clientY);
    if (slot) this.handlers.onSlotClick(slot.day, slot.minute);
  }

  slotAt(clientX, clientY) {
    for (const [day, column] of this.columns) {
      const rect = column.getBoundingClientRect();
      if (clientX < rect.left || clientX >= rect.right) continue;
      if (clientY < this.scroller.getBoundingClientRect().top || clientY > this.scroller.getBoundingClientRect().bottom) return null;
      const minute = ((clientY - rect.top) / this.hourPx) * 60;
      return { day, minute: Math.max(0, Math.min(DAY_MINUTES, minute)) };
    }
    return null;
  }

  showGhost(day, start, end, title) {
    const column = this.columns.get(day);
    if (!column) return this.hideGhost();
    this.ghost.textContent = `${title}  ${clock(start)}–${clock(end)}`;
    this.ghost.style.setProperty("top", `${(start / 60) * this.hourPx}px`);
    this.ghost.style.setProperty("height", `${((end - start) / 60) * this.hourPx - 2}px`);
    if (this.ghost.parentNode !== column) column.append(this.ghost);
    return undefined;
  }

  hideGhost() {
    this.ghost.remove();
  }

  scrollToMinute(minute) {
    this.scroller.scrollTop = (minute / 60) * this.hourPx;
  }

  blockNodeFor(key) {
    return this.nodes.get(key) ?? null;
  }
}

/** The day's capacity: meetings, then focus blocks, as parts of its working day. */
function capacityBar({ workMin, meetingMin, focusMin }) {
  const bar = element("div", "cal-capacity");
  bar.title = `${hoursText(meetingMin)} meetings · ${hoursText(focusMin)} focus · ${hoursText(Math.max(0, workMin - meetingMin - focusMin))} free`;
  for (const [kind, total] of [["meetings", meetingMin], ["focus", focusMin]]) {
    const part = element("span", `cal-capacity__${kind}`);
    // CSSOM, never style="" (the CSP).
    part.style.setProperty("--part", String(Math.min(1, total / workMin)));
    bar.append(part);
  }
  return bar;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
