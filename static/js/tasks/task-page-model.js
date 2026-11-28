// What a task's page says (task-page.js and its parts): the head's chips, the facts row, the
// next block, the side column's cards and rows, the Files and History lines. Pure.
//   ctx: { tree, tasks, meetings?, sessions?, timeSettings?, today? }; now: a Date (the clock)
//
//   shortDay(day, today)              "Fri" within 6 days either way, else "Fri 4 Dec"
//   dueChip(task, today)              { text, tone }: "2 d late · was due Tue 24 Nov" (danger),
//                                     "Due Fri" (caution, this week), "Due Fri 4 Dec" (neutral);
//                                     null with no due day or once done
//   headChips(ctx, task, now)         [{ text, tone }]: due, "2 h estimate", one "placed" per block
//   taskFacts(ctx, task, now)         [{ key, label, text, noteId? }]: Project, For, Delegated
//                                     to, Next block
//   nextSession(sessions, taskId, now)  the task's next block not over yet, or null
//   freeSlotFor(ctx, task, now)       { slot, length, until }: where s would put it (slot null:
//                                     no room), from now, before its due day
//   nextBlockText(ctx, task, now)     "Mon 30 Nov 10:00–12:00", "None · s finds Fri 08:00", "None"
//   placedText(task, slot, today) / noSlotText(length, until)   what s says
//   subtaskCount(subs)                "1 of 2 done"
//   subtaskDetail(ctx, task, today)   a subtask's right side: "done Thu 26 Nov", "→ Ben · follow
//                                     up Mon", "due Fri"
//   toAnswerText(emails)              "2 to answer" ("" when none)
//   fileDetail(file, hubId)           "OneDrive · Specs", "… · from Ben Ortiz" (another hub's)
//   sourceOf(ctx, task)               { noteId, title, day, when, chip, tone, quote } or null
//   historyRows(events, today)        [{ key, day, text, noteId }] as the server sent them
//   SIDE_CARDS                        the side column's cards, top to bottom
import { localDay } from "../meetings/meeting-days.js";
import { DEFAULT_LENGTH, clock, minutes } from "../calendar/week-model.js";
import { hubOf, isArchived } from "../notes/hub-groups.js";
import { Meetings, shortTitle } from "../meetings/meetings-model.js";
import { planningSettings } from "../today/today-model.js";
import { dayText } from "../ui/dates.js";
import { firstFreeSlot, hoursText } from "../week/capacity.js";
import { estimateText } from "./tasks-model.js";

export const SIDE_CARDS = ["subtasks", "emails", "files", "source", "history"];
export const NOTES_EMPTY = "No notes yet. e to write them.";
export const FILES_HINT = "Add file… opens the file picker in the project's OneDrive folder";

// A day this many days away or nearer is named by its weekday alone: one a week away would
// read as today's.
const WEEKDAY_DAYS = 6;

function dayNumber(day) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(day ?? ""));
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000 : null;
}

function dayString(today) {
  if (typeof today === "string") return today;
  return localDay(today instanceof Date ? today : new Date());
}

function daysFrom(day, today) {
  return dayNumber(day) - dayNumber(dayString(today));
}

export function shortDay(day, today) {
  const away = daysFrom(day, today);
  const near = !Number.isNaN(away) && Math.abs(away) <= WEEKDAY_DAYS;
  return dayText(day, { today: dayString(today), short: near });
}

export function dueChip(task, today) {
  if (!task.due || task.done) return null;
  const away = daysFrom(task.due, today);
  const full = dayText(task.due, { today: dayString(today) });
  if (away < 0) return { text: `${-away} d late · was due ${full}`, tone: "danger" };
  if (away === 0) return { text: "Due today", tone: "caution" };
  if (away === 1) return { text: "Due tomorrow", tone: "caution" };
  if (away <= WEEKDAY_DAYS) return { text: `Due ${shortDay(task.due, today)}`, tone: "caution" };
  return { text: `Due ${full}`, tone: "neutral" };
}

function sessionsOf(sessions, taskId) {
  return (sessions ?? []).filter((each) => each.task_id === taskId)
    .sort((a, b) => (a.day === b.day ? String(a.start).localeCompare(String(b.start)) : a.day.localeCompare(b.day)));
}

function minuteOf(now) {
  return now.getHours() * 60 + now.getMinutes();
}

function isOver(session, now) {
  const today = localDay(now);
  return session.day < today || (session.day === today && minutes(session.end) <= minuteOf(now));
}

function length(session) {
  return Math.max(0, (minutes(session.end) ?? 0) - (minutes(session.start) ?? 0));
}

