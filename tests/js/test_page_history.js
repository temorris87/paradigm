// H and L, back and forward a page (spec 041): every page change is a step, and the app knows
// its place in the tab's history (layout/page-history.js) so it can say there is no earlier or
// later page.
import { MAIN_KEYS, mainAction } from "../../static/js/layout/main-keys.js";
import { PageHistory, stepOf } from "../../static/js/layout/page-history.js";
import { viewKeyGroups } from "../../static/js/layout/view-keys.js";
import { hubAction } from "../../static/js/hubs/hub-keys.js";
import { PageViews } from "../../static/js/notes/page-views.js";
import { assertEqual, assertTrue, test } from "./harness.js";

// A tab's history as a browser keeps it: entries, the one shown, popstate on Back and Forward.
// Here popstate comes at once; with { later: true } each Back or Forward waits in a queue, as in
// a browser, until settle() runs the next one (its delta counted from where the tab is then).
function browserHistory(first = { state: null, url: "/" }, { later = false } = {}) {
  const tab = {
    entries: [first],
    index: 0,
    waiting: [],
    onPop: () => {},
    get state() { return tab.entries[tab.index].state; },
    get url() { return tab.entries[tab.index].url; },
    pushState(state, _title, url) {
      tab.entries = [...tab.entries.slice(0, tab.index + 1), { state: structuredClone(state), url }];
      tab.index += 1;
    },
    replaceState(state, _title, url = tab.url) {
      tab.entries[tab.index] = { state: structuredClone(state), url };
    },
    back() { tab.go(-1); },
    forward() { tab.go(1); },
    go(by) {
      if (later) tab.waiting.push(by);
      else tab.traverse(by);
    },
    traverse(by) {
      const next = tab.index + by;
      if (next < 0 || next >= tab.entries.length) return;
      tab.index = next;
      tab.onPop();
    },
    settle() { if (tab.waiting.length) tab.traverse(tab.waiting.shift()); },
    settleAll() { while (tab.waiting.length) tab.settle(); },
  };
  return tab;
}

// sessionStorage as a tab keeps it: it lasts through a reload.
function tabStorage() {
  const items = new Map();
  return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => items.set(key, String(value)) };
}

test("page history: a step in every entry; a push counts on, a replace keeps it", () => {
  const tab = browserHistory();
  const history = new PageHistory(tab);
  history.replaceState({}, "", "/?note=1&home");
  assertEqual(JSON.stringify(tab.state), '{"step":0}');
  history.pushState({ view: "people" }, "", "/?note=1&people");
  history.pushState(null, "", "/?note=14");
  assertEqual(JSON.stringify(tab.state), '{"step":2}');
  history.replaceState({ view: "plan" }, "", "/?note=14&plan");
  assertEqual(JSON.stringify(tab.state), '{"view":"plan","step":2}', "the state asked for, with the step");
  assertEqual(history.state, tab.state);
  assertEqual(stepOf(null), 0);
  assertEqual(stepOf({ step: -2 }), 0);
});

test("page history: the ends say no, in between it goes back and forward", () => {
  const tab = browserHistory();
  const history = new PageHistory(tab);
  tab.onPop = () => history.popped();
  assertEqual(history.goBack(), false, "the first page: no earlier page");
  assertEqual(history.goForward(), false, "no later page");
  history.pushState({ view: "people" }, "", "/?people");
  history.pushState({ view: "meetings" }, "", "/?meetings");
  assertTrue(history.goBack());
  assertEqual(tab.url, "/?people");
  assertTrue(history.goBack());
  assertEqual(tab.url, "/");
  assertEqual(history.goBack(), false);
  assertEqual(tab.url, "/", "nothing happened");
  assertTrue(history.goForward());
  assertTrue(history.goForward());
  assertEqual(tab.url, "/?meetings");
  assertEqual(history.goForward(), false);
  // A push from the middle drops the pages ahead, as the browser does.
  history.goBack();
  history.pushState({ view: "trash" }, "", "/?trash");
  assertEqual(history.goForward(), false, "Meetings is gone from ahead");
});

test("page history: a reload counts from the page loaded; pages before Paradigm are not the app's", () => {
  const outside = browserHistory({ state: null, url: "/elsewhere" });
  const before = new PageHistory(outside);
  outside.onPop = () => before.popped();
  before.pushState({}, "", "/?note=1");
  before.pushState({}, "", "/?note=2");
  // Reloaded on /?note=2: its step stays, the steps before it can still be gone back to.
  const reloaded = new PageHistory(outside);
  outside.onPop = () => reloaded.popped();
  assertEqual(reloaded.goForward(), false);
  assertTrue(reloaded.goBack());
  assertTrue(reloaded.goBack());
  assertEqual(outside.url, "/elsewhere");
  assertEqual(reloaded.goBack(), false, "the page before the app's first entry is not one of its pages");
  assertTrue(reloaded.goForward(), "forward again, as far as the browser went");
});

