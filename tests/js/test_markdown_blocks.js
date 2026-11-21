import { parseMarkdown, renderBlocks } from "../../static/js/markdown/index.js";
import { assertEqual, test } from "./harness.js";
import { md } from "./markdown-helpers.js";

test("markdown blocks: ATX and setext headings get ids", () => {
  assertEqual(md("# One"), '<h1 id="md-one">One</h1>');
  assertEqual(md("### Three ###"), '<h3 id="md-three">Three</h3>');
  assertEqual(md("#nospace"), "<p>#nospace</p>");
  assertEqual(md("Big\n==="), '<h1 id="md-big">Big</h1>');
  assertEqual(md("Small\n---"), '<h2 id="md-small">Small</h2>');
  assertEqual(md("# Same\n# Same"), '<h1 id="md-same">Same</h1>\n<h1 id="md-same-1">Same</h1>');
  assertEqual(md("# A *b*", { idPrefix: "n1-" }), '<h1 id="n1-a-b">A <em>b</em></h1>');
});

test("markdown blocks: paragraphs, single newlines as line breaks", () => {
  assertEqual(md("one\ntwo\n\nthree"), "<p>one<br>\ntwo</p>\n<p>three</p>");
  assertEqual(md("one\ntwo", { breaks: false }), "<p>one\ntwo</p>");
  assertEqual(md("hard  \nbreak", { breaks: false }), "<p>hard<br>\nbreak</p>");
  assertEqual(md("back\\\nslash", { breaks: false }), "<p>back<br>\nslash</p>");
});

test("markdown blocks: thematic breaks", () => {
  assertEqual(md("***\n---\n_ _ _"), "<hr>\n<hr>\n<hr>");
  assertEqual(md("- - -"), "<hr>");
});

test("markdown blocks: fenced and indented code", () => {
  assertEqual(md("```js\nlet a = 1 < 2;\n```"), '<pre><code class="language-js">let a = 1 &lt; 2;\n</code></pre>');
  assertEqual(md("~~~\n```\n~~~"), "<pre><code>```\n</code></pre>");
  assertEqual(md("```\nunclosed"), "<pre><code>unclosed\n</code></pre>");
  assertEqual(md("    code\n\n    more"), "<pre><code>code\n\nmore\n</code></pre>");
  assertEqual(md("```mermaid\ngraph TD\n```"), '<pre><code class="language-mermaid">graph TD\n</code></pre>');
});

test("markdown blocks: block quotes, nested and lazy", () => {
  assertEqual(md("> a\nlazy"), "<blockquote>\n<p>a<br>\nlazy</p>\n</blockquote>");
  assertEqual(md("> a\n>> b"), "<blockquote>\n<p>a</p>\n<blockquote>\n<p>b</p>\n</blockquote>\n</blockquote>");
  assertEqual(md("> # H"), '<blockquote>\n<h1 id="md-h">H</h1>\n</blockquote>');
});

test("markdown blocks: bullet and ordered lists", () => {
  assertEqual(md("- a\n- b"), "<ul>\n<li>a</li>\n<li>b</li>\n</ul>");
  assertEqual(md("3. a\n4. b"), '<ol start="3">\n<li>a</li>\n<li>b</li>\n</ol>');
  assertEqual(md("1) a"), "<ol>\n<li>a</li>\n</ol>");
  assertEqual(md("- a\n+ b"), "<ul>\n<li>a</li>\n</ul>\n<ul>\n<li>b</li>\n</ul>");
  assertEqual(md("- a\n  - b\n- c"), "<ul>\n<li>a\n<ul>\n<li>b</li>\n</ul>\n</li>\n<li>c</li>\n</ul>");
  assertEqual(md("- a\n\n- b"), "<ul>\n<li>\n<p>a</p>\n</li>\n<li>\n<p>b</p>\n</li>\n</ul>");
  assertEqual(md("- a\n\n  more"), "<ul>\n<li>\n<p>a</p>\n<p>more</p>\n</li>\n</ul>");
  // Only "1." can interrupt a paragraph, so a number in running text stays text.
  assertEqual(md("year\n2024. was good"), "<p>year<br>\n2024. was good</p>");
});

test("markdown blocks: tabs count to the next multiple of 4 columns", () => {
  assertEqual(md("\tcode"), "<pre><code>code\n</code></pre>");
  assertEqual(md("-\tfoo\n\n\tbar"), "<ul>\n<li>\n<p>foo</p>\n<p>bar</p>\n</li>\n</ul>");
});

test("markdown blocks: link reference definitions are used and not shown", () => {
  assertEqual(md("[Acme]\n\n[acme]: https://acme.example 'Home'"),
    '<p><a href="https://acme.example" title="Home" target="_blank" rel="noopener noreferrer">Acme</a></p>');
  assertEqual(md("[a]: /one\n[a]: /two\n\n[a]"), '<p><a href="/one">a</a></p>');
});

test("markdown blocks: Windows line endings", () => {
  assertEqual(md("# T\r\n\r\npara\r\nnext"), '<h1 id="md-t">T</h1>\n<p>para<br>\nnext</p>');
});

test("markdown blocks: empty input", () => {
  assertEqual(md(""), "");
  assertEqual(md("\n\n  \n"), "");
});

test("markdown blocks: renderBlocks maps each top-level block to its source lines", () => {
  const source = "# T\n\npara\nmore\n\n- a\n\n  b\n\n```\nx\n\n```\n> q\nlazy\n\n| a |\n| - |\n| 1 |";
  const { blocks } = renderBlocks(parseMarkdown(source));
  const ranges = blocks.map((block) => `${block.startLine}-${block.endLine}`).join(" ");
  assertEqual(ranges, "0-0 2-3 5-7 9-12 13-14 16-18");
  assertEqual(blocks[1].html, "<p>para<br>\nmore</p>");
});

test("markdown blocks: a table under a paragraph splits it", () => {
  const { blocks } = renderBlocks(parseMarkdown("intro\na | b\n- | -\n1 | 2"));
  assertEqual(blocks.map((block) => `${block.startLine}-${block.endLine}`).join(" "), "0-0 1-3");
  assertEqual(blocks[0].html, "<p>intro</p>");
});

test("markdown blocks: parseMarkdown returns plain data", () => {
  const doc = parseMarkdown("> - a\n\n# H");
  JSON.stringify(doc.blocks); // no parent cycles left
  assertEqual(doc.blocks[0].children[0].type, "list");
  assertEqual(doc.blocks[1].id, "h");
});

test("markdown blocks: very deep nesting stops nesting instead of overflowing", () => {
  const html = md(`${">".repeat(500)} deep`);
  assertEqual((html.match(/<blockquote>/g) || []).length, 50);
  const list = Array.from({ length: 200 }, (_, i) => `${" ".repeat(i * 2)}- x`).join("\n");
  assertEqual(md(list).startsWith("<ul>"), true);
});
