// A project's History page, in the main window (?note=P&history=P), over its dashboard: the
// bar ("Acme · History", the tabs with their counts, Search history /), then every dated thing
// the project has, grouped by week, newest first (history-model.js). The latest 4 weeks are
// drawn first; nearing the list's foot (by scrolling, or j past the last row) draws 4 more.
// One focus stop: a listbox of the rows. Its keys: history-keys.js.
//
//   const page = new HistoryPage(section, { app: () => notesApp, onLeave() });
//   page.enter()        it comes into view: on the tab asked (app.historyRequest), from the top,
//                       unless it is the same ask as last time (Back from a row's page)
//   page.show(ctx)      ctx.tree, tasks, meetings, records, statusLogs, plan, today
//   page.crumbs(ctx)    "Projects › Acme › History"
//   page.focus()
import { groupOf } from "../notes/hub-groups.js";
import { statusHistoryDialog } from "../status/status-commands.js";
import { chip } from "../ui/chip.js";
import { dayText } from "../ui/dates.js";
import { historyAction } from "./history-keys.js";
import { HISTORY_TABS, PAGE_WEEKS, answerLine, filterRows, historyRows, pageOf, tabCounts, weekGroups } from "./history-model.js";

// How near the list's foot (px) the next weeks start drawing.
const NEAR_FOOT = "240px";

