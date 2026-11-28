// Capture by key, the pure part (static/js/notes/capture-model.js): the title from a line, who
// it names, the default role and day, the nearest hub, the marks and the chips' texts.
import {
  agreedRows, captureHighlights, captureHub, captureMarks, capturedOn, capturesByLine, captureToRemove, findPerson, fieldsOf, hubChoices, lineDue, markText,
  dayRow, nextWorkingDay, payloadOf, readDay, renderedText, roleChoices, sheetState, stepDay, stripParts, titleOf, withDay, withKind,
  withPerson, withRole,
} from "../../static/js/notes/capture-model.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const T = "2026-11-01T12:00:00.000Z";
// Friday 27 November 2026.
const TODAY = "2026-11-27";

const tree = () => new NoteTree([
  { id: 1, parent_id: null, title: "Team", kind: "area", updated_at: T },
  { id: 2, parent_id: 1, title: "1:1 Ada", kind: "meeting", updated_at: T },
  { id: 3, parent_id: 1, title: "Notes on hiring", updated_at: T },
  { id: 4, parent_id: null, title: "Ada Park", kind: "person", updated_at: T },
  { id: 5, parent_id: null, title: "Ben Ortiz", kind: "person", updated_at: T },
  { id: 6, parent_id: null, title: "Grace Liu", kind: "person", updated_at: T },
  { id: 7, parent_id: null, title: "Loose thought", updated_at: T },
  { id: 8, parent_id: 4, title: "Prep", updated_at: T },
  { id: 9, parent_id: null, title: "Customer portal v2", kind: "project", updated_at: T },
  { id: 10, parent_id: null, title: "Old", kind: "project", archived_at: T, updated_at: T },
  { id: 11, parent_id: null, title: "Ben Chen", kind: "person", updated_at: T },
  { id: 12, parent_id: 10, title: "Old notes", updated_at: T },
  { id: 13, parent_id: 10, title: "Old standup", kind: "meeting", updated_at: T },
]);

const capture = (extra) => ({ kind: "task", id: 41, title: "Check the numbers", quote: "Ben to check the numbers", hub_id: 1,
  hub_title: "Team", person_id: 5, person_name: "Ben Ortiz", role: "delegate", follow_up: "2026-11-30", due: null, open: true, ...extra });

test("capture model: the title drops list marks, a box and a trailing !day; the day is read", () => {
  assertEqual(titleOf("- [ ] Send Ada the deck !fri"), "Send Ada the deck");
  assertEqual(titleOf("  1. Ship it"), "Ship it");
  assertEqual(titleOf("* plain words"), "plain words");
  assertEqual(titleOf("ends with !bang words"), "ends with !bang words", "only a trailing !day");
  assertEqual(lineDue("Send it !fri", TODAY), "2026-11-27");
  assertEqual(lineDue("Send it", TODAY), null);
});

test("capture model: who the line names: an @mention, else a full name, else a unique first name", () => {
  const t = tree();
  assertEqual(findPerson("Ask @Grace and Ben Ortiz", t).person.id, 6, "a mention first");
  assertEqual(findPerson("send the deck to ben ortiz", t).person.id, 5, "a full name, any case");
  const grace = findPerson("Grace will share the dashboards with Chloe", t);
  assertEqual([grace.person.id, grace.at].join(), "6,0", "a first name only one person has");
  assertEqual(findPerson("Ben will check", t), null, "two Bens: no one");
  assertEqual(findPerson("grace will share", t), null, "a first name is written as a name");
  assertEqual(findPerson("nobody here", t), null);
});

test("capture model: the nearest hub: a meeting's parent, a note's area, a person; none for a loose note", () => {
  const t = tree();
  assertEqual(captureHub(t, 2).id, 1);
  assertEqual(captureHub(t, 3).id, 1);
  assertEqual(captureHub(t, 8).id, 4);
  assertEqual(captureHub(t, 7), null);
  assertEqual(captureHub(t, 4), null, "a person's own note");
  assertEqual(captureHub(t, 12), null, "a note in an archived hub");
  assertEqual(captureHub(t, 13), null, "a meeting under an archived hub, as nearest_hub");
  assertEqual(hubChoices(t).map((note) => note.id).join(), "9,1", "live projects and areas, by title");
  assertEqual(hubChoices(t, 8).map((note) => note.id).join(), "4,9,1", "and the person the note is under");
});

test("capture model: next working day skips the weekend; days step and read", () => {
  assertEqual(nextWorkingDay("2026-11-27"), "2026-11-30");
  assertEqual(nextWorkingDay("2026-11-30"), "2026-12-01");
  assertEqual(stepDay("2026-11-30", -1, TODAY), "2026-11-29");
  assertEqual(stepDay(null, 1, TODAY), "2026-11-28", "from today when none");
  assertEqual(readDay("fri", "2026-11-30"), "2026-12-04");
  assertEqual(readDay("2026-12-04", TODAY), "2026-12-04");
  assertEqual(readDay("", TODAY), null);
  assertEqual(readDay("soonish", TODAY), undefined);
  assertEqual(readDay("Mon 30 Novfri", TODAY), undefined, "a day typed after the shown one is not Monday");
});

