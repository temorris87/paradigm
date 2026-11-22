// A note template's text made ready to put into a note. Pure.
//
//   fillTemplate(body, { date, time, title })  -> { text, tasks, cursorAt }
//     {{date}} (2026-11-24), {{time}} (14:30) and {{title}} (the note's) are filled in;
//     {{cursor}} is taken out, and cursorAt is the line it was on (null when there is none);
//     each "- [ ]" box becomes a task instead of a line: tasks [{ title, done, parent }] in
//     order, parent the index of the task it is nested under (one level deep, as tasks go),
//     and its line leaves the text.
import { tasksIn } from "../notes/tasks.js";

const CURSOR = "{{cursor}}";

export function fillTemplate(body, { date = "", time = "", title = "" } = {}) {
  const filled = String(body ?? "").replace(/\r\n?/g, "\n")
    .replaceAll("{{date}}", date).replaceAll("{{time}}", time).replaceAll("{{title}}", title);
  const boxes = tasksIn(filled);
  const lines = filled.split("\n");
  const index = new Map();
  const tasks = [];
  for (const box of boxes) {
    // A box under a subtask counts as a subtask of the same task (one level deep).
    let parent = box.parent === null ? null : index.get(box.parent) ?? null;
    if (parent !== null && tasks[parent].parent !== null) parent = tasks[parent].parent;
    index.set(box.line, tasks.length);
    tasks.push({ title: box.title || "(no text)", done: box.done, parent });
  }
  const dropped = new Set(boxes.map((box) => box.line));
  const kept = lines.filter((_, line) => !dropped.has(line));
  let cursorAt = null;
  const text = kept.map((line, at) => {
    if (cursorAt === null && line.includes(CURSOR)) cursorAt = at;
    return line.replaceAll(CURSOR, "");
  }).join("\n").replace(/\n+$/, "");
  return { text, tasks, cursorAt };
}