export class HistoryPage {
  constructor(section, { app, onLeave }) {
    this.section = section;
    this.app = app;
    this.onLeave = onLeave;
    this.ctx = null;
    this.project = null;
    this.request = null;
    this.tab = "everything";
    this.query = "";
    this.weeks = PAGE_WEEKS;
    this.rows = []; // the rows drawn, in order
    this.more = false;
    this.active = 0;
    this.answers = new Map(); // question id -> { at: its updated_at, text }
    section.classList.add("history-page");
    section.tabIndex = -1;
    this.title = element("h1", "history__title");
    this.tabs = element("div", "history__tabs");
    this.tabs.setAttribute("role", "group");
    this.tabs.setAttribute("aria-label", "Show");
    this.search = element("input", "history__search");
    Object.assign(this.search, { type: "search", placeholder: "Search history /", autocomplete: "off" });
    this.search.setAttribute("aria-label", "Search history");
    this.search.addEventListener("input", () => {
      this.query = this.search.value;
      this.restart();
    });
    this.search.addEventListener("keydown", (event) => this.onSearchKey(event));
    const bar = element("header", "history__bar");
    bar.append(this.title, this.tabs, this.search);
    this.list = element("div", "history__list");
    this.list.id = "history-list";
    this.list.tabIndex = 0;
    this.list.setAttribute("role", "listbox");
    this.list.setAttribute("aria-label", "History");
    this.list.addEventListener("keydown", (event) => this.onListKey(event));
    this.list.addEventListener("click", (event) => {
      const row = event.target.closest?.("[role=option]");
      if (!row) return;
      this.active = Number(row.dataset.index);
      this.markActive({ reveal: true });
      this.list.focus();
      this.open(this.rows[this.active]);
    });
    // Nearing the foot draws the next weeks; the rows are all in hand already.
    this.foot = element("div", "history__sentinel");
    this.foot.setAttribute("aria-hidden", "true");
    this.note = element("p", "history__note",
      "Older weeks load as you scroll. Every row opens its note; Back returns to the project.");
    section.replaceChildren(bar, this.list, this.foot, this.note);
    if (typeof IntersectionObserver === "function") {
      this.observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting) && this.more && !this.section.hidden) this.loadMore();
      }, { rootMargin: `0px 0px ${NEAR_FOOT} 0px` });
      this.observer.observe(this.foot);
    }
  }

  enter() {
    const request = this.app().historyRequest ?? null;
    if (request && request === this.request) return;
    this.request = request;
    this.tab = request?.tab ?? "everything";
    this.query = "";
    this.search.value = "";
    this.weeks = PAGE_WEEKS;
    this.active = 0;
  }

  show(ctx) {
    this.ctx = ctx;
    const id = this.request?.id ?? this.app().currentId;
    const note = ctx.tree.get(id) ?? null;
    this.project = note?.kind === "project" ? note : null;
    this.title.textContent = this.project ? `${this.project.title} · History` : "History";
    this.draw();
  }

  crumbs(ctx) {
    if (!this.project || !ctx.tree.has(this.project.id)) return [{ label: "History" }];
    return [{ label: groupOf(ctx.tree, this.project.id).heading }, { label: this.project.title, open: () => this.onLeave() },
      { label: "History" }];
  }

  /** All the project's rows, its answers as far as they are read. */
  allRows() {
    if (!this.project) return [];
    const answers = new Map([...this.answers].map(([id, { text }]) => [id, text]));
    return historyRows(this.ctx, this.project, { answers });
  }

  draw() {
    const all = this.allRows();
    this.drawTabs(tabCounts(all));
    const groups = weekGroups(filterRows(all, this.tab, this.query), this.ctx?.today ?? new Date());
    const page = pageOf(groups, this.weeks);
    this.more = page.more;
    this.rows = page.groups.flatMap((group) => group.rows);
    this.active = Math.min(this.active, Math.max(0, this.rows.length - 1));
    let index = 0;
    const nodes = page.groups.map((group) => {
      const week = element("div", "history__week");
      week.setAttribute("role", "group");
      const head = element("div", "history__week-head", group.label);
      head.id = `history-week-${group.monday}`;
      week.setAttribute("aria-labelledby", head.id);
      week.append(head, ...group.rows.map((row) => this.row(row, index++)));
      return week;
    });
    const empty = this.query ? "Nothing matches" : this.project ? "Nothing here yet" : "History belongs to a project";
    this.list.replaceChildren(...(nodes.length ? nodes : [element("p", "history__empty", empty)]));
    this.markActive();
    this.readAnswers(page.groups.flatMap((group) => group.rows));
    this.fillView();
  }

  /** The observer calls back only when the foot crosses into view: while it is still in view after a
   * draw (a short list, another tab, a search), draw the next weeks, a frame later. */
  fillView() {
    if (!this.more || this.section.hidden || this.filling) return;
    if (typeof requestAnimationFrame !== "function" || typeof innerHeight !== "number") return;
    this.filling = true;
    requestAnimationFrame(() => {
      this.filling = false;
      if (!this.more || this.section.hidden || !this.foot.isConnected) return;
      const top = this.foot.getBoundingClientRect().top;
      if (top <= innerHeight + parseInt(NEAR_FOOT, 10)) this.loadMore();
    });
  }

  drawTabs(counts) {
    this.tabs.replaceChildren(...HISTORY_TABS.map((tab, index) => {
      const on = tab.key === this.tab;
      const label = tab.key === "everything" ? tab.label : `${tab.label} ${counts[tab.key]}`;
      const button = chip(label, on ? "info" : "neutral", { tag: "button", title: `${tab.label} (${index + 1})` });
      button.classList.add("history__tab");
      button.setAttribute("aria-pressed", String(on));
      button.tabIndex = -1;
      button.addEventListener("click", () => {
        this.setTab(tab.key);
        this.list.focus();
      });
      return button;
    }));
  }

  row(row, index) {
    const node = element("div", `history__row history__row--${row.kind}`);
    node.id = `history-row-${index}`;
    node.dataset.index = String(index);
    node.setAttribute("role", "option");
    node.append(element("span", "history__day", dayText(row.day, { month: false })), chip(row.chip.text, row.chip.tone),
      element("span", "history__row-title", row.title), element("span", "history__detail", row.detail));
    return node;
  }

  /** Answered questions drawn: their answer's first line, read from each note once (again when it changed). */
  readAnswers(rows) {
    const api = this.app()?.api;
    if (!api) return;
    for (const row of rows.filter((each) => each.question !== undefined)) {
      const at = this.ctx.tree.get(row.question)?.updated_at ?? "";
      if (this.answers.get(row.question)?.at === at) continue;
      this.answers.set(row.question, { at, text: "" });
      Promise.resolve(api.get(row.question)).then((note) => {
        this.answers.set(row.question, { at, text: answerLine(note?.body) });
        if (!this.section.hidden) this.draw();
      }).catch(() => {});
    }
  }

  setTab(key) {
    if (!HISTORY_TABS.some((tab) => tab.key === key)) return;
    this.tab = key;
    this.restart();
  }

  /** Another tab or search: from the top, the latest weeks only. */
  restart() {
    this.weeks = PAGE_WEEKS;
    this.active = 0;
    this.draw();
  }

  loadMore() {
    this.weeks += PAGE_WEEKS;
    this.draw();
  }

  onListKey(event) {
    const action = historyAction(event, "list");
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    switch (action) {
      case "next":
        if (this.active >= this.rows.length - 1 && this.more) this.loadMore();
        return this.moveTo(Math.min(this.active + 1, this.rows.length - 1));
      case "previous": return this.moveTo(Math.max(this.active - 1, 0));
      case "open": return this.open(this.rows[this.active]);
      case "tab": return this.setTab(HISTORY_TABS[Number(event.key) - 1]?.key);
      case "search": return this.startSearch();
      case "leave": return this.onLeave();
      default: return undefined;
    }
  }

  /** /: the old query stays (the list is filtered by it), but selected, so typing starts afresh. */
  startSearch() {
    this.search.focus();
    this.search.select();
  }

  onSearchKey(event) {
    if (historyAction(event, "search") !== "list") return;
    event.preventDefault();
    event.stopPropagation();
    this.list.focus();
  }

  open(row) {
    if (!row) return;
    const app = this.app();
    if (row.open.task !== undefined) return app.guard(app.showTask(row.open.task));
    if (row.open.status !== undefined) {
      return app.guard(Promise.resolve().then(() => statusHistoryDialog(app, this.project)));
    }
    return app.guard(app.open(row.open.note));
  }

  moveTo(index) {
    if (index < 0) return;
    this.active = index;
    this.markActive({ reveal: true });
  }

  /** Only a move reveals the active row: a redraw (more weeks, an answer read) leaves the scroll be. */
  markActive({ reveal = false } = {}) {
    const nodes = this.list.querySelectorAll("[role=option]");
    nodes.forEach((node, index) => node.setAttribute("aria-selected", String(index === this.active)));
    const node = nodes[this.active];
    if (node) {
      this.list.setAttribute("aria-activedescendant", node.id);
      if (reveal) node.scrollIntoView?.({ block: "nearest" });
    } else {
      this.list.removeAttribute("aria-activedescendant");
    }
  }

  focus() {
    this.list.focus();
  }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
