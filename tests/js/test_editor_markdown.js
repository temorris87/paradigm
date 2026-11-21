import { fenceStateAt, tokenizeLine } from "../../static/js/editor/markdown-tokens.js";
import { assertEqual, test } from "./harness.js";

function classes(text, fence = null) {
  return tokenizeLine(text, fence).tokens.map(({ from, to, cls }) => `${cls}:${text.slice(from, to)}`).join(" | ");
}

test("markdown: headings get a class per level", () => {
  assertEqual(classes("# One"), "md-h1:# One");
  assertEqual(classes("### Three"), "md-h3:### Three");
  assertEqual(classes("###### Six"), "md-h6:###### Six");
  assertEqual(classes("#hashtag"), "");
  assertEqual(classes("####### seven"), "");
});

test("markdown: links, bare URLs and inline code", () => {
  assertEqual(classes("see [the site](http://example.com) now"), "md-link:[the site](http://example.com)");
  assertEqual(classes("at https://example.com/a."), "md-link:https://example.com/a");
  assertEqual(classes("run `[x](y)` here"), "md-code:`[x](y)`");
});

test("markdown: emphasis", () => {
  assertEqual(classes("a **bold** b"), "md-bold:**bold**");
  assertEqual(classes("an *em* and _em_"), "md-italic:*em* | md-italic:_em_");
  assertEqual(classes("snake_case_name"), "");
  assertEqual(classes("2 * 3 * 4"), "");
});

test("markdown: lists, tasks and quotes", () => {
  assertEqual(classes("  - item"), "md-list:-");
  assertEqual(classes("1. first"), "md-list:1.");
  assertEqual(classes("- [ ] todo"), "md-list:- | md-task:[ ]");
  assertEqual(classes("- [x] done"), "md-list:- | md-task-done:[x]");
  assertEqual(classes("> quoted"), "md-quote:> quoted | md-quote-mark:> ");
  assertEqual(classes("---"), "md-hr:---");
});

test("markdown: code fences switch the state", () => {
  const open = tokenizeLine("```js", null);
  assertEqual(open.fence, "code");
  assertEqual(classes("# not a heading", "code"), "md-code-block:# not a heading");
  assertEqual(classes("$$", "code"), "md-code-block:$$");
  assertEqual(tokenizeLine("```", "code").fence, null);
  assertEqual(fenceStateAt(["a", "```", "b", "```", "c"], 2), "code");
  assertEqual(fenceStateAt(["a", "```", "b", "```", "c"], 4), null);
});

test("markdown: maths blocks switch the state", () => {
  assertEqual(tokenizeLine("$$", null).fence, "math");
  assertEqual(tokenizeLine("$$ x = 1 $$", null).fence, null);
  assertEqual(tokenizeLine("> $$", null).fence, "math");
  assertEqual(classes("# a*b*", "math"), "md-math:# a*b*");
  assertEqual(classes("```", "math"), "md-math:```");
  assertEqual(tokenizeLine("x $$", "math").fence, null);
  assertEqual(fenceStateAt(["$$", "x", "$$", "y"], 1), "math");
  assertEqual(fenceStateAt(["$$", "x", "$$", "y"], 3), null);
  assertEqual(tokenizeLine("$$x$$ and more", null).fence, null);
});

test("markdown: inline maths, with no other colour inside it", () => {
  assertEqual(classes("let $a*b*c$ be"), "md-math:$a*b*c$");
  assertEqual(classes("see $$x$$ here"), "md-math:$$x$$");
  assertEqual(classes("costs $5 and $10"), "");
  assertEqual(classes("`$x$` and \\$y$"), "md-code:`$x$`");
});
