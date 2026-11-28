// The pages the main window draws in place of a dashboard (Home, People, Meetings, Trash, the
// calendar, the timesheet, a plan template, a folder, a task, the Live note, Settings): which
// one shows, if any, and its URL flag and history step. The dashboard stays open under them:
// /?note=N&people, /?note=N&template=4, /?note=N&task=12.
//
//   const views = new PageViews({ main, pages: { home, people, meetings }, history, noteUrl() });
//   views.shown                    "home" | "people" | "meetings" | "trash" | null
//   views.fromUrl(searchParams)    the view a URL asks for, or null
//   views.show(key, history, flag?) history: "push" (a command or button), "replace" (the
//                                  page was loaded with the flag) or "none" (Back/Forward);
//                                  flag: the URL's flag when it carries a value ("template=4");
//                                  the same page with another value (a subtask's page) takes
//                                  the URL's place, so Back still reaches the dashboard under
//                                  the first one
//   views.leave()                  back to the note; false when it is the app's to redraw
//   views.hide()                   no view, without touching the history (opening a note)
//   views.draw(ctx, crumbs)        after every redraw of the notes page
//
// Each page has section, show(ctx) and focus(), and may have enter() (called when it comes
// into view: the calendar loads then, not on every redraw) and crumbs(ctx) -> [{ label, open? }]
// (its own crumb trail, "Projects › Acme › History"; else its label alone): a ListPage
// (static/js/pages/list-page.js), the Today page (static/js/today/today-page.js)...; main carries
// data-view while one shows, for the CSS that hides the dashboard.
export const PAGE_VIEWS = [
  { key: "home", label: "Today" },
  { key: "people", label: "People" },
  { key: "meetings", label: "Meetings" },
  { key: "trash", label: "Trash" },
  { key: "week", label: "Week" },
  { key: "template", label: "Plan template" },
  { key: "folder", label: "Folder" },
  { key: "task", label: "Task" },
  { key: "plan", label: "Plan" },
  { key: "live", label: "Live note" },
  { key: "history", label: "History" },
  { key: "settings", label: "Settings" },
];

/** A page's name ("Home"), for the tab's title. */
export function viewLabel(key) {
  return PAGE_VIEWS.find((view) => view.key === key)?.label ?? "";
}

export class PageViews {
  constructor({ main, pages, history, noteUrl }) {
    this.main = main;
    this.pages = pages;
    this.history = history;
    this.noteUrl = noteUrl;
    this.shown = null;
  }

  fromUrl(params) {
    // The calendar and the timesheet became the Week page: their old flags still reach it.
    if ((params.has("calendar") || params.has("time")) && this.pages.week) return "week";
    // The Week's Settings tab became the Settings page.
    if (params.get("week") === "settings" && this.pages.settings) return "settings";
    return PAGE_VIEWS.find(({ key }) => params.has(key) && this.pages[key])?.key ?? null;
  }

  show(key, history, flag = key) {
    const base = this.noteUrl();
    const url = `${base}${base.includes("?") ? "&" : "?"}${flag}`;
    // Every page is a step of its own, from a note or from another page: H, Escape and Back
    // walk back through each (Tyson, 2026-11-28).
    if (history === "push" && this.shown !== key) this.history.pushState({ view: key }, "", url);
    else if (history === "push" && flag !== key) this.history.replaceState(this.history.state, "", url);
    // Only a push is marked: leaving a page that was loaded with the flag must not go Back
    // out of Paradigm.
    if (history === "replace") this.history.replaceState({}, "", url);
    // The Week page enters again to switch between its Plan and Timesheet.
    const entering = this.shown !== key || flag !== key || key === "week";
    this.setShown(key);
    if (entering) this.pages[key].enter?.();
    this.pages[key].focus();
  }

  /** Returns true when it went Back (popstate redraws), false when the caller must redraw. */
  leave() {
    if (!this.shown) return true;
    // Came here with a command in this tab: Back is the same step, so the history stays short.
    if (this.history.state?.view) {
      this.history.back();
      return true;
    }
    this.history.pushState({}, "", this.noteUrl());
    this.setShown(null);
    return false;
  }

  hide() {
    this.setShown(null);
  }

  setShown(key) {
    this.shown = key;
    if (key) this.main.dataset.view = key;
    else delete this.main.dataset.view;
    for (const [each, page] of Object.entries(this.pages)) page.section.hidden = each !== key;
  }

  draw(ctx, crumbs) {
    if (!this.shown) return;
    const page = this.pages[this.shown];
    page.show(ctx);
    showViewCrumb(crumbs, page.crumbs?.(ctx) ?? [{ label: PAGE_VIEWS.find(({ key }) => key === this.shown).label }]);
  }
}

/** The crumbs of a page: each but the last a group's name or a link (open), the last the page. */
function showViewCrumb(nav, parts) {
  const nodes = [];
  parts.forEach(({ label, open }, index) => {
    if (index) {
      const separator = document.createElement("span");
      separator.className = "crumbs__separator";
      separator.textContent = "›";
      separator.setAttribute("aria-hidden", "true");
      nodes.push(separator);
    }
    const last = index === parts.length - 1;
    const node = document.createElement(open && !last ? "button" : "span");
    node.className = last ? "crumbs__here" : open ? "crumbs__link" : "crumbs__group";
    node.textContent = label;
    if (last) node.setAttribute("aria-current", "page");
    if (open && !last) {
      node.type = "button";
      node.addEventListener("click", open);
    }
    nodes.push(node);
  });
  nav.replaceChildren(...nodes);
}
