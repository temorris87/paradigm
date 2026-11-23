// The main window's dashboard of a hub or a person: its text, rendered (the note window
// edits it: Edit ↗), and a project's or an area's plan as a Gantt chart, over the card and
// sections HubPage draws. A project's chart moves its phases and milestones (each drop is a
// recorded change); an area's has a bar per project.
//
//   const dashboard = new Dashboard({ text, chart });   text: { box, label, body, edit }
//   dashboard.attach(app)      the NotesApp it works for (its plan, commands, renderer)
//   dashboard.show(ctx, note, body, pageShown)    after every redraw
//   dashboard.hasChart / dashboard.focus()
import { GanttView } from "../gantt/gantt-view.js";
import { valueOf } from "../gantt/gantt-model.js";
import { drawDiagrams } from "../diagrams/mermaid.js";
import { renderMarkdown } from "../markdown/index.js";
import { ensureMathFonts, typesetMath } from "../math/typeset.js";
import { localDay } from "../meetings/meeting-days.js";
import { isHub, isPerson } from "../notes/hub-groups.js";
import { applyTemplateDialog, dropDates, editDatesDialog, historyDialog, newMilestoneDialog, newPhaseDialog,
  saveTemplateDialog, setMilestoneDone } from "../plan/plan-commands.js";
import { areaRows, projectRows } from "../plan/plan-rows.js";
import { fieldsFor } from "./fields.js";

// Past this height (rem) the rendered text folds under Show more.
const FOLD_REM = 24;

export class Dashboard {
  constructor({ text, chart }) {
    this.text = text;
    this.chartBox = chart;
    this.note = null;
    this.hasChart = false;
    this.app = null;
    this.chart = new GanttView(chart, {
      label: "Plan",
      onOpen: (row, mark) => this.open(row, mark),
      onDrop: (row, mark, span) => this.drop(row, mark, span),
      onAction: (action, row) => this.action(action, row),
    });
    // Long text is folded under "Show more" (never a scroll box inside the scrolling page);
    // opened stays opened for that note until another note is shown.
    this.unfolded = null;
    text.more?.addEventListener("click", () => {
      this.unfolded = this.unfolded === this.note?.id ? null : this.note?.id;
      this.fold();
    });
    text.edit.addEventListener("click", () => this.note && this.app.guard(this.app.openInNoteWindow(this.note.id)));
    // A link in the rendered text opens like any other: a dashboard here, a note there.
    text.body.addEventListener("click", (event) => {
      const link = event.target.closest?.("a[href]");
      if (!link) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || !url.searchParams.has("note")) return;
      event.preventDefault();
      this.app.guard(this.app.open(Number(url.searchParams.get("note"))));
    });
  }

  attach(app) {
    this.app = app;
  }

  show(ctx, note, body, pageShown) {
    const shown = Boolean(note) && !pageShown && (isHub(ctx.tree, note.id) || isPerson(ctx.tree, note.id));
    this.text.box.hidden = !shown;
    this.note = shown ? note : null;
    this.hasChart = shown && (note.kind === "project" || note.kind === "area");
    this.chartBox.hidden = !this.hasChart;
    if (!shown) return;
    const fields = fieldsFor(note);
    this.text.label.textContent = fields.main.label;
    this.text.body.innerHTML = body.trim() ? renderMarkdown(body, this.app.markdownOptions())
      : `<p class="dash-text__empty">${escapeHtml(fields.main.hint || "Nothing written yet")}: Edit ↗ to write it</p>`;
    for (const link of this.text.body.querySelectorAll("a")) link.tabIndex = -1;
    // The renderer leaves maths and diagrams as placeholders; draw them as the editor does.
    ensureMathFonts();
    typesetMath(this.text.body);
    drawDiagrams(this.text.body);
    this.fold();
    if (this.hasChart) this.drawChart(ctx, note);
  }

  fold() {
    const { body, more } = this.text;
    if (!more) return;
    const open = this.unfolded === this.note?.id;
    body.classList.remove("dash-text__body--folded");
    const tall = body.scrollHeight > FOLD_REM * parseFloat(getComputedStyle(document.documentElement).fontSize);
    body.classList.toggle("dash-text__body--folded", tall && !open);
    more.hidden = !tall;
    more.textContent = open ? "Show less" : "Show more";
  }

  drawChart(ctx, note) {
    const today = localDay(ctx.today ?? new Date());
    const archived = Boolean(note.archived_at);
    if (note.kind === "area") {
      this.chart.draw({ rows: areaRows(ctx.tree, ctx.plan, note.id, today), today, tools: [],
        empty: "No projects in this area yet" });
      return;
    }
    const tools = archived ? [] : [
      tool("+ Phase", "A stretch of the work, with its tasks and notes (p)", () => newPhaseDialog(this.app, note)),
      tool("+ Milestone", "A dated point to reach (m)", () => newMilestoneDialog(this.app, note)),
      tool("Apply plan template…", "Make phases, milestones and tasks from a template on the area", () => applyTemplateDialog(this.app, note)),
      tool("Save as plan template…", "Keep this plan on the area, to start other projects from", () => saveTemplateDialog(this.app, note)),
    ].map((button) => this.wire(button));
    const applied = ctx.plan.appliedTo(note.id);
    if (applied) tools.push(span("gantt__note", `from “${applied.title}”`));
    this.chart.draw({ rows: projectRows(ctx.tree, ctx.plan, note.id, today, { draggable: !archived }), today, tools,
      empty: "No phases yet: + Phase, or Apply plan template…" });
  }

  wire(button) {
    button.addEventListener("click", () => this.app.guard(button.run()));
    return button;
  }

  open(row, mark) {
    if (mark) return this.app.guard(this.app.open(mark.id));
    if (row.kind === "milestone") return undefined;
    return this.app.guard(this.app.open(row.id));
  }

  drop(row, mark, span) {
    const app = this.app;
    if (mark) return app.guard(dropDates(app, mark.id, { day: valueOf(this.chart.axis, span.start) }));
    return app.guard(dropDates(app, row.id, { start: valueOf(this.chart.axis, span.start), end: valueOf(this.chart.axis, span.end) }));
  }

  action(action, row) {
    const app = this.app;
    const note = this.note;
    if (!note || note.kind !== "project") return undefined;
    const planned = row && row.kind === "phase" ? row.id : row?.marks?.length === 1 ? row.marks[0].id : null;
    switch (action) {
      case "newPhase": return app.guard(newPhaseDialog(app, note));
      case "newMilestone": return app.guard(newMilestoneDialog(app, row?.kind === "phase" ? app.tree.get(row.id) : note));
      case "edit": return planned !== null ? app.guard(editDatesDialog(app, planned)) : undefined;
      case "history": return planned !== null ? app.guard(historyDialog(app, planned)) : undefined;
      case "done": {
        const milestone = row?.marks?.find((each) => !each.done) ?? row?.marks?.[0];
        return milestone ? app.guard(setMilestoneDone(app, milestone.id, !milestone.done)) : undefined;
      }
      default: return undefined;
    }
  }

  focus() {
    this.chart.focus();
  }
}

function tool(text, title, run) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "gantt__tool";
  button.textContent = text;
  button.title = title;
  button.run = run;
  return button;
}

function span(className, text) {
  const node = document.createElement("span");
  node.className = className;
  node.textContent = text;
  return node;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
