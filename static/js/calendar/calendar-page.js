// The Week page's Plan (in the main window, &week; static/js/week/week-page.js holds it): a
// week of meetings and task blocks with each day's capacity and what is due, the tray of tasks
// to plan onto it, and the Outlook import. It loads what it shows from the server and tells
// the other windows what it changed (connection/changes.js); a note opens in the note window
// (openNote).
//
//   const page = new CalendarPage({ root, bar, side, week, api: { notes, meetings, tasks, calendar,
//                                   plan?, time? }, changes, openNote(id), isShown(), today,
//                                   onMove?(days), onDrawn?() });
//     onMove: the week page moves the week (days: -7, 7, or 0 for this one); without it the
//             page has its own ‹ Today › in its bar
//   page.show() / page.focus()      when its page comes into view (loads it the first time)
//   page.setMonday(day)             show that week
//   page.data, page.settings, page.days()    what it shows (the week page's summary)
// Its keys work while the focus is inside root (calendar-keys.js).
//
// What the pointer does (week-model.js, grid-view.js, drag.js):
//   drag a task from the list     a block of it there, 30 minutes (another each time)
//   drag a block                  moves it (another day too); a meeting from "all day" gets a time
//   drag a block's bottom edge    makes it longer or shorter (15-minute steps)
//   click a block (or right-click)  its menu: open, done, edit time, remove / cancel
//   click an empty slot           New meeting… at that time
import { NoteTree } from "../notes/tree-model.js";
import { Meetings } from "../meetings/meetings-model.js";
import { Tasks } from "../tasks/tasks-model.js";
import { addDays, dateOf, localDay, whenText } from "../meetings/meeting-days.js";
import { weekRange } from "../ui/dates.js";
import { groupForKind, isArchived, isHub } from "../notes/hub-groups.js";
import { formDialog, confirmDialog } from "../ui/dialog.js";
import { openMenu } from "../ui/menu.js";
import { calendarAction } from "./calendar-keys.js";
import { trackDrag } from "./drag.js";
import { GridView } from "./grid-view.js";
import { TaskSidebar } from "./task-sidebar.js";
import { DAY_MINUTES, DEFAULT_LENGTH, STEP, calendarBlocks, clock, shownDays, snap, weekDays, weekOf } from "./week-model.js";
import { Plan } from "../plan/plan-model.js";
import { planningSettings } from "../today/today-model.js";
import { dayCapacity, firstFreeSlot, isWorkingDay } from "../week/capacity.js";
import { dueChips } from "../week/tray-model.js";

// Blocks are read this far ahead of today too: how much of a task is placed already.
const PLACED_AHEAD_DAYS = 60;

const START_HOUR = 7;
const SHORTEST = STEP;

export class CalendarPage {
  constructor({ root, bar, side, week, api, changes, openNote = () => {}, isShown = () => true, today = () => new Date(),
                location = window.location, onMove = null, onDrawn = () => {} }) {
    this.onMove = onMove;
    this.onDrawn = onDrawn;
    this.settings = {};
    this.root = root;
    this.openNoteIn = openNote;
    this.isShown = isShown;
    this.started = false;
    this.api = api;
    this.changes = changes;
    this.today = today;
    this.monday = weekOf(localDay(today()));
    this.weekend = false;
    this.selected = null;
    this.data = { tree: new NoteTree(), meetings: new Meetings(), tasks: new Tasks(), sessions: [], pending: [], plan: new Plan() };
    this.blocks = [];
    this.status = null;
    this.location = location;
    this.bar = this.makeBar(bar);
    this.side = new TaskSidebar(side, {
      onTaskDown: (entry, event) => this.dragTask(entry, event),
      onToggle: (entry) => this.run(this.setDone(entry.task.id, !entry.task.done)),
      onOpen: (entry) => this.run(this.openNote(entry.note.id)),
      onFile: (ids, hubId) => this.run(this.file(ids, hubId)),
      onIgnore: (ids) => this.run(this.ignore(ids)),
      onFilter: () => this.drawSide(),
    });
    this.grid = new GridView(week, {
      onBlockDown: (block, event, part) => this.blockDown(block, event, part),
      onSlotClick: (day, minute) => this.run(this.newMeetingAt(day, snap(minute - STEP / 2))),
      onBlockMenu: (block, node) => this.blockMenu(block, node),
      onChip: (chip) => this.run(this.openNote(chip.noteId)),
    });
    root.addEventListener("keydown", (event) => this.onKey(event));
    // Coming back to the window: the import folder may hold today's export by now.
    window.addEventListener("focus", () => {
      if (this.started && this.isShown()) this.run(this.importAndLoad({ quiet: true }));
    });
    changes.listen((message) => {
      if (message.type === "changed" && this.started) this.run(this.load());
    });
    for (const type of ["dragover", "drop"]) {
      root.addEventListener(type, (event) => {
        if (![...(event.dataTransfer?.types ?? [])].includes("Files")) return;
        event.preventDefault();
        if (type === "drop") this.run(this.uploadFiles(event.dataTransfer.files));
      });
    }
  }