test("page history: Today, People, Meetings, a dashboard: H walks back through each, L forward", () => {
  const tab = browserHistory({ state: null, url: "/?note=1&home" });
  const history = new PageHistory(tab);
  const main = document.createElement("main");
  const page = () => ({ section: document.createElement("section"), focus() {}, show() {} });
  const pages = { home: page(), people: page(), meetings: page() };
  const views = new PageViews({ main, pages, history, noteUrl: () => "/?note=1" });
  views.show("home", "replace");
  views.show("people", "push");
  views.show("meetings", "push");
  // A dashboard opened from a page: NotesApp.open pushes its own step and hides the view.
  views.hide();
  history.pushState({}, "", "/?note=14");
  const urls = [];
  tab.onPop = () => {
    history.popped();
    urls.push(tab.url);
  };
  for (let press = 0; press < 3; press += 1) assertTrue(history.goBack());
  assertEqual(urls.join(" "), "/?note=1&meetings /?note=1&people /?note=1&home");
  assertEqual(history.goBack(), false, "Today was the first");
  assertTrue(history.goForward());
  assertTrue(history.goForward());
  assertEqual(tab.url, "/?note=1&meetings");
  assertTrue(history.goForward());
  assertEqual(history.goForward(), false, "the dashboard was the last");
});

test("page history: H and L are the window's, never a text box's; S logs status on a dashboard", () => {
  assertEqual(mainAction({ key: "H", shiftKey: true, target: document.body }), "back");
  assertEqual(mainAction({ key: "L", shiftKey: true, target: document.body }), "forward");
  const input = document.createElement("input");
  document.body.append(input);
  try {
    assertEqual(mainAction({ key: "H", shiftKey: true, target: input }), null, "H types an H");
  } finally {
    input.remove();
  }
  assertEqual(hubAction({ key: "S", shiftKey: true }, "project"), "logStatus");
  assertEqual(hubAction({ key: "L", shiftKey: true }, "project"), null, "L is the window's forward now");
  const anywhere = viewKeyGroups("people").find((group) => group.name === "Anywhere in this window").rows;
  assertTrue(anywhere.some((row) => row.keys.join() === "H" && row.help === "back a page"));
  assertTrue(anywhere.some((row) => row.keys.join() === "L" && row.help === "forward a page"));
  assertEqual(MAIN_KEYS.find((entry) => entry.action === "back").label, "H L");
});

test("page history: a quick second H before the first popstate cannot step out of Paradigm", () => {
  const tab = browserHistory({ state: null, url: "/?note=1" }, { later: true });
  const history = new PageHistory(tab);
  tab.onPop = () => history.popped();
  history.pushState({ view: "people" }, "", "/?note=1&people");
  assertTrue(history.goBack(), "the first H");
  assertEqual(history.goBack(), false, "the second, before Back has landed: no earlier page");
  tab.settleAll();
  assertEqual(tab.url, "/?note=1");
  assertEqual(tab.index, 0, "still in the app's first entry");
  // Forward the same: two L with one page ahead.
  assertTrue(history.goForward());
  assertEqual(history.goForward(), false);
  tab.settleAll();
  assertEqual(tab.url, "/?note=1&people");
});

test("page history: H H H over three pages lands on the first, each popstate settling one", () => {
  const tab = browserHistory({ state: null, url: "/?note=1" }, { later: true });
  const history = new PageHistory(tab);
  tab.onPop = () => history.popped();
  history.pushState({ view: "home" }, "", "/?note=1&home");
  history.pushState({ view: "people" }, "", "/?note=1&people");
  assertTrue(history.goBack());
  assertTrue(history.goBack());
  tab.settle(); // the first Back lands; the second is still on its way
  assertEqual(history.goBack(), false, "the second Back already reaches the first page");
  tab.settleAll();
  assertEqual(tab.url, "/?note=1");
  assertEqual(history.goBack(), false);
  assertTrue(history.goForward());
  tab.settleAll();
  assertEqual(tab.url, "/?note=1&home");
});

