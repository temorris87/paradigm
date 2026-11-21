// Draws the maths placeholders left by the Markdown renderer (`.md-math`, TeX source as their
// text) with the vendored KaTeX. The rules come from docs/security/vendor-audit.md:
//   - only katex.render into an element: renderToString's markup carries style="" attributes,
//     which the CSP blocks, and the formula falls apart;
//   - trust stays off (it is the only gate on \href{javascript:...} and friends);
//   - every call is caught, since deep nesting throws even past throwOnError.
// Errors are caught here rather than drawn by KaTeX (throwOnError: true): its error markup
// sets a style attribute, which the CSP refuses with a console message each time.
import katex from "../../vendor/katex-0.19.1/dist/katex.mjs";

export const KATEX_CSS = new URL("../../vendor/katex-0.19.1/dist/katex.min.css", import.meta.url).href;

const OPTIONS = Object.freeze({
  trust: false,
  maxExpand: 1000,
  maxSize: 10,
  strict: "ignore",
  throwOnError: true,
  output: "htmlAndMathml",
});

/** Fill in every maths placeholder under `root` not drawn yet. */
export function typesetMath(root) {
  for (const element of root.querySelectorAll(".md-math:not([data-tex])")) typesetOne(element);
}

function typesetOne(element) {
  element.dataset.tex = element.textContent; // marks it drawn, and keeps the source for copying or errors
  draw(element, OPTIONS.output);
}

function draw(element, output) {
  const tex = element.textContent;
  try {
    katex.render(tex, element, { ...OPTIONS, output, displayMode: element.classList.contains("md-math-display") });
  } catch (error) {
    element.textContent = tex;
    element.classList.add("md-math-error");
    element.title = String(error?.message ?? error);
  }
}

/**
 * Draw one formula as MathML only, for :export (audit condition 5): no styles, no fonts to
 * carry; the reader's browser draws it with its maths font. Errors leave the source, marked.
 */
export function typesetMathML(element) {
  draw(element, "mathml");
}

/**
 * KaTeX's fonts must be declared in the page itself: Chrome ignores @font-face rules inside a
 * shadow root, so a component that draws maths in one calls this as well.
 */
export function ensureMathFonts(doc = document) {
  if (doc.querySelector(`link[data-katex-fonts]`)) return;
  const link = doc.createElement("link");
  link.rel = "stylesheet";
  link.href = KATEX_CSS;
  link.dataset.katexFonts = "";
  doc.head.append(link);
}
