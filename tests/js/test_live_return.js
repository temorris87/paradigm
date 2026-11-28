// Closing the note window closes the Live page (spec 032): the page under Live shows again,
// in Live's history step; a reload of the note window within the grace keeps Live.
import { LivePage } from "../../static/js/live/live-page.js";
import { RELOAD_GRACE_MS, returnTo, viewUnderLive } from "../../static/js/live/live-return.js";
import { NotesApp } from "../../static/js/notes/app.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { assertEqual, assertTrue, test } from "./harness.js";

test("live return: the page under Live is remembered, unless it was Live itself", () => {
  assertEqual(JSON.stringify(viewUnderLive("?note=14", {})), JSON.stringify({ search: "?note=14", state: {} }));
  assertEqual(viewUnderLive("?note=14&people", { view: "people" }).state.view, "people");
  assertEqual(viewUnderLive("?note=14&live", { view: "live" }), null, "a reload on &live: nothing to go back to");
  assertEqual(JSON.stringify(viewUnderLive("", null)), JSON.stringify({ search: "", state: {} }));
});

test("live return: only while Live is on screen, and only with a page under it", () => {
  const under = { search: "?note=14", state: {} };
  assertEqual(returnTo("live", under), under);
  assertEqual(returnTo("week", under), null, "moved to the Week: it stays");
  assertEqual(returnTo(null, under), null);
  assertEqual(returnTo("live", null), null, "Live opened by hand: nothing to go back to");
});

function fakeTimers() {
  return {
    queue: new Map(),
    next: 1,
    setTimeout(run, ms) {
      const id = this.next++;
      this.queue.set(id, { run, ms });
      return id;
    },
    clearTimeout(id) {
      this.queue.delete(id);
    },
    fire() {
      const due = [...this.queue.values()];
      this.queue.clear();
      for (const { run } of due) run();
    },
  };
}

function withLive(body) {
  const section = document.createElement("section");
  document.body.append(section);
  const timers = fakeTimers();
  const closes = [];
  const app = { tree: new NoteTree([]), markdownOptions: () => ({}), guard: () => {}, today: () => new Date() };
  const page = new LivePage(section, { app: () => app, timers, onClosed: () => closes.push(true) });
  try {
    body({ page, timers, closes });
  } finally {
    section.remove();
  }
}

const live = (extra = {}) => ({ type: "live", id: 1, title: "Kickoff", kind: "", crumbs: [], active: "body",
  fields: [{ name: "body", label: "", text: "hi", highlights: [] }], line: 0, col: 0, mode: "normal", trashed: false, ...extra });

test("live closes: live-closed asks to leave after the grace", () => withLive(({ page, timers, closes }) => {
  page.receive(live());
  page.receive({ type: "live-closed" });
  assertEqual(timers.queue.size, 1);
  assertEqual([...timers.queue.values()][0].ms, RELOAD_GRACE_MS);
  assertEqual(RELOAD_GRACE_MS, 2000);
  assertEqual(closes.length, 0, "not at once");
  timers.fire();
  assertEqual(closes.length, 1);
}));

test("live closes: a reload (a new live within the grace) keeps Live", () => withLive(({ page, timers, closes }) => {
  page.receive(live());
  page.receive({ type: "live-closed" });
  page.receive(live());
  assertEqual(timers.queue.size, 0, "the leave is called off");
  timers.fire();
  assertEqual(closes.length, 0);
  page.receive({ type: "live-closed" });
  page.receive({ type: "live-closed" });
  assertEqual(timers.queue.size, 1, "one leave, however many closes");
}));

// A main-window NotesApp as far as showView and leaveLive reach: the address and its states.
function mainApp(search, state = {}) {
  const steps = [];
  const location = { pathname: "/", search };
  Object.defineProperty(location, "href", { get: () => `${location.pathname}${location.search}` });
  const history = {
    state,
    replaceState(next, _t, url) {
      this.state = next;
      location.search = new URL(url, "http://x").search;
      steps.push(`replace ${location.search}`);
    },
    pushState(next, _t, url) {
      this.state = next;
      location.search = new URL(url, "http://x").search;
      steps.push(`push ${location.search}`);
    },
  };
  const app = {
    role: "main", location, history, underLive: null, folderId: null, templateId: null, taskId: null, weekView: "plan",
    loaded: [],
    redraw: () => {},
    views: {
      shown: null,
      show(key, how) {
        if (how === "push") history.pushState({ view: key }, "", `?note=14&${key}`);
        this.shown = key;
      },
    },
    // As mainFromUrl: the page the address names, its state reset as a fresh load does.
    async openFromUrl(how) {
      app.loaded.push(`${how} ${location.search}`);
      const params = new URLSearchParams(location.search);
      app.views.shown = ["people", "week", "home"].find((key) => params.has(key)) ?? null;
      history.replaceState({}, "", location.href);
    },
  };
  for (const name of ["showView", "leaveLive"]) app[name] = NotesApp.prototype[name];
  return { app, steps };
}

