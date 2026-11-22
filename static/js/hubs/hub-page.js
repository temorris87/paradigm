// The page around the open note's text: the card under the breadcrumb (hub-line.js), the
// label over each text box (fields.js), and the sections under the text (hub-sections.js)
// on a hub, a person or a meeting. A decision or question gets the card and its label; any
// other note just its label. It knows the tree, the people, the meetings, the records and the
// section table, and tells the page which note to open; it never opens notes itself.
//
//   const hub = new HubPage({ page: mainElement, line, section, labels, onOpen(id, at?),
//                             onLeave(), controls, tabActions, renderSnippet(markdown) });
//     labels: { main, agenda, agendaField }: the label elements over the text boxes, and the
//             agenda's wrapper (shown on a meeting only)
//     controls: the card's buttons (hub-actions.js hubLineControls)
//     tabActions: { add(sectionKey, owner), row(key, sectionKey, owner, row) } (hub-actions.js)
//     at: { field, line } when a row points into the text (a mention)
//   hub.show(ctx, currentId)    after every redraw; ctx: { tree, people, meetings, records,
//                               links, mentions, today }
//   hub.focus()                 :hub: the sections
//   hub.hub                     the open hub, person, meeting, decision or question, or null
//   hub.hasPanel                it has sections
//
// page carries data-page (project, area, resource, person, meeting, decision, question,
// note) for the CSS: how tall each text box is.
import { Meetings } from "../meetings/meetings-model.js";
import { hubOf, isDecisionOrQuestion, isHub, isMeeting, isPerson } from "../notes/hub-groups.js";
import { Links } from "../notes/links.js";
import { People } from "../people/people-model.js";
import { Records } from "../records/records-model.js";
import { fieldsFor } from "./fields.js";
import { foldKey, isFolded, loadFolds, saveFolds } from "./hub-folds.js";
import { showHubLine } from "./hub-line.js";
import { NO_CONTROLS } from "./hub-line-controls.js";
import { HubPanel } from "./hub-panel.js";
import { sectionsFor } from "./hub-sections.js";

const NO_LABELS = { main: null, agenda: null, agendaField: null };

export class HubPage {
  constructor({ page, line, section, labels = NO_LABELS, onOpen, onLeave, controls = NO_CONTROLS,
                tabActions = { add() {}, row() {} }, renderSnippet = () => "" }) {
    this.page = page;
    this.line = line;
    this.section = section;
    this.labels = labels;
    this.onOpen = onOpen;
    this.onLeave = onLeave;
    this.controls = controls;
    this.tabActions = tabActions;
    this.ctx = { tree: null, people: new People(), meetings: new Meetings(), records: new Records(), links: new Links(), mentions: [] };
    this.hub = null;
    this.sections = [];
    this.folds = loadFolds();
    this.showingAll = new Set(); // "hubId:section" while its "Show all" is on
    this.panel = new HubPanel(section, {
      onRow: (sectionDef, row) => this.onOpen(row.id, row.at),
      onToggle: (sectionDef) => this.toggle(sectionDef),
      onMore: (sectionDef) => this.showAll(sectionDef),
      onAdd: (sectionDef) => this.tabActions.add(sectionDef.key, this.hub),
      onRowAction: (sectionDef, row, key) => this.tabActions.row(key, sectionDef.key, this.hub, row),
      onLeave: () => this.onLeave(),
      renderSnippet,
    });
  }

  get hasPanel() {
    return this.sections.length > 0;
  }

  // The text is never hidden under the sections now; kept for the app's focus rules.
  get editorHidden() {
    return false;
  }

  show(ctx, currentId) {
    this.ctx = { people: new People(), meetings: new Meetings(), records: new Records(), links: new Links(), mentions: [], ...ctx };
    const { tree } = this.ctx;
    const shown = [isHub, isPerson, isMeeting, isDecisionOrQuestion].some((is) => is(tree, currentId));
    const note = tree.get(currentId) ?? null;
    if (this.hub?.id !== (shown ? note?.id : null)) this.showingAll.clear();
    this.hub = shown ? note : null;
    this.sections = sectionsFor(this.hub).filter(Boolean);
    this.page.dataset.page = this.hub?.kind ?? "note";
    this.showLabels(note);
    showHubLine(this.line, this.ctx, this.hub, (id) => this.onOpen(id), this.controls);
    this.section.hidden = !this.hasPanel;
    if (this.hasPanel) this.panel.draw(this.sections.map((section) => this.drawn(section)));
  }

  showLabels(note) {
    const fields = fieldsFor(note, Boolean(note && hubOf(this.ctx.tree, note.id)));
    setLabel(this.labels.main, fields.main);
    if (this.labels.agendaField) this.labels.agendaField.hidden = !fields.agenda;
    if (fields.agenda) setLabel(this.labels.agenda, fields.agenda);
  }

  drawn(section) {
    const hub = this.hub;
    const rows = section.rows(this.ctx, hub);
    const all = this.showingAll.has(`${hub.id}:${section.key}`);
    const limit = section.limit && !all ? section.limit : rows.length;
    return {
      key: section.key,
      label: section.label,
      detail: section.detail ? section.detail(rows) : String(rows.length),
      folded: isFolded(this.folds, hub.kind, section),
      rows: rows.slice(0, limit),
      more: Math.max(0, rows.length - limit),
      empty: section.empty(hub),
      add: section.add?.label ?? null,
    };
  }

  redraw() {
    if (this.hasPanel) this.panel.draw(this.sections.map((section) => this.drawn(section)));
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
    if (this.hasPanel) this.panel.focus();
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
