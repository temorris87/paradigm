// The calendar's sidebar: open tasks to drag onto the week, and the imported events waiting
// for a hub (To file). It draws what it is given and reports what was done; CalendarPage
// decides the rest.
//
//   const side = new TaskSidebar(element, { onTaskDown(entry, event), onToggle(entry), onOpen(entry),
//                                           onFile(ids, hubId), onIgnore(ids), onFilter() });
//   side.draw({ tree, tasks, pending, hubs })    hubs: [note] the live hubs, for To file
//   side.filter -> { hubId, text }; side.show("tasks" | "file")
import { whenText } from "../meetings/meeting-days.js";
import { groupForKind } from "../notes/hub-groups.js";
import { hubChoices, openTasks } from "../tasks/tasks-model.js";

const MAX_DEPTH = 4;

export class TaskSidebar {
  constructor(root, handlers) {
    this.root = root;
    this.handlers = handlers;
    this.tab = "tasks";
    this.filter = { hubId: null, text: "" };
    this.tabs = element("div", "cal-side__tabs");
    this.tabs.setAttribute("role", "tablist");
    this.tasksTab = tabButton("Tasks", () => this.show("tasks"));
    this.fileTab = tabButton("To file", () => this.show("file"));
    this.tabs.append(this.tasksTab, this.fileTab);
    this.hubSelect = element("select", "cal-side__hub");
    this.hubSelect.setAttribute("aria-label", "Project or area");
    this.hubSelect.addEventListener("change", () => {
      this.filter.hubId = this.hubSelect.value ? Number(this.hubSelect.value) : null;
      this.handlers.onFilter();
    });
    this.search = element("input", "cal-side__search");
    Object.assign(this.search, { type: "search", placeholder: "Find a task" });
    this.search.setAttribute("aria-label", "Find a task");
    this.search.addEventListener("input", () => {
      this.filter.text = this.search.value;
      this.handlers.onFilter();
    });
    this.filters = element("div", "cal-side__filters");
    this.filters.append(this.hubSelect, this.search);
    this.list = element("ul", "cal-side__list");
    this.list.setAttribute("aria-label", "Open tasks: drag one onto the week");
    this.fileList = element("ul", "cal-side__list cal-side__list--file");
    this.fileList.setAttribute("aria-label", "Imported meetings waiting for a hub");
    this.hint = element("p", "cal-side__hint", "Drag a task onto the week. Drag a block's bottom edge to make it longer or shorter.");
    root.replaceChildren(this.tabs, this.filters, this.hint, this.list, this.fileList);
    this.show("tasks");
  }

  show(tab) {
    this.tab = tab;
    this.tasksTab.setAttribute("aria-selected", String(tab === "tasks"));
    this.fileTab.setAttribute("aria-selected", String(tab === "file"));
    this.filters.hidden = tab !== "tasks";
    this.hint.hidden = tab !== "tasks";
    this.list.hidden = tab !== "tasks";
    this.fileList.hidden = tab !== "file";
  }

  draw({ tree, tasks, pending, hubs }) {
    this.drawHubFilter(tree, tasks);
    this.drawTasks(tree, tasks);
    this.drawPending(pending, hubs);
    this.fileTab.textContent = pending.length ? `To file · ${pending.length}` : "To file";
  }

  drawHubFilter(tree, tasks) {
    const choices = hubChoices(tree, tasks);
    if (this.filter.hubId !== null && !choices.some((hub) => hub.id === this.filter.hubId)) this.filter.hubId = null;
    this.hubSelect.replaceChildren(option("", "All projects and areas"),
      ...choices.map((hub) => option(String(hub.id), `${hub.title} (${groupForKind(hub.kind).label})`)));
    this.hubSelect.value = this.filter.hubId === null ? "" : String(this.filter.hubId);
  }

  drawTasks(tree, tasks) {
    const entries = openTasks(tree, tasks, this.filter);
    if (!entries.length) {
      this.list.replaceChildren(element("li", "cal-side__empty", this.filter.text || this.filter.hubId !== null
        ? "No open task matches" : "No open tasks of yours. Add one in a project's or a meeting's Tasks."));
      return;
    }
    this.list.replaceChildren(...entries.map((entry) => {
      const row = element("li", `cal-task cal-task--depth-${Math.min(entry.depth, MAX_DEPTH)}${entry.task.done ? " cal-task--done" : ""}`);
      const box = element("input", "cal-task__box");
      Object.assign(box, { type: "checkbox", checked: entry.task.done, title: entry.task.done ? "Open it again" : "Done" });
      box.setAttribute("aria-label", `Done: ${entry.task.title}`);
      box.addEventListener("change", () => this.handlers.onToggle(entry));
      const grip = element("div", "cal-task__grip");
      grip.append(element("span", "cal-task__title", entry.task.title || "(no text)"),
        element("span", "cal-task__meta", [entry.hub?.title, entry.note.id !== entry.hub?.id ? entry.note.title : "",
          entry.task.due ? `due ${entry.task.due}` : ""].filter(Boolean).join(" · ")));
      grip.title = "Drag onto the week to schedule it; click to open its note";
      grip.addEventListener("pointerdown", (event) => {
        if (event.button === 0) this.handlers.onTaskDown(entry, event);
      });
      row.append(box, grip);
      return row;
    }));
  }

  drawPending(pending, hubs) {
    if (!pending.length) {
      this.fileList.replaceChildren(element("li", "cal-side__empty", "Nothing to file: every imported meeting is in a hub."));
      return;
    }
    const sameTitle = (event) => pending.filter((each) => each.title.toLowerCase() === event.title.toLowerCase());
    this.fileList.replaceChildren(...pending.map((event) => {
      const row = element("li", "cal-file");
      const when = whenText({ day: event.day, time: event.time, end_time: event.end_time });
      row.append(element("span", "cal-file__title", event.title),
        element("span", "cal-file__meta", [when, event.recurring ? "recurring" : "", event.location].filter(Boolean).join(" · ")));
      const select = element("select", "cal-file__hub");
      select.setAttribute("aria-label", `Hub for ${event.title}`);
      select.append(option("", "Choose a hub…"), ...hubs.map((hub) => option(String(hub.id), `${hub.title} (${groupForKind(hub.kind).label})`)));
      if (event.hub_guess !== null && hubs.some((hub) => hub.id === event.hub_guess)) select.value = String(event.hub_guess);
      const twins = sameTitle(event);
      const file = button("File", "Make it a meeting in that hub", () => this.fileWith(select, [event.id]));
      const actions = element("div", "cal-file__actions");
      actions.append(select, file);
      if (twins.length > 1) {
        actions.append(button(`File all ${twins.length}`, `Every waiting "${event.title}" into that hub`,
          () => this.fileWith(select, twins.map((each) => each.id))));
      }
      actions.append(button("Don't import", "Leave it out; later exports won't bring it back", () => this.handlers.onIgnore([event.id])));
      row.append(actions);
      return row;
    }));
  }

  fileWith(select, ids) {
    if (!select.value) {
      select.focus();
      select.classList.add("is-missing");
      return;
    }
    this.handlers.onFile(ids, Number(select.value));
  }
}

function tabButton(text, onClick) {
  const node = element("button", "cal-side__tab", text);
  node.type = "button";
  node.setAttribute("role", "tab");
  node.addEventListener("click", onClick);
  return node;
}

function button(text, title, onClick) {
  const node = element("button", "cal-button", text);
  Object.assign(node, { type: "button", title });
  node.addEventListener("click", onClick);
  return node;
}

function option(value, text) {
  const node = element("option", "", text);
  node.value = value;
  return node;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
