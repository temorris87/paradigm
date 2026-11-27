// A task's emails (static/js/tasks/emails-model.js, task-emails.js): the row's words, the reply
// cycle, the keys, the page's Emails section with a fake API, drops of .msg and other files,
// and :attach off the task page.
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { runNoteCommand } from "../../static/js/notes/commands.js";
import { EMAIL_HINT, isMsgName, linkLabel, nextReply, removeEmailText, replyChip, senderLine,
  uploadError } from "../../static/js/tasks/emails-model.js";
import { ATTACH_REFUSAL, attachCommand } from "../../static/js/tasks/task-emails.js";
import { taskPageAction } from "../../static/js/tasks/task-page-keys.js";
import { TaskPage } from "../../static/js/tasks/task-page.js";
import { Tasks } from "../../static/js/tasks/tasks-model.js";
import { assertEqual as same, assertTrue, test } from "./harness.js";

const assertEqual = (actual, expected, message = "") => same(JSON.stringify(actual), JSON.stringify(expected), message);
const TODAY = new Date(2026, 10, 27); // a Friday
const email = (id, more = {}) => ({ id, task_id: 10, subject: `Quote ${id}`, sender: "Dana Reyes", sender_email: "dana@northwind.example",
  sent_at: "2026-11-25T14:05:00", reply: "needed", replied_on: null, file_name: `${id}.msg`, added_at: "2026-11-26T09:00:00", ...more });

test("emails: the reply cycle", () => {
  assertEqual(["needed", "replied", "none"].map(nextReply), ["replied", "none", "needed"]);
});

test("emails: the chip, the sender line, the link, the confirm", () => {
  assertEqual(replyChip(email(1), TODAY), { text: "Reply needed", tone: "caution" });
  assertEqual(replyChip(email(1, { reply: "none" }), TODAY), null, "no chip for No reply");
  assertEqual(replyChip(email(1, { reply: "replied", replied_on: "2026-11-27" }), TODAY).text, "Replied Fri", "today: its weekday");
  assertEqual(replyChip(email(1, { reply: "replied", replied_on: "2026-11-21" }), TODAY), { text: "Replied Sat", tone: "success" });
  assertEqual(replyChip(email(1, { reply: "replied", replied_on: "2026-11-20" }), TODAY).text, "Replied 20 Nov", "a week ago: its date");
  assertEqual(replyChip(email(1, { reply: "replied", replied_on: "2025-12-01" }), TODAY).text, "Replied 1 Dec 2025");
  assertEqual(senderLine(email(1), TODAY), "Dana Reyes · Wed 25 Nov 14:05");
  assertEqual(senderLine(email(1, { sender: "", sent_at: null }), TODAY), "dana@northwind.example");
  assertEqual([linkLabel(email(1)), linkLabel(email(1, { reply: "replied" })), linkLabel(email(1, { reply: "none" }))],
    ["Reply ↗", "Open ↗", "Open ↗"]);
  assertEqual(removeEmailText(email(1)), 'Remove "Quote 1" from this task? The saved copy is deleted.');
  assertEqual([isMsgName("Re Quote.msg"), isMsgName("A.MSG"), isMsgName("photo.png"), isMsgName("msg")], [true, true, false, false]);
});

test("emails: an upload's refusal reads", () => {
  assertEqual(uploadError({ status: 400, message: "not an Outlook message (.msg)" }, "a.msg"), "E: not an Outlook message (.msg): a.msg");
  assertEqual(uploadError({ status: 409, message: "already on this task" }, "a.msg"), "E: already on this task");
  assertEqual(uploadError({ status: 413, message: "HTTP 413" }, "big.msg"), "E: over 30 MB: big.msg");
  assertEqual(uploadError({ status: 404, message: "no such task" }, "a.msg"), "E: no such task");
});

test("emails: the keys on a task's page", () => {
  const key = (k) => taskPageAction(new KeyboardEvent("keydown", { key: k }));
  assertEqual(["r", "o", "Enter", "x", "Delete"].map(key), ["reply", "openEmail", "open", "remove", "remove"]);
});

const NOTES = [
  { id: 1, parent_id: null, title: "Move", kind: "project" },
  { id: 4, parent_id: null, title: "Old", kind: "project", archived_at: "2026-11-01T00:00:00Z" },
];
const task = (id, title, more = {}) => ({ id, note_id: 1, parent_id: null, title, notes: "", due: "", delegate_id: null,
  follow_up: "", done: false, done_day: "", position: id, estimate_min: null, for_person_id: null, ...more });
