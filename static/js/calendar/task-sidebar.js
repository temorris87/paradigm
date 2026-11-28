// The Week page's tray: the open tasks to plan, grouped (Overdue, Due this week, Due later,
// No due date, Follow-ups: week/tray-model.js), each with where it is, when it is due, how much of it is
// placed and its estimate, to drag onto the week (or s: the first free slot); and the
// imported events waiting for a hub (To file). It draws what it is given and reports what was
// done; CalendarPage decides the rest.
//
//   const side = new TaskSidebar(element, { onTaskDown(entry, event), onToggle(entry), onOpen(entry),
//                                           onFile(ids, hubId), onIgnore(ids), onFilter() });
//   side.draw({ tree, tasks, sessions, pending, hubs, today, monday })   hubs: the live hubs
//   side.filter -> { hubId, text }; side.show("tasks" | "file")
//     hubId: a hub's id, OTHER_NOTES or null (all); remembered in localStorage (HUB_STORE), the
//     search box isn't
//   side.focusedTask() -> task id of the tray row with the focus, or null
//   side.focusRow(step) -> whether a row took the focus (0: the focused one, else the first;
//                          1 / -1: the next / previous)
import { whenText } from "../meetings/meeting-days.js";
import { groupForKind } from "../notes/hub-groups.js";
import { hubChoices } from "../tasks/tasks-model.js";
import { OTHER_NOTES, trayGroups, weekEnd } from "../week/tray-model.js";

export const HUB_STORE = "paradigm.week.trayHub";

export class TaskSidebar {
  constructor(root, handlers) {
    this.root = root;
    this.handlers = handlers;
    this.tab = "tasks";
    this.filter = { hubId: savedHub(), text: "" };
    this.tabs = element("div", "cal-side__tabs");
    this.tabs.setAttribute("role", "tablist");
    this.tasksTab = tabButton("To plan", () => this.show("tasks"));
    this.fileTab = tabButton("To file", () => this.show("file"));
    this.tabs.append(this.tasksTab, this.fileTab);
    this.hubSelect = element("select", "cal-side__hub");
    this.hubSelect.setAttribute("aria-label", "Project or area");
    this.hubSelect.addEventListener("change", () => {
      this.filter.hubId = hubOfValue(this.hubSelect.value);
      saveHub(this.filter.hubId);
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
    this.list.setAttribute("aria-label", "Tasks to plan: drag one onto the week, or s for the first free slot");
    this.fileList = element("ul", "cal-side__list cal-side__list--file");
    this.fileList.setAttribute("aria-label", "Imported meetings waiting for a hub");
    this.hint = element("p", "cal-side__hint");
    this.hint.append("Drag onto the week, or ", element("kbd", "cal-side__key", "s"), " to drop into the first free slot before its due day.");
    root.replaceChildren(this.tabs, this.filters, this.list, this.fileList, this.hint);
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

  draw({ tree, tasks, sessions = [], pending, hubs, today, monday }) {
    this.drawHubFilter({ tree, tasks, sessions }, today, monday);
    const count = this.drawTasks({ tree, tasks, sessions }, today, monday);
    this.drawPending(pending, hubs);
    this.tasksTab.textContent = `To plan · ${count}`;
    this.fileTab.textContent = `To file · ${pending.length}`;
  }

  focusedTask() {
    const row = document.activeElement?.closest?.(".cal-task");
    return row && this.list.contains(row) ? Number(row.dataset.task) : null;
  }

  /** j / k (step 1 / -1) from the row with the focus, or gt (0): it, else the first. On To file,
   * gt shows To plan first. Whether a row took the focus. */
  focusRow(step) {
    if (step === 0 && this.tab !== "tasks") this.show("tasks");
    const rows = [...this.list.querySelectorAll(".cal-task")];
    if (!rows.length) return false;
    const at = rows.indexOf(document.activeElement?.closest?.(".cal-task"));
    const row = rows[at < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, at + step))];
    row.focus();
    return true;
  }

  drawHubFilter(data, today, monday) {
    const choices = hubChoices(data.tree, data.tasks, { until: weekEnd(monday) });
    const other = trayGroups(data, today, monday, { hubId: OTHER_NOTES }).length > 0;
    const offered = this.filter.hubId === OTHER_NOTES ? other : choices.some((hub) => hub.id === this.filter.hubId);
    // A saved hub with nothing left to plan (done, archived, on hold) falls back to All.
    if (this.filter.hubId !== null && !offered) {
      this.filter.hubId = null;
      saveHub(null);
    }
    this.hubSelect.replaceChildren(option("", "All projects and areas"),
      ...choices.map((hub) => option(String(hub.id), `${hub.title} (${groupForKind(hub.kind).label})`)),
      ...(other ? [option(OTHER_NOTES, "Other notes")] : []));
    this.hubSelect.value = this.filter.hubId === null ? "" : String(this.filter.hubId);
  }

  drawTasks(data, today, monday) {
    const groups = trayGroups(data, today, monday, this.filter);
    if (!groups.length) {
      this.list.replaceChildren(element("li", "cal-side__empty", this.filter.text || this.filter.hubId !== null
        ? "No open task matches" : "Nothing to plan: every task is done or delegated."));
      return 0;
    }
    const focused = this.focusedTask();
    this.list.replaceChildren(...groups.map((group) => {
      const item = element("li", `cal-group cal-group--${group.key}`);
      const label = element("h3", "cal-group__label", group.label);
      const rows = element("ul", "cal-group__rows");
      rows.append(...group.items.map(({ entry, meta, estimate }) => {
        const row = element("li", "cal-task");
        row.tabIndex = 0;
        row.dataset.task = String(entry.task.id);
        const grip = element("div", "cal-task__grip");
        const line = element("span", "cal-task__meta");
        meta.forEach(([text, tone], index) => {
          if (index) line.append(" · ");
          line.append(tone ? element("span", `cal-task__tone cal-task__tone--${tone}`, text) : text);
        });
        grip.append(element("span", "cal-task__title", entry.task.title || "(no text)"), line);
        grip.title = "Drag onto the week to schedule it; click to open its note";
        grip.addEventListener("pointerdown", (event) => {
          if (event.button === 0) this.handlers.onTaskDown(entry, event);
        });
        row.append(grip, element("span", `cal-task__estimate${estimate ? "" : " cal-task__estimate--none"}`, estimate || "est?"));
        return row;
      }));
      item.append(label, rows);
      return item;
    }));
    if (focused !== null) this.list.querySelector(`[data-task="${focused}"]`)?.focus();
    return groups.reduce((sum, group) => sum + group.items.length, 0);
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

function hubOfValue(value) {
  if (value === OTHER_NOTES) return OTHER_NOTES;
  return value && Number.isInteger(Number(value)) ? Number(value) : null;
}

// localStorage may be off (a private window): then the choice lasts only this page.
function savedHub() {
  try {
    return hubOfValue(localStorage.getItem(HUB_STORE) ?? "");
  } catch {
    return null;
  }
}

function saveHub(hubId) {
  try {
    if (hubId === null) localStorage.removeItem(HUB_STORE);
    else localStorage.setItem(HUB_STORE, String(hubId));
  } catch {
    // Not remembered; the filter still works.
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
