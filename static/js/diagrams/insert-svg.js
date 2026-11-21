// Puts an SVG string from Mermaid into the page under the CSP (docs/security/vendor-audit.md,
// Mermaid condition 2). Mermaid's SVG carries a <style> element and style="" attributes; the
// CSP blocks both when markup goes in through innerHTML. So:
//   - the string is parsed in an inert document (DOMParser: nothing runs, no CSP applies);
//   - <style> text moves into a constructed stylesheet adopted by the page or shadow root;
//   - style attributes are set again through the CSSOM (element.style.cssText), which the CSP
//     allows;
//   - links keep their target only if the Markdown renderer's allowlist passes it, and open in
//     a new tab like every other note link;
//   - each diagram's sheet is kept in step with what is on show by syncDiagramSheets.
import { safeLinkUrl } from "../markdown/urls.js";

const XLINK = "http://www.w3.org/1999/xlink";
const cssBySvg = new WeakMap(); // inserted <svg> -> its CSS
const sheetsByRoot = new WeakMap(); // Document | ShadowRoot -> Map(diagram id -> CSSStyleSheet)

/** Replace `container`'s children with the diagram in `svgText`. Returns the <svg> or null. */
export function insertSvg(container, svgText) {
  const svg = cleanSvg(svgText);
  if (!svg) return null;
  const css = takeStyles(svg);
  const styles = takeStyleAttributes(svg);
  const node = container.ownerDocument.importNode(svg, true);
  restoreStyles(node, styles);
  keepNaturalWidth(node);
  node.setAttribute("data-pd-diagram", "");
  container.replaceChildren(node);
  if (css && node.id) cssBySvg.set(node, css);
  if (container.isConnected) syncDiagramSheets(container.getRootNode());
  return node;
}

/**
 * Mermaid's SVG text parsed in an inert document, with scripts, handlers and unsafe links
 * gone; its <style> and style="" are left alone. Returns the <svg> element or null.
 * :export serialises this as it is: the exported file's own CSP allows inline styles.
 */
export function cleanSvg(svgText) {
  const parsed = new DOMParser().parseFromString(svgText, "text/html");
  const svg = parsed.querySelector("svg");
  if (!svg) return null;
  for (const node of svg.querySelectorAll("script")) node.remove();
  stripHandlers(svg);
  fixLinks(svg);
  return svg;
}

/**
 * Make `root`'s adopted stylesheets match the diagrams in it: a diagram inserted while its
 * node was not yet in the page gets its sheet, and a diagram that went away takes its sheet
 * along. Call after the diagrams under `root` change.
 */
export function syncDiagramSheets(root) {
  if (!root.adoptedStyleSheets) return;
  if (!sheetsByRoot.has(root)) sheetsByRoot.set(root, new Map());
  const sheets = sheetsByRoot.get(root);
  const wanted = new Map(); // the same cached diagram shown twice shares one sheet
  for (const svg of root.querySelectorAll("svg[data-pd-diagram]")) {
    if (cssBySvg.has(svg)) wanted.set(svg.id, cssBySvg.get(svg));
  }
  const stale = new Set();
  for (const [id, sheet] of sheets) {
    if (wanted.has(id)) continue;
    stale.add(sheet);
    sheets.delete(id);
  }
  const added = [];
  for (const [id, css] of wanted) {
    if (sheets.has(id)) continue;
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    sheets.set(id, sheet);
    added.push(sheet);
  }
  if (stale.size || added.length) {
    root.adoptedStyleSheets = [...root.adoptedStyleSheets.filter((sheet) => !stale.has(sheet)), ...added];
  }
}

/** For tests: the ids whose stylesheet is adopted by `root`. */
export function adoptedDiagramIds(root) {
  return [...(sheetsByRoot.get(root)?.keys() ?? [])];
}

function takeStyles(svg) {
  const parts = [];
  for (const style of svg.querySelectorAll("style")) {
    parts.push(style.textContent);
    style.remove();
  }
  return parts.join("\n");
}

// Attributes are read off in the inert document: had they been imported as they are, the CSP
// would refuse each one (and log it).
function takeStyleAttributes(svg) {
  const saved = [];
  for (const element of [svg, ...svg.querySelectorAll("[style]")]) {
    if (!element.hasAttribute("style")) continue;
    saved.push(element.getAttribute("style"));
    element.removeAttribute("style");
    element.setAttribute("data-pd-style", String(saved.length - 1));
  }
  return saved;
}

function restoreStyles(svg, saved) {
  for (const element of [svg, ...svg.querySelectorAll("[data-pd-style]")]) {
    const index = element.getAttribute("data-pd-style");
    if (index === null) continue;
    element.removeAttribute("data-pd-style");
    element.style.cssText = saved[Number(index)];
  }
}

// Mermaid sizes a diagram as width="100%" plus a max-width of its natural width, set as a style
// attribute while it renders, where the CSP blocks it. Without it a small diagram is blown up
// to the full text width; the viewBox gives the natural width back.
function keepNaturalWidth(svg) {
  if (svg.getAttribute("width") !== "100%" || svg.style.maxWidth) return;
  const width = Number(svg.getAttribute("viewBox")?.trim().split(/[\s,]+/)[2]);
  if (width > 0) svg.style.maxWidth = `${width}px`;
}

// Mermaid's sanitising already removes handlers under securityLevel "strict"; this is a
// second line, so a handler that slipped through is gone rather than merely blocked by CSP.
function stripHandlers(svg) {
  for (const element of [svg, ...svg.querySelectorAll("*")]) {
    for (const { name } of [...element.attributes]) {
      if (name.toLowerCase().startsWith("on")) element.removeAttribute(name);
    }
  }
}

function fixLinks(svg) {
  for (const link of svg.querySelectorAll("a")) {
    const raw = link.getAttribute("href") ?? link.getAttributeNS(XLINK, "href") ?? link.getAttribute("xlink:href");
    link.removeAttribute("href");
    link.removeAttributeNS(XLINK, "href");
    link.removeAttribute("xlink:href");
    link.removeAttribute("target");
    const url = raw === null ? null : safeLinkUrl(raw.trim());
    if (url === null || url.startsWith("#")) continue;
    link.setAttribute("href", url);
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
    link.setAttribute("tabindex", "-1");
  }
}
