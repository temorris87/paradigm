import { parseMarkdown } from "../../static/js/markdown/index.js";
import { assertEqual, test } from "./harness.js";
import { md } from "./markdown-helpers.js";

const inline = (tex) => `<span class="md-math">${tex}</span>`;
const display = (tex) => `<span class="md-math md-math-display">${tex}</span>`;
const block = (tex) => `<div class="md-math md-math-display">${tex}</div>`;

test("markdown math: inline $...$", () => {
  assertEqual(md("Let $x^2 + y^2$ be."), `<p>Let ${inline("x^2 + y^2")} be.</p>`);
  assertEqual(md("$a$"), `<p>${inline("a")}</p>`);
  assertEqual(md("$a$ and $b$"), `<p>${inline("a")} and ${inline("b")}</p>`);
});

test("markdown math: prices and loose dollars stay text", () => {
  assertEqual(md("costs $5 and $10"), "<p>costs $5 and $10</p>");
  assertEqual(md("$ x$"), "<p>$ x$</p>"); // a space after the opener
  assertEqual(md("$x $"), "<p>$x $</p>"); // a space before the closer
  assertEqual(md("$x$5"), "<p>$x$5</p>"); // a digit after the closer
  assertEqual(md("one $ alone"), "<p>one $ alone</p>");
  assertEqual(md("one $$ alone"), "<p>one $$ alone</p>");
});

test("markdown math: \\$ is a dollar sign, and \\$ inside maths does not end it", () => {
  assertEqual(md("\\$x$"), "<p>$x$</p>");
  assertEqual(md("$a\\$b$"), `<p>${inline("a\\$b")}</p>`);
});

test("markdown math: no Markdown inside maths; code spans win", () => {
  assertEqual(md("$a_1*b_2*c$"), `<p>${inline("a_1*b_2*c")}</p>`);
  assertEqual(md("$[x](y)$"), `<p>${inline("[x](y)")}</p>`);
  assertEqual(md("`$x$`"), "<p><code>$x$</code></p>");
});

test("markdown math: inline $$...$$ is display maths", () => {
  assertEqual(md("see $$\\sum_i x_i$$ here"), `<p>see ${display("\\sum_i x_i")} here</p>`);
  assertEqual(md("a $$x$ y"), "<p>a $$x$ y</p>"); // an unclosed $$ cannot become $x$
});

test("markdown math: TeX is escaped", () => {
  assertEqual(md('$<img src=x onerror="a">$'), `<p>${inline("&lt;img src=x onerror=&quot;a&quot;&gt;")}</p>`);
  assertEqual(md("$$\n</div><script>\n$$"), block("&lt;/div&gt;&lt;script&gt;"));
});

test("markdown math: $$ blocks", () => {
  assertEqual(md("$$\n\\frac{a}{b}\n$$"), block("\\frac{a}{b}"));
  assertEqual(md("$$ x = 1 $$"), block("x = 1"));
  assertEqual(md("$$a\nb$$"), block("a\nb"));
  assertEqual(md("$$\na\n\nb\n$$\nafter"), `${block("a\n\nb")}\n<p>after</p>`);
  assertEqual(md("text\n$$\nx\n$$"), `<p>text</p>\n${block("x")}`); // interrupts a paragraph
  assertEqual(md("$$x$$ and more"), `<p>${display("x")} and more</p>`);
  assertEqual(md("    $$\n    x\n    $$"), "<pre><code>$$\nx\n$$\n</code></pre>"); // indented code
});

test("markdown math: an unclosed $$ runs to the end of its container", () => {
  assertEqual(md("$$\na\n\n# b"), block("a\n\n# b"));
  assertEqual(md("$$"), block(""));
  assertEqual(md("> $$\n> a\n\nafter"), `<blockquote>\n${block("a")}\n</blockquote>\n<p>after</p>`);
});

test("markdown math: blocks inside lists and quotes", () => {
  assertEqual(md("> $$\n> x\n> $$"), `<blockquote>\n${block("x")}\n</blockquote>`);
  assertEqual(md("- a\n  $$\n  x\n\n  y\n  $$\n- b"), `<ul>\n<li>a\n${block("x\n\ny")}\n</li>\n<li>b</li>\n</ul>`);
});

test("markdown math: blocks record their source lines", () => {
  const doc = parseMarkdown("intro\n\n$$\nx\n\ny\n$$\nafter\n\n$$ z $$");
  const lines = doc.blocks.map((b) => [b.type, b.startLine, b.endLine]);
  assertEqual(JSON.stringify(lines), JSON.stringify([["paragraph", 0, 0], ["math", 2, 6], ["paragraph", 7, 7], ["math", 9, 9]]));
});

test("markdown math: heading ids use the TeX", () => {
  assertEqual(md("# Area $r^2$"), `<h1 id="md-area-r2">Area ${inline("r^2")}</h1>`);
});
