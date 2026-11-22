// The timesheet page, in the main window (&time): the week's hours by time code (Monday to Friday, each day exactly the
// working day), how they were made, and the settings (codes, hours, holidays, time off). The
// sums are the server's (paradigm/timesheet/report.py); this page shows them and copies them.
//
//   const page = new TimePage({ root, bar, main, api: timeApi, changes, isShown(), today: () => new Date() });
//   page.show() / page.focus()      when its page comes into view (loads it the first time)
import { addDays, dateOf, localDay, whenText } from "../meetings/meeting-days.js";
import { confirmDialog } from "../ui/dialog.js";
import { copyGrid, dayHeading, hoursText } from "./copy.js";
import { timeAction } from "./time-keys.js";

const KIND_LABELS = { holiday: "Holiday", time_off: "Time off", sick: "Sick" };
const CODE_FIELDS = [["default_code", "Default code", "the hours nothing is booked to"],
  ["holiday_code", "Holiday code", ""], ["time_off_code", "Time off code", ""], ["sick_code", "Sick code", ""]];
const HOUR_FIELDS = [["day_start", "Working day starts"], ["day_end", "Working day ends"],
  ["lunch_start", "Lunch starts"], ["lunch_end", "Lunch ends"]];

export class TimePage {
  constructor({ root, bar, main, api, changes, isShown = () => true, today = () => new Date() }) {
    this.root = root;
    this.isShown = isShown;
    this.started = false;
    this.api = api;
    this.today = today;
    this.monday = mondayOf(localDay(today()));
    this.tab = "week";
    this.report = null;
    this.main = main;
    this.bar = this.makeBar(bar);
    this.weekView = element("section", "time-week");
    this.settingsView = element("section", "time-settings");
    main.replaceChildren(this.weekView, this.settingsView);
    changes.listen((message) => {
      if (message.type === "changed" && this.started) this.run(this.load());
    });
    window.addEventListener("focus", () => {
      if (this.started && this.isShown()) this.run(this.load());
    });
    root.addEventListener("keydown", (event) => this.onKey(event));
  }

  async start() {
    this.started = true;
    await this.load();
  }

  /** Its page came into view: loaded the first time, read again after. */
  show() {
    if (!this.started) this.run(this.start());
    else this.run(this.load());
  }

  focus() {
    this.root.focus({ preventScroll: true });
  }

  makeBar(bar) {
    const make = (text, title, onClick) => {
      const node = element("button", "time-button", text);
      Object.assign(node, { type: "button", title });
      node.addEventListener("click", onClick);
      return node;
    };
    const week = element("h1", "time-bar__week");
    const weekTab = make("Week", "The week's hours", () => this.show("week"));
    const settingsTab = make("Settings", "Codes, working hours, holidays and time off", () => this.show("settings"));
    for (const tab of [weekTab, settingsTab]) tab.classList.add("time-tab");
    const copy = make("Copy", "Copy the grid: paste it into the timesheet, Excel or an email (c)", () => this.run(this.copy()));
    const status = element("span", "time-bar__status");
    status.setAttribute("role", "status");
    bar.replaceChildren(make("‹", "The week before ([)", () => this.moveWeek(-7)), make("This week", "This week (t)", () => this.thisWeek()),
      make("›", "The week after (])", () => this.moveWeek(7)), week, weekTab, settingsTab, copy, status);
    return { week, weekTab, settingsTab, copy, status };
  }

  show(tab) {
    this.tab = tab;
    this.weekView.hidden = tab !== "week";
    this.settingsView.hidden = tab !== "settings";
    this.bar.weekTab.setAttribute("aria-pressed", String(tab === "week"));
    this.bar.settingsTab.setAttribute("aria-pressed", String(tab === "settings"));
    this.bar.copy.disabled = tab !== "week";
    if (tab === "settings") this.run(this.loadSettings());
  }

  moveWeek(days) {
    this.monday = localDay(addDays(dateOf(this.monday), days));
    this.run(this.load());
  }

  thisWeek() {
    this.monday = mondayOf(localDay(this.today()));
    this.run(this.load());
  }

  async load() {
    this.report = await this.api.week(this.monday);
    this.bar.week.textContent = `Week of ${whenText({ day: this.monday })}`;
    this.drawWeek();
    this.show(this.tab);
  }

  // ---- the week ---------------------------------------------------------------------

