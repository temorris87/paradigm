// The frame page's side of frame-client.js's messages: {type: "render", id, source, config} in,
// {type: "rendered", id, svg} or {type: "failed", id, error} back. It answers only its parent
// window, at its own origin: any other window or origin is ignored, so no other page can use
// the frame (its CSP already keeps other sites from framing it).
//
//   listenForRenders({ win, render: async (id, source, config) => svgText })
const MESSAGE_LIMIT = 500;

/** Starts answering; returns a function that stops it. */
export function listenForRenders({ win = window, render }) {
  const onMessage = async (event) => {
    if (event.source !== win.parent || event.source === win || event.origin !== win.location.origin) return;
    const { type, id, source, config } = event.data ?? {};
    if (type !== "render" || typeof id !== "string" || typeof source !== "string") return;
    let reply;
    try {
      reply = { type: "rendered", id, svg: String(await render(id, source, config ?? {})) };
    } catch (error) {
      reply = { type: "failed", id, error: messageOf(error) };
    }
    win.parent.postMessage(reply, win.location.origin);
  };
  win.addEventListener("message", onMessage);
  return () => win.removeEventListener("message", onMessage);
}

function messageOf(error) {
  const text = String(error?.message ?? error ?? "The diagram could not be drawn.");
  return text.length > MESSAGE_LIMIT ? `${text.slice(0, MESSAGE_LIMIT)}…` : text;
}
