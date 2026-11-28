// What a note's words say, for the capture paths that read text. Pure.
// T:/D:/Q: lines are no longer read (028, Tyson 2026-11-27): a task, question or decision is
// captured by key (\t \q \d, capture-model.js and capture-sheet.js); an old "T:" line is
// plain text. What stays:
//
//   parseTaskText(text, tree, today) { title, delegate, forPerson, due, people } of :t's words:
//                                    a name first delegates, a name later is who I owe, !day
//   parseDue(word, today)            "fri", "tomorrow", "today", "2026-12-01" -> a day, or ""
//   captureText(task, today)         "Task for Tom Okafor · due Fri 27 Nov" (:t's hint)
//   topicLines(text, tree)           [{ kind: "topic", line, quote, title, people: [person] }]:
//                                    "@Priya ? owning the registry" in any note: a topic to
//                                    raise at the next 1:1 with Priya, captured on save
//   toPayload(topic)                 what the save sends for it (ids, not notes)
import { MENTION, trimName } from "../markdown/mentions.js";
import { addDays, localDay } from "../meetings/meeting-days.js";
import { dayText } from "../ui/dates.js";
import { personForMention } from "./mentions.js";

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const LABELS = { task: "Task", decision: "Decision", question: "Question" };
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DUE = /(^|\s)!(\S+)/;

function dayOf(today) {
  return typeof today === "string" ? today : localDay(today);
}

export function parseDue(word, today) {
  const raw = String(word ?? "").toLowerCase();
  const day = dayOf(today);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (raw === "today") return day;
  if (raw === "tomorrow" || raw === "tmrw") return localDay(addDays(dateFrom(day), 1));
  const weekday = WEEKDAYS.findIndex((name) => raw.startsWith(name) && raw.length >= 3);
  if (weekday < 0) return "";
  const from = dateFrom(day);
  // The coming one, today included.
  return localDay(addDays(from, (weekday - from.getDay() + 7) % 7));
}

function dateFrom(day) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** The mentions in a text: [{ start, end, name, person }] (person: the note, or null). */
function mentionsIn(text, tree) {
  const found = [];
  MENTION.lastIndex = 0;
  for (let match = MENTION.exec(text); match; match = MENTION.exec(text)) {
    const start = match.index + match[1].length;
    const name = trimName(match[2]);
    found.push({ start, end: start + 1 + name.length, name, person: personForMention(tree, name) });
    MENTION.lastIndex = start + 1 + name.length;
  }
  return found;
}

/** The text with known mentions as plain names, and the !day taken out. */
function plainText(text, mentions, skip = null) {
  let out = "";
  let from = 0;
  for (const mention of mentions) {
    out += text.slice(from, mention.start);
    if (mention !== skip) out += mention.person ? mention.person.title.split(/\s+/)[0] : `@${mention.name}`;
    from = mention.end;
  }
  out += text.slice(from);
  return out.replace(DUE, "$1").replace(/\s+/g, " ").replace(/^[\s,:;-]+|[\s,;-]+$/g, "");
}

export function parseTaskText(text, tree, today) {
  const mentions = mentionsIn(text, tree);
  const due = parseDue(DUE.exec(text)?.[2], today);
  // A name first is who does it; a name later is who it is for.
  const first = mentions[0] && !text.slice(0, mentions[0].start).trim() ? mentions[0] : null;
  const delegate = first?.person ?? null;
  const forPerson = delegate ? null : mentions.find((mention) => mention.person)?.person ?? null;
  const words = plainText(text, mentions, delegate ? first : null);
  return { title: words ? words[0].toUpperCase() + words.slice(1) : "", delegate, forPerson, due,
    people: mentions.map((mention) => mention.person).filter(Boolean) };
}

// "@Name ?": a known name, then a lone question mark.
const ASK = /(^|[^\p{L}\p{N}_@./:+-])@(\p{L}[\p{L}\p{N}_'-]*)\s*\?(?=\s|$)/u;

export function topicLines(text, tree) {
  const out = [];
  let fence = null;
  String(text ?? "").split("\n").forEach((line, index) => {
    const opener = FENCE.exec(line);
    if (fence) {
      if (opener && opener[1][0] === fence[0] && opener[1].length >= fence.length) fence = null;
      return;
    }
    if (opener) {
      fence = opener[1];
      return;
    }
    if (/^( {4}|\t)/.test(line)) return;
    // Inline code holds no topic: blank it (same length, so positions hold).
    const match = ASK.exec(line.replace(/`[^`]*`/g, (code) => " ".repeat(code.length)));
    const person = match ? personForMention(tree, trimName(match[2])) : null;
    if (!person) return;
    const rest = (line.slice(0, match.index) + match[1] + line.slice(match.index + match[0].length))
      .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)?/, "");
    const title = plainText(rest, mentionsIn(rest, tree));
    if (title) out.push({ kind: "topic", line: index, quote: line.trim(), title: title[0].toUpperCase() + title.slice(1), people: [person] });
  });
  return out;
}

export function captureText(capture, today) {
  const parts = [LABELS[capture.kind]];
  if (capture.delegate) parts[0] += ` for ${capture.delegate.title}`;
  if (capture.forPerson) parts.push(`I owe ${capture.forPerson.title}`);
  if (capture.kind !== "task" && capture.people.length) parts.push(`with ${capture.people.map((person) => person.title).join(", ")}`);
  if (capture.due) parts.push(`due ${dayText(capture.due, { today: dayOf(today) })}`);
  return parts.join(" · ");
}

export function toPayload(capture) {
  return { kind: capture.kind, quote: capture.quote, title: capture.title, due: capture.due ?? "",
    people: capture.people.map((person) => person.id), delegate_id: capture.delegate?.id ?? null,
    for_person_id: capture.forPerson?.id ?? null, ...(capture.kind === "topic" ? { line: capture.line } : {}) };
}