  async start() {
    this.started = true;
    await this.importAndLoad({ quiet: true });
    this.grid.scrollToMinute(START_HOUR * 60);
  }

  /** Its page came into view: loaded the first time, read again after. */
  show() {
    if (!this.started) this.run(this.start());
    else this.run(this.importAndLoad({ quiet: true }));
  }

  focus() {
    this.root.focus({ preventScroll: true });
  }

  // ---- loading and drawing ----------------------------------------------------------

  setMonday(monday) {
    this.monday = monday;
    this.selected = null;
    if (this.started) this.run(this.load());
  }

  days() {
    return weekDays(this.monday);
  }

  async load() {
    const days = weekDays(this.monday);
    const today = localDay(this.today());
    const first = days[0] < today ? days[0] : today;
    const ahead = localDay(addDays(dateOf(today), PLACED_AHEAD_DAYS));
    const last = days[6] > ahead ? days[6] : ahead;
    const [notes, meetings, tasks, sessions, pending, status, plan, time] = await Promise.all([
      this.api.notes.list(), this.api.meetings.list(), this.api.tasks.list(),
      this.api.tasks.sessions(first, last), this.api.calendar.pending(), this.api.calendar.status(),
      this.api.plan?.list() ?? undefined, this.api.time?.settings().catch(() => null) ?? null,
    ]);
    this.data = { tree: new NoteTree(notes), meetings: new Meetings(meetings), tasks: new Tasks(tasks), sessions, pending,
      plan: new Plan(plan) };
    this.settings = planningSettings(time);
    this.status = status;
    this.draw();
  }

  draw() {
    const days = weekDays(this.monday);
    this.blocks = calendarBlocks(this.data, days);
    const shown = shownDays(days, this.blocks, this.weekend, localDay(this.today()));
    const now = this.today();
    const capacity = Object.fromEntries(shown.filter((day) => isWorkingDay(day, this.settings))
      .map((day) => [day, dayCapacity(this.data, day, this.settings)]));
    this.grid.draw({ days: shown, blocks: this.blocks, today: localDay(now), now: now.getHours() * 60 + now.getMinutes(),
      selected: this.selected, capacity, chips: dueChips(this.data, days) });
    if (this.bar.week) this.bar.week.textContent = weekLabel(days);
    this.bar.weekend.setAttribute("aria-pressed", String(this.weekend));
    // Off, a weekend day still shows when something is on it; on, both always show.
    this.bar.weekend.textContent = this.weekend ? "Hide weekend" : "Show weekend";
    this.drawStatus();
    this.drawSide();
    this.onDrawn();
  }

  drawSide() {
    this.side.draw({ tree: this.data.tree, tasks: this.data.tasks, sessions: this.data.sessions, pending: this.data.pending,
      hubs: liveHubs(this.data.tree), today: localDay(this.today()), monday: this.monday });
  }

  drawStatus(message = "") {
    const status = this.status;
    const text = message || (!status ? "" : status.imported_today ? `Calendar imported today`
      : `Calendar not imported today. In Outlook: File › Save Calendar, Next 7 days, Full details, into ${status.folder}`);
    this.bar.status.textContent = text;
    this.bar.status.classList.toggle("cal-bar__status--due", Boolean(status && !status.imported_today && !message));
  }