  drawWeek() {
    const report = this.report;
    const table = element("table", "time-grid");
    const head = element("tr", "");
    head.append(element("th", "", "Code"), ...report.days.map((day) => element("th", "time-grid__num", dayHeading(day))),
      element("th", "time-grid__num", "Total"));
    const body = report.rows.map((row) => {
      const line = element("tr", row.code === report.default_code ? "time-grid__default" : "");
      line.append(element("th", "time-grid__code", row.code), ...row.hours.map((hours) => element("td", "time-grid__num", hoursText(hours))),
        element("td", "time-grid__num time-grid__total", row.total.toFixed(2)));
      return line;
    });
    const totals = element("tr", "time-grid__totals");
    totals.append(element("th", "", "Total"), ...report.totals.map((hours) => element("td", "time-grid__num", hours.toFixed(2))),
      element("td", "time-grid__num time-grid__total", report.total.toFixed(2)));
    const thead = element("thead", "");
    thead.append(head);
    const tbody = element("tbody", "");
    tbody.append(...body, totals);
    table.append(thead, tbody);
    const parts = [table];
    parts.push(element("p", "time-note", report.unbooked_hours
      ? `${report.unbooked_hours.toFixed(2)} h with nothing on the calendar went to ${report.default_code}.`
      : "Every hour of the working days is on the calendar."));
    if (report.warnings.length) parts.push(listSection("Check", report.warnings.map((text) => [text]), "time-warnings"));
    if (report.pto.length) {
      parts.push(listSection("Time off", report.pto.map((entry) => [`${dayHeading(entry.day)}: ${entry.name}`,
        `${KIND_LABELS[entry.kind]} · ${entry.hours.toFixed(2)} h`])));
    }
    if (report.not_counted.length) {
      parts.push(listSection("Not counted", report.not_counted.map((entry) => [`${dayHeading(entry.day)}: ${entry.label}`,
        [entry.hub, entry.reason, entry.minutes ? `${entry.minutes} min` : ""].filter(Boolean).join(" · ")])));
    }
    const details = element("section", "time-details");
    details.append(element("h2", "time-heading", "What made each code"));
    for (const [code, items] of Object.entries(report.details)) {
      const box = element("details", "time-code");
      const total = items.reduce((sum, item) => sum + item.minutes, 0);
      box.append(element("summary", "", `${code} · ${(total / 60).toFixed(2)} h on the calendar`));
      const list = element("ul", "time-list");
      list.append(...items.map((item) => {
        const row = element("li", "");
        row.append(element("span", "time-list__main", `${dayHeading(item.day)}: ${item.label}`),
          element("span", "time-list__meta", [item.kind === "meeting" ? "meeting" : "task", item.hub, `${item.minutes} min`].filter(Boolean).join(" · ")));
        return row;
      }));
      box.append(list);
      details.append(box);
    }
    if (!Object.keys(report.details).length) details.append(element("p", "time-note", "Nothing on the calendar this week counts yet."));
    parts.push(details);
    this.weekView.replaceChildren(...parts);
  }

  async copy() {
    if (!this.report) return;
    await copyGrid(this.report);
    this.say("Copied: paste it into the timesheet, Excel or an email");
  }

  // ---- settings -----------------------------------------------------------------------

  async loadSettings() {
    this.drawSettings(await this.api.settings());
  }

