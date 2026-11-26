// The diagram frame page (diagram-frame.html): draws each diagram it is sent with the vendored
// Mermaid and sends back the SVG text (frame-listener.js has the messages). Mermaid's settings
// come from the window with each diagram (its theme colours are read there). Mermaid is 5 MB, so
// it is loaded the first time it is asked; renders arrive one at a time (mermaid.js's queue).
import { listenForRenders } from "./frame-listener.js";
import { mermaidWorkArea } from "./work-area.js";

const MERMAID_URL = new URL("../../vendor/mermaid-12.3.0/dist/mermaid.esm.min.mjs", import.meta.url).href;

let mermaid = null;
let settings = null; // the config Mermaid was last initialised with, as JSON

async function render(id, source, config) {
  mermaid ??= await import(MERMAID_URL).then((module) => module.default);
  const json = JSON.stringify(config);
  if (json !== settings) {
    // Never anything looser than strict, whatever arrives (docs/security/vendor-audit.md).
    mermaid.initialize({ ...config, securityLevel: "strict", startOnLoad: false });
    settings = json;
  }
  const area = mermaidWorkArea(config.fontFamily ?? "sans-serif");
  try {
    const { svg } = await mermaid.render(id, source, area);
    return svg;
  } finally {
    area.replaceChildren(); // Mermaid's temporary elements, left behind by an error
  }
}

listenForRenders({ render });
