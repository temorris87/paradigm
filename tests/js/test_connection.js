import { Connection } from "../../static/js/connection/connection.js";
import { mountBanner } from "../../static/js/connection/banner.js";
import { tabId } from "../../static/js/connection/tab-id.js";
import { assertEqual, assertTrue, test } from "./harness.js";
import { FakeEventSource, FakeTimers } from "./fakes.js";

function setup() {
  FakeEventSource.reset();
  const timers = new FakeTimers();
  const beacons = [];
  const events = [];
  const connection = new Connection({
    tabId: "tab 1",
    EventSourceImpl: FakeEventSource,
    sendBeacon: (url) => beacons.push(url),
    setTimer: timers.set,
    clearTimer: timers.clear,
  });
  for (const name of ["connected", "lost"]) {
    connection.addEventListener(name, () => events.push(name));
  }
  connection.start();
  return { connection, timers, beacons, events };
}

test("opens the event stream with the tab id", () => {
  setup();
  assertEqual(FakeEventSource.latest().url, "/api/events?tab=tab%201");
});

test("reports connected once the stream opens", () => {
  const { connection, events } = setup();
  FakeEventSource.latest().open();
  assertEqual(connection.state, "connected");
  assertEqual(events.join(), "connected");
});

test("a short drop is not reported as lost", () => {
  const { timers, events } = setup();
  FakeEventSource.latest().open();
  FakeEventSource.latest().drop();
  timers.advance(2000);
  FakeEventSource.latest().open();
  timers.advance(5000);
  assertEqual(events.join(), "connected");
});

test("a drop longer than 3 s is reported as lost", () => {
  const { connection, timers, events } = setup();
  FakeEventSource.latest().open();
  FakeEventSource.latest().drop();
  timers.advance(2999);
  assertEqual(events.join(), "connected");
  timers.advance(1);
  assertEqual(connection.state, "lost");
  assertEqual(events.join(), "connected,lost");
});

test("repeated errors while lost report lost only once", () => {
  const { timers, events } = setup();
  FakeEventSource.latest().open();
  FakeEventSource.latest().drop();
  timers.advance(3000);
  FakeEventSource.latest().drop();
  timers.advance(10000);
  assertEqual(events.join(), "connected,lost");
});

test("reconnecting after lost reports connected again", () => {
  const { connection, timers, events } = setup();
  FakeEventSource.latest().open();
  FakeEventSource.latest().drop();
  timers.advance(3000);
  FakeEventSource.latest().open();
  assertEqual(connection.state, "connected");
  assertEqual(events.join(), "connected,lost,connected");
});

test("a stream the browser gave up on is reopened after 2 s", () => {
  const { timers } = setup();
  const first = FakeEventSource.latest();
  first.drop({ closed: true });
  assertTrue(first.closed, "closed stream should be closed");
  assertEqual(FakeEventSource.instances.length, 1);
  timers.advance(2000);
  assertEqual(FakeEventSource.instances.length, 2);
});

test("sendClosing sends a beacon with the tab id", () => {
  const { connection, beacons } = setup();
  connection.sendClosing();
  assertEqual(beacons.join(), "/api/closing?tab=tab%201");
});

test("stop closes the stream and cancels timers", () => {
  const { connection, timers, events } = setup();
  FakeEventSource.latest().drop({ closed: true });
  connection.stop();
  timers.advance(10000);
  assertEqual(FakeEventSource.instances.length, 1);
  assertEqual(events.join(), "");
});

test("banner shows while lost and hides when connected", () => {
  const { connection } = setup();
  const parent = document.createElement("div");
  let unsaved = false;
  const banner = mountBanner(connection, { unsaved: () => unsaved }, parent);
  assertTrue(banner.hidden, "hidden at first");
  connection.dispatchEvent(new Event("lost"));
  assertEqual(banner.hidden, false);
  assertTrue(banner.textContent.includes("paradigm.py"), "names the launcher");
  assertTrue(banner.textContent.endsWith("retrying…"));
  connection.dispatchEvent(new Event("connected"));
  assertTrue(banner.hidden, "hidden again");
  unsaved = true;
  connection.dispatchEvent(new Event("lost"));
  assertTrue(/changes since \d\d:\d\d are kept in this window and will save when it’s back/.test(banner.textContent), banner.textContent);
  connection.dispatchEvent(new Event("connected"));
});

test("tab id is kept in storage", () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const first = tabId(storage);
  assertTrue(first.length > 0, "non-empty id");
  assertEqual(tabId(storage), first);
});