const TASKS = [task(10, "Book van"), task(11, "Get quotes", { parent_id: 10 }), task(30, "Old one", { note_id: 4 })];
const tick = async (times = 5) => {
  for (let step = 0; step < times; step += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

function fakeEmailsApi(list) {
  const calls = [];
  let rows = list.map((each) => ({ ...each }));
  let next = 100;
  return {
    calls,
    list: async (taskId) => {
      calls.push(["list", taskId]);
      return rows.map((each) => ({ ...each }));
    },
    upload: async (taskId, name) => {
      calls.push(["upload", taskId, name]);
      if (name === "twice.msg" && rows.some((each) => each.file_name === name)) {
        throw Object.assign(new Error("already on this task"), { status: 409 });
      }
      const added = email(next, { subject: name.replace(/\.msg$/, ""), file_name: name, sent_at: "2026-11-26T08:00:00" });
      next += 1;
      rows = [added, ...rows];
      return added;
    },
    setReply: async (id, reply) => {
      calls.push(["reply", id, reply]);
      rows = rows.map((each) => (each.id === id ? { ...each, reply, replied_on: reply === "replied" ? "2026-11-27" : null } : each));
      return rows.find((each) => each.id === id);
    },
    open: async (id) => {
      calls.push(["open", id]);
      return { ok: true };
    },
    remove: async (id) => {
      calls.push(["remove", id]);
      rows = rows.filter((each) => each.id !== id);
      return { ok: true };
    },
  };
}

function fakeApp() {
  const calls = [];
  return {
    calls,
    role: "main",
    tasks: new Tasks(TASKS),
    guard: (promise) => promise?.catch?.((error) => calls.push(["error", error.message])),
    open: async (id) => calls.push(["openNote", id]),
    showTask: async (id) => calls.push(["showTask", id]),
    say: (text, { error = false } = {}) => calls.push([error ? "error" : "say", text]),
    markdownOptions: () => ({}),
  };
}

async function withEmails(body, { taskId = 10, list = [email(1), email(2, { reply: "replied", replied_on: "2026-11-26" })] } = {}) {
  const section = document.createElement("section");
  document.body.append(section);
  const api = fakeEmailsApi(list);
  const app = fakeApp();
  const page = new TaskPage(section, { app: () => app, onLeave() {}, emailsApi: api });
  try {
    page.show({ tree: new NoteTree(NOTES), tasks: new Tasks(TASKS), trash: { entries: [] }, taskId, today: TODAY });
    await tick();
    return await body({ page, section, api, app });
  } finally {
    document.querySelector("dialog")?.remove();
    section.remove();
  }
}

const press = (section, key) => section.querySelector(".task-page__body")
  .dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
const subjects = (section) => [...section.querySelectorAll(".task-emails__subject")].map((node) => node.textContent);
const selectedSubject = (section) => section.querySelector("[aria-selected=true] .task-emails__subject")?.textContent ?? null;
const fileOf = (name) => new File(["x"], name);

test("emails: the section's rows, after the subtasks in one list", () => withEmails(async ({ section, api }) => {
  assertEqual(api.calls[0], ["list", 10]);
  assertEqual(subjects(section), ["Quote 1", "Quote 2"]);
  const first = section.querySelector(".task-emails__row");
  assertEqual(first.querySelector(".task-emails__chip").textContent, "Reply needed");
  assertTrue(first.querySelector(".task-emails__chip--caution"), "caution tone");
  assertEqual(first.querySelector(".task-emails__link").textContent, "Reply ↗");
  assertEqual(first.querySelector(".task-emails__sender").textContent, "Dana Reyes · Wed 25 Nov 14:05");
  assertEqual(section.querySelectorAll(".task-emails__row")[1].querySelector(".task-emails__chip").textContent, "Replied Thu");
  press(section, "j");
  assertEqual(selectedSubject(section), null, "the subtask first");
  press(section, "j");
  assertEqual(selectedSubject(section), "Quote 1");
  press(section, "G");
  assertEqual(selectedSubject(section), "Quote 2");
}));

test("emails: r cycles the reply and the row keeps its place; o, Enter and the link open it", () => withEmails(async ({ section, api }) => {
  press(section, "G");
  press(section, "k");
  press(section, "r");
  await tick();
  assertEqual(api.calls.at(-1), ["reply", 1, "replied"]);
  assertEqual(selectedSubject(section), "Quote 1");
  assertEqual(section.querySelector("[aria-selected=true] .task-emails__chip").textContent, "Replied Fri");
  press(section, "r");
  await tick();
  assertEqual(api.calls.at(-1), ["reply", 1, "none"]);
  assertEqual(section.querySelector("[aria-selected=true] .task-emails__chip"), null, "No reply: no chip");
  press(section, "o");
  press(section, "Enter");
  section.querySelectorAll(".task-emails__link")[1].click();
  await tick();
  assertEqual(api.calls.filter(([kind]) => kind === "open"), [["open", 1], ["open", 1], ["open", 2]]);
  assertEqual(selectedSubject(section), "Quote 2", "a click on the link selects its row");
}));

test("emails: x asks first; cancel keeps it, confirm removes it", () => withEmails(async ({ section, api }) => {
  press(section, "G");
  press(section, "x");
  let dialog = document.querySelector("dialog");
  assertTrue(dialog.textContent.includes('Remove "Quote 2" from this task? The saved copy is deleted.'));
  dialog.querySelector(".dialog__button:not(.dialog__button--ok)").click();
  await tick();
  assertEqual(api.calls.filter(([kind]) => kind === "remove"), []);
  assertEqual(subjects(section), ["Quote 1", "Quote 2"]);
  press(section, "x");
  dialog = document.querySelector("dialog");
  dialog.querySelector(".dialog__button--ok").click();
  await tick();
  assertEqual(api.calls.filter(([kind]) => kind === "remove"), [["remove", 2]]);
  assertEqual(subjects(section), ["Quote 1"]);
}));

test("emails: x on a subtask still deletes the subtask", () => withEmails(async ({ section, api }) => {
  press(section, "j");
  press(section, "x");
  const dialog = document.querySelector("dialog");
  assertTrue(dialog.textContent.includes('Delete "Get quotes"'), dialog.textContent);
  dialog.querySelector(".dialog__button:not(.dialog__button--ok)").click();
  await tick();
  assertEqual(api.calls.filter(([kind]) => kind === "remove"), []);
}));

test("emails: dropped files: each .msg goes in, anything else is refused by name", () => withEmails(async ({ page, section, api, app }) => {
  await page.emails.attachFiles([fileOf("Kickoff.msg"), fileOf("photo.png"), fileOf("Budget.msg")]);
  assertEqual(api.calls.filter(([kind]) => kind === "upload"), [["upload", 10, "Kickoff.msg"], ["upload", 10, "Budget.msg"]]);
  assertEqual(app.calls.at(-1), ["error", "2 emails attached · E: not an Outlook message (.msg): photo.png"]);
  assertTrue(subjects(section).includes("Budget"), "the list is read again");
  await page.emails.attachFiles([fileOf("twice.msg")]);
  await page.emails.attachFiles([fileOf("twice.msg")]);
  assertEqual(app.calls.at(-1), ["error", "E: already on this task"]);
}, { list: [] }));

test("emails: a .msg over 30 MB is refused before it is sent", () => withEmails(async ({ page, api, app }) => {
  const big = { name: "huge.msg", size: 30_000_001 };
  await page.emails.attachFiles([big]);
  assertEqual(api.calls.filter(([kind]) => kind === "upload"), []);
  assertEqual(app.calls.at(-1), ["error", "E: over 30 MB: huge.msg"]);
}, { list: [] }));

test("emails: none yet shows the hint; an archived task takes no drop or :attach", async () => {
  await withEmails(async ({ section }) => {
    assertEqual(section.querySelector(".task-emails__hint").textContent, EMAIL_HINT);
  }, { list: [] });
  await withEmails(async ({ page, section, api, app }) => {
    const drop = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() });
    drop.dataTransfer.items.add(fileOf("a.msg"));
    section.querySelector(".task-page__body").dispatchEvent(drop);
    await tick();
    assertEqual(api.calls.filter(([kind]) => kind === "upload"), []);
    assertTrue(app.calls.some(([kind, text]) => kind === "error" && text.includes("read-only")), JSON.stringify(app.calls));
    let refused = "";
    try {
      page.attach();
    } catch (error) {
      refused = error.message;
    }
    assertTrue(refused.includes("read-only"));
  }, { taskId: 30, list: [] });
});

