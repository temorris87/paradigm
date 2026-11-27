// A task's Emails section on its page (task-page.js): the Outlook messages saved with it, one
// row each (✉ subject, the reply chip, sender and sent time, Reply ↗ / Open ↗), the page as a
// drop target for .msg files, and :attach's file input. The rows are options of the page's
// listbox; the page owns the selection and the keys, and hands an email row's actions here.
//
//   const emails = new TaskEmails({ api, app: () => notesApp, redraw() });
//   emails.sync(taskId)            loads the task's emails when the page shows another task
//   emails.rows()                  [{ email }], newest sent first, for the page's row list
//   emails.draw(option, { readOnly, today })  the section; option(node, index) makes a row an
//                                  option, numbered from emails.first (set by the page)
//   emails.perform(action, email)  "open" | "openEmail" | "reply" | "remove"
//   emails.attachFiles(files)      uploads each .msg; anything else is refused by name
//   emails.pick()                  :attach: the browser's file picker
//   emails.listenForDrops(node, { accepts, refusal })  a drop of files on node attaches them
//   attachCommand(app)             :attach: the task page's picker; anywhere else (Today, the
//                                  note window...) refused
import { confirmDialog } from "../ui/dialog.js";
import { chip as statusChip } from "../ui/chip.js";
import { EMAIL_HINT, MAX_EMAIL_BYTES, isMsgName, linkLabel, nextReply, notMsgText, removeEmailText, replyChip,
  senderLine, tooBigText, uploadError } from "./emails-model.js";

export const ATTACH_REFUSAL = "E: open the task's page to attach";

/** Async, so a refusal is a rejection for app.guard; the picker still opens inside the key's
 * user activation, since the body runs at once up to its end. */
export async function attachCommand(app) {
  const page = app.role === "main" && app.views?.shown === "task" ? app.views.pages?.task : null;
  if (!page?.attach) throw new Error(ATTACH_REFUSAL);
  page.attach();
}

export class TaskEmails {
  constructor({ api, app, redraw }) {
    this.api = api;
    this.app = app;
    this.redraw = redraw;
    this.taskId = null;
    this.list = [];
    this.first = 0;
    this.input = document.createElement("input");
    this.input.type = "file";
    this.input.accept = ".msg";
    this.input.multiple = true;
    this.input.hidden = true;
    this.input.className = "task-emails__input";
    this.input.addEventListener("change", () => {
      const files = [...this.input.files];
      this.input.value = "";
      if (files.length) this.app().guard(this.attachFiles(files));
    });
  }

  sync(taskId) {
    if (taskId === this.taskId) return;
    this.taskId = taskId;
    this.list = [];
    if (this.api) this.app().guard(this.load());
  }

  async load() {
    const taskId = this.taskId;
    const list = await this.api.list(taskId);
    // Another task's page may have come up while this one loaded.
    if (taskId !== this.taskId) return;
    this.list = list;
    this.redraw();
  }

  rows() {
    return this.list.map((email) => ({ email }));
  }

  draw(option, { readOnly = false, today = new Date() } = {}) {
    const section = element("section", "task-emails");
    section.append(element("h3", "task-emails__heading", "Emails"), this.input);
    if (!this.list.length) {
      section.append(element("p", "task-emails__hint", readOnly ? "No emails" : EMAIL_HINT));
      return section;
    }
    this.list.forEach((email, at) => section.append(option(this.row(email, today), this.first + at)));
    return section;
  }

  row(email, today) {
    const node = element("div", "task-emails__row");
    const line = element("div", "task-emails__line");
    line.append(element("span", "task-emails__icon", "✉"), element("span", "task-emails__subject", email.subject || "(no subject)"));
    const chip = replyChip(email, today);
    if (chip) line.append(statusChip(chip.text, chip.tone));
    const link = element("button", "task-emails__link", linkLabel(email));
    link.type = "button";
    link.tabIndex = -1;
    link.title = "Open it in Outlook (o)";
    link.dataset.action = "openEmail";
    line.append(link);
    node.append(line);
    const sender = senderLine(email, today);
    if (sender) node.append(element("p", "task-emails__sender", sender));
    return node;
  }

  perform(action, email) {
    switch (action) {
      case "open":
      case "openEmail": return this.open(email);
      case "reply": return this.cycleReply(email);
      case "remove": return this.remove(email);
      default: return undefined;
    }
  }

  async open(email) {
    await this.api.open(email.id);
    this.app().say(`Opening "${email.subject}" in Outlook`);
  }

  async cycleReply(email) {
    const changed = await this.api.setReply(email.id, nextReply(email.reply));
    this.list = this.list.map((each) => (each.id === changed.id ? changed : each));
    this.redraw();
  }

  remove(email) {
    return confirmDialog({
      title: "Remove email",
      text: removeEmailText(email),
      confirm: "Remove",
      danger: true,
      safeFocus: true,
      run: async () => {
        await this.api.remove(email.id);
        this.list = this.list.filter((each) => each.id !== email.id);
        this.redraw();
        this.app().say(`"${email.subject}" removed`);
        return true;
      },
    });
  }

  /** Each file in turn: one refused never stops the others. */
  async attachFiles(files) {
    const taskId = this.taskId;
    if (!this.api || taskId === null) return;
    const added = [];
    const refused = [];
    for (const file of files) {
      if (!isMsgName(file.name)) {
        refused.push(notMsgText(file.name));
        continue;
      }
      if (file.size > MAX_EMAIL_BYTES) {
        refused.push(tooBigText(file.name));
        continue;
      }
      try {
        added.push(await this.api.upload(taskId, file.name, file));
      } catch (error) {
        refused.push(uploadError(error, file.name));
      }
    }
    if (added.length && taskId === this.taskId) {
      this.list = await this.api.list(taskId);
      this.redraw();
    }
    const done = added.length === 1 ? `"${added[0].subject}" attached` : added.length ? `${added.length} emails attached` : "";
    const text = [done, ...refused].filter(Boolean).join(" · ");
    if (text) this.app().say(text, { error: refused.length > 0 });
  }

  pick() {
    this.input.click();
  }

  /** accepts(): a page to drop on (a task shown); refusal(): why not now ("" when it may). */
  listenForDrops(node, { accepts, refusal = () => "" }) {
    const hasFiles = (event) => [...(event.dataTransfer?.types ?? [])].includes("Files");
    node.addEventListener("dragover", (event) => {
      if (!hasFiles(event) || !accepts()) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      node.classList.add("task-page--drop");
    });
    node.addEventListener("dragleave", (event) => {
      if (!node.contains(event.relatedTarget)) node.classList.remove("task-page--drop");
    });
    node.addEventListener("drop", (event) => {
      node.classList.remove("task-page--drop");
      if (!hasFiles(event)) return;
      // The window's own listener stops the browser opening the file; this one takes it.
      event.preventDefault();
      if (!accepts()) return;
      const refused = refusal();
      if (refused) return this.app().say(refused, { error: true });
      return this.app().guard(this.attachFiles([...event.dataTransfer.files]));
    });
  }
}

function element(tag, className, text = null) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== null) node.textContent = text;
  return node;
}
