// A project's (or an area's) full plan, in the main window (&plan, over its dashboard): the
// Gantt chart. A project's chart moves its phases and milestones (each drop is a recorded
// change); an area's has a bar per project. gp on a dashboard (or Gantt ↗ on its Plan
// strip) opens it; Escape goes back.
//
//   const page = new PlanPage(section, { app: () => notesApp, onLeave() });
//   page.show(ctx)      the open note's plan (app.currentId)
//   page.focus()
import { GanttView } from "../gantt/gantt-view.js";
import { valueOf } from "../gantt/gantt-model.js";
import { localDay } from "../meetings/meeting-days.js";
import { applyTemplateDialog, dropDates, editDatesDialog, historyDialog, newMilestoneDialog, newPhaseDialog,
  saveTemplateDialog, setMilestoneDone } from "./plan-commands.js";
import { areaRows, projectRows } from "./plan-rows.js";
import { dayNumber, daysBetween, shortDay, slipOf } from "./plan-model.js";

export class PlanPage {
  constructor(section, { app, onLeave }) {
    this.section = section;
    this.app = app;
    this.note = null;
    section.classList.add("plan-page");
    section.tabIndex = -1;
    this.head = element("header", "plan-page__head");
    this.title = element("h1", "plan-page__title");
    const back = element("button", "plan-page__back", "‹ Dashboard");
    back.type = "button";
    back.title = "Back to the dashboard (Escape)";
    back.addEventListener("click", () => onLeave());
    this.head.append(back, this.title);
    this.chartBox = element("section", "plan-page__chart");
    // Beside the chart: the chosen phase's date history, newest first (the why of each move).
    this.history = element("aside", "plan-page__history");
    this.history.setAttribute("aria-label", "Date history");
    this.legend = element("p", "plan-page__legend");
    const body = element("div", "plan-page__body");
    const left = element("div", "plan-page__main");
    left.append(this.chartBox, this.legend);
    body.append(left, this.history);
    section.replaceChildren(this.head, body);
    this.chart = new GanttView(this.chartBox, {
      label: "Plan",
      onOpen: (row, mark) => this.open(row, mark),
      onDrop: (row, mark, span) => this.drop(row, mark, span),
      onAction: (action, row) => this.action(action, row),
      onActive: (row) => this.drawHistory(row),
    });
    section.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !event.target.closest("dialog")) {
        event.preventDefault();
        onLeave();
      }
    });
  }

  show(ctx) {
    const app = this.app();
    const note = ctx.tree.get(app.currentId) ?? null;
    this.note = note && (note.kind === "project" || note.kind === "area") ? note : null;
    this.title.textContent = this.note ? `${this.note.title} · plan` : "No plan here";
    if (!this.note) {
      this.chart.draw({ rows: [], today: localDay(ctx.today ?? new Date()), empty: "Plans belong to projects and areas" });
      return;
    }
    this.draw(ctx, this.note);
  }

  draw(ctx, note) {
    const app = this.app();
    const today = localDay(ctx.today ?? new Date());
    const archived = Boolean(note.archived_at);
    if (note.kind === "area") {
      this.chart.draw({ rows: areaRows(ctx.tree, ctx.plan, note.id, today), today, tools: [], empty: "No projects in this area yet" });
      return;
    }
    const tools = archived ? [] : [
      tool("+ Phase", "A stretch of the work, with its tasks and notes (p)", () => newPhaseDialog(app, note)),
      tool("+ Milestone", "A dated point to reach (m)", () => newMilestoneDialog(app, note)),
      tool("Apply plan template…", "Make phases, milestones and tasks from a template on the area", () => applyTemplateDialog(app, note)),
      tool("Save as plan template…", "Keep this plan on the area, to start other projects from", () => saveTemplateDialog(app, note)),
    ].map((button) => {
      button.addEventListener("click", () => app.guard(button.run()));
      return button;
    });
    const applied = ctx.plan.appliedTo(note.id);
    if (applied) tools.push(element("span", "gantt__note", `from “${applied.title}”`));
    this.ctx = ctx;
    this.chart.draw({ rows: notedRows(ctx, note, today, archived), today, tools,
      empty: "No phases yet: + Phase, or Apply plan template…" });
    this.legend.replaceChildren(...[["bar", "a phase"], ["baseline", "where it was first planned"], ["today", "today"],
      ["due", note.due ? `due ${note.due}` : ""]].filter(([, words]) => words).map(([kind, words]) => {
      const item = element("span", `plan-page__key plan-page__key--${kind}`);
      item.append(element("span", "plan-page__swatch"), words);
      return item;
    }));
    this.drawHistory(this.chart.activeRow);
  }

  /** The chosen phase's (or milestone's) moves, newest first, the baseline last. */
  drawHistory(row) {
    const ctx = this.ctx;
    const marks = (row?.marks ?? []).filter((mark) => !mark.key.startsWith("due:"));
    const id = row?.kind === "phase" ? row.id : marks.length === 1 ? marks[0].id : null;
    if (!ctx || id === null) {
      this.history.replaceChildren(element("p", "plan-page__history-empty", "Choose a phase to see how its dates moved."));
      return;
    }
    const today = localDay(ctx.today ?? new Date());
    const title = ctx.tree.get(id)?.title ?? "";
    const changes = [...ctx.plan.changesOf(id)].reverse();
    const phase = ctx.plan.phase(id);
    const milestone = ctx.plan.milestone(id);
    const rows = changes.map((change) => {
      const line = element("div", "plan-page__move");
      const shift = daysBetween(change.old, change.new);
      line.append(element("span", "plan-page__move-day", shortDay(change.changed_at?.slice(0, 10) ?? "", today)),
        element("span", "plan-page__move-what", `${change.field === "start" ? "Start" : change.field === "end" ? "End" : "Day"} ${shift > 0 ? "+" : ""}${shift} d → ${shortDay(change.new, today)}`),
        element("span", "plan-page__move-why", change.reason || "no reason given"));
      return line;
    });
    const baseline = element("div", "plan-page__move plan-page__move--baseline");
    baseline.append(element("span", "plan-page__move-day", "first"), element("span", "plan-page__move-what",
      phase ? `${shortDay(phase.baseline_start, today)} → ${shortDay(phase.baseline_end, today)}` : shortDay(milestone?.baseline_day ?? "", today)),
    element("span", "plan-page__move-why", "the baseline"));
    this.history.replaceChildren(element("h2", "plan-page__history-title", `${title} · date history`), ...rows, baseline,
      element("p", "plan-page__history-foot", "Each why goes into the next Log status's suggestions."));
  }

  open(row, mark) {
    const app = this.app();
    if (mark?.key.startsWith("due:")) return undefined;
    if (mark) return app.guard(app.open(mark.id));
    if (row.kind === "milestone") return undefined;
    return app.guard(app.open(row.id));
  }

  drop(row, mark, span) {
    const app = this.app();
    if (mark) return app.guard(dropDates(app, mark.id, { day: valueOf(this.chart.axis, span.start) }));
    return app.guard(dropDates(app, row.id, { start: valueOf(this.chart.axis, span.start), end: valueOf(this.chart.axis, span.end) }));
  }

  action(action, row) {
    const app = this.app();
    const note = this.note;
    if (!note || note.kind !== "project") return undefined;
    const marks = (row?.marks ?? []).filter((mark) => !mark.key.startsWith("due:"));
    const planned = row && row.kind === "phase" ? row.id : marks.length === 1 ? marks[0].id : null;
    switch (action) {
      case "newPhase": return app.guard(newPhaseDialog(app, note));
      case "newMilestone": return app.guard(newMilestoneDialog(app, row?.kind === "phase" ? app.tree.get(row.id) : note));
      case "edit": return planned !== null ? app.guard(editDatesDialog(app, planned)) : undefined;
      case "history": return planned !== null ? app.guard(historyDialog(app, planned)) : undefined;
      case "done": {
        const milestone = marks.find((each) => !each.done) ?? marks[0];
        return milestone ? app.guard(setMilestoneDone(app, milestone.id, !milestone.done)) : undefined;
      }
      default: return undefined;
    }
  }

  focus() {
    this.chart.focus();
  }
}