  drawSettings({ settings, holidays, time_off: timeOff, upcoming }) {
    const form = element("form", "time-form");
    form.append(element("h2", "time-heading", "Codes and hours"));
    const inputs = {};
    for (const [key, label, hint] of CODE_FIELDS) inputs[key] = field(form, label, "text", settings[key], hint);
    for (const [key, label] of HOUR_FIELDS) inputs[key] = field(form, label, "time", settings[key]);
    const observed = element("input", "");
    Object.assign(observed, { type: "checkbox", checked: settings.observed === "1" });
    const observedLabel = element("label", "time-check");
    observedLabel.append(observed, " A holiday on a Saturday is taken on the Friday, on a Sunday on the Monday");
    form.append(observedLabel);
    const save = element("button", "time-button", "Save");
    save.type = "submit";
    form.append(save);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const values = Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.value.trim()]));
      this.run(this.api.setSettings({ ...values, observed: observed.checked }).then((all) => {
        this.drawSettings(all);
        this.say("Settings saved");
        return this.load();
      }));
    });

    const holidaysPart = element("section", "time-part");
    holidaysPart.append(element("h2", "time-heading", "Holidays"),
      element("p", "time-note", "Rules: Jul 4 · 4th Thu of Nov · last Mon of May · 4th Thu of Nov + 1 · 2026-12-24 (one day only)"));
    const holidayList = element("ul", "time-list");
    holidayList.append(...holidays.map((holiday) => {
      const row = element("li", holiday.ok ? "" : "time-list--bad");
      row.append(element("span", "time-list__main", holiday.name), element("span", "time-list__meta", holiday.ok ? holiday.rule : `${holiday.rule} (can't read this rule)`),
        smallButton("Remove", `Remove ${holiday.name}`, () => this.run(confirmDialog({ title: `Remove ${holiday.name}?`, confirm: "Remove", danger: true,
          run: async () => this.drawSettings(await this.api.removeHoliday(holiday.id)) }))));
      return row;
    }));
    const addHoliday = element("form", "time-inline");
    const name = field(addHoliday, "Name", "text", "");
    const rule = field(addHoliday, "Rule", "text", "", "Jul 4");
    const add = element("button", "time-button", "Add holiday");
    add.type = "submit";
    addHoliday.append(add);
    addHoliday.addEventListener("submit", (event) => {
      event.preventDefault();
      this.run(this.api.addHoliday(name.value, rule.value).then((all) => this.drawSettings(all)));
    });
    const next = element("p", "time-note", upcoming.length
      ? `Next: ${upcoming.slice(0, 6).map((entry) => `${entry.name} ${dayHeading(entry.day)}`).join(" · ")}` : "No holidays in the next year");
    holidaysPart.append(holidayList, addHoliday, next);

    const offPart = element("section", "time-part");
    offPart.append(element("h2", "time-heading", "Time off and sick time"));
    const offList = element("ul", "time-list");
    offList.append(...timeOff.map((entry) => {
      const row = element("li", "");
      const days = entry.first === entry.last ? entry.first : `${entry.first} to ${entry.last}`;
      row.append(element("span", "time-list__main", `${KIND_LABELS[entry.kind]}: ${days}`),
        element("span", "time-list__meta", [entry.hours ? `${entry.hours} h a day` : "whole days", entry.note].filter(Boolean).join(" · ")),
        smallButton("Remove", "Remove it", () => this.run(this.api.removeTimeOff(entry.id).then((all) => {
          this.drawSettings(all);
          return this.load();
        }))));
      return row;
    }));
    if (!timeOff.length) offList.append(element("li", "time-note", "None yet"));
    const addOff = element("form", "time-inline");
    const kind = element("select", "time-input");
    kind.append(option("time_off", "Time off"), option("sick", "Sick"));
    const kindLabel = element("label", "time-field");
    kindLabel.append(element("span", "time-field__label", "Kind"), kind);
    addOff.append(kindLabel);
    const first = field(addOff, "From", "date", localDay(this.today()));
    const last = field(addOff, "To (optional)", "date", "");
    const hours = field(addOff, "Hours a day (empty: whole day)", "number", "");
    Object.assign(hours, { min: "0", max: "24", step: "0.25" });
    const note = field(addOff, "Note (optional)", "text", "");
    const addButton = element("button", "time-button", "Add");
    addButton.type = "submit";
    addOff.append(addButton);
    addOff.addEventListener("submit", (event) => {
      event.preventDefault();
      this.run(this.api.addTimeOff(kind.value, first.value, last.value, hours.value === "" ? 0 : Number(hours.value), note.value)
        .then((all) => {
          this.drawSettings(all);
          return this.load();
        }));
    });
    offPart.append(offList, addOff);
    this.settingsView.replaceChildren(form, holidaysPart, offPart);
  }

  onKey(event) {
    const action = timeAction(event);
    if (!action) return;
    event.preventDefault();
    if (action === "previousWeek") this.moveWeek(-7);
    else if (action === "nextWeek") this.moveWeek(7);
    else if (action === "thisWeek") this.thisWeek();
    else if (action === "copy" && this.tab === "week") this.run(this.copy());
  }

  run(promise) {
    Promise.resolve(promise).catch((error) => this.say(error?.message ?? String(error), true));
  }

  say(text, error = false) {
    this.bar.status.textContent = text;
    this.bar.status.classList.toggle("time-bar__status--error", error);
  }
}

function mondayOf(day) {
  const date = dateOf(day);
  return localDay(addDays(date, -((date.getDay() + 6) % 7)));
}

function listSection(title, rows, className = "") {
  const section = element("section", `time-part ${className}`.trim());
  section.append(element("h2", "time-heading", title));
  const list = element("ul", "time-list");
  list.append(...rows.map(([main, meta]) => {
    const row = element("li", "");
    row.append(element("span", "time-list__main", main));
    if (meta) row.append(element("span", "time-list__meta", meta));
    return row;
  }));
  section.append(list);
  return section;
}

function field(form, label, type, value, placeholder = "") {
  const wrap = element("label", "time-field");
  const input = element("input", "time-input");
  Object.assign(input, { type, value: value ?? "", placeholder });
  wrap.append(element("span", "time-field__label", label), input);
  form.append(wrap);
  return input;
}

function smallButton(text, title, onClick) {
  const node = element("button", "time-button time-button--small", text);
  Object.assign(node, { type: "button", title });
  node.addEventListener("click", onClick);
  return node;
}

function option(value, text) {
  const node = element("option", "", text);
  node.value = value;
  return node;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
