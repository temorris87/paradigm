// The exported file around the notes' HTML, drawn with the theme its CSS holds. Pure.
//
// Its own CSP forbids scripts and anything from outside: images come only as data: URLs,
// styles only from the <style> in the file (and the diagrams' own). So even opened from
// disk, nothing in the file can run or call out.
import { escapeHtml } from "../markdown/escape.js";
import { DEFAULT_THEME } from "../theme/themes.js";

export const EXPORT_CSP = [
  "default-src 'none'",
  "img-src data:",
  "style-src 'unsafe-inline'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

export function buildPage({ title, css, content, theme = DEFAULT_THEME }) {
  // Our own stylesheets, but never let one end the <style> element early.
  const style = css.replace(/<\/style/gi, "<\\/style");
  return `<!DOCTYPE html>
<html lang="en" data-theme="${escapeHtml(theme)}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${escapeHtml(EXPORT_CSP)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Paradigm">
<title>${escapeHtml(title)}</title>
<style>
${style}
</style>
</head>
<body>
<main class="export">
${content}</main>
</body>
</html>
`;
}
