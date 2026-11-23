// The note window's strip under its breadcrumb: the task block on now (its time, what is left,
// a bar), and the next meeting within two hours with a link to it (its Prep). Hidden when
// neither is near. It moves on once a minute.
//
//   const strip = new ContextStrip(section, { onOpen(id) });
//   strip.show(ctx, now)
import { clock } from "../calendar/week-model.js";
import { shortTitle } from "../meetings/meetings-model.js";
import { hoursText } from "../week/capacity.js";
import { contextOf } from "./today-model.js";

export class ContextStrip {
  constructor(root, { onOpen }) {
    this.root = root;
    this.onOpen = onOpen;
  }

  show(ctx, now) {
    const context = contextOf(ctx, now);
    this.root.hidden = !context;
    if (!context) return;
    const label = element("span", "context-strip__label", context.block ? "NOW" : "NEXT");
    const middle = element("div", "context-strip__middle");
    if (context.block) {
      const { block } = context;
      const line = element("div", "context-strip__line");
      line.append(element("span", "context-strip__title", block.entry.task.title),
        element("span", "context-strip__time", `${clock(block.start)}–${clock(block.end)} · ${hoursText(block.left)} left`));
      const bar = element("div", "context-strip__bar");
      const fill = element("div", "context-strip__fill");
      // CSSOM, never style="" (the CSP).
      fill.style.setProperty("--done", String(block.elapsed / Math.max(1, block.end - block.start)));
      bar.append(fill);
      middle.append(line, bar);
    }
    const right = element("span", "context-strip__next");
    if (context.next) {
      const { note, meeting } = context.next;
      const link = element("button", "context-strip__link", `Next: ${shortTitle(note, meeting)} ${meeting.time} · prep`);
      link.type = "button";
      link.title = "Open the meeting here, with its Prep";
      link.addEventListener("click", () => this.onOpen(note.id));
      right.append(link);
    }
    this.root.replaceChildren(label, middle, right);
  }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
