// H and L, back and forward a page (spec 041): every page change is a step, and the app knows
// its place in the tab's history (layout/page-history.js) so it can say there is no earlier or
// later page.
import { MAIN_KEYS, mainAction } from "../../static/js/layout/main-keys.js";
import { PageHistory, stepOf } from "../../static/js/layout/page-history.js";
import { viewKeyGroups } from "../../static/js/layout/view-keys.js";
import { hubAction } from "../../static/js/hubs/hub-keys.js";
import { PageViews } from "../../static/js/notes/page-views.js";
import { NotesApp } from "../../static/js/notes/app.js";
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
    // A "#" link clicked (a footnote on Live): a new entry with no state, and popstate at once.
    fragment(hash) {
      tab.pushState(null, "", `${tab.url.split("#")[0]}${hash}`);
      tab.onPop();
    },
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
  assertEqual(stepOf({ step: -2 }), -2, "an entry from before the upgrade, behind the first counted");
  assertEqual(stepOf({ step: 1.5 }), 0);
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
  const pages = { home: page(), people: page(), meetings: page(), task: page(), settings: page(), history: page(),
    live: page() };
  const views = new PageViews({ main, pages, history, noteUrl: () => "/?note=1" });
  tab.onPop = () => {
    history.popped();
    const key = views.fromUrl(new URL(tab.url, "http://x").searchParams);
    if (key) views.show(key, "none");
    else views.hide();
    history.landed();
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

test("page history: a footnote link on Live is a step of its own: H goes back from it, then on through the pages", () => {
  const tab = browserHistory({ state: null, url: "/?note=1" });
  const { history, views } = pagesOver(tab);
  views.show("home", "push");
  views.show("people", "push");
  views.show("live", "push");
  tab.fragment("#fn1");
  assertEqual(history.step, 4, "one on from Live, not the first page");
  assertEqual(tab.state.step, 4, "and the entry says so, for the pops that reach it later");
  assertTrue(history.goBack());
  assertEqual(tab.url, "/?note=1&live");
  assertTrue(history.goBack());
  assertEqual(views.shown, "people");
  assertTrue(history.goForward() && history.goForward());
  assertEqual(tab.url, "/?note=1&live#fn1", "Forward reaches the footnote again");
  assertEqual(history.goForward(), false);
  assertEqual(views.shown, "live");
});

test("page history: Back onto an entry the old build made (no step) is behind, not a \"#\" link", () => {
  // A tab open across the upgrade: two entries pushed before steps existed, reloaded on the second.
  const tab = browserHistory({ state: {}, url: "/?note=1" });
  tab.pushState({ view: "people" }, "", "/?note=1&people");
  const storage = tabStorage();
  const history = new PageHistory(tab, storage, { where: () => tab.url });
  tab.onPop = () => history.popped();
  assertEqual(history.step, 0, "the reloaded entry counts from 0");
  tab.go(-1); // the browser's own Back button
  assertEqual(history.step, -1, "one behind, not one on");
  assertEqual(tab.state.step, -1, "and marked so");
  assertEqual(history.goBack(), false, "nothing before it is known to be the app's: H says so");
  assertTrue(history.goForward(), "L goes back to the reloaded page");
  assertEqual(tab.url, "/?note=1&people");
  assertEqual(history.step, 0);
  assertEqual(history.goForward(), false, "and no later page");
  const reloaded = new PageHistory(tab, storage, { where: () => tab.url });
  assertTrue(reloaded.goBack(), "after a reload the earlier entry is still the app's");
});

test("page history: with the URL known, a \"#\" link is still a step on", () => {
  const tab = browserHistory({ state: null, url: "/?note=1&live" });
  const history = new PageHistory(tab, null, { where: () => tab.url });
  tab.onPop = () => history.popped();
  tab.fragment("#fn1");
  assertEqual(history.step, 1);
  assertTrue(history.goBack());
  assertEqual(history.step, 0);
});

test("page views: Escape pressed right after H waits for Back to land, then leaves from there", () => {
  const tab = browserHistory({ state: null, url: "/?note=1" }, { later: true });
  const { history, views } = pagesOver(tab);
  views.show("home", "push");
  views.show("people", "push");
  views.show("settings", "push");
  const app = { role: "main", currentId: 1, isDashboard: () => true, views, history, redraw() {}, focusNote() {} };
  for (const name of ["leaveView", "leaveViewNow"]) app[name] = NotesApp.prototype[name];
  assertTrue(history.goBack(), "H from Settings");
  app.leaveView(); // Escape, before Back has landed
  assertEqual(tab.waiting.length, 1, "nothing asked of the browser yet");
  tab.settle(); // Back lands on People; Escape runs from there
  tab.settleAll();
  assertEqual(tab.url, "/?note=1", "People's Escape: the dashboard under Today and People");
  assertEqual(tab.index, 0, "no step pushed while Back was on its way");
  assertEqual(views.shown, null);
});

test("page history: H and L pressed while Back is on its way run once its page is drawn", () => {
  const tab = browserHistory({ state: null, url: "/?note=1" }, { later: true });
  const { history, views } = pagesOver(tab);
  views.show("home", "push");
  views.show("people", "push");
  const ran = [];
  // As main.js binds them: each key waits for the page before it to land.
  const press = (name, move) => history.whenSettled(() => ran.push(`${name} ${move()}`));
  press("H", () => history.goBack());
  press("H", () => history.goBack());
  press("L", () => history.goForward());
  assertEqual(ran.join(), "H true", "the first at once; the others wait");
  tab.settle();
  assertEqual(ran.join(), "H true,H true");
  tab.settle();
  assertEqual(ran.join(), "H true,H true,L true");
  tab.settleAll();
  assertEqual(tab.url, "/?note=1&home");
  assertEqual(views.shown, "home");
});

test("page history: a move whose popstate never comes is given up after a second; the keys waiting on it are dropped", () => {
  const tab = browserHistory({ state: null, url: "/?note=1" }, { later: true });
  const timers = { queue: new Map(), next: 1,
    setTimeout(fn, ms) { const id = timers.next++; timers.queue.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.queue.delete(id); },
    runAll() { for (const [id, { fn }] of [...timers.queue]) { timers.queue.delete(id); fn(); } } };
  const history = new PageHistory(tab, null, { timers });
  tab.onPop = () => { history.popped(); history.landed(); };
  history.pushState({ view: "home" }, "", "/?note=1&home");
  history.pushState({ view: "people" }, "", "/?note=1&people");
  assertTrue(history.goBack());
  assertEqual([...timers.queue.values()][0]?.ms, 1000, "a second to land");
  const ran = [];
  history.whenSettled(() => ran.push("Escape"));
  tab.waiting.length = 0; // the browser skipped it: no popstate, the tab did not move
  timers.runAll();
  assertEqual(ran.length, 0, "dropped: it would act from a place not known");
  assertEqual(history.position, 2, "the step the entry shown carries");
  assertTrue(history.settled);
  assertTrue(history.goBack(), "H works again");
  tab.settle();
  assertEqual(tab.url, "/?note=1&home");
  assertEqual(timers.queue.size, 0, "a move that landed stops its timer");
});

test("page history: a footnote on a page H went back to is one on from that page", () => {
  const tab = browserHistory({ state: null, url: "/?note=1" });
  const history = new PageHistory(tab, null, { where: () => tab.url });
  tab.onPop = () => { history.popped(); history.landed(); };
  history.pushState({ view: "live" }, "", "/?note=1&live");
  history.pushState({ view: "people" }, "", "/?note=1&people");
  assertTrue(history.goBack(), "H back to Live");
  tab.fragment("#fn1");
  assertEqual(history.step, 2, "one on from Live, not taken for an old entry");
  assertEqual(history.goForward(), false, "People is gone from ahead");
  assertTrue(history.goBack());
  assertEqual(tab.url, "/?note=1&live");
  assertTrue(history.goBack(), "and the note before Live");
  assertEqual(tab.url, "/?note=1");
});

test("page history: Forward onto an entry the old build left ahead counts it ahead", () => {
  // A tab open across the upgrade, gone Back from old entry 3 to old entry 2, then reloaded.
  const tab = browserHistory({ state: {}, url: "/?note=1" });
  tab.pushState({ view: "home" }, "", "/?note=1&home");
  tab.pushState({ view: "people" }, "", "/?note=1&people");
  tab.index = 1;
  const history = new PageHistory(tab, tabStorage(), { where: () => tab.url, index: () => tab.index });
  tab.onPop = () => history.popped();
  tab.go(1); // the browser's own Forward button
  assertEqual(history.step, 1, "one ahead of the page reloaded");
  assertTrue(history.goBack(), "H goes back to it");
  assertEqual(tab.url, "/?note=1&home");
  assertTrue(history.goForward(), "and L forward again");
  assertEqual(tab.url, "/?note=1&people");
  tab.go(-2); // Back twice at once, onto the old entry behind
  assertEqual(history.step, -1);
  assertEqual(history.goBack(), false, "nothing before it is known to be the app's");
});
