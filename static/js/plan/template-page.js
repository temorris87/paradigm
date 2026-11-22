// A plan template's page, in the main window (&template=ID): its Gantt chart in working days
// from the start (drag a bar or a diamond to move it), and its phases and milestones with
// their standard tasks, each with its buttons. Every change is saved at once.
//
//   const page = new TemplatePage(section, { app: () => notesApp, onLeave() });
//   page.show(ctx)      ctx.planTemplates, ctx.templateId
//   page.focus()
import { GanttView } from "../gantt/gantt-view.js";
import { confirmDialog, formDialog } from "../ui/dialog.js";
import { templateRows } from "./plan-rows.js";

export class TemplatePage {
  constructor(section, { app, onLeave }) {
    this.section = section;
    this.app = app;
    this.template = null;
    section.classList.add("plan-template");
    section.tabIndex = -1;
    this.head = element("header", "plan-template__head");
    this.chartBox = element("div", "plan-template__chart");
    this.items = element("div", "plan-template__items");
    section.replaceChildren(this.head, this.chartBox, this.items);
    this.chart = new GanttView(this.chartBox, {
      label: "Template plan",
      onOpen: (row, mark) => this.run(this.editItem(mark?.id ?? row.id, row, mark)),
      onDrop: (row, mark, span) => this.run(this.moved(mark ? mark.id : row.id, mark ? { start: span.start } : span)),
      onAction: (action, row) => this.onAction(action, row),
    });
    section.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !event.target.closest("dialog")) {
        event.preventDefault();
        onLeave();
      }
    });
  }

  show(ctx) {
    this.template = (ctx.planTemplates ?? []).find((each) => each.id === ctx.templateId) ?? null;
    const template = this.template;
    if (!template) {
      this.head.replaceChildren(element("h2", "plan-template__title", "That plan template is gone"));
      this.chartBox.hidden = true;
      this.items.replaceChildren();
      return;
    }
    const area = ctx.tree.get(template.area_id);
    const back = button("‹ " + (area?.title ?? "Area"), "Back to the area's dashboard", () => this.run(this.app().open(template.area_id)));
    this.head.replaceChildren(back, element("h2", "plan-template__title", template.title),
      element("span", "plan-template__note", "Days are working days from the start: weekends and the timesheet's holidays are skipped when it is applied."),
      button("Rename…", "Rename the template", () => this.run(this.rename())),
      button("Delete…", "Delete the template (projects made from it keep their plans)", () => this.run(this.remove())));
    this.chartBox.hidden = false;
    this.chart.draw({
      rows: templateRows(template), mode: "offsets",
      tools: [button("+ Phase", "A phase of the template (p)", () => this.run(this.addItem("phase"))),
        button("+ Milestone", "A milestone of the template (m)", () => this.run(this.addItem("milestone")))],
      empty: "Nothing in it yet: + Phase",
    });
    this.items.replaceChildren(...template.items.map((item) => this.itemNode(template, item)));
  }

  itemNode(template, item) {
    const node = element("section", `plan-template__item plan-template__item--${item.kind}`);
    const phase = template.items.find((each) => each.id === item.phase_id);
    const when = item.kind === "phase" ? `days ${item.start}–${item.end}` : `day ${item.start}${phase ? ` · in ${phase.title}` : ""}`;
    const head = element("div", "plan-template__item-head");
    head.append(element("span", "plan-template__kind", item.kind === "phase" ? "Phase" : "◆ Milestone"),
      element("span", "plan-template__item-title", item.title), element("span", "plan-template__when", when),
      button("Edit…", "Its name and days", () => this.run(this.editItem(item.id))),
      button("+ Task", "A task it brings to every project", () => this.run(this.addTask(item))),
      button("Remove", "Take it out of the template", () => this.run(this.removeItem(item))));
    node.append(head);
    const tops = item.tasks.filter((task) => task.parent_id === null);
    if (tops.length) {
      const list = element("ul", "plan-template__tasks");
      for (const task of tops) {
        const li = element("li", "plan-template__task");
        li.append(element("span", "", `☐ ${task.title}`), button("+ Subtask", "A subtask of it", () => this.run(this.addTask(item, task))),
          button("×", `Take "${task.title}" out`, () => this.run(this.removeTask(task))));
        const subs = item.tasks.filter((each) => each.parent_id === task.id);
        if (subs.length) {
          const inner = element("ul", "plan-template__tasks plan-template__tasks--sub");
          for (const sub of subs) {
            const subLi = element("li", "plan-template__task");
            subLi.append(element("span", "", `☐ ${sub.title}`), button("×", `Take "${sub.title}" out`, () => this.run(this.removeTask(sub))));
            inner.append(subLi);
          }
          li.append(inner);
        }
        list.append(li);
      }
      node.append(list);
    }
    return node;
  }

  // ---- changes ----

  async changed(text) {
    await this.app().refreshTree();
    if (text) this.app().say(text);
  }

  addItem(kind) {
    const template = this.template;
    const phases = template.items.filter((item) => item.kind === "phase");
    const end = template.items.length ? Math.max(...template.items.map((item) => item.end)) + 1 : 0;
    return formDialog({
      title: kind === "phase" ? `New phase in "${template.title}"` : `New milestone in "${template.title}"`,
      fields: [
        { key: "title", label: kind === "phase" ? "Phase" : "Milestone" },
        { key: "start", label: kind === "phase" ? "Starts on working day" : "On working day", type: "number", value: String(kind === "phase" ? end : Math.max(end - 1, 0)) },
        ...(kind === "phase" ? [{ key: "length", label: "How many working days", type: "number", value: "10" }] : []),
        ...(kind === "milestone" && phases.length ? [{ key: "phase", label: "In", type: "select", value: "",
          options: [["", "The project"], ...phases.map((phase) => [String(phase.id), phase.title])] }] : []),
      ],
      submit: "Add",
      run: async ({ title, start, length = "1", phase = "" }) => {
        const from = wholeDay(start);
        await this.app().planTemplatesApi.addItem(template.id, { kind, title: title.trim(), start: from,
          end: kind === "phase" ? from + Math.max(wholeDay(length), 1) - 1 : from, phaseId: phase ? Number(phase) : null });
        await this.changed(`${kind === "phase" ? "Phase" : "Milestone"} "${title.trim()}" added`);
      },
      fallbackFocus: () => this.focus(),
    });
  }

  editItem(itemId) {
    const item = this.template?.items.find((each) => each.id === itemId);
    if (!item) return undefined;
    return formDialog({
      title: `"${item.title}"`,
      fields: [
        { key: "title", label: item.kind === "phase" ? "Phase" : "Milestone", value: item.title },
        { key: "start", label: item.kind === "phase" ? "Starts on working day" : "On working day", type: "number", value: String(item.start) },
        ...(item.kind === "phase" ? [{ key: "end", label: "Ends on working day", type: "number", value: String(item.end) }] : []),
      ],
      submit: "Save",
      run: async ({ title, start, end }) => {
        const values = { title: title.trim(), start: wholeDay(start) };
        if (item.kind === "phase") values.end = wholeDay(end);
        await this.app().planTemplatesApi.updateItem(item.id, values);
        await this.changed(`"${values.title}" saved`);
      },
      fallbackFocus: () => this.focus(),
    });
  }

  async moved(itemId, span) {
    const item = this.template?.items.find((each) => each.id === itemId);
    if (!item) return;
    const values = item.kind === "phase" ? { start: Math.max(span.start, 0), end: Math.max(span.end, 0) } : { start: Math.max(span.start, 0) };
    await this.app().planTemplatesApi.updateItem(itemId, values);
    await this.changed("");
  }

  removeItem(item) {
    return confirmDialog({
      title: "Remove from the template",
      text: `Take "${item.title}" out of "${this.template.title}"${item.tasks.length ? `, with its ${item.tasks.length} tasks` : ""}?`,
      confirm: "Remove",
      danger: true,
      run: async () => {
        await this.app().planTemplatesApi.removeItem(item.id);
        await this.changed(`"${item.title}" taken out`);
      },
      fallbackFocus: () => this.focus(),
    });
  }

  addTask(item, parent = null) {
    return formDialog({
      title: parent ? `New subtask of "${parent.title}"` : `New task in "${item.title}"`,
      fields: [{ key: "title", label: parent ? "Subtask" : "Task" }],
      submit: "Add",
      run: async ({ title }) => {
        await this.app().planTemplatesApi.addTask(item.id, title.trim(), parent?.id ?? null);
        await this.changed("");
      },
      fallbackFocus: () => this.focus(),
    });
  }

  async removeTask(task) {
    await this.app().planTemplatesApi.removeTask(task.id);
    await this.changed(`"${task.title}" taken out`);
  }

  rename() {
    const template = this.template;
    return formDialog({
      title: `Rename "${template.title}"`,
      fields: [{ key: "title", label: "Template name", value: template.title }],
      submit: "Rename",
      run: async ({ title }) => {
        await this.app().planTemplatesApi.rename(template.id, title.trim());
        await this.changed("");
      },
      fallbackFocus: () => this.focus(),
    });
  }

  remove() {
    const template = this.template;
    return confirmDialog({
      title: "Delete plan template",
      text: `Delete "${template.title}"? Projects already made from it keep their plans.`,
      confirm: "Delete",
      danger: true,
      run: async () => {
        await this.app().planTemplatesApi.remove(template.id);
        await this.app().open(template.area_id);
        await this.changed(`Plan template "${template.title}" deleted`);
      },
      fallbackFocus: () => this.focus(),
    });
  }

  onAction(action, row) {
    if (action === "newPhase") return this.run(this.addItem("phase"));
    if (action === "newMilestone") return this.run(this.addItem("milestone"));
    if (action === "edit" && row) return this.run(this.editItem(row.kind === "phase" ? row.id : row.marks?.[0]?.id));
    return undefined;
  }

  run(promise) {
    Promise.resolve(promise).catch((error) => this.app().fail(error));
  }

  focus() {
    if (this.template) this.chart.focus();
    else this.section.focus();
  }
}

function wholeDay(text) {
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0) throw new Error("Days are whole numbers from 0");
  return value;
}

function button(text, title, onClick) {
  const node = element("button", "plan-template__button", text);
  node.type = "button";
  node.title = title;
  node.addEventListener("click", onClick);
  return node;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
