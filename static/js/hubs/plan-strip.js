// A project's Plan strip on its dashboard (the main window): its phases side by side, each as
// wide as its working days (done, the current one, those to come; a late one underlined in
// red with its slip), today's line, and Gantt ↗ (gp) for the full chart. A click on a phase
// opens it in the note window.
//
//   const strip = new PlanStrip(sectionElement, { onOpen(id), onPlan() });
//   strip.show(ctx, note)     note: a project with phases, else the strip hides
import { localDay } from "../meetings/meeting-days.js";
import { planStrip } from "../plan/plan-rows.js";

export class PlanStrip {
  constructor(root, { onOpen, onPlan }) {
    this.root = root;
    this.onOpen = onOpen;
    this.onPlan = onPlan;
  }

  show(ctx, note) {
    const strip = note?.kind === "project" ? planStrip(ctx.tree, ctx.plan, note.id, localDay(ctx.today ?? new Date())) : null;
    this.root.hidden = !strip;
    if (!strip) return;
    const label = element("span", "plan-strip__label", "Plan");
    const track = element("div", "plan-strip__track");
    for (const segment of strip.segments) {
      const node = element("button", `plan-strip__phase plan-strip__phase--${segment.state}${segment.late ? " plan-strip__phase--late" : ""}`,
        segment.label);
      node.type = "button";
      node.tabIndex = -1;
      node.title = `${segment.title}: ${segment.start} → ${segment.end}`;
      // Inline style="" is refused by the CSP; CSSOM properties are not.
      node.style.flexGrow = String(segment.days);
      node.addEventListener("click", () => this.onOpen(segment.id));
      track.append(node);
    }
    if (strip.todayAt !== null) {
      const today = element("span", "plan-strip__today");
      today.style.setProperty("--at", String(strip.todayAt));
      track.append(today);
    }
    const gantt = element("button", "plan-strip__gantt", "Gantt ");
    gantt.type = "button";
    gantt.title = "The full plan: drag phases and milestones (gp)";
    gantt.append(element("kbd", "plan-strip__key", "gp"));
    gantt.addEventListener("click", () => this.onPlan());
    this.root.replaceChildren(label, track, gantt);
  }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