test("capture model: the Due row says the line's !day only while it is that day", () => {
  const plain = sheetState({ kind: "task", text: "What is the budget for Q1", line: 0, sourceId: 2, tree: tree(), today: TODAY });
  assertEqual(dayRow(plain).note, "none");
  assertEqual(dayRow(withDay(plain, "2026-11-28")).note, "", "a stepped day did not come from the line");
  const dated = sheetState({ kind: "task", text: "Send the deck !fri", line: 0, sourceId: 2, tree: tree(), today: TODAY });
  assertEqual(dayRow(dated).note, "from the line's !day");
  assertEqual(dayRow(withDay(dated, "2026-12-05")).note, "");
});

test("capture model: a sheet on a meeting line: title, who, the delegate's follow-up, the hub", () => {
  const state = sheetState({ kind: "task", text: "Grace will share the dashboards with Chloe", line: 3, sourceId: 2, tree: tree(),
    meetingDay: "2026-11-27", today: TODAY });
  assertEqual([state.title, state.person.title, state.found, state.role, state.followUp, state.hubTitle, state.meeting].join("|"),
    "Grace will share the dashboards with Chloe|Grace Liu|true|delegate|2026-11-30|Team|true");
  assertEqual(roleChoices(state).map((choice) => choice.label).join(), "Grace does it,I owe Grace,Mine");
  assertEqual(fieldsOf(state).join(), "title,who,role,day,hub");
  assertEqual(JSON.stringify(payloadOf(state)), JSON.stringify({ source_id: 2, kind: "task", title: "Grace will share the dashboards with Chloe",
    quote: "Grace will share the dashboards with Chloe", hub_id: 1, person_id: 6, role: "delegate", follow_up: "2026-11-30" }));
  const owe = withRole(state, "for");
  assertEqual(JSON.stringify(payloadOf(owe)), JSON.stringify({ source_id: 2, kind: "task", title: "Grace will share the dashboards with Chloe",
    quote: "Grace will share the dashboards with Chloe", hub_id: 1, person_id: 6, role: "for" }), "I owe: Due, none yet");
  assertEqual(payloadOf(withDay(owe, "2026-12-04")).due, "2026-12-04");
});

test("capture model: a name later is who I owe; no one is mine; records take people, no role or day", () => {
  const owed = sheetState({ kind: "task", text: "- Send @Ada the numbers !fri", sourceId: 3, tree: tree(), today: TODAY });
  assertEqual([owed.title, owed.role, owed.due, owed.meeting].join("|"), "Send @Ada the numbers|for|2026-11-27|false");
  const mine = sheetState({ kind: "task", text: "Book the room", sourceId: 2, tree: tree(), today: TODAY });
  assertEqual([mine.role, roleChoices(mine).length, fieldsOf(mine).join()].join("|"), "mine|1|title,who,day,hub");
  assertEqual(payloadOf(mine).role, undefined, "no person, no role");
  const question = withKind(owed, "question");
  assertEqual(fieldsOf(question).join(), "title,who,hub");
  assertEqual(JSON.stringify(payloadOf(question)), JSON.stringify({ source_id: 3, kind: "question", title: "Send @Ada the numbers",
    quote: "- Send @Ada the numbers !fri", hub_id: 1, person_id: 4 }));
  assertEqual(withPerson(mine, tree().get(6)).role, "delegate", "a person picked does it");
  assertEqual(withPerson(owed, null).role, "mine");
});

test("capture model: no hub, or nothing on the line, opens no sheet", () => {
  assertEqual(sheetState({ kind: "task", text: "x", sourceId: 7, tree: tree(), today: TODAY }).error, "E: no hub to capture to");
  assertEqual(sheetState({ kind: "task", text: "   ", sourceId: 2, tree: tree(), today: TODAY }).error, "E: nothing on this line to capture");
});

test("capture model: marks on the lines whose trimmed text is a capture's quote, or holds it; chip texts", () => {
  const captures = [capture(), capture({ id: 42, kind: "question", quote: "Who owns it?", role: null, person_id: null, person_name: null }),
    capture({ id: 43, kind: "decision", quote: "Ship Monday", role: null })];
  const lines = ["intro", "  Ben to check the numbers ", "Who owns it? (edited)", "Ship Monday", "Who owns the budget"];
  const marks = captureMarks(captures, lines, TODAY);
  assertEqual(marks.map((mark) => `${mark.line}${mark.glyph}${mark.label}/${mark.tone}`).join(" | "),
    "1□Task → Ben · follow up Mon/info | 2?Question · in Team/question | 3◆Decision · in Team/decision");
  assertEqual(markText(capture({ role: "for", person_name: "Ada Park", due: "2026-12-04", follow_up: null }), TODAY), "Task · for Ada · due Fri");
  assertEqual(markText(capture({ role: "mine", person_id: null, person_name: null, follow_up: null }), TODAY), "Task · mine");
  assertEqual(markText(captures[1], TODAY), "Question · in Team");
  assertEqual(capturedOn(captures, lines, 3).map((each) => each.id).join(), "43");
  assertEqual(capturedOn(captures, lines, 0).length, 0);
  assertEqual(captureToRemove(captures, lines, 4), null, "nothing captured on this line");
});