test("page history: after a reload L still reaches the later pages; a push drops them", () => {
  const tab = browserHistory({ state: null, url: "/?note=1" });
  const storage = tabStorage();
  const first = new PageHistory(tab, storage);
  tab.onPop = () => first.popped();
  first.pushState({ view: "home" }, "", "/?note=1&home");
  first.pushState({ view: "people" }, "", "/?note=1&people");
  first.goBack();
  first.goBack();
  // Reloaded on the first page: the browser still has two later pages of the app.
  const reloaded = new PageHistory(tab, storage);
  tab.onPop = () => reloaded.popped();
  assertTrue(reloaded.goForward(), "L after a reload");
  assertTrue(reloaded.goForward());
  assertEqual(tab.url, "/?note=1&people");
  assertEqual(reloaded.goForward(), false, "and no further");
  // A push from the middle drops the steps ahead, and a reload after it knows.
  reloaded.goBack();
  reloaded.pushState({ view: "trash" }, "", "/?note=1&trash");
  const again = new PageHistory(tab, storage);
  assertEqual(again.goForward(), false, "People is gone from ahead");
  // A fresh load (an entry with no step) has nothing ahead, whatever the tab remembered.
  const fresh = browserHistory({ state: null, url: "/?note=1" });
  storage.setItem("paradigm.lastPageStep", "5");
  assertEqual(new PageHistory(fresh, storage).goForward(), false);
});

test("page history: a reload in the middle keeps the entry's step, so H still goes back", () => {
  const tab = browserHistory({ state: null, url: "/?note=1" });
  const storage = tabStorage();
  const first = new PageHistory(tab, storage);
  tab.onPop = () => first.popped();
  first.pushState({ view: "home" }, "", "/?note=1&home");
  first.pushState({ view: "people" }, "", "/?note=1&people");
  first.pushState({ view: "meetings" }, "", "/?note=1&meetings");
  first.goBack();
  assertEqual(tab.url, "/?note=1&people");
  const reloaded = new PageHistory(tab, storage);
  tab.onPop = () => reloaded.popped();
  assertEqual(reloaded.step, 2, "the step the entry kept");
  assertTrue(reloaded.goBack());
  assertTrue(reloaded.goBack());
  assertEqual(tab.url, "/?note=1");
  assertEqual(reloaded.goBack(), false);
  assertTrue(reloaded.goForward());
  assertTrue(reloaded.goForward());
  assertTrue(reloaded.goForward(), "Meetings, after the page reloaded");
  assertEqual(tab.url, "/?note=1&meetings");
});

// The main window over a tab: the page the URL names shows on popstate, as NotesApp's does.
function pagesOver(tab) {
  const history = new PageHistory(tab);
  const main = document.createElement("main");
  const page = () => ({ section: document.createElement("section"), focus() {}, show() {} });
  const pages = { home: page(), people: page(), meetings: page(), task: page(), settings: page(), history: page() };
  const views = new PageViews({ main, pages, history, noteUrl: () => "/?note=1" });
  tab.onPop = () => {
    history.popped();
    const key = views.fromUrl(new URLSearchParams(tab.url.split("?")[1]));
    if (key) views.show(key, "none");
    else views.hide();
  };
  return { history, views };
}

test("page views: Escape from pages opened one from another returns to the dashboard; H steps page by page", () => {
  const tab = browserHistory({ state: null, url: "/?note=1" });
  const { history, views } = pagesOver(tab);
  views.show("home", "push");
  views.show("people", "push");
  views.show("meetings", "push");
  assertTrue(views.leave(), "went Back");
  assertEqual(tab.url, "/?note=1", "the dashboard under the pages");
  assertEqual(views.shown, null);
  assertTrue(history.goForward() && history.goForward() && history.goForward());
  assertEqual(tab.url, "/?note=1&meetings", "Forward still has every page");
  assertTrue(history.goBack());
  assertEqual(views.shown, "people", "H, one page");
  views.leave();
  assertEqual(tab.url, "/?note=1", "Escape there: the dashboard again");
});

test("page views: Escape from a task or Settings returns to the page it was opened from", () => {
  const tab = browserHistory({ state: null, url: "/?note=1" });
  const { views } = pagesOver(tab);
  views.show("home", "push");
  views.show("people", "push");
  views.show("settings", "push");
  views.leave();
  assertEqual(views.shown, "people", "Settings: back to People");
  views.show("task", "push", "task=10");
  views.show("task", "push", "task=11");
  views.leave();
  assertEqual(views.shown, "people", "a task page (and its subtask's): back to People");
  views.leave();
  assertEqual(tab.url, "/?note=1", "then the dashboard, over Today and People at once");
});

test("page views: Escape from a page opened from History returns to History", () => {
  const tab = browserHistory({ state: null, url: "/?note=1" });
  const { views } = pagesOver(tab);
  views.show("home", "push");
  views.show("history", "push", "history=1");
  views.show("people", "push");
  views.show("meetings", "push");
  views.leave();
  assertEqual(tab.url, "/?note=1&history=1", "History is kept under");
  views.leave();
  assertEqual(tab.url, "/?note=1", "and History itself, opened from Today, goes to the dashboard");
});
