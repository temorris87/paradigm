// H and L, back and forward a page (spec 041): every page change is a step, and the app knows
// its place in the tab's history (layout/page-history.js) so it can say there is no earlier or
// later page.
import { MAIN_KEYS, mainAction } from "../../static/js/layout/main-keys.js";
import { PageHistory, stepOf } from "../../static/js/layout/page-history.js";
import { viewKeyGroups } from "../../static/js/layout/view-keys.js";
import { hubAction } from "../../static/js/hubs/hub-keys.js";
import { PageViews } from "../../static/js/notes/page-views.js";
import { assertEqual, assertTrue, test } from "./harness.js";

// A tab's history as a browser keeps it: entries, the one shown, popstate on Back and Forward
// (here at once; a browser fires it a moment later).
function browserHistory(first = { state: null, url: "/" }) {
  const tab = {
    entries: [first],
    index: 0,
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
      const next = tab.index + by;
      if (next < 0 || next >= tab.entries.length) return;
      tab.index = next;
      tab.onPop();
    },
  };
  return tab;
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
