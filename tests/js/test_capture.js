// What capture.js still reads: :t's words (a name first delegates, a name later is who I owe,
// !day) and "@Name ?" topic lines. T:/D:/Q: lines are no longer read (028): they are plain text.
import * as capture from "../../static/js/notes/capture.js";
import { captureText, parseDue, parseTaskText, toPayload, topicLines } from "../../static/js/notes/capture.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { assertEqual, assertTrue, test } from "./harness.js";

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

test("capture: :t's words: a name first delegates; a name later is who I owe", () => {
  const first = parseTaskText("@Tom book cutover rehearsal !fri", tree(), TODAY);
  assertEqual([first.title, first.delegate?.id, first.forPerson, first.due].join("|"), "Book cutover rehearsal|4||2026-11-27");
  const later = parseTaskText("send @Tom the numbers", tree(), TODAY);
  assertEqual([later.title, later.delegate, later.forPerson?.id].join("|"), "Send Tom the numbers||4");
  const unknown = parseTaskText("ask @Zed", tree(), TODAY);
  assertEqual([unknown.title, unknown.forPerson].join("|"), "Ask @Zed|", "an unknown name stays text");
  assertEqual(captureText({ kind: "task", ...first }, TODAY), "Task for Tom Okafor · due Fri 27 Nov");
});

test("capture: T:, D: and Q: lines are no longer read: nothing reads them, no topic either", () => {
  assertTrue(!("captureLines" in capture), "captureLines is gone");
  const text = ["T: old style", "D: Stay at-least-once, @Priya", "Q: Ordering across partitions?"].join("\n");
  assertEqual(topicLines(text, tree()).length, 0);
});

test("capture: @Name ? lines in any note are topics to raise, never in code", () => {
  const text = ["- @Priya ? owning the schema registry", "Ask @Tom? about on-call", "`@Priya ? x` in code", "    @Priya ? indented code",
    "@Zed ? unknown", "plain line"].join("\n");
  const topics = topicLines(text, tree());
  assertEqual(topics.map((topic) => `${topic.people[0].id}:${topic.line}:${topic.title}`).join(" | "),
    "5:0:Owning the schema registry | 4:1:Ask about on-call");
  assertEqual(toPayload(topics[0]).kind, "topic");
  assertEqual(toPayload(topics[0]).line, 0);
});
