// KaTeX drawing the Markdown renderer's maths placeholders, in a real page. (This runner has no
// CSP; the CSP check is done in the app itself, see CLAUDE.md "Testing".)
import { renderMarkdown } from "../../static/js/markdown/index.js";
import { KATEX_CSS, MAX_TEX_NESTING, ensureMathFonts, texNestingDepth, typesetMath } from "../../static/js/math/typeset.js";
import { assertEqual, assertTrue, test } from "./harness.js";

function draw(markdown) {
  const box = document.createElement("div");
  box.innerHTML = renderMarkdown(markdown);
  typesetMath(box);
  return box;
}

test("math typeset: inline and display maths are drawn by KaTeX", () => {
  const box = draw("Let $\\frac{a}{b}$ be.\n\n$$\n\\sum_{i=1}^n i\n$$");
  const [inline, display] = box.querySelectorAll(".md-math");
  assertTrue(inline.querySelector(".katex") !== null, "inline drawn");
  assertTrue(inline.querySelector(".katex-display") === null, "inline is not display");
  assertTrue(display.querySelector(".katex-display") !== null, "display drawn");
  assertTrue(display.querySelector("math") !== null, "MathML for screen readers");
  assertEqual(inline.dataset.tex, "\\frac{a}{b}");
});

test("math typeset: each placeholder is drawn once", () => {
  const box = draw("$x$");
  const drawn = box.querySelector(".katex");
  typesetMath(box);
  assertTrue(box.querySelector(".katex") === drawn);
});

test("math typeset: a parse error shows the source, marked as an error", () => {
  const box = draw("$\\frac{a$");
  const math = box.querySelector(".md-math");
  assertTrue(math.classList.contains("md-math-error"));
  assertEqual(math.textContent, "\\frac{a");
  assertTrue(math.title.includes("KaTeX"), math.title);
});

test("math typeset: too deep nesting falls back without throwing", () => {
  const box = draw(`$${"{".repeat(3000)}x${"}".repeat(3000)}$`);
  assertTrue(box.querySelector(".md-math").classList.contains("md-math-error"));
});

test("math typeset: nesting up to the cap is drawn, one past it falls back", () => {
  const nested = (n) => `$${"{".repeat(n)}x${"}".repeat(n)}$`;
  const ok = draw(nested(MAX_TEX_NESTING)).querySelector(".md-math");
  assertTrue(ok.querySelector(".katex") !== null, "drawn at the cap");
  const deep = draw(nested(MAX_TEX_NESTING + 1)).querySelector(".md-math");
  assertTrue(deep.classList.contains("md-math-error"), "refused past the cap");
});

test("math typeset: texNestingDepth counts groups and \\left, not escaped braces", () => {
  assertEqual(texNestingDepth("x"), 0);
  assertEqual(texNestingDepth("\\frac{a}{b^{2}}"), 2);
  assertEqual(texNestingDepth("\\{\\{\\{x\\}\\}\\}"), 0);
  assertEqual(texNestingDepth("\\left( \\left[ x \\right] \\right)"), 2);
  assertEqual(texNestingDepth("a \\leftarrow b \\rightarrow c \\leftrightarrow d"), 0);
});

test("math typeset: hostile commands make no links, images or attributes", () => {
  const box = draw(
    "$\\href{javascript:alert(1)}{x}$ $\\url{javascript:alert(1)}$ $\\includegraphics{https://example.com/a.png}$ " +
      "$\\htmlClass{evil}{x}$ $\\htmlId{evil}{x}$ $\\htmlData{x=1}{y}$ $\\text{<img src=x onerror=alert(1)>}$",
  );
  assertEqual(box.querySelectorAll("a, img, [href], [src], .evil, #evil, [data-x], [onerror]").length, 0);
});

test("math typeset: huge sizes are capped by maxSize", () => {
  const box = draw("$\\rule{100000em}{100000em}$");
  document.body.append(box);
  try {
    assertTrue(box.getBoundingClientRect().height < 400, `height ${box.getBoundingClientRect().height}`);
  } finally {
    box.remove();
  }
});

test("math typeset: the fonts stylesheet is added to the page once", () => {
  ensureMathFonts();
  ensureMathFonts();
  const links = [...document.head.querySelectorAll("link[data-katex-fonts]")];
  assertEqual(links.length, 1);
  assertEqual(links[0].href, KATEX_CSS);
});
