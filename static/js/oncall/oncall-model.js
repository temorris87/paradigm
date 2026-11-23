// The on-call rota in the page: the rows the server keeps ({ week, role, name, position }),
// who holds each role in a week, which person a name in a cell is, and the texts for the Week
// bar, Today, a person's head and the paste's preview. Pure.
//
//   const rota = new Rota(rows)
//   rota.weeks                       Mondays with rows, oldest first
//   rota.of(monday)                  [{ role, name }] holding a name, in the sheet's order
//   cellPeople(tree, cell)           [{ text, person }] (person: a note, or null)
//   personForName(tree, name)        a person note or null
//   nextOnCall(rota, tree, personId, today)  { week, roles, thisWeek } | null
//   barText(tree, entries)           { text, title } for the Week bar ("" when none)
//   pasteSummary(parsed, rota, tree) the preview's line
import { weekOf } from "../calendar/week-model.js";
import { localDay } from "../meetings/meeting-days.js";
import { personForMention } from "../notes/mentions.js";
import { dayText } from "../ui/dates.js";

// What separates two names in one cell: "Tom / Ana", "Tom & Ana", "Tom, Ana", "Tom and Ana".
const SEPARATOR = /\s*(?:\/|&|;|,|\+|\band\b)\s*/i;
// The bar names this many roles, then "+N".
const BAR_ROLES = 2;

export class Rota {
  constructor(rows = []) {
    this.byWeek = new Map();
    for (const row of rows) {
      if (!this.byWeek.has(row.week)) this.byWeek.set(row.week, []);
      this.byWeek.get(row.week).push(row);
    }
    for (const list of this.byWeek.values()) list.sort((a, b) => a.position - b.position);
    this.weeks = [...this.byWeek.keys()].sort();
  }

  get empty() {
    return this.weeks.length === 0;
  }

  /** The roles of the week holding day, in the sheet's order; only those with a name. */
  of(day) {
    return (this.byWeek.get(weekOf(day)) ?? []).filter((row) => row.name).map(({ role, name }) => ({ role, name }));
  }

  /** Every role in the rota: the newest week's in its order, then older ones it dropped. */
  roles() {
    const order = [];
    for (const week of [...this.weeks].reverse()) {
      for (const row of this.byWeek.get(week)) {
        if (!order.some((role) => role.toLowerCase() === row.role.toLowerCase())) order.push(row.role);
      }
    }
    return order;
  }

  /** The name in a role that week ("" when none). */
  name(week, role) {
    return (this.byWeek.get(week) ?? []).find((row) => row.role.toLowerCase() === role.toLowerCase())?.name ?? "";
  }
}

/** A person by "First Last", "Last, First" or a first name only one live person has. */
export function personForName(tree, name) {
  const text = String(name ?? "").trim();
  if (!text) return null;
  const found = personForMention(tree, text);
  if (found) return found;
  const reversed = /^([^,]+),\s*([^,]+)$/.exec(text);
  return reversed ? personForMention(tree, `${reversed[2]} ${reversed[1]}`) : null;
}

/** The names in a cell, each with its person: the whole cell first ("Smith, Joe"), else split. */
export function cellPeople(tree, cell) {
  const text = String(cell ?? "").trim();
  if (!text) return [];
  const whole = personForName(tree, text);
  if (whole) return [{ text, person: whole }];
  const parts = text.split(SEPARATOR).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return [{ text, person: null }];
  return parts.map((part) => ({ text: part, person: personForName(tree, part) }));
}

/** The person's next on-call week from today's on: its Monday and the roles they hold. */
export function nextOnCall(rota, tree, personId, today) {
  const thisWeek = weekOf(typeof today === "string" ? today : localDay(today));
  for (const week of rota.weeks) {
    if (week < thisWeek) continue;
    const roles = rota.of(week).filter((entry) => cellPeople(tree, entry.name).some((part) => part.person?.id === personId))
      .map((entry) => entry.role);
    if (roles.length) return { week, roles, thisWeek: week === thisWeek };
  }
  return null;
}

/** "On call this week (Primary)" / "On call from Mon 7 Dec (Secondary)". */
export function nextOnCallText(next, today) {
  if (!next) return "";
  const roles = `(${next.roles.join(", ")})`;
  return next.thisWeek ? `On call this week ${roles}` : `On call from ${dayText(next.week, { today })} ${roles}`;
}

/** The Week bar's line: the people's names (as their notes say), each with the role. */
export function barText(tree, entries) {
  if (!entries.length) return { text: "", title: "" };
  const said = entries.map(({ role, name }) => `${cellPeople(tree, name).map((part) => part.person?.title ?? part.text).join(" / ")} (${role})`);
  const shown = said.slice(0, BAR_ROLES).join(", ");
  const more = said.length - BAR_ROLES;
  return { text: `On call: ${shown}${more > 0 ? ` +${more}` : ""}`, title: said.join("\n") };
}

/** "3 roles × 6 weeks, Mon 23 Nov – Mon 28 Dec · replaces 2 weeks already in · ...". */
export function pasteSummary(parsed, rota, tree, today = null) {
  if (parsed.problem) return parsed.problem;
  const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
  const { weeks, roles } = parsed;
  const first = dayText(weeks[0].week, { today });
  const last = dayText(weeks[weeks.length - 1].week, { today });
  const parts = [`${plural(roles.length, "role")} × ${plural(weeks.length, "week")}, ${weeks.length > 1 ? `${first} – ${last}` : first}`];
  const replaced = weeks.filter((week) => rota.byWeek.has(week.week)).length;
  if (replaced) parts.push(`replaces ${plural(replaced, "week")} already in`);
  const unknown = [...new Set(weeks.flatMap((week) => week.roles.flatMap((entry) => cellPeople(tree, entry.name)))
    .filter((part) => !part.person).map((part) => part.text))];
  if (unknown.length) parts.push(`${plural(unknown.length, "name")} not in People: ${unknown.slice(0, 5).join(", ")}${unknown.length > 5 ? "…" : ""}`);
  if (parsed.skipped.length) parts.push(`${plural(parsed.skipped.length, "column")} left out (not a date or a week twice): ${parsed.skipped.slice(0, 3).join(", ")}`);
  return parts.join(" · ");
}
