// The page around the open note's text: the card under the breadcrumb (hub-line.js), the
// label over each text box (fields.js), and the sections under the text (hub-sections.js).
// A hub, a person, a meeting, a phase or a milestone gets the card and its sections; a
// decision or question the card; any other note its Tasks and Files. It knows the tree, the
// people, the meetings, the records, the plan and the section table, and tells the page which
// note to open; it never opens notes itself.
//
//   const hub = new HubPage({ page: mainElement, line, section, labels, onOpen(id, at?),
//                             onLeave(), controls, tabActions, renderSnippet(markdown),
//                             hideSections: [...], dashboard: true, sheet });
//     dashboard: the main window: a hub's or a person's sections in two lanes (Act, Know:
//             hub-sections.js DASHBOARD_LAYOUT), the plan drawn as a chart instead
//     labels: { main, agenda, agendaField }: the label elements over the text boxes, and the
//             agenda's wrapper (shown on a meeting only)
//     controls: the card's buttons (hub-actions.js hubLineControls)
//     tabActions: { add(sectionKey, owner), row(key, sectionKey, owner, row), command(action, owner) }
//             (hub-actions.js); command: "logStatus", "plan";
//             row keys besides the row's buttons: "addSubtask", "openFile", "openFolder",
//             "openTemplate", "openTask"
//     at: { field, line } when a row points into the text (a mention)
//     sheet: the note window's .sheet around the sections (section-sheet.js): they slide up
//             over the text from a bar of counts; closed whenever another note opens
//   hub.show(ctx, currentId)    after every redraw; ctx: { tree, people, meetings, records, tasks, sessions,
//                               links, mentions, today }
//   hub.focus()                 :hub: the sections (the sheet opened first)
//   hub.hub                     the open hub, person, meeting, decision or question, or null
//   hub.hasPanel                it has sections
//
// page carries data-page (project, area, resource, person, meeting, decision, question,
// note) for the CSS: how tall each text box is.
import { Tasks } from "../tasks/tasks-model.js";
import { Meetings } from "../meetings/meetings-model.js";
import { hubOf, isDecisionOrQuestion, isHub, isMeeting, isMilestone, isPerson, isPhase } from "../notes/hub-groups.js";
import { Links } from "../notes/links.js";
import { People } from "../people/people-model.js";
import { Records } from "../records/records-model.js";
import { fieldsFor } from "./fields.js";
import { foldKey, isFolded, loadFolds, saveFolds } from "./hub-folds.js";
import { showHubLine } from "./hub-line.js";
import { NO_CONTROLS } from "./hub-line-controls.js";
import { HubPanel } from "./hub-panel.js";
import { dashboardFor, sectionsFor } from "./hub-sections.js";
import { SectionSheet } from "./section-sheet.js";
import { sectionSummary } from "./section-summary.js";

const NO_LABELS = { main: null, agenda: null, agendaField: null };

export class HubPage {
  constructor({ page, line, section, labels = NO_LABELS, onOpen, onLeave, controls = NO_CONTROLS,
                tabActions = { add() {}, row() {} }, renderSnippet = () => "", hideSections = [], dashboard = false, sheet = null }) {
    this.hideSections = new Set(hideSections);
    this.dashboard = dashboard;
    this.lanes = null;
    this.expanded = new Set(); // tasks shown with their subtasks
    this.page = page;
    this.line = line;
    this.section = section;
    this.labels = labels;
    this.onOpen = onOpen;
    this.onLeave = onLeave;
    this.controls = controls;
    this.tabActions = tabActions;
    this.ctx = { tree: null, people: new People(), meetings: new Meetings(), records: new Records(), links: new Links(), mentions: [],
      tasks: new Tasks(), sessions: [] };
    this.hub = null;
    this.sections = [];
    this.folds = loadFolds();
    this.showingAll = new Set(); // "hubId:section" while its "Show all" is on
    this.panel = new HubPanel(section, {
      onRow: (sectionDef, row) => this.onRow(sectionDef, row),
      onToggle: (sectionDef) => this.toggle(sectionDef),
      onExpand: (sectionDef, row) => this.expand(row),
      onMore: (sectionDef) => this.showAll(sectionDef),
      // A split section ("openQuestions") adds and acts as the section it is cut from.
      onAdd: (sectionDef) => this.tabActions.add(sectionDef.base ?? sectionDef.key, this.hub),
      onRowAction: (sectionDef, row, key) => this.tabActions.row(key, sectionDef.base ?? sectionDef.key, this.hub, row),
      // Keys about the page's owner, not a row: L (Log status…), gp (the full plan).
      onCommand: (action) => this.tabActions.command?.(action, this.hub),
      onLeave: () => this.leave(),
      renderSnippet,
    });
    this.sheet = sheet && new SectionSheet(sheet, { onEnter: () => this.panel.focus(), onLeave: () => this.onLeave() });
  }

  leave() {
    this.sheet?.close();
    this.onLeave();
  }

  get hasPanel() {
    return this.sections.length > 0;
  }

  // The text is never hidden under the sections now; kept for the app's focus rules.
  get editorHidden() {
    return false;
  }

