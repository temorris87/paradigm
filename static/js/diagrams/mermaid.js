// Draws the Markdown renderer's diagram placeholders (`.md-mermaid`, source as their text) with
// the vendored Mermaid. The rules come from docs/security/vendor-audit.md:
//   - securityLevel "strict", never anything looser; the secure-keys list stays as shipped;
//   - SVGs go in only through insert-svg.js, never innerHTML;
//   - rendering is slow and blocks the page, so diagrams render one at a time, only when a
//     placeholder is actually drawn (a block shown rendered, never while it is edited), and
//     results are cached by source;
//   - a failed render shows the source and the message, and Mermaid's temporary elements go
//     (it renders inside work-area.js's element, which is emptied after each diagram).
// Mermaid is 5 MB, so it is loaded the first time a diagram is seen.
import { insertSvg } from "./insert-svg.js";
import { mermaidWorkArea } from "./work-area.js";

const MERMAID_URL = new URL("../../vendor/mermaid-12.3.0/dist/mermaid.esm.min.mjs", import.meta.url).href;
const CACHE_LIMIT = 50;
const MESSAGE_LIMIT = 500;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Mermaid's settings. Theme colours come from the Nord variables in the page. */
export function mermaidConfig(colour = nordColour) {
  const themeVariables = {
    darkMode: true,
    background: colour("--nord0"),
    fontFamily: FONT,
    primaryColor: colour("--nord1"),
    primaryTextColor: colour("--nord4"),
    primaryBorderColor: colour("--nord9"),
    secondaryColor: colour("--nord2"),
    tertiaryColor: colour("--nord3"),
    lineColor: colour("--nord4"),
    edgeLabelBackground: colour("--nord0"),
    textColor: colour("--nord4"),
    noteBkgColor: colour("--nord2"),
    noteTextColor: colour("--nord5"),
    noteBorderColor: colour("--nord13"),
  };
  for (const [key, value] of Object.entries(themeVariables)) if (value === "") delete themeVariables[key];
  return {
    startOnLoad: false,
    securityLevel: "strict",
    maxTextSize: 20000,
    maxEdges: 500,
    suppressErrorRendering: true, // errors come back to us; Mermaid's own error picture is not drawn
    theme: "base",
    look: "classic", // "neo" adds a pale drop shadow, a smudge on a dark page
    fontFamily: FONT,
    themeVariables,
  };
}

function nordColour(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * A renderer around one Mermaid instance. `load()` resolves to the mermaid API
 * ({ initialize, render }); tests pass a fake.
 */
export function createDiagramRenderer({ load = () => import(MERMAID_URL).then((module) => module.default) } = {}) {
  const cache = new Map(); // source -> { svg } | { error }, oldest first
  const waiting = new Map(); // source -> Set of placeholder elements
  const pending = new Map(); // source -> Promise of its result, while queued or rendering
  const listeners = new Set();
  let api = null;
  let tail = Promise.resolve();
  let counter = 0;

  async function mermaid() {
    if (!api) {
      api = await load();
      api.initialize(mermaidConfig());
    }
    return api;
  }

  function cached(source) {
    const result = cache.get(source);
    if (result) {
      cache.delete(source); // most recently used goes last
      cache.set(source, result);
    }
    return result;
  }

  function remember(source, result) {
    cache.set(source, result);
    while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  }

  async function renderOne(source) {
    counter += 1;
    const id = `pd-mermaid-${counter}`;
    let result;
    try {
      const api = await mermaid();
      const { svg } = await api.render(id, source, workArea());
      result = { svg };
    } catch (error) {
      result = { error: messageOf(error) };
    } finally {
      workArea().replaceChildren(); // Mermaid's temporary elements, left behind by an error
    }
    remember(source, result);
    const elements = waiting.get(source) ?? new Set();
    waiting.delete(source);
    for (const element of elements) if (element.isConnected) fill(element, source, result);
    pending.delete(source);
    for (const listener of listeners) listener(source);
    return result;
  }

  function schedule(source) {
    if (!pending.has(source)) {
      const done = tail.then(() => renderOne(source));
      pending.set(source, done);
      tail = done.catch((error) => console.error(error));
    }
    return pending.get(source);
  }

  return {
    /** Fill every placeholder under `root` not drawn yet: at once if cached, else later. */
    draw(root) {
      for (const element of root.querySelectorAll(".md-mermaid:not([data-source])")) {
        const source = element.textContent;
        element.dataset.source = source; // marks it seen, and keeps the source
        const result = cached(source);
        if (result) fill(element, source, result);
        else {
          showPending(element);
          if (!waiting.has(source)) waiting.set(source, new Set());
          waiting.get(source).add(element);
          schedule(source);
        }
      }
    },
    /** Resolves to { svg } (Mermaid's text, not yet cleaned) or { error }, through the queue. */
    async svgFor(source) {
      return cached(source) ?? schedule(source);
    },
    /** fn(source) after each render finishes. Returns a function that stops it. */
    onDrawn(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Resolves when every render asked for so far is done. */
    idle() {
      return tail;
    },
  };
}

function showPending(element) {
  element.classList.add("md-mermaid-pending");
  element.textContent = "Drawing diagram…";
}

function fill(element, source, result) {
  element.classList.remove("md-mermaid-pending");
  if (result.svg !== undefined && insertSvg(element, result.svg)) return;
  element.classList.add("md-mermaid-error");
  const code = document.createElement("pre");
  code.textContent = source;
  const message = document.createElement("div");
  message.className = "md-mermaid-message";
  message.textContent = result.error ?? "The diagram could not be drawn.";
  element.replaceChildren(code, message);
}

function messageOf(error) {
  const text = String(error?.message ?? error ?? "The diagram could not be drawn.");
  return text.length > MESSAGE_LIMIT ? `${text.slice(0, MESSAGE_LIMIT)}…` : text;
}

function workArea() {
  return mermaidWorkArea(FONT);
}

const shared = createDiagramRenderer();

/** Draw the diagram placeholders under `root` with the page's shared renderer. */
export function drawDiagrams(root) {
  shared.draw(root);
}

/** fn(source) whenever the shared renderer finishes a diagram. Returns an unsubscribe. */
export function onDiagramDrawn(fn) {
  return shared.onDrawn(fn);
}

/** { svg } or { error } for one diagram's source, from the shared renderer (used by :export). */
export function diagramSvg(source) {
  return shared.svgFor(source);
}

/** Resolves when the shared renderer has finished every diagram asked for so far. */
export function diagramsIdle() {
  return shared.idle();
}
