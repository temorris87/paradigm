import { assertEqual, test } from "./harness.js";
import { md } from "./markdown-helpers.js";

const p = (html) => `<p>${html}</p>`;

test("markdown inline: emphasis follows the CommonMark rules", () => {
  assertEqual(md("*em* _em_ **strong** __strong__"), p("<em>em</em> <em>em</em> <strong>strong</strong> <strong>strong</strong>"));
  assertEqual(md("***both***"), p("<em><strong>both</strong></em>"));
  assertEqual(md("snake_case_name"), p("snake_case_name"));
  assertEqual(md("2 * 3 * 4"), p("2 * 3 * 4"));
  assertEqual(md("in*word*s"), p("in<em>word</em>s"));
  assertEqual(md("*foo**bar**baz*"), p("<em>foo<strong>bar</strong>baz</em>"));
  assertEqual(md("**unclosed"), p("**unclosed"));
  assertEqual(md("*a _b* c_"), p("<em>a _b</em> c_"));
});

test("markdown inline: strikethrough and highlight need exactly two", () => {
  assertEqual(md("~~gone~~ ==marked=="), p("<del>gone</del> <mark>marked</mark>"));
  assertEqual(md("~one~ =one= a == b"), p("~one~ =one= a == b"));
  assertEqual(md("==**both**=="), p("<mark><strong>both</strong></mark>"));
});

test("markdown inline: code spans", () => {
  assertEqual(md("`a < b`"), p("<code>a &lt; b</code>"));
  assertEqual(md("`` a ` b ``"), p("<code>a ` b</code>"));
  assertEqual(md("`**not bold**`"), p("<code>**not bold**</code>"));
  assertEqual(md("`unclosed"), p("`unclosed"));
});

test("markdown inline: backslash escapes", () => {
  assertEqual(md("\\*not em\\*"), p("*not em*"));
  assertEqual(md("\\[not link\\]"), p("[not link]"));
  assertEqual(md("a\\b"), p("a\\b"));
});

test("markdown inline: links, titles and references", () => {
  assertEqual(md("[a](/path)"), p('<a href="/path">a</a>'));
  assertEqual(md('[a](https://x.example "T")'), p('<a href="https://x.example" title="T" target="_blank" rel="noopener noreferrer">a</a>'));
  assertEqual(md("[a](<with space>)"), p('<a href="with%20space">a</a>'));
  assertEqual(md("[a](#heading)"), p('<a href="#heading">a</a>'));
  assertEqual(md("[a](mailto:x@acme.example)"), p('<a href="mailto:x@acme.example">a</a>'));
  assertEqual(md("[*em* link](/u)"), p('<a href="/u"><em>em</em> link</a>'));
  assertEqual(md("[x][ref] [ref][] [ref]\n\n[ref]: /r"), p('<a href="/r">x</a> <a href="/r">ref</a> <a href="/r">ref</a>'));
  assertEqual(md("[no ref]"), p("[no ref]"));
  assertEqual(md("[a [b](/in)](/out)"), p('[a <a href="/in">b</a>](/out)'));
});

test("markdown inline: images", () => {
  assertEqual(md('![alt *text*](/i.png "T")'), p('<img src="/i.png" alt="alt text" title="T">'));
});

test("markdown inline: autolinks and bare URLs", () => {
  const ext = 'target="_blank" rel="noopener noreferrer"';
  assertEqual(md("<https://acme.example/a>"), p(`<a href="https://acme.example/a" ${ext}>https://acme.example/a</a>`));
  assertEqual(md("<pat@acme.example>"), p('<a href="mailto:pat@acme.example">pat@acme.example</a>'));
  assertEqual(md("see https://acme.example/a."), p(`see <a href="https://acme.example/a" ${ext}>https://acme.example/a</a>.`));
  assertEqual(md("(www.acme.example)"), p(`(<a href="http://www.acme.example" ${ext}>www.acme.example</a>)`));
  assertEqual(md("https://w.example/a_(b)"), p(`<a href="https://w.example/a_(b)" ${ext}>https://w.example/a_(b)</a>`));
  assertEqual(md("`https://not.linked`"), p("<code>https://not.linked</code>"));
  assertEqual(md("nohttps://x.example"), p("nohttps://x.example"));
});

test("markdown inline: raw HTML, entities and emoji shortcodes stay text", () => {
  assertEqual(md("<b>bold</b>"), p("&lt;b&gt;bold&lt;/b&gt;"));
  assertEqual(md("&copy; &amp; &#169;"), p("&amp;copy; &amp;amp; &amp;#169;"));
  assertEqual(md(":smile:"), p(":smile:"));
  assertEqual(md("a < b > c"), p("a &lt; b &gt; c"));
});
