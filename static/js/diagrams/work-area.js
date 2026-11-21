// Where Mermaid lays a diagram out before handing back its SVG text: an off-screen element of
// ours in <body>. Mermaid measures every label there, styled by the <style> element it adds to
// the diagram, but the CSP blocks that element, so labels were measured with the browser's
// defaults (a <p>'s margins made every box 2 em too tall). A constructed stylesheet, which the
// CSP allows, supplies the rules that change label sizes. Rendering into our own element also
// keeps Mermaid's temporary elements in one place, so nothing is left in <body> after an error.
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
