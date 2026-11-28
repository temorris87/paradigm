// Capture by key (028, Tyson 2026-11-27): \t \q \d on a line of a note make a task, a question
// or a decision on the note's nearest hub, through the capture sheet (capture-sheet.js). This
// is what the sheet starts from and what a capture shows as afterwards. Pure.
//
// A capture is the API's Capture: { kind, id, title, quote, hub_id, hub_title, person_id,
// person_name, role: "delegate" | "for" | "mine" | null, follow_up, due, open }. A capture sits
// on the lines whose text, trimmed, equals its quote; with none, on the first line that contains
// it (a capture from a visual selection quotes the selection). One function, capturesByLine,
// says which, for the editor's marks, \u and the rendered notes' chips alike.
//
//   titleOf(text)                 the line less its list mark, "- [ ]" and a trailing !day
//   lineDue(text, today)          the trailing !day as a day, or null
//   findPerson(text, tree)        { person, at } who the line names: an @mention first, then a
//                                 known person's full name, then a unique first name; or null
//   captureHub(tree, id)          the note a capture from note id goes to (a meeting's parent;
//                                 a note's project, area or person), or null
//   hubChoices(tree, sourceId)    what "Goes to" can pick: the live projects and areas, and the
//                                 person the note sits under
//   nextWorkingDay(day)           the next Monday to Friday after a day
//   sheetState({ kind, text, line, sourceId, tree, meetingDay, today })
//                                 the sheet's first state, or { error } (no hub, empty line)
//   withKind / withPerson / withRole / withDay / withHub (state, value)   a new state
//   roleChoices(state)            [{ role, label }]: "{First} does it", "I owe {First}", "Mine"
//   dayRow(state)                 null, or { label: "Follow up" | "Due", day, note }
//   fieldsOf(state)               the sheet's Tab order: title, who, role?, day?, hub
//   stepDay(day, n, today)        a day n days on (from today when there is none)
//   readDay(text, today)          "fri", "2026-12-04", "" -> a day or null; undefined: not a day
//   payloadOf(state)              POST /api/capture's body
//   capturesByLine(captures, lines)  Map line number -> [capture] on it, in the order made
//   captureMarks(captures, lines, today)  the editor's line marks [{ line, glyph, label, tone }]:
//                                 a line's first capture
//   markText(capture, today)      "Task → Ben · follow up Mon", "Question · in Team"...
//   renderedText(capture, today)  the rendered notes' chip: "Task → Ben · Mon", "Question"
//   captureHighlights(captures, lines, today)  highlights.js's highlights for the rendered
//                                 notes: one per capture, its text the line it sits on
//   agreedRows(captures, today)   the meeting's "Agreed in this meeting" rows
//   captureCounts(captures)       { task, question, decision }
//   capturedOn(captures, lines, line)  the captures on line number line, in the order made
//   captureToRemove(captures, lines, line)  what \u removes: the line's first capture, or null
import { MENTION, trimName } from "../markdown/mentions.js";
import { addDays, localDay } from "../meetings/meeting-days.js";
import { dayText } from "../ui/dates.js";
import { parseDue } from "./capture.js";
import { isArchived, isHub, isMeeting, isPerson, topNoteOf } from "./hub-groups.js";
import { personForMention } from "./mentions.js";

export const CAPTURE_KINDS = ["task", "question", "decision"];
export const KIND_LABELS = { task: "Task", question: "Question", decision: "Decision" };
const PLURALS = { task: "Tasks", question: "Questions", decision: "Decisions" };
export const GLYPHS = { task: "□", question: "?", decision: "◆" };

const LIST_MARKS = /^\s*(?:(?:[-*+]|\d+[.)])\s+)?(?:\[[ xX]\]\s+)?/;
const TRAILING_DAY = /(?:^|\s+)!(\S+)\s*$/;

function dayOf(today) {
  return typeof today === "string" ? today : localDay(today ?? new Date());
}

function dateFrom(day) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function titleOf(text) {
  return String(text ?? "").replace(LIST_MARKS, "").replace(TRAILING_DAY, "").trim();
}

export function lineDue(text, today) {
  const match = TRAILING_DAY.exec(String(text ?? ""));
  return (match && parseDue(match[1], today)) || null;
}

