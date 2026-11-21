// The renderer's output goes into the page with innerHTML, so hostile notes must come out
// inert: no tags, no attribute breakouts, no script URLs.
import { assertEqual, assertTrue, test } from "./harness.js";
import { md } from "./markdown-helpers.js";

const p = (html) => `<p>${html}</p>`;

test("markdown safety: HTML in a note is shown, never run", () => {
  assertEqual(md("<script>alert(1)</script>"), p("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assertEqual(md('<img src=x onerror="alert(1)">'), p("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
  assertEqual(md("| <b>x</b> |\n| - |"), "<table>\n<thead>\n<tr><th>&lt;b&gt;x&lt;/b&gt;</th></tr>\n</thead>\n</table>");
});

test("markdown safety: script URLs are refused in every link form", () => {
  assertEqual(md("[x](javascript:alert(1))"), p("x"));
  assertEqual(md("[x](JaVaScRiPt:alert(1))"), p("x"));
  assertEqual(md("[x](vbscript:msgbox)"), p("x"));
  assertEqual(md("[x](data:text/html,hi)"), p("x"));
  assertEqual(md("[x](file:///etc/passwd)"), p("x"));
  assertEqual(md("<javascript:alert(1)>"), p("javascript:alert(1)"));
  assertEqual(md("[x]\n\n[x]: javascript:alert(1)"), p("x"));
  assertEqual(md("![x](javascript:alert(1))"), p("x"));
  assertEqual(md("![x](data:image/png;base64,AAAA)"), p("x"));
  assertEqual(md("![x](mailto:a@b.example)"), p("x"));
});

test("markdown safety: obfuscated schemes cannot slip through", () => {
  // Entities are not decoded, so "&#106;avascript:" stays literal text in the URL.
  const entity = md("[x](&#106;avascript:alert(1))");
  assertTrue(!/href="j/i.test(entity), entity);
  assertEqual(md("[x](<java\tscript:alert(1)>)"), p("x"));
  assertEqual(md("[x](<java\nscript:alert(1)>)"), p("[x](&lt;java<br>\nscript:alert(1)&gt;)"));
  assertEqual(md("[x](\\javascript:alert(1))"), p("x"));
  assertEqual(md("[x](/path:with-colon)"), p('<a href="/path:with-colon">x</a>'));
});

test("markdown safety: attribute values cannot break out", () => {
  assertEqual(md('[x](<a"b> "t\\"q")'), p('<a href="a%22b" title="t&quot;q">x</a>'));
  assertEqual(md("[x](/a 't\"><script>')"), p('<a href="/a" title="t&quot;&gt;&lt;script&gt;">x</a>'));
  assertEqual(md("[[a\" onmouseover=\"x]]"), p('<a class="md-wikilink" data-target="a&quot; onmouseover=&quot;x">a&quot; onmouseover=&quot;x</a>'));
  assertEqual(md('```"><script>\nx\n```'), '<pre><code class="language-&quot;&gt;&lt;script&gt;">x\n</code></pre>');
  assertEqual(md("x[^a]\n\n[^a]: n", { idPrefix: '"><b>' }).includes('id="&quot;&gt;&lt;b&gt;fnref-1"'), true);
});

test("markdown safety: no style attributes anywhere (the CSP forbids them)", () => {
  const html = md("| a | b |\n|:-:|--:|\n| 1 | 2 |\n\n> [!tip]- t\n> x\n\n- [x] t\n\n```js\nx\n```");
  assertTrue(!/\sstyle=/.test(html), html);
});

test("markdown safety: unclosed constructs and odd input do not throw", () => {
  const inputs = ["[", "](", "![", "[[", "``", "**", "> ", "- ", "1.", "|", "[^", "[^1]:", "```", "<", "\0", "\t\t", "\\"];
  for (const input of inputs) md(input);
  assertEqual(md("a\0b"), p("a�b"));
});

test("markdown safety: pathological input stays fast", () => {
  const started = Date.now();
  md("[".repeat(20000));
  md("*a".repeat(20000));
  md("*".repeat(10000) + "a" + "*".repeat(10000));
  md("![".repeat(5000) + "x" + "](u)".repeat(5000));
  md("<a".repeat(10000));
  md("`a``".repeat(5000));
  assertTrue(Date.now() - started < 3000, `took ${Date.now() - started} ms`);
});
