// One focus ring (static/CLAUDE.md "Look"): every :focus-visible rule in the windows' CSS
// draws either the control ring (outline 2px --border-focus, offset 1px, or -2px inside a box
// that scrolls) or a list row's inset --focus-ring, or leaves both to the shared rule.
import { assertEqual, assertTrue, test } from "./harness.js";

const CONTROL_RING = "2px solid var(--border-focus)";
const OFFSETS = new Set(["1px", "-2px"]);
const ROW_RING = "inset 0 0 0 1px var(--focus-ring)";

const squeeze = (text) => text.trim().replace(/\s+/g, " ").replace(/\b0px\b/g, "0");

/** The stylesheets index.html and note.html load, as paths from this page. */
async function windowSheets() {
  const files = new Set();
  for (const page of ["index.html", "note.html"]) {
    const html = await (await fetch(`../../static/${page}`)).text();
    for (const [, href] of html.matchAll(/<link rel="stylesheet" href="\/(css\/[^"]+)">/g)) files.add(href);
  }
  return [...files];
}

function styleRules(rules) {
  return [...rules].flatMap((rule) => (rule.cssRules && !rule.style ? styleRules(rule.cssRules) : rule.style ? [rule] : []));
}

/** What is wrong with a :focus-visible rule's ring, or "" when it is one of the two. */
function ringProblem(style) {
  const outline = squeeze(style.getPropertyValue("outline"));
  const outlineStyle = style.getPropertyValue("outline-style");
  const offset = squeeze(style.getPropertyValue("outline-offset"));
  const shadow = squeeze(style.getPropertyValue("box-shadow"));
  const hasOutline = Boolean(outline || outlineStyle || style.getPropertyValue("outline-width") || style.getPropertyValue("outline-color"));
  if (shadow && shadow !== ROW_RING) return `box-shadow ${shadow}`;
  if (!hasOutline) return offset ? `outline-offset ${offset} with no outline` : "";
  if (outlineStyle === "none" || outline === "none") return shadow === ROW_RING ? "" : "outline: none with no row ring";
  if (outline !== CONTROL_RING) return `outline ${outline || "longhands"}`;
  if (!OFFSETS.has(offset)) return `outline-offset ${offset || "unset"}`;
  return "";
}

test("focus ring: the checker takes the two rings and nothing else", () => {
  const style = (text) => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(`a:focus-visible { ${text} }`);
    return sheet.cssRules[0].style;
  };
  assertEqual(ringProblem(style("outline: 2px solid var(--border-focus); outline-offset: 1px;")), "");
  assertEqual(ringProblem(style("outline: 2px solid var(--border-focus); outline-offset: -2px;")), "");
  assertEqual(ringProblem(style("outline: none; box-shadow: inset 0 0 0 1px var(--focus-ring);")), "");
  assertEqual(ringProblem(style("color: var(--link); border-color: var(--border-focus);")), "");
  assertTrue(ringProblem(style("outline: 1px solid var(--focus-ring);")) !== "");
  assertTrue(ringProblem(style("outline: 2px solid var(--border-focus); outline-offset: 0;")) !== "");
  assertTrue(ringProblem(style("box-shadow: 0 0 0 1px var(--focus-ring);")) !== "");
  assertTrue(ringProblem(style("outline: none;")) !== "");
});

test("focus ring: every :focus-visible rule in the app's CSS is one of the two rings", async () => {
  const files = await windowSheets();
  assertTrue(files.includes("css/base.css") && files.length > 20, "found the stylesheets");
  const problems = [];
  let rules = 0;
  for (const file of files) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(await (await fetch(`../../static/${file}`)).text());
    for (const rule of styleRules(sheet.cssRules)) {
      if (!rule.selectorText?.includes(":focus-visible")) continue;
      rules += 1;
      const problem = ringProblem(rule.style);
      if (problem) problems.push(`${file}: ${rule.selectorText}: ${problem}`);
    }
  }
  assertTrue(rules > 30, `read the rules (${rules})`);
  assertEqual(problems.join("\n"), "");
});