test("capture model: a capture from a selection marks the line it is part of", () => {
  const selected = capture({ quote: "check the numbers" });
  const lines = ["intro", "- Ben to check the numbers by Friday", "check the numbers later too"];
  const marks = captureMarks([selected], lines, TODAY);
  assertEqual(marks.map((mark) => `${mark.line}${mark.glyph}`).join(), "1□", "the first line holding it, only");
  assertEqual(captureToRemove([selected], lines, 1)?.id, 41);
  const [chip] = captureHighlights([selected], lines, TODAY);
  assertEqual(chip.text, "- Ben to check the numbers by Friday", "the chip goes after the whole line");
  assertEqual(captureHighlights([capture({ quote: "not in the note" })], lines, TODAY).length, 0, "no line, no chip");
});

test("capture model: a line equal to the quote wins over one that contains it", () => {
  const lines = ["Call Ben about the budget", "  Call Ben ", "Call Ben"];
  const byLine = capturesByLine([capture({ quote: "Call Ben" })], lines);
  assertEqual([...byLine.keys()].join(), "1,2", "every equal line, not the earlier one holding it");
  assertEqual(captureMarks([capture({ quote: "Call Ben" })], lines, TODAY).map((mark) => mark.line).join(), "1,2");
  assertEqual(capturedOn([capture({ quote: "Call Ben" })], lines, 0).length, 0);
});

test("capture model: several captures on one line: the first made gives the mark, a chip each", () => {
  const line = "Ben to check the numbers and ship Monday";
  const captures = [
    capture({ id: 60, kind: "decision", quote: "ship Monday", role: null }),
    capture({ id: 61, quote: line }),
    capture({ id: 62, kind: "question", quote: "check the numbers", role: null }),
  ];
  const lines = ["intro", line];
  assertEqual(capturesByLine(captures, lines).get(1).map((each) => each.id).join(), "60,61,62", "in the order made");
  const marks = captureMarks(captures, lines, TODAY);
  assertEqual(marks.map((mark) => `${mark.line}${mark.glyph}${mark.label}`).join(" | "), "1◆Decision · in Team", "one mark: the first made");
  const chips = captureHighlights(captures, lines, TODAY);
  assertEqual(chips.map((each) => `${each.label}@${each.text}`).join(" | "),
    `Decision@${line} | Task → Ben · Mon@${line} | Question@${line}`);
});

test("capture model: \\u removes the line's first capture", () => {
  const captures = [capture({ id: 70, quote: "the numbers" }), capture({ id: 71, kind: "decision", quote: "Ben to check the numbers", role: null })];
  const lines = ["Ben to check the numbers"];
  assertEqual(captureToRemove(captures, lines, 0).id, 70, "the first made, though the other equals the line");
  assertEqual(captureToRemove(captures.slice(1), lines, 0).id, 71, "then the next");
});

test("capture model: the rendered notes' chips and the Agreed rows", () => {
  assertEqual(renderedText(capture(), TODAY), "Task → Ben · Mon");
  assertEqual(renderedText(capture({ kind: "question" }), TODAY), "Question");
  const highlights = captureHighlights([capture(), capture({ id: 50, kind: "decision" })], ["Ben to check the numbers"], TODAY);
  assertEqual(highlights.map((each) => `${each.label}:${each.data}:${each.capture}`).join(), "Task → Ben · Mon:null:task,Decision:50:decision");
  const rows = agreedRows([
    capture(),
    capture({ id: 44, role: "for", person_name: "Chloe Diaz", follow_up: null, due: "2026-12-04" }),
    capture({ id: 45, kind: "question", role: null, hub_title: "Customer portal v2" }),
    capture({ id: 46, kind: "decision", role: null, hub_title: "Customer portal v2" }),
  ], TODAY);
  assertEqual(rows.map((row) => `${row.chip.label}|${row.detail}`).join(" / "),
    "Task|Ben Ortiz · follow up Mon 30 Nov / Task|I owe Chloe · due Fri 4 Dec / Question|open · in Customer portal v2 / Decision|in Customer portal v2");
  assertEqual([rows[0].task, rows[0].id, rows[2].task, rows[2].id].join(), "41,1,,45", "a task opens its page, a record its note");
  assertEqual(stripParts([capture(), capture(), capture({ kind: "decision" })]).map((part) => `${part.label} ${part.count}`).join(),
    "Tasks 2,Questions 0,Decisions 1");
  assertTrue(rows.every((row) => row.depth === 0));
});