function quoteOf(text) {
  return String(text ?? "").trim();
}

/** The live people: top-level person notes not in the Archive. */
function livePeople(tree) {
  return tree.children(null).filter((note) => isPerson(tree, note.id) && !isArchived(tree, note.id));
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findPerson(text, tree) {
  const line = String(text ?? "");
  MENTION.lastIndex = 0;
  for (let match = MENTION.exec(line); match; match = MENTION.exec(line)) {
    const at = match.index + match[1].length;
    const person = personForMention(tree, trimName(match[2]));
    if (person) return { person, at };
    MENTION.lastIndex = at + 1;
  }
  const people = livePeople(tree);
  // A full name, the earliest in the line.
  let best = null;
  for (const person of people) {
    const found = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(person.title.trim())}(?![\\p{L}\\p{N}])`, "iu").exec(line);
    if (!found || !person.title.trim()) continue;
    const at = found.index + found[1].length;
    if (!best || at < best.at) best = { person, at };
  }
  if (best) return best;
  // A first name only one live person has, written as a name (a capital first).
  const words = /\p{Lu}[\p{L}'-]*/gu;
  for (let match = words.exec(line); match; match = words.exec(line)) {
    if (match.index > 0 && /[\p{L}\p{N}@]/u.test(line[match.index - 1])) continue;
    const named = people.filter((person) => person.title.split(/\s+/)[0].toLowerCase() === match[0].toLowerCase());
    if (named.length === 1) return { person: named[0], at: match.index };
  }
  return null;
}

/** A name that starts the line (after its list mark) is who does it; one later, who I owe. */
function roleFrom(text, found) {
  if (!found) return "mine";
  return String(text ?? "").slice(0, found.at).replace(LIST_MARKS, "").trim() ? "for" : "delegate";
}

function isTarget(tree, id) {
  return isHub(tree, id) || isPerson(tree, id);
}

export function captureHub(tree, id) {
  if (!tree.has(id)) return null;
  if (isMeeting(tree, id)) {
    const parent = tree.parentId(id);
    // As the server's nearest_hub, an archived parent is no hub: \t says so before the sheet opens.
    if (parent !== null && isTarget(tree, parent)) return isArchived(tree, parent) ? null : tree.get(parent);
  }
  // As the server's nearest_hub: a person's own note, and a note in an archived hub, have none.
  const top = topNoteOf(tree, id);
  if (!top || !isTarget(tree, top.id) || isArchived(tree, top.id)) return null;
  return isPerson(tree, top.id) && top.id === id ? null : top;
}

/** The live projects and areas, and the person the note sits under: a person takes only
 * captures from a note under them (POST /api/capture answers 400 otherwise). */
export function hubChoices(tree, sourceId = null) {
  const own = sourceId === null ? null : captureHub(tree, sourceId);
  return tree.children(null).filter((note) => !isArchived(tree, note.id)
    && (isHub(tree, note.id) || (own !== null && note.id === own.id)));
}

export function nextWorkingDay(day) {
  const date = dateFrom(day);
  do date.setDate(date.getDate() + 1);
  while (date.getDay() === 0 || date.getDay() === 6);
  return localDay(date);
}

export function sheetState({ kind, text, line = 0, sourceId, tree, meetingDay = null, today }) {
  const hub = captureHub(tree, sourceId);
  if (!hub) return { error: "E: no hub to capture to" };
  const quote = quoteOf(text);
  if (!quote) return { error: "E: nothing on this line to capture" };
  const found = findPerson(text, tree);
  const due = lineDue(text, today);
  return {
    kind: CAPTURE_KINDS.includes(kind) ? kind : "task",
    line,
    sourceId,
    meeting: isMeeting(tree, sourceId),
    quote,
    title: titleOf(text) || quote,
    person: found?.person ?? null,
    found: Boolean(found),
    role: roleFrom(text, found),
    followUp: nextWorkingDay(meetingDay || dayOf(today)),
    due,
    lineDue: due,
    hubId: hub.id,
    hubTitle: hub.title,
    nearestHubId: hub.id,
  };
}

export function withKind(state, kind) {
  return CAPTURE_KINDS.includes(kind) ? { ...state, kind } : state;
}

/** Someone picked in Who (or none): a new person does it, until the role says otherwise. */
export function withPerson(state, person) {
  if (!person) return { ...state, person: null, found: false, role: "mine" };
  return { ...state, person, found: false, role: state.person ? state.role : "delegate" };
}

export function withRole(state, role) {
  return roleChoices(state).some((choice) => choice.role === role) ? { ...state, role } : state;
}

/** The day row's day: the follow-up while someone does it, else the due day. */
export function withDay(state, day) {
  return state.role === "delegate" && state.person ? { ...state, followUp: day } : { ...state, due: day };
}

export function withHub(state, hub) {
  return hub ? { ...state, hubId: hub.id, hubTitle: hub.title } : state;
}

function firstOf(name) {
  return String(name ?? "").trim().split(/\s+/)[0] ?? "";
}

export function roleChoices(state) {
  if (state.kind !== "task") return [];
  const mine = { role: "mine", label: "Mine" };
  if (!state.person) return [mine];
  const first = firstOf(state.person.title);
  return [{ role: "delegate", label: `${first} does it` }, { role: "for", label: `I owe ${first}` }, mine];
}

export function dayRow(state) {
  if (state.kind !== "task") return null;
  if (state.role === "delegate" && state.person) {
    return { label: "Follow up", day: state.followUp, note: `default: next working day after ${state.meeting ? "the meeting" : "today"}` };
  }
  const fromLine = state.due && state.due === state.lineDue;
  return { label: "Due", day: state.due, note: fromLine ? "from the line's !day" : state.due ? "" : "none" };
}

export function fieldsOf(state) {
  if (state.kind !== "task") return ["title", "who", "hub"];
  return ["title", "who", ...(state.person ? ["role"] : []), "day", "hub"];
}

export function stepDay(day, n, today) {
  const from = dateFrom(day || dayOf(today));
  return localDay(addDays(from, n));
}

export function readDay(text, today) {
  const raw = String(text ?? "").trim();
  if (!raw || raw.toLowerCase() === "none") return null;
  // One word only: parseDue reads any word starting with a weekday, so "Mon 30 Novfri" (a day
  // typed after the shown one) would quietly mean Monday.
  if (/\s/.test(raw)) return undefined;
  return parseDue(raw, today) || undefined;
}

export function payloadOf(state) {
  const body = { source_id: state.sourceId, kind: state.kind, title: state.title.trim(), quote: state.quote, hub_id: state.hubId };
  if (state.person) body.person_id = state.person.id;
  if (state.kind !== "task") return body;
  if (state.person) body.role = state.role;
  if (state.person && state.role === "delegate") {
    if (state.followUp) body.follow_up = state.followUp;
  } else if (state.due) body.due = state.due;
  return body;
}

function weekday(day, today) {
  return dayText(day, { today: dayOf(today) }).split(" ")[0];
}

function taskRole(capture) {
  return capture.role ?? (capture.person_id ? "delegate" : "mine");
}

export function markText(capture, today) {
  if (capture.kind !== "task") return `${KIND_LABELS[capture.kind]} · in ${capture.hub_title}`;
  const first = firstOf(capture.person_name);
  const role = taskRole(capture);
  const due = capture.due ? ` · due ${weekday(capture.due, today)}` : "";
  if (role === "delegate") return `Task → ${first}${capture.follow_up ? ` · follow up ${weekday(capture.follow_up, today)}` : ""}`;
  if (role === "for") return `Task · for ${first}${due}`;
  return `Task · mine${due}`;
}

/** The chip's tone: who has it for a task (info: delegated, success: I owe, neutral: mine). */
export function markTone(capture) {
  if (capture.kind !== "task") return capture.kind;
  return { delegate: "info", for: "success" }[taskRole(capture)] ?? "neutral";
}

/** The lines a capture sits on: every line equal to its quote (a whole line wins), else the
 * first that contains it (only the first: a short selection would otherwise mark every line
 * that happens to hold its words). */
function linesOf(capture, trimmed) {
  const quote = quoteOf(capture.quote);
  if (!quote) return [];
  const equal = [];
  trimmed.forEach((text, line) => {
    if (text === quote) equal.push(line);
  });
  if (equal.length) return equal;
  const containing = trimmed.findIndex((text) => text.includes(quote));
  return containing < 0 ? [] : [containing];
}

export function capturesByLine(captures, lines) {
  const trimmed = lines.map(quoteOf);
  const byLine = new Map();
  for (const capture of captures) {
    for (const line of linesOf(capture, trimmed)) byLine.set(line, [...(byLine.get(line) ?? []), capture]);
  }
  return byLine;
}

export function captureMarks(captures, lines, today) {
  return [...capturesByLine(captures, lines)].sort(([a], [b]) => a - b).map(([line, [capture]]) => ({
    line, glyph: GLYPHS[capture.kind], label: markText(capture, today), tone: markTone(capture),
  }));
}

export function capturedOn(captures, lines, line) {
  return capturesByLine(captures, lines).get(line) ?? [];
}

export function captureToRemove(captures, lines, line) {
  return capturedOn(captures, lines, line)[0] ?? null;
}

export function renderedText(capture, today) {
  if (capture.kind !== "task") return KIND_LABELS[capture.kind];
  const role = taskRole(capture);
  const first = firstOf(capture.person_name);
  const day = role === "delegate" ? capture.follow_up : capture.due;
  const who = role === "delegate" ? ` → ${first}` : role === "for" ? ` · for ${first}` : "";
  return `Task${who}${day ? ` · ${weekday(day, today)}` : ""}`;
}

/** Each capture's chip after the line it sits on in rendered notes (the line's whole text, so
 * highlights.js marks the line, and its chips follow in the order made); a record's opens it
 * on a click. A capture on no line has none. */
export function captureHighlights(captures, lines, today) {
  const lineOf = new Map();
  for (const [line, on] of [...capturesByLine(captures, lines)].sort(([a], [b]) => a - b)) {
    for (const capture of on) if (!lineOf.has(capture)) lineOf.set(capture, line);
  }
  return captures.filter((capture) => lineOf.has(capture)).map((capture) => ({
    text: quoteOf(lines[lineOf.get(capture)]),
    label: renderedText(capture, today),
    title: `${KIND_LABELS[capture.kind]} in ${capture.hub_title}: ${capture.title}${capture.kind === "task" ? "" : " (click to open)"}`,
    data: capture.kind === "task" ? null : capture.id,
    kind: capture.kind,
    capture: capture.kind,
  }));
}

function agreedDetail(capture, today) {
  const day = (value) => dayText(value, { today: dayOf(today) });
  if (capture.kind === "question") return `${capture.open ? "open" : "answered"} · in ${capture.hub_title}`;
  if (capture.kind === "decision") return `in ${capture.hub_title}`;
  const role = taskRole(capture);
  const parts = role === "delegate" ? [capture.person_name, capture.follow_up ? `follow up ${day(capture.follow_up)}` : ""]
    : role === "for" ? [`I owe ${firstOf(capture.person_name)}`, capture.due ? `due ${day(capture.due)}` : ""]
      : ["mine", capture.due ? `due ${day(capture.due)}` : ""];
  return [capture.open ? "" : "done", ...parts].filter(Boolean).join(" · ");
}

/** A row per capture, in the order made: a task opens its page, a record its note. */
export function agreedRows(captures, today) {
  return captures.map((capture) => ({
    id: capture.kind === "task" ? capture.hub_id : capture.id,
    title: capture.title,
    depth: 0,
    detail: agreedDetail(capture, today),
    chip: { label: KIND_LABELS[capture.kind], tone: capture.kind },
    muted: !capture.open,
    ...(capture.kind === "task" ? { task: capture.id, done: !capture.open } : {}),
  }));
}

export function captureCounts(captures) {
  const counts = { task: 0, question: 0, decision: 0 };
  for (const capture of captures) if (capture.kind in counts) counts[capture.kind] += 1;
  return counts;
}

/** The strip's chips: [{ kind, label: "Tasks", count }]. */
export function stripParts(captures) {
  const counts = captureCounts(captures);
  return CAPTURE_KINDS.map((kind) => ({ kind, label: PLURALS[kind], count: counts[kind] }));
}