  show(ctx, currentId) {
    this.ctx = { people: new People(), meetings: new Meetings(), records: new Records(), links: new Links(), mentions: [],
      tasks: new Tasks(), sessions: [], ...ctx, expanded: this.expanded };
    const { tree } = this.ctx;
    const carded = [isHub, isPerson, isMeeting, isDecisionOrQuestion, isPhase, isMilestone].some((is) => is(tree, currentId));
    const note = tree.get(currentId) ?? null;
    if (this.hub?.id !== note?.id) {
      this.showingAll.clear();
      this.expanded.clear();
      this.sheet?.close();
      this.panel.reset();
    }
    // hub: the page's owner, whose sections these are (any note but a template).
    this.hub = note && note.kind !== "template" ? note : null;
    const shown = (sections) => sections.filter((section) => section && !this.hideSections.has(section.key));
    const lanes = this.dashboard ? dashboardFor(this.hub) : null;
    this.lanes = lanes && { wide: shown(lanes.wide), act: shown(lanes.act), know: shown(lanes.know) };
    this.sections = this.lanes ? [...this.lanes.wide, ...this.lanes.act, ...this.lanes.know] : shown(sectionsFor(this.hub));
    this.page.dataset.page = this.hub?.kind ?? "note";
    this.showLabels(note);
    showHubLine(this.line, this.ctx, carded ? note : null, (id) => this.onOpen(id), this.controls);
    this.section.hidden = !this.hasPanel;
    this.redraw();
  }

  showLabels(note) {
    const fields = fieldsFor(note, Boolean(note && hubOf(this.ctx.tree, note.id)));
    setLabel(this.labels.main, fields.main);
    if (this.labels.agendaField) this.labels.agendaField.hidden = !fields.agenda;
    if (fields.agenda) setLabel(this.labels.agenda, fields.agenda);
  }

  drawn(section, rows) {
    const hub = this.hub;
    const all = this.showingAll.has(`${hub.id}:${section.key}`);
    // Pinned rows (a Files section's folders) are always drawn; the limit and Show all count the rest.
    const pinned = section.pinned ? rows.filter(section.pinned) : [];
    const counted = section.pinned ? rows.filter((row) => !section.pinned(row)) : rows;
    const limit = section.limit && !all ? section.limit : counted.length;
    return {
      key: section.key,
      base: section.base ?? null,
      label: typeof section.label === "function" ? section.label(hub) : section.label,
      columns: section.columns ?? null,
      detail: section.detail ? section.detail(rows) : String(rows.length),
      folded: isFolded(this.folds, hub.kind, section),
      rows: [...pinned, ...counted.slice(0, limit)],
      more: Math.max(0, counted.length - limit),
      total: counted.length,
      empty: section.empty(hub),
      add: section.add?.label ?? null,
      addPlain: Boolean(section.add?.plain),
    };
  }

  redraw() {
    if (!this.hasPanel) return this.sheet?.setSummary([]);
    const rows = new Map(this.sections.map((section) => [section, section.rows(this.ctx, this.hub)]));
    const drawn = (sections) => sections.map((section) => this.drawn(section, rows.get(section)));
    this.panel.draw(this.lanes ? { wide: drawn(this.lanes.wide), act: drawn(this.lanes.act), know: drawn(this.lanes.know) }
      : drawn(this.sections));
    this.sheet?.setSummary(sectionSummary(this.sections.map((section) => ({
      key: section.key, label: typeof section.label === "function" ? section.label(this.hub) : section.label,
      rows: rows.get(section) }))));
  }

  onRow(sectionDef, row) {
    if (row.addSubtask !== undefined) return this.tabActions.row("addSubtask", sectionDef.key, this.hub, row);
    if (row.folder !== undefined) return this.tabActions.row("openFolder", sectionDef.key, this.hub, row);
    if (row.file !== undefined) return this.tabActions.row("openFile", sectionDef.key, this.hub, row);
    if (row.template !== undefined) return this.tabActions.row("openTemplate", sectionDef.key, this.hub, row);
    if (row.statusEntry !== undefined || row.statusHistory) return this.tabActions.row("statusHistory", sectionDef.key, this.hub, row);
    if (row.digest) return this.tabActions.add("digest", this.hub);
    // A task (Tasks, Waiting on, I owe, a subtask opened in place) opens its own page.
    if (row.task !== undefined) return this.tabActions.row("openTask", sectionDef.key, this.hub, row);
    return this.onOpen(row.id, row.at);
  }

  /** z on a task in Tasks: its notes, every level of subtasks and + Add subtask, in place. */
  expand(row) {
    if (this.expanded.has(row.task)) this.expanded.delete(row.task);
    else this.expanded.add(row.task);
    this.redraw();
  }

  toggle(sectionDef) {
    const section = this.sections.find((each) => each.key === sectionDef.key);
    if (!section) return;
    this.folds[foldKey(this.hub.kind, section)] = !isFolded(this.folds, this.hub.kind, section);
    saveFolds(this.folds);
    this.redraw();
  }

  showAll(sectionDef) {
    this.showingAll.add(`${this.hub.id}:${sectionDef.key}`);
    this.redraw();
  }

  focus() {
    if (!this.hasPanel) return;
    this.sheet?.open();
    this.panel.focus();
  }
}

/** The label over a text box: "OUTCOME" and, while the box is empty, its hint. */
function setLabel(node, { label, hint }) {
  if (!node) return;
  node.replaceChildren(text("field-label__name", label), ...(hint ? [text("field-label__hint", hint)] : []));
}

function text(className, value) {
  const node = document.createElement("span");
  node.className = className;
  node.textContent = value;
  return node;
}