/** The chart's rows with a second line under each label: done, its slip, or the slack left
 * before the project's due date (the last phase); the due date as a mark on the Milestones row. */
function notedRows(ctx, note, today, archived) {
  const rows = projectRows(ctx.tree, ctx.plan, note.id, today, { draggable: !archived });
  const phases = rows.filter((row) => row.kind === "phase");
  const lastPhase = phases[phases.length - 1];
  for (const row of phases) {
    const phase = ctx.plan.phase(row.id);
    const slip = slipOf(ctx.plan, row.id);
    if (phase.end < today) Object.assign(row, { note: "done", noteTone: "done" });
    else if (slip.days > 0) Object.assign(row, { note: `+${slip.days} d · moved ${slip.moves}×`, noteTone: "late" });
    if (row === lastPhase && note.due && phase.end <= note.due && phase.end >= today) {
      const slack = daysBetween(phase.end, note.due);
      Object.assign(row, { note: `${slack} d of slack left`, noteTone: slack <= 3 ? "warn" : "dim" });
    }
  }
  if (note.due) {
    const due = { key: `due:${note.id}`, id: note.id, label: "Due", at: dayNumber(note.due), done: false, draggable: false, late: note.due < today,
      detail: `due ${shortDay(note.due, today)}` };
    const own = rows.find((row) => row.kind === "milestone");
    if (own) own.marks = [...own.marks, due];
    else rows.push({ key: `milestones:${note.id}`, id: note.id, kind: "milestone", label: "Milestones", start: NaN, end: NaN, marks: [due] });
  }
  return rows;
}

function tool(text, title, run) {
  const button = element("button", "gantt__tool", text);
  button.type = "button";
  button.title = title;
  button.run = run;
  return button;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
