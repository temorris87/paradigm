// The diagram frame's messages (frame-client.js in the window, frame-listener.js in the frame):
// replies matched by id, a timeout so the queue never sticks, and the frame answering only its
// parent at our origin. Fake windows throughout; test_diagrams.js draws through the real frame.
import { createFrameClient, NOT_DRAWN } from "../../static/js/diagrams/frame-client.js";
import { listenForRenders } from "../../static/js/diagrams/frame-listener.js";
import { assertEqual as same, assertTrue, test } from "./harness.js";

const ORIGIN = "http://127.0.0.1:8765";
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A window that only records listeners, and sends what it is told to. */
function fakeWindow(extra = {}) {
  const listeners = new Set();
  return {
    location: { origin: ORIGIN },
    sent: [],
    addEventListener: (type, fn) => listeners.add(fn),
    removeEventListener: (type, fn) => listeners.delete(fn),
    postMessage(data, origin) {
      this.sent.push({ data, origin });
    },
    deliver: (event) => Promise.all([...listeners].map((fn) => fn(event))),
    ...extra,
  };
}

function client(timeoutMs = 1000) {
  const win = fakeWindow();
  const frame = fakeWindow();
  let opened = 0;
  const api = createFrameClient({ win, timeoutMs, openFrame: async () => {
    opened += 1;
    return frame;
  } });
  return { api, win, frame, opened: () => opened };
}

test("diagram frame: render sends the source and config, and the reply comes back by id", async () => {
  const { api, win, frame, opened } = client();
  api.initialize({ theme: "base" });
  const one = api.render("pd-mermaid-1", "graph LR\nA-->B");
  const two = api.render("pd-mermaid-2", "bad");
  await tick();
  same(opened(), 1, "one frame for the window");
  same(frame.sent.length, 2);
  same(frame.sent[0].origin, ORIGIN, "sent to our origin only");
  same(JSON.stringify(frame.sent[0].data), JSON.stringify({ type: "render", id: "pd-mermaid-1", source: "graph LR\nA-->B", config: { theme: "base" } }));
  await win.deliver({ source: frame, origin: ORIGIN, data: { type: "failed", id: "pd-mermaid-2", error: "Parse error" } });
  await win.deliver({ source: frame, origin: ORIGIN, data: { type: "rendered", id: "pd-mermaid-1", svg: "<svg></svg>" } });
  same((await one).svg, "<svg></svg>");
  let failure = null;
  await two.catch((error) => { failure = error; });
  same(failure?.message, "Parse error");
});

test("diagram frame: replies from another window or origin are ignored", async () => {
  const { api, win, frame } = client(50);
  const drawn = api.render("pd-mermaid-1", "graph LR\nA-->B");
  await tick();
  await win.deliver({ source: fakeWindow(), origin: ORIGIN, data: { type: "rendered", id: "pd-mermaid-1", svg: "<svg>other</svg>" } });
  await win.deliver({ source: frame, origin: "http://acme.example", data: { type: "rendered", id: "pd-mermaid-1", svg: "<svg>far</svg>" } });
  let failure = null;
  await drawn.catch((error) => { failure = error; });
  same(failure?.message, NOT_DRAWN, "only the timeout ended it");
});

test("diagram frame: no answer fails after the timeout, and a late answer is dropped", async () => {
  const { api, win, frame } = client(30);
  let failure = null;
  await api.render("pd-mermaid-1", "graph LR\nA-->B").catch((error) => { failure = error; });
  same(failure?.message, NOT_DRAWN);
  await win.deliver({ source: frame, origin: ORIGIN, data: { type: "rendered", id: "pd-mermaid-1", svg: "<svg></svg>" } });
  const next = api.render("pd-mermaid-2", "x");
  await tick();
  await win.deliver({ source: frame, origin: ORIGIN, data: { type: "rendered", id: "pd-mermaid-2", svg: "<svg>2</svg>" } });
  same((await next).svg, "<svg>2</svg>", "the client keeps working");
});

test("diagram frame: a frame that never opens times out too", async () => {
  const win = fakeWindow();
  const api = createFrameClient({ win, timeoutMs: 30, openFrame: () => new Promise(() => {}) });
  let failure = null;
  await api.render("pd-mermaid-1", "x").catch((error) => { failure = error; });
  same(failure?.message, NOT_DRAWN);
});

function frameSide() {
  const parent = fakeWindow();
  const win = fakeWindow({ parent });
  const asked = [];
  listenForRenders({ win, render: async (id, source, config) => {
    asked.push({ id, source, config });
    if (source === "bad") throw new Error("Parse error on line 1");
    return `<svg id="${id}"></svg>`;
  } });
  return { parent, win, asked };
}

test("diagram frame: the frame page answers its parent with the SVG or the error", async () => {
  const { parent, win, asked } = frameSide();
  await win.deliver({ source: parent, origin: ORIGIN, data: { type: "render", id: "d1", source: "graph", config: { theme: "base" } } });
  await win.deliver({ source: parent, origin: ORIGIN, data: { type: "render", id: "d2", source: "bad", config: {} } });
  same(asked[0].config.theme, "base");
  same(JSON.stringify(parent.sent.map((each) => each.data)), JSON.stringify([
    { type: "rendered", id: "d1", svg: '<svg id="d1"></svg>' },
    { type: "failed", id: "d2", error: "Parse error on line 1" },
  ]));
  assertTrue(parent.sent.every((each) => each.origin === ORIGIN), "replies go to our origin only");
});

test("diagram frame: the frame page ignores another window, another origin and other messages", async () => {
  const { parent, win, asked } = frameSide();
  const render = { type: "render", id: "d1", source: "graph", config: {} };
  await win.deliver({ source: fakeWindow(), origin: ORIGIN, data: render });
  await win.deliver({ source: parent, origin: "http://acme.example", data: render });
  await win.deliver({ source: parent, origin: "null", data: render });
  await win.deliver({ source: parent, origin: ORIGIN, data: { type: "other", id: "d1" } });
  await win.deliver({ source: parent, origin: ORIGIN, data: "render" });
  same(asked.length, 0, "nothing drawn");
  same(parent.sent.length, 0, "nothing sent");
});

test("diagram frame: a top-level frame page (no parent) answers no one", async () => {
  const win = fakeWindow();
  win.parent = win;
  const asked = [];
  listenForRenders({ win, render: async () => asked.push(1) });
  await win.deliver({ source: win, origin: ORIGIN, data: { type: "render", id: "d1", source: "graph", config: {} } });
  same(asked.length, 0);
});
