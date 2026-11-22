// The pages the main window draws in place of a dashboard (Home, People, Meetings, Trash, the
// calendar, the timesheet, a plan template): which one shows, if any, and its URL flag and
// history step. The dashboard stays open under them: /?note=N&people, /?note=N&template=4.
//
//   const views = new PageViews({ main, pages: { home, people, meetings }, history, noteUrl() });
//   views.shown                    "home" | "people" | "meetings" | "trash" | null
//   views.fromUrl(searchParams)    the view a URL asks for, or null
//   views.show(key, history, flag?) history: "push" (a command or button), "replace" (the
//                                  page was loaded with the flag) or "none" (Back/Forward);
//                                  flag: the URL's flag when it carries a value ("template=4")
//   views.leave()                  back to the note; false when it is the app's to redraw
//   views.hide()                   no view, without touching the history (opening a note)
//   views.draw(ctx, crumbs)        after every redraw of the notes page
//
// Each page has section, show(ctx) and focus(), and may have enter() (called when it comes
// into view: the calendar loads then, not on every redraw): a ListPage
// (static/js/pages/list-page.js), the Home page (static/js/home/home-page.js)...; main carries
// data-view while one shows, for the CSS that hides the dashboard.
export const PAGE_VIEWS = [
  { key: "home", label: "Home" },
  { key: "people", label: "People" },
  { key: "meetings", label: "Meetings" },
  { key: "trash", label: "Trash" },
  { key: "calendar", label: "Calendar" },
  { key: "time", label: "Time" },
  { key: "template", label: "Plan template" },
];

export class PageViews {
  constructor({ main, pages, history, noteUrl }) {
    this.main = main;
    this.pages = pages;
    this.history = history;
    this.noteUrl = noteUrl;
    this.shown = null;
  }

  fromUrl(params) {
    return PAGE_VIEWS.find(({ key }) => params.has(key) && this.pages[key])?.key ?? null;
  }

  show(key, history, flag = key) {
    const url = `${this.noteUrl()}&${flag}`;
    if (history === "push" && this.shown !== key) {
      // From one page to the other: one step, so Escape and Back both reach the note.
      if (this.history.state?.view) this.history.replaceState({ view: key }, "", url);
      else this.history.pushState({ view: key }, "", url);
    }
    // Only a push is marked: leaving a page that was loaded with the flag must not go Back
    // out of Paradigm.
    if (history === "replace") this.history.replaceState({}, "", url);
    const entering = this.shown !== key || flag !== key;
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
    this.pages[this.shown].show(ctx);
    showViewCrumb(crumbs, PAGE_VIEWS.find(({ key }) => key === this.shown).label);
  }
}

function showViewCrumb(nav, label) {
  const here = document.createElement("span");
  here.className = "crumbs__here";
  here.textContent = label;
  here.setAttribute("aria-current", "page");
  nav.replaceChildren(here);
}