test("live closes: the dashboard under Live shows again in Live's step", async () => {
  const { app, steps } = mainApp("?note=14");
  app.showView("live", "push");
  assertEqual(app.location.search, "?note=14&live");
  await app.leaveLive();
  assertEqual(app.loaded.join(), "replace ?note=14");
  assertEqual(app.location.search, "?note=14");
  assertEqual(steps.filter((step) => step.startsWith("push")).length, 1, "no new step: Back never reaches Live");
  assertEqual(app.underLive, null);
});

test("live closes: a page under Live comes back with its mark", async () => {
  const { app } = mainApp("?note=14&people", { view: "people" });
  app.views.shown = "people";
  app.showView("live", "push");
  app.showView("live", "push"); // a second note opened: still People under it
  await app.leaveLive();
  assertEqual(app.location.search, "?note=14&people");
  assertEqual(app.views.shown, "people");
  assertEqual(app.history.state.view, "people", "Escape there still goes Back");
});

test("live closes: the page under Live keeps Live's way back, so Escape still reaches the dashboard", async () => {
  // People two page steps over the dashboard; Live one more over it (PageViews counts them).
  const { app } = mainApp("?note=14&people", { view: "people", leave: 2 });
  app.views.shown = "people";
  app.views.show = function show(key, how) {
    if (how === "push") app.history.pushState({ view: key, leave: app.history.state.leave + 1 }, "", `?note=14&${key}`);
    this.shown = key;
  };
  app.showView("live", "push");
  await app.leaveLive();
  assertEqual(app.views.shown, "people");
  assertEqual(JSON.stringify(app.history.state), '{"view":"people","leave":3}', "People in Live's step: three back");
});

test("live closes: off Live, or Live with nothing under it, nothing happens", async () => {
  const moved = mainApp("?note=14");
  moved.app.showView("live", "push");
  moved.app.views.shown = "week";
  await moved.app.leaveLive();
  assertEqual(moved.app.loaded.length, 0, "the Week stays");
  const byHand = mainApp("?note=14&live", { view: "live" });
  byHand.app.showView("live", "replace");
  await byHand.app.leaveLive();
  assertEqual(byHand.app.loaded.length, 0);
  assertTrue(byHand.app.underLive === null);
});

// The real openFromUrl and mainFromUrl over a tree of dashboards: open() hides the page
// before mainFromUrl shows the one the address names, as after Back or Forward.
function routedApp(notes, search, state = {}) {
  const { app, steps } = mainApp(search, state);
  app.tree = new NoteTree(notes);
  app.currentId = null;
  app.hubPage = {};
  app.say = () => {};
  app.isDashboard = (id) => app.tree.get(id)?.kind === "project";
  app.views.fromUrl = (params) => ["live", "people", "week"].find((key) => params.has(key)) ?? null;
  app.views.hide = () => { app.views.shown = null; };
  const show = app.views.show;
  app.views.show = (key, how, flag = key) => {
    if (how === "replace") app.history.replaceState({}, "", `?note=${app.currentId}&${flag}`);
    show.call(app.views, key, how);
  };
  app.open = async (id) => {
    if (app.views.shown) app.views.hide();
    app.currentId = id;
    return true;
  };
  for (const name of ["openFromUrl", "mainFromUrl"]) app[name] = NotesApp.prototype[name];
  return { app, steps };
}

const hubs = [{ id: 14, parent_id: null, title: "Acme", kind: "project" }, { id: 20, parent_id: null, title: "Northwind", kind: "project" }];

test("live closes: Live reached by Back still goes back to the page under it", async () => {
  const { app } = routedApp(hubs, "?note=14&people", { view: "people" });
  app.currentId = 14;
  app.views.shown = "people";
  app.showView("live", "push");
  app.showView("week", "push");
  // Back: the address is Live's step again, and popstate loads it.
  app.history.state = { view: "live" };
  app.location.search = "?note=14&live";
  await app.openFromUrl("none");
  assertEqual(app.views.shown, "live");
  assertEqual(app.underLive?.search, "?note=14&people", "Back onto Live keeps the page under it");
  await app.leaveLive();
  assertEqual(app.views.shown, "people");
  assertEqual(app.location.search, "?note=14&people");
});

test("live closes: a dashboard under Live that has gone shows Today", async () => {
  const { app } = routedApp(hubs, "?note=20");
  app.currentId = 20;
  app.showView("live", "push");
  app.tree = new NoteTree(hubs.filter((note) => note.id !== 20)); // Northwind trashed meanwhile
  await app.leaveLive();
  assertEqual(app.views.shown, "home", "Today");
  assertEqual(app.currentId, 14);
});
