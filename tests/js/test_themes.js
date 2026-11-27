// The theme table (js/theme/themes.js): its rows, the fallback to the default, and the
// <html data-theme> attribute that picks a theme's tokens.
import { mermaidConfig } from "../../static/js/diagrams/mermaid.js";
import { buildPage } from "../../static/js/export/page.js";
import { applyTheme, currentTheme, DEFAULT_THEME, themeOf, THEMES } from "../../static/js/theme/themes.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const tokenNames = (css) => new Set([...css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1])
  .filter((name) => !/^--nord\d+$/.test(name)));

async function readCss(path) {
  const response = await fetch(new URL(`../../static/${path}`, import.meta.url));
  assertTrue(response.ok, `${path} loads`);
  return response.text();
}

test("themes: one row per theme, ids unique, the default among them", () => {
  assertEqual(THEMES.map((theme) => theme.id).join(), "nord-dark");
  assertEqual(new Set(THEMES.map((theme) => theme.id)).size, THEMES.length, "unique ids");
  assertEqual(DEFAULT_THEME, "nord-dark");
  const dark = themeOf("nord-dark");
  assertEqual(dark.label, "Nord Dark");
  assertEqual(dark.file, "css/themes/nord-dark.css");
  assertEqual(dark.colorScheme, "dark");
});

test("themes: an unknown or missing id means the default", () => {
  assertEqual(themeOf("sepia").id, DEFAULT_THEME);
  assertEqual(themeOf(undefined).id, DEFAULT_THEME);
  const root = document.createElement("html");
  assertEqual(currentTheme(root), DEFAULT_THEME, "no attribute");
  root.dataset.theme = "sepia";
  assertEqual(currentTheme(root), DEFAULT_THEME, "unknown attribute");
});

test("themes: applyTheme sets <html data-theme>, which currentTheme reads back", () => {
  const root = document.createElement("html");
  assertEqual(applyTheme("nord-dark", root), "nord-dark");
  assertEqual(root.getAttribute("data-theme"), "nord-dark");
  assertEqual(currentTheme(root), "nord-dark");
  assertEqual(applyTheme("sepia", root), DEFAULT_THEME, "unknown falls back");
  assertEqual(root.getAttribute("data-theme"), DEFAULT_THEME);
});

test("themes: every theme file sets exactly the template's tokens under its own id", async () => {
  const template = tokenNames(await readCss("css/themes/_template.css"));
  assertTrue(template.size > 50, "the template lists the role tokens");
  for (const theme of THEMES) {
    const css = await readCss(theme.file);
    assertTrue(css.includes(`:root[data-theme="${theme.id}"]`), `${theme.id}: its selector`);
    assertTrue(css.includes(`color-scheme: ${theme.colorScheme}`), `${theme.id}: its color-scheme`);
    const names = tokenNames(css);
    const missing = [...template].filter((name) => !names.has(name));
    const extra = [...names].filter((name) => !template.has(name));
    assertEqual(missing.join(), "", `${theme.id}: missing`);
    assertEqual(extra.join(), "", `${theme.id}: not in the template`);
  }
});

test("themes: Mermaid's dark mode and the export's <html> follow the theme", () => {
  assertEqual(mermaidConfig(() => "", true).themeVariables.darkMode, true);
  assertEqual(mermaidConfig(() => "", false).themeVariables.darkMode, false);
  const asked = [];
  mermaidConfig((name) => { asked.push(name); return ""; }, true);
  assertTrue(asked.length > 0 && asked.every((name) => !/^--nord\d/.test(name)), "role tokens only");
  assertTrue(buildPage({ title: "t", css: "", content: "" }).includes(`data-theme="${DEFAULT_THEME}"`), "default");
  assertTrue(buildPage({ title: "t", css: "", content: "", theme: "nord-dark" }).includes('data-theme="nord-dark"'));
});

test("themes: the export keeps the browser's default color-scheme whatever the theme", async () => {
  // export.css comes after the theme in the file, so its :root[data-theme] rule wins.
  const css = await readCss("css/export.css");
  assertTrue(/:root\[data-theme\]\s*\{[^}]*color-scheme:\s*normal/.test(css), "color-scheme: normal");
});