export function headChips(ctx, task, now) {
  const due = dueChip(task, now);
  const placed = sessionsOf(ctx.sessions, task.id).map((session) => ({
    text: `${hoursText(length(session))} placed ${shortDay(session.day, now)}${isOver(session, now) ? " · done" : ""}`,
    tone: "success",
  }));
  return [due, task.estimate_min ? { text: `${estimateText(task.estimate_min)} estimate`, tone: "neutral" } : null, ...placed]
    .filter(Boolean);
}

const HUB_LABELS = { area: "Area", person: "Person" };

export function taskFacts(ctx, task, now) {
  const { tree } = ctx;
  const hub = hubOf(tree, task.note_id) ?? tree.get(task.note_id);
  const forPerson = tree.get(task.for_person_id);
  const delegate = tree.get(task.delegate_id);
  const follow = delegate && task.follow_up ? ` · follow up ${shortDay(task.follow_up, now)}` : "";
  return [
    { key: "hub", label: HUB_LABELS[hub?.kind] ?? "Project", text: hub?.title ?? "—", noteId: hub?.id },
    { key: "for", label: "For", text: forPerson?.title ?? "—" },
    { key: "delegate", label: "Delegated to", text: delegate ? `${delegate.title}${follow}` : "—" },
    { key: "next", label: "Next block", text: nextBlockText(ctx, task, now) },
  ];
}

export function nextSession(sessions, taskId, now) {
  return sessionsOf(sessions, taskId).find((session) => !isOver(session, now)) ?? null;
}

export function freeSlotFor(ctx, task, now) {
  const day = localDay(now);
  const span = task.estimate_min || DEFAULT_LENGTH;
  const until = task.due && task.due >= day ? task.due : "";
  const slot = firstFreeSlot({ tree: ctx.tree, meetings: ctx.meetings ?? new Meetings(), tasks: ctx.tasks, sessions: ctx.sessions ?? [] },
    { length: span, from: { day, minute: minuteOf(now) }, until, settings: planningSettings(ctx.timeSettings) });
  return { slot, length: span, until };
}

export function nextBlockText(ctx, task, now) {
  const next = nextSession(ctx.sessions, task.id, now);
  if (next) return `${dayText(next.day, { today: localDay(now) })} ${next.start}–${next.end}`;
  if (task.done || isArchived(ctx.tree, task.note_id)) return "None";
  const { slot } = freeSlotFor(ctx, task, now);
  return slot ? `None · s finds ${shortDay(slot.day, now)} ${clock(slot.start)}` : "None";
}

export function placedText(task, slot, today) {
  return `"${task.title}" placed ${dayText(slot.day, { today: dayString(today) })} ${clock(slot.start)}–${clock(slot.end)}`;
}

export function noSlotText(span, until) {
  return `No free ${hoursText(span)} ${until ? "before it is due" : "in the next two weeks"}`;
}

export function subtaskCount(subs) {
  return `${subs.filter((task) => task.done).length} of ${subs.length} done`;
}

export function subtaskDetail(ctx, task, today) {
  if (task.done) return task.done_day ? `done ${dayText(task.done_day, { today: dayString(today) })}` : "done";
  const delegate = ctx.tree.get(task.delegate_id);
  if (delegate) return `→ ${delegate.title}${task.follow_up ? ` · follow up ${shortDay(task.follow_up, today)}` : ""}`;
  return task.due ? `due ${shortDay(task.due, today)}` : "";
}

export function toAnswerText(emails) {
  const count = emails.filter((email) => email.reply === "needed").length;
  return count ? `${count} to answer` : "";
}

export function fileDetail(file, hubId) {
  const from = file.hub_id !== undefined && file.hub_id !== null && file.hub_id !== hubId && file.hub_title
    ? ` · from ${file.hub_title}` : "";
  return `OneDrive · ${file.folder_name ?? ""}${from}`;
}

export function sourceOf(ctx, task) {
  if (task.source_id === undefined || task.source_id === null) return null;
  const note = ctx.tree.get(task.source_id);
  if (!note) return null;
  const meeting = note.kind === "meeting";
  const day = meeting ? ctx.meetings?.get(note.id)?.day ?? "" : "";
  return {
    noteId: note.id,
    title: meeting && day ? shortTitle(note, { day }) : note.title,
    day,
    when: day ? dayText(day, { today: dayString(ctx.today ?? new Date()) }) : "",
    chip: meeting ? "From a meeting" : "From a note",
    tone: meeting ? "meeting" : "neutral",
    quote: task.quote ?? "",
  };
}

export function historyRows(events, today) {
  return (events ?? []).map((event, at) => ({
    key: `event-${at}`,
    day: event.day ? dayText(event.day, { today: dayString(today) }) : "",
    // The server sends the follow-up as a bare day, so it is worded here like every date on screen.
    text: event.follow_up ? `${event.text} · follow up ${shortDay(event.follow_up, today)}` : event.text,
    noteId: event.note_id ?? null,
  }));
}


