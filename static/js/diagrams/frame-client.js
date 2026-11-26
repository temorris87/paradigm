// Mermaid draws in a hidden, same-origin frame page (diagram-frame.html, frame-main.js), not in
// this window: while it lays a diagram out it writes a <style> element and style="" attributes,
// which this window's CSP blocks (one violation each). The frame page alone is served with a CSP
// that allows inline styles; it sends back the SVG text, which insert-svg.js puts in here.
//
//   const api = createFrameClient();      // the { initialize, render } shape of Mermaid's API
//   api.initialize(config);               // sent with every render
//   const { svg } = await api.render(id, source);   // rejects with the error's message
//
// Messages: {type: "render", id, source, config} -> {type: "rendered", id, svg} or
// {type: "failed", id, error}. Only the frame's own window, at our origin, is listened to.
const FRAME_URL = new URL("../../diagram-frame.html", import.meta.url).href;
export const FRAME_TIMEOUT_MS = 20000; // per diagram, the first one's loading of Mermaid included
export const NOT_DRAWN = "The diagram could not be drawn.";

/**
 * openFrame() resolves to the frame's window once its page has loaded; tests pass a fake, with a
 * fake `win` (location.origin, addEventListener) to receive its replies.
 */
export function createFrameClient({ openFrame = () => openHiddenFrame(FRAME_URL), win = window, timeoutMs = FRAME_TIMEOUT_MS } = {}) {
  const waiting = new Map(); // id -> { resolve, reject, timer }
  let config = {};
  let frame = null; // Promise of the frame's window

  win.addEventListener("message", (event) => {
    if (!frame || event.origin !== win.location.origin) return;
    frame.then((target) => {
      if (event.source !== target) return;
      const { type, id, svg, error } = event.data ?? {};
      const entry = waiting.get(id);
      if (!entry) return; // timed out already, or not ours
      waiting.delete(id);
      clearTimeout(entry.timer);
      if (type === "rendered" && typeof svg === "string") entry.resolve({ svg });
      else entry.reject(new Error(typeof error === "string" && error ? error : NOT_DRAWN));
    });
  });

  return {
    initialize(next) {
      config = next;
    },
    render(id, source) {
      frame ??= openFrame();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiting.delete(id);
          reject(new Error(NOT_DRAWN));
        }, timeoutMs);
        waiting.set(id, { resolve, reject, timer });
        frame.then((target) => {
          if (waiting.has(id)) target.postMessage({ type: "render", id, source, config }, win.location.origin);
        }, () => {}); // a frame that never opens times out like one that never answers
      });
    },
  };
}

// Off-screen, not display: none, because Firefox can't measure text in an undisplayed frame.
// Styled through the CSSOM, which the CSP allows (a style="" attribute it would block).
function openHiddenFrame(url, doc = document) {
  return new Promise((resolve) => {
    const frame = doc.createElement("iframe");
    frame.className = "pd-diagram-frame";
    frame.title = "Diagram drawing";
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    const place = { position: "fixed", top: "0", left: "-100000px", width: "2000px", height: "1000px",
      border: "0", "pointer-events": "none" };
    for (const [name, value] of Object.entries(place)) frame.style.setProperty(name, value);
    frame.addEventListener("load", () => resolve(frame.contentWindow), { once: true });
    frame.src = url;
    doc.body.append(frame);
  });
}

let shared = null;

/** This window's one frame client, made on first use. */
export function diagramFrame() {
  shared ??= createFrameClient();
  return shared;
}
