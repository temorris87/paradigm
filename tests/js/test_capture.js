// Meeting capture: T:/D:/Q: lines, who does it (a name first) or who it is for (a name later),
// !day, and never inside code.
import { captureLines, captureText, parseDue, parseTaskText, toPayload } from "../../static/js/notes/capture.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { assertEqual, test } from "./harness.js";

const T = "2026-11-01T12:00:00.000Z";
const tree = () => new NoteTree([
  { id: 4, parent_id: null, title: "Tom Okafor", kind: "person", updated_at: T },
  { id: 5, parent_id: null, title: "Priya Shah", kind: "person", updated_at: T },
]);
// Monday 23 November 2026.
const TODAY = "2026-11-23";

test("capture: !day is the coming one, today included", () => {
  assertEqual(["fri", "mon", "tomorrow", "today", "2026-12-01", "soon"].map((word) => parseDue(word, TODAY)).join(),
    "2026-11-27,2026-11-23,2026-11-24,2026-11-23,2026-12-01,");
});

test("capture: a name first delegates; a name later is who I owe", () => {
  const first = parseTaskText("@Tom book cutover rehearsal !fri", tree(), TODAY);
  assertEqual([first.title, first.delegate?.id, first.forPerson, first.due].join("|"), "Book cutover rehearsal|4||2026-11-27");
  const later = parseTaskText("send @Tom the numbers", tree(), TODAY);
  assertEqual([later.title, later.delegate, later.forPerson?.id].join("|"), "Send Tom the numbers||4");
  const unknown = parseTaskText("ask @Zed", tree(), TODAY);
  assertEqual([unknown.title, unknown.forPerson].join("|"), "Ask @Zed|", "an unknown name stays text");
});

test("capture: lines in a note, never in code; payload and hint", () => {
  const text = ["Priya has p50 numbers.", "T: Rerun p99 on prod-like nodes", "D: Stay at-least-once, @Priya", "```",
    "T: not this one", "```", "    T: nor this", "Q: Ordering across partitions?", "T:no space"].join("\n");
  const lines = captureLines(text, tree(), TODAY);
  assertEqual(lines.map((line) => `${line.kind}:${line.line}:${line.title}`).join(" | "),
    "task:1:Rerun p99 on prod-like nodes | decision:2:Stay at-least-once, Priya | question:7:Ordering across partitions?");
  assertEqual(JSON.stringify(toPayload(lines[1])), JSON.stringify({ kind: "decision", quote: "Stay at-least-once, @Priya",
    title: "Stay at-least-once, Priya", due: "", people: [5], delegate_id: null, for_person_id: null }));
  const task = captureLines("T: @Tom book cutover rehearsal !fri", tree(), TODAY)[0];
  assertEqual(captureText(task, TODAY), "Task for Tom Okafor · due Fri 27 Nov");
});

test("capture: a captured line's badge takes the place of its T:, even before a mention", async () => {
  const { markHighlights } = await import("../../static/js/live/highlights.js");
  const p = document.createElement("p");
  p.innerHTML = 'Priya has numbers.<br>\nT: <a class="md-mention">@Tom</a> book it !fri<br>\nD: Stay';
  markHighlights(p, [{ text: "@Tom book it !fri", label: "Task", capture: "task", meta: "→ Tom" },
    { text: "Stay", label: "Decision", capture: "decision" }]);
  assertEqual(p.textContent.replace(/\s+/g, " "), "Priya has numbers. Task@Tom book it !fri→ Tom DecisionStay");
});

test("capture: @Name ? lines in any note are topics to raise, never in code", async () => {
  const { topicLines } = await import("../../static/js/notes/capture.js");
  const text = ["- @Priya ? owning the schema registry", "Ask @Tom? about on-call", "`@Priya ? x` in code", "    @Priya ? indented code",
    "@Zed ? unknown", "plain line"].join("\n");
  assertEqual(topicLines(text, tree()).map((topic) => `${topic.people[0].id}:${topic.line}:${topic.title}`).join(" | "),
    "5:0:Owning the schema registry | 4:1:Ask about on-call");
});
