// The on-call sheet as Excel copies it: a header row ("Role", then one date per week) and a
// row per role holding who is on call each week. parseSheet reads it into the weeks to save;
// each column is the week (Monday to Sunday) holding its date. Pure.
//
//   parseSheet(text, today) -> { weeks: [{ week, roles: [{ role, name }] }], roles: [role],
//                                skipped: [header text], problem: "" | why nothing can be saved }
//   headerDay(text, today)  -> "YYYY-MM-DD" | null
import { cellsFromPaste } from "../editor/table-paste.js";
import { weekOf } from "../calendar/week-model.js";
import { dateOf, localDay } from "../meetings/meeting-days.js";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
// Words a sheet may put before the date: "Week of 11/23", "w/c 23 Nov", "Mon 11/23".
const LEAD = /^(?:week\s+(?:of|commencing|starting)|w\/c|wc|wk|week|(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?)[\s:,]*/i;

export function parseSheet(text, today) {
  const rows = cellsFromPaste(String(text ?? "")).map((row) => row.map(clean));
  const header = rows[0] ?? [];
  const columns = [];
  const skipped = [];
  const seen = new Set();
  header.forEach((cell, index) => {
    if (index === 0 || !cell) return;
    const day = headerDay(cell, today);
    const week = day ? weekOf(day) : null;
    if (!week || seen.has(week)) skipped.push(cell);
    else {
      seen.add(week);
      columns.push({ index, week });
    }
  });
  const roles = [];
  const body = [];
  for (const row of rows.slice(1)) {
    const role = row[0] ?? "";
    if (!role || roles.some((each) => each.toLowerCase() === role.toLowerCase())) continue;
    roles.push(role);
    body.push(row);
  }
  const problem = rows.length < 2 || header.length < 2
    ? "Paste the whole sheet: a header row (Role, then one date per week) and a row per role"
    : !columns.length ? "No week in the header row reads as a date (like 11/23 or 23-Nov)"
      : !roles.length ? "No row under the header names a role" : "";
  if (problem) return { weeks: [], roles: [], skipped, problem };
  const weeks = columns.sort((a, b) => (a.week < b.week ? -1 : 1))
    .map(({ index, week }) => ({ week, roles: body.map((row) => ({ role: row[0], name: row[index] ?? "" })) }));
  return { weeks, roles, skipped, problem };
}

/** The day a header cell names, or null. Numbers are month/day; no year: the nearest one. */
export function headerDay(text, today) {
  const cell = clean(text).replace(LEAD, "").replace(/[.,]+$/, "").trim();
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(cell);
  if (match) return day(+match[1], +match[2], +match[3]);
  match = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(cell);
  if (match) return withYear(+match[1], +match[2], match[3], today);
  match = /^(\d{1,2})[-\s]([a-z]{3,})\.?(?:[-\s,]+(\d{2}|\d{4}))?$/i.exec(cell);
  if (match) return withYear(month(match[2]), +match[1], match[3], today);
  match = /^([a-z]{3,})\.?\s+(\d{1,2})(?:(?:st|nd|rd|th)?,?\s+(\d{4}))?(?:st|nd|rd|th)?$/i.exec(cell);
  if (match) return withYear(month(match[1]), +match[2], match[3], today);
  return null;
}

function withYear(monthNumber, date, year, today) {
  if (!monthNumber) return null;
  if (year) return day(year.length === 2 ? 2000 + Number(year) : Number(year), monthNumber, date);
  const now = today instanceof Date ? today : dateOf(today) ?? new Date();
  const thisYear = now.getFullYear();
  const days = [thisYear - 1, thisYear, thisYear + 1].map((each) => day(each, monthNumber, date)).filter(Boolean);
  const distance = (each) => Math.abs(dateOf(each) - now);
  return days.sort((a, b) => distance(a) - distance(b))[0] ?? null;
}

function month(word) {
  const index = MONTHS.indexOf(String(word).slice(0, 3).toLowerCase());
  return index < 0 ? 0 : index + 1;
}

function day(year, monthNumber, date) {
  const pad = (n) => String(n).padStart(2, "0");
  const text = `${year}-${pad(monthNumber)}-${pad(date)}`;
  return dateOf(text) ? localDay(dateOf(text)) : null;
}

function clean(cell) {
  return String(cell ?? "").replace(/\s+/g, " ").trim();
}
