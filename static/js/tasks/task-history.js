// A task's From and History cards on its page (task-page.js). From: where it was captured (a
// meeting's T: line, task_sources), its chip, the source's title and day as a link, the quote.
// History: the task's life as the server derives it (/api/task/history), newest first, each row
// a day and a line. Their rows are options of the page's listbox: Enter opens the note a row
// names.
//
//   const history = new TaskHistory({ app: () => notesApp, redraw() });
//   history.sync(taskId, { force })   loads the events (another task, or the data read again);
//                                     nothing is fetched without app().tasksApi.history
//   history.rows(today)               [{ event: { key, day, text, noteId } }]
//   history.draw(option, today)       the History card; option(node, event) makes a row an option
//   drawSource(source, option)        the From card (source: task-page-model.js sourceOf)
import { chip } from "../ui/chip.js";
import { historyRows } from "./task-page-model.js";
import { card, element } from "./task-side.js";

export class TaskHistory {
  constructor({ app, redraw }) {
    this.app = app;
    this.redraw = redraw;
    this.taskId = null;
    this.events = [];
  }

  api() {
    const api = this.app().tasksApi;
    return api?.history ? api : null;
  }

  sync(taskId, { force = false } = {}) {
    if (taskId === this.taskId && !force) return;
    if (taskId !== this.taskId) this.events = [];
    this.taskId = taskId;
    if (this.api()) this.app().guard(this.load());
  }

  async load() {
    const taskId = this.taskId;
    const events = await this.api().history(taskId);
    if (taskId !== this.taskId) return;
    const same = JSON.stringify(events) === JSON.stringify(this.events);
    this.events = events;
    if (!same) this.redraw();
  }

  rows(today) {
    return historyRows(this.events, today).map((event) => ({ event }));
  }

  draw(option, today) {
    const node = card("history", "History");
    const rows = this.rows(today);
    if (!rows.length) {
      node.append(element("p", "task-card__hint", "Nothing yet"));
      return node;
    }
    for (const { event } of rows) {
      const row = element("div", "task-history__row");
      row.append(element("span", "task-history__day", event.day));
      const text = event.noteId === null ? element("span", "task-history__text", event.text)
        : linkButton("task-history__text task-history__link", event.text, "Open the note (Enter)", "openNote");
      row.append(text);
      node.append(option(row, event));
    }
    return node;
  }
}

export function drawSource(source, option) {
  const node = card("source", "From");
  const row = element("div", "task-source__row");
  const head = element("div", "task-source__line");
  head.append(chip(source.chip, source.tone),
    linkButton("task-source__title", [source.title, source.when].filter(Boolean).join(" · "), "Open it (Enter)", "openNote"));
  row.append(head);
  if (source.quote) row.append(element("blockquote", "task-source__quote", source.quote));
  node.append(option(row, source));
  return node;
}

function linkButton(className, text, title, action) {
  const node = element("button", className, text);
  node.type = "button";
  node.tabIndex = -1;
  node.title = title;
  node.dataset.action = action;
  return node;
}
