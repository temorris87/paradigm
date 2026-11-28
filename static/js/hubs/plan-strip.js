// A project's Plan strip on its dashboard (the main window), in a card of its own: a head
// ("Plan", the phases in one line, Gantt g p on the right) over the strip: its phases side by
// side, each as wide as its working days (done, the current one, those to come; a late one
// underlined in red with its slip) and today's line. A click on a phase
// opens it in the note window. A project with no phases yet still gets the strip, with what
// starts a plan: + Phase and Apply plan template… (not on an archived project).
//
//   const strip = new PlanStrip(sectionElement, { onOpen(id), onPlan(), onAddPhase(), onApplyTemplate() });
//   strip.show(ctx, note)     note: a project, else the strip hides
import { localDay } from "../meetings/meeting-days.js";
import { planStrip } from "../plan/plan-rows.js";

export class PlanStrip {
  constructor(root, { onOpen, onPlan, onAddPhase, onApplyTemplate }) {
    this.root = root;
    this.onOpen = onOpen;
    this.onPlan = onPlan;
    this.onAddPhase = onAddPhase;
    this.onApplyTemplate = onApplyTemplate;
  }

  show(ctx, note) {
    const project = note?.kind === "project";
    this.root.hidden = !project;
    if (!project) return;
    const strip = planStrip(ctx.tree, ctx.plan, note.id, localDay(ctx.today ?? new Date()));
    const head = element("div", "plan-strip__head");
    const label = element("span", "plan-strip__label", "Plan");
    const track = strip ? this.track(strip) : this.empty(note);
    const gantt = element("button", "plan-strip__gantt", "Gantt ");
    gantt.type = "button";
    gantt.title = "The full plan: drag phases and milestones (g p)";
    gantt.append(element("kbd", "plan-strip__key", "g p"));
    gantt.addEventListener("click", () => this.onPlan());
    head.append(label, element("span", "plan-strip__summary", strip ? stripSummary(strip) : ""), gantt);
    this.root.replaceChildren(head, track);
  }

  /** No phases yet: say so, and offer what starts a plan. */
  empty(note) {
    const track = element("div", "plan-strip__track plan-strip__track--empty");
    track.append(element("span", "plan-strip__empty", "No phases yet"));
    if (note.archived_at) return track;
    const add = (text, title, run) => {
      const button = element("button", "plan-strip__add", text);
      button.type = "button";
      button.title = title;
      button.addEventListener("click", run);
      track.append(button);
    };
    add("+ Phase", "A stretch of the work, with its own tasks and notes", () => this.onAddPhase());
    add("Apply plan template…", "Make phases, milestones and tasks from a template on the area", () => this.onApplyTemplate());
    return track;
  }

  track(strip) {
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
    return track;
  }
}

/** "4 phases · now Build · 1 done": the phases in one line. */
export function stripSummary(strip) {
  const n = strip.segments.length;
  const current = strip.segments.find((segment) => segment.state === "current");
  const done = strip.segments.filter((segment) => segment.state === "done").length;
  return [`${n} phase${n === 1 ? "" : "s"}`, current ? `now ${current.title}` : "", done ? `${done} done` : ""].filter(Boolean).join(" · ");
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
