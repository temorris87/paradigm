// Where Mermaid lays a diagram out before handing back its SVG text: an off-screen element in the
// diagram frame page's <body> (frame-main.js). Rendering into our own element keeps Mermaid's
// temporary elements in one place, emptied after each diagram. Mermaid's own <style> applies
// there now (the frame's CSP allows it); the rule on <p> stays until a test shows the label
// sizes match without it (a <p>'s default margins made every box 2 em too tall).
const RULES = (font) => `
.pd-mermaid-work {
  position: absolute;
  top: 0;
  left: -100000px;
  width: 2000px;
  visibility: hidden;
  font-family: ${font};
  font-size: 16px;
}
.pd-mermaid-work p { margin: 0; }
`;

let area = null;

/** The work element, created on first use. */
export function mermaidWorkArea(font, doc = document) {
  if (area?.isConnected) return area;
  area = doc.createElement("div");
  area.className = "pd-mermaid-work";
  area.setAttribute("aria-hidden", "true");
  doc.body.append(area);
  const sheet = new doc.defaultView.CSSStyleSheet();
  sheet.replaceSync(RULES(font));
  doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  return area;
}
