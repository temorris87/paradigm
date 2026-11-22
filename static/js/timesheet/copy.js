// The week's grid as clipboard text: an HTML table (Outlook, Teams, Word) and tab-separated
// text (Excel, a timesheet web form). Pure, except copyGrid, which writes the clipboard.
//
//   gridRows(report)        [[cells]]: the header, a row per code, the totals
//   gridText(report)        tab-separated lines
//   gridHtml(report)        a <table>
import { dateOf } from "../meetings/meeting-days.js";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function dayHeading(day) {
  const date = dateOf(day);
  return `${WEEKDAYS[date.getDay()]} ${date.getMonth() + 1}/${date.getDate()}`;
}

export function hoursText(hours) {
  return hours ? hours.toFixed(2) : "";
}

export function gridRows(report) {
  return [
    ["Code", ...report.days.map(dayHeading), "Total"],
    ...report.rows.map((row) => [row.code, ...row.hours.map(hoursText), row.total.toFixed(2)]),
    ["Total", ...report.totals.map((hours) => hours.toFixed(2)), report.total.toFixed(2)],
  ];
}

export function gridText(report) {
  return `${gridRows(report).map((cells) => cells.join("\t")).join("\n")}\n`;
}

export function gridHtml(report) {
  const escape = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const [head, ...rows] = gridRows(report);
  const cell = (tag, text, index) => `<${tag}${index ? ' align="right"' : ""}>${escape(text)}</${tag}>`;
  return `<table border="1" cellspacing="0" cellpadding="4"><thead><tr>${head.map((text, index) => cell("th", text, index)).join("")}</tr></thead>`
    + `<tbody>${rows.map((cells) => `<tr>${cells.map((text, index) => cell("td", text, index)).join("")}</tr>`).join("")}</tbody></table>`;
}

export async function copyGrid(report, clipboard = navigator.clipboard) {
  const text = gridText(report);
  if (typeof ClipboardItem === "function" && clipboard?.write) {
    await clipboard.write([new ClipboardItem({
      "text/html": new Blob([gridHtml(report)], { type: "text/html" }),
      "text/plain": new Blob([text], { type: "text/plain" }),
    })]);
  } else {
    await clipboard.writeText(text);
  }
}
