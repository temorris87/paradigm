// A table copied out for other programs: HTML for Word, Outlook and Teams (a bordered table,
// the header bold, each column aligned as in the note) with tab-separated text beside it for
// Excel. This HTML goes only to the clipboard, never into the page, so its inline styles
// are outside the CSP's reach.
//
//   tableClip(lines) -> { html, text, columns, rows }
import { renderMarkdown } from "../markdown/index.js";
import { alignTable, cellsOf, isSeparatorRow, visibleText } from "./tables.js";

const TABLE_STYLE = "border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt";
const CELL_STYLE = "border:1px solid #808080;padding:2pt 6pt;vertical-align:top";
const ALIGN = { left: "left", center: "center", right: "right" };

export function tableClip(lines) {
  const aligned = alignTable(lines);
  const withSeparator = aligned.some(isSeparatorRow) ? aligned
    : [aligned[0], `|${"---|".repeat(cellsOf(aligned[0]).length)}`, ...aligned.slice(1)];
  const rows = aligned.filter((line) => !isSeparatorRow(line)).map((line) => cellsOf(line).map(visibleText));
  const text = rows.map((cells) => cells.join("\t")).join("\n");
  // Wiki links and mentions mean nothing outside the app: they go out as their words.
  const rendered = renderMarkdown(withSeparator.join("\n"), { resolveWikiLink: () => ({ plain: true }), breaks: false });
  return { html: styled(rendered), text, columns: rows[0]?.length ?? 0, rows: rows.length };
}

function styled(html) {
  return html
    .replace("<table>", `<table border="1" cellspacing="0" style="${TABLE_STYLE}">`)
    .replace(/<(th|td)( class="md-align-(left|center|right)")?>/g,
      (_, tag, cls, align) => `<${tag} style="${CELL_STYLE}${align ? `;text-align:${ALIGN[align]}` : tag === "th" ? ";text-align:left" : ""}">`)
    .trim();
}