  makeBar(bar) {
    const make = (text, title, onClick) => {
      const node = element("button", "cal-button", text);
      Object.assign(node, { type: "button", title });
      node.addEventListener("click", onClick);
      return node;
    };
    const week = element("h1", "cal-bar__week");
    const weekend = make("Show weekend", "Show or hide Saturday and Sunday (w)", () => this.toggleWeekend());
    const picker = element("input", "");
    Object.assign(picker, { type: "file", accept: ".ics,text/calendar", multiple: true, hidden: true });
    picker.addEventListener("change", () => {
      this.run(this.uploadFiles(picker.files));
      picker.value = "";
    });
    const status = element("span", "cal-bar__status");
    status.setAttribute("role", "status");
    // Held by the week page, the week's own controls are its; alone, the page has them.
    const navigation = this.onMove ? [] : [
      make("‹", "The week before ([)", () => this.moveWeek(-7)),
      make("Today", "This week (t)", () => this.goToday()),
      make("›", "The week after (])", () => this.moveWeek(7)),
      week];
    bar.replaceChildren(
      ...navigation, weekend,
      make("Import", "Import the calendar files in the import folder (i)", () => this.run(this.importAndLoad({ quiet: false }))),
      make("Import a file…", "Pick a calendar file (.ics) saved from Outlook", () => picker.click()),
      picker, status,
    );
    return { week: this.onMove ? null : week, weekend, status };
  }

  // ---- the week ---------------------------------------------------------------------

  moveWeek(days) {
    if (this.onMove) return this.onMove(days);
    this.monday = localDay(addDays(dateOf(this.monday), days));
    this.selected = null;
    this.run(this.load());
  }

  goToday() {
    if (this.onMove) return this.onMove(0);
    this.monday = weekOf(localDay(this.today()));
    this.run(this.load());
  }

  toggleWeekend() {
    this.weekend = !this.weekend;
    this.draw();
  }

  // ---- dragging -----------------------------------------------------------------------

  dragTask(entry, down) {
    const title = entry.task.title;
    let target = null;
    trackDrag(down, {
      onMove: (event) => {
        const slot = this.grid.slotAt(event.clientX, event.clientY);
        if (!slot) {
          target = null;
          return this.grid.hideGhost();
        }
        const start = Math.min(snap(slot.minute - DEFAULT_LENGTH / 2), DAY_MINUTES - DEFAULT_LENGTH);
        target = { day: slot.day, start, end: start + DEFAULT_LENGTH };
        return this.grid.showGhost(slot.day, target.start, target.end, title);
      },
      onDrop: () => {
        this.grid.hideGhost();
        if (target) this.run(this.addBlock(entry.task.id, target));
      },
      onClick: () => this.run(this.openNote(entry.note.id)),
      onCancel: () => this.grid.hideGhost(),
    });
  }

  blockDown(block, down, part) {
    const grabbed = this.grid.slotAt(down.clientX, down.clientY);
    const offset = block.timed && grabbed ? grabbed.minute - block.start : DEFAULT_LENGTH / 2;
    const length = block.timed ? block.end - block.start : DEFAULT_LENGTH;
    let target = null;
    trackDrag(down, {
      onMove: (event) => {
        const slot = this.grid.slotAt(event.clientX, event.clientY);
        if (!slot) {
          target = null;
          return this.grid.hideGhost();
        }
        if (part === "end") {
          const end = Math.min(DAY_MINUTES, Math.max(block.start + SHORTEST, snap(slot.minute)));
          target = { day: block.day, start: block.start, end };
        } else {
          const start = Math.max(0, Math.min(snap(slot.minute - offset), DAY_MINUTES - length));
          target = { day: slot.day, start, end: start + length };
        }
        return this.grid.showGhost(target.day, target.start, target.end, block.title);
      },
      onDrop: () => {
        this.grid.hideGhost();
        if (target) this.run(this.placeBlock(block, target));
      },
      onClick: () => this.blockMenu(block, this.grid.blockNodeFor(block.key)),
      onCancel: () => this.grid.hideGhost(),
    });
  }

  async addBlock(taskId, { day, start, end }) {
    await this.api.tasks.addSession(taskId, day, clock(start), clock(end));
    await this.changed(["tasks"]);
  }

  async placeBlock(block, { day, start, end }) {
    if (block.kind === "task") await this.api.tasks.moveSession(block.id, day, clock(start), clock(end));
    else if (block.kind === "meeting") await this.api.meetings.update(block.id, day, clock(start), clock(end));
    await this.changed(["tasks", "meetings"]);
  }