test("emails: a drop of files on the task page uploads them", () => withEmails(async ({ section, api }) => {
  const transfer = new DataTransfer();
  transfer.items.add(fileOf("Kickoff.msg"));
  const over = new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer });
  section.querySelector(".task-page__body").dispatchEvent(over);
  assertTrue(over.defaultPrevented, "the page takes the drop");
  const drop = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer });
  section.querySelector(".task-page__body").dispatchEvent(drop);
  assertTrue(drop.defaultPrevented, "the browser never opens the file");
  await tick();
  assertEqual(api.calls.filter(([kind]) => kind === "upload"), [["upload", 10, "Kickoff.msg"]]);
}, { list: [] }));

test("emails: :attach on the task page opens the picker; anywhere else it is refused", async () => {
  let picked = 0;
  const onTask = { role: "main", views: { shown: "task", pages: { task: { attach: () => { picked += 1; } } } } };
  await attachCommand(onTask);
  assertEqual(picked, 1);
  const refusal = async (app) => {
    try {
      await runNoteCommand(app, { name: "attach", arg: "" });
    } catch (error) {
      return error.message;
    }
    return "";
  };
  assertEqual(await refusal({ ...onTask, views: { ...onTask.views, shown: "home" } }), ATTACH_REFUSAL, "Today");
  assertEqual(await refusal({ ...onTask, role: "note", views: null }), ATTACH_REFUSAL, "the note window");
  assertEqual(await refusal({ role: "main", views: { shown: null, pages: onTask.views.pages } }), ATTACH_REFUSAL, "a dashboard");
  assertEqual(ATTACH_REFUSAL, "E: open the task's page to attach");
});

test("emails: + Add subtask still adds one with an email selected; r on a subtask does nothing", () => withEmails(async ({ section, api }) => {
  press(section, "j");
  press(section, "r");
  await tick();
  assertEqual(api.calls.filter(([kind]) => kind === "reply"), []);
  press(section, "G");
  section.querySelector(".task-page__add").click();
  const dialog = document.querySelector("dialog");
  assertTrue(dialog, "the new subtask dialog");
  dialog.querySelector(".dialog__button:not(.dialog__button--ok)").click();
  await tick();
}));