  /** s: the task's estimate (or 30 min) in the first free slot from now on, before its due day. */
  async schedule(taskId) {
    const task = this.data.tasks.get(taskId);
    if (!task) return;
    const now = this.today();
    const day = localDay(now);
    const length = task.estimate_min || DEFAULT_LENGTH;
    const until = task.due && task.due >= day ? task.due : "";
    const slot = firstFreeSlot(this.data, { length, from: { day, minute: now.getHours() * 60 + now.getMinutes() }, until,
      settings: this.settings });
    if (!slot) {
      this.say(`No free ${length} min${until ? " before it is due" : " in the next two weeks"} for "${task.title}"`);
      return;
    }
    await this.api.tasks.addSession(taskId, slot.day, clock(slot.start), clock(slot.end));
    await this.changed(["tasks"]);
    this.say(`"${task.title}" placed ${whenText({ day: slot.day, time: clock(slot.start), end_time: clock(slot.end) })}`);
  }

  // ---- a block's menu -------------------------------------------------------------------

  blockMenu(block, node) {
    if (!node) return;
    this.select(block.key);
    const entries = block.kind === "task" ? [
      { label: "Open its note", run: () => this.run(this.openNote(block.noteId)) },
      { label: block.done ? "Open it again" : "Mark done", run: () => this.run(this.setDone(block.taskId, !block.done)) },
      { label: "Edit time…", run: () => this.run(this.editTime(block)) },
      "separator",
      { label: "Remove from calendar", danger: true, run: () => this.run(this.removeBlock(block)) },
    ] : block.kind === "meeting" ? [
      { label: "Open the meeting", run: () => this.run(this.openNote(block.noteId)) },
      ...(this.data.meetings.get(block.id).join_url ? [{ label: "Join ↗", run: () => window.open(this.data.meetings.get(block.id).join_url, "_blank", "noopener") }] : []),
      { label: "Edit time…", run: () => this.run(this.editTime(block)) },
      "separator",
      block.cancelled ? { label: "Not cancelled", run: () => this.run(this.cancelMeeting(block, false)) }
        : { label: "Cancel the meeting", danger: true, run: () => this.run(this.cancelMeeting(block, true)) },
    ] : [
      { label: "File it…", run: () => this.side.show("file") },
      { label: "Don't import", danger: true, run: () => this.run(this.ignore([block.id])) },
    ];
    openMenu(node, entries, { label: block.title });
  }

  select(key) {
    this.selected = key;
    for (const node of document.querySelectorAll(".cal-block--selected")) node.classList.remove("cal-block--selected");
    this.grid.blockNodeFor(key)?.classList.add("cal-block--selected");
  }

  editTime(block) {
    return formDialog({
      title: `When is "${block.title}"?`,
      fields: [
        { key: "day", label: "Date", type: "date", value: block.day },
        { key: "start", label: "Starts", type: "time", value: block.timed ? clock(block.start) : "", optional: block.kind === "meeting" },
        { key: "end", label: "Ends", type: "time", value: block.timed ? clock(block.end) : "", optional: block.kind === "meeting" },
      ],
      submit: "Save",
      run: async ({ day, start, end }) => {
        if (block.kind === "task") await this.api.tasks.moveSession(block.id, day, start, end);
        else await this.api.meetings.update(block.id, day, start, start ? end : "");
        await this.changed(["tasks", "meetings"]);
      },
    });
  }

  async removeBlock(block) {
    await this.api.tasks.removeSession(block.id);
    this.selected = null;
    await this.changed(["tasks"]);
  }

  cancelMeeting(block, cancelled) {
    const run = async () => {
      await this.api.meetings.cancel(block.id, cancelled);
      await this.changed(["meetings"]);
    };
    if (!cancelled) return run();
    return confirmDialog({ title: `Cancel "${block.title}"?`, text: "It stays on the calendar, struck through, and is not counted as time worked.",
      confirm: "Cancel the meeting", danger: true, run });
  }

  async setDone(taskId, done) {
    await this.api.tasks.setDone(taskId, done);
    await this.changed(["tasks", "notes"]);
  }

  newMeetingAt(day, minute) {
    const hubs = liveHubs(this.data.tree);
    if (!hubs.length) return this.say("Make a project or an area first: a meeting goes in one");
    const start = Math.max(0, Math.min(minute, DAY_MINUTES - DEFAULT_LENGTH));
    return formDialog({
      title: `New meeting on ${whenText({ day, time: clock(start) })}`,
      fields: [
        { key: "hub", label: "Hub", type: "select", options: hubs.map((hub) => [String(hub.id), `${hub.title} (${groupForKind(hub.kind).label})`]) },
        { key: "title", label: "Title" },
        { key: "day", label: "Date", type: "date", value: day },
        { key: "start", label: "Starts", type: "time", value: clock(start) },
        { key: "end", label: "Ends", type: "time", value: clock(start + DEFAULT_LENGTH), optional: true },
      ],
      submit: "Make it",
      run: async ({ hub, title, day: date, start: from, end }) => {
        await this.api.meetings.create(Number(hub), title.trim(), date, from, end);
        await this.changed(["meetings"]);
      },
    });
  }

  // ---- the import ---------------------------------------------------------------------

  async importAndLoad({ quiet }) {
    const counts = await this.api.calendar.importFolder();
    await this.load();
    if (counts.files || counts.errors.length || !quiet) this.drawStatus(importSummary(counts));
    if (counts.files) this.changes.send({ type: "changed", what: ["meetings"] });
  }

  async uploadFiles(files) {
    const list = [...(files ?? [])].filter((file) => /\.ics$/i.test(file.name) || file.type === "text/calendar");
    if (!list.length) return this.say("Only calendar files (.ics) can be imported");
    const total = { files: 0, errors: [] };
    for (const file of list) {
      try {
        const counts = await this.api.calendar.upload(file);
        for (const [key, value] of Object.entries(counts)) if (typeof value === "number") total[key] = (total[key] ?? 0) + value;
      } catch (error) {
        total.errors.push(`${file.name}: ${error.message}`);
      }
    }
    await this.load();
    this.drawStatus(importSummary(total));
    this.changes.send({ type: "changed", what: ["meetings"] });
    return undefined;
  }

  async file(ids, hubId) {
    await this.api.calendar.file(ids, hubId);
    await this.changed(["meetings", "notes"]);
    this.drawStatus(`${ids.length === 1 ? "1 meeting" : `${ids.length} meetings`} filed in ${this.data.tree.get(hubId)?.title ?? "the hub"}`);
  }

  async ignore(ids) {
    await this.api.calendar.ignore(ids);
    await this.load();
  }

  // ---- notes, keys, errors ----------------------------------------------------------------

  /** Opens a note in the note window. */
  async openNote(id) {
    if (id !== null) this.openNoteIn(id);
  }

  async changed(what) {
    await this.load();
    this.changes.send({ type: "changed", what });
  }

  onKey(event) {
    const action = calendarAction(event);
    if (!action) return;
    const block = this.blocks.find((each) => each.key === this.selected) ?? null;
    event.preventDefault();
    switch (action) {
      case "previousWeek": return this.moveWeek(-7);
      case "nextWeek": return this.moveWeek(7);
      case "today": return this.goToday();
      case "weekend": return this.toggleWeekend();
      case "import": return this.run(this.importAndLoad({ quiet: false }));
      case "open": return block && block.noteId !== null ? this.run(this.openNote(block.noteId)) : undefined;
      case "remove": return block?.kind === "task" ? this.run(this.removeBlock(block)) : undefined;
      case "schedule": {
        const taskId = this.side.focusedTask();
        return taskId !== null ? this.run(this.schedule(taskId)) : this.say("Choose a task in the tray first (Tab to it), then s");
      }
      case "deselect": return this.select(null);
      default: return undefined;
    }
  }

  run(promise) {
    Promise.resolve(promise).catch((error) => this.say(error?.message ?? String(error)));
  }

  say(text) {
    this.drawStatus(text);
  }
}

function liveHubs(tree) {
  return tree.children(null).filter((note) => isHub(tree, note.id) && !isArchived(tree, note.id))
    .sort((a, b) => a.title.localeCompare(b.title));
}

function weekLabel(days) {
  return weekRange(days[0]);
}

/** "Imported: 3 new, 2 to file, 1 moved" (or why nothing was). */
export function importSummary(counts) {
  const parts = [["new", "new"], ["to_file", "to file"], ["updated", "updated"], ["moved", "moved"],
    ["cancelled", "cancelled"], ["back_on", "back on"], ["people", "new people"]]
    .filter(([key]) => counts[key]).map(([key, label]) => `${counts[key]} ${label}`);
  const errors = counts.errors?.length ? ` Could not read: ${counts.errors.join("; ")}` : "";
  if (!counts.files) return `No calendar file waiting in the import folder.${errors}`;
  return `Imported ${counts.files === 1 ? "1 file" : `${counts.files} files`}: ${parts.length ? parts.join(", ") : "nothing changed"}.${errors}`;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
