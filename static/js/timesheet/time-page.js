// The timesheet page, in the main window (&time): the week's hours by time code (Monday to Friday, each day exactly the
// working day), how they were made, and the settings (codes, hours, holidays, time off). The
// sums are the server's (paradigm/timesheet/report.py); this page shows them and copies them.
//
//   const page = new TimePage({ root, bar, main, api: timeApi, changes, isShown(), today: () => new Date(),
//                               onMove?(days) });
//     onMove: the week page (week/week-page.js) holds it: the week, the tabs and Copy are its,
//             and this page's bar keeps only the status
//   page.show() / page.focus()      when its page comes into view (loads it the first time)
//   page.setMonday(day) / page.showTab("week" | "settings") / page.copy()
import { addDays, dateOf, localDay } from "../meetings/meeting-days.js";
import { confirmDialog } from "../ui/dialog.js";
import { copyGrid, hoursText } from "./copy.js";
import { dayText } from "../ui/dates.js";
import { timeAction } from "./time-keys.js";

const KIND_LABELS = { holiday: "Holiday", time_off: "Time off", sick: "Sick" };
const CODE_FIELDS = [["default_code", "Default code", "the hours nothing is booked to"],
  ["holiday_code", "Holiday code", ""], ["time_off_code", "Time off code", ""], ["sick_code", "Sick code", ""]];
const HOUR_FIELDS = [["day_start", "Working day starts"], ["day_end", "Working day ends"],
  ["lunch_start", "Lunch starts"], ["lunch_end", "Lunch ends"]];

export class TimePage {
  constructor({ root, bar, main, api, changes, isShown = () => true, today = () => new Date(), onMove = null }) {
    this.onMove = onMove;
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
    const weekTab = make("Week", "The week's hours", () => this.showTab("week"));
    const settingsTab = make("Settings", "Codes, working hours, holidays and time off", () => this.showTab("settings"));
    for (const tab of [weekTab, settingsTab]) tab.classList.add("time-tab");
    const copy = make("Copy", "Copy the grid: paste it into the timesheet, Excel or an email (c)", () => this.run(this.copy()));
    const status = element("span", "time-bar__status");
    status.setAttribute("role", "status");
    // The week's own controls (‹ This week › and its title) show on the Week tab only.
    const weekControls = [make("‹", "The week before ([)", () => this.moveWeek(-7)), make("This week", "This week (t)", () => this.thisWeek()),
      make("›", "The week after (])", () => this.moveWeek(7)), week];
    if (this.onMove) bar.replaceChildren(status);
    else bar.replaceChildren(...weekControls, weekTab, settingsTab, copy, status);
    return { week, weekTab, settingsTab, copy, status, weekControls };
  }

  showTab(tab) {
    this.tab = tab;
    this.weekView.hidden = tab !== "week";
    this.settingsView.hidden = tab !== "settings";
    this.bar.weekTab.setAttribute("aria-pressed", String(tab === "week"));
    this.bar.settingsTab.setAttribute("aria-pressed", String(tab === "settings"));
    this.bar.copy.disabled = tab !== "week";
    for (const node of this.bar.weekControls) node.hidden = tab !== "week";
    if (tab === "settings") this.run(this.loadSettings());
  }

  moveWeek(days) {
    if (this.onMove) return this.onMove(days);
    this.monday = localDay(addDays(dateOf(this.monday), days));
    return this.run(this.load());
  }

  thisWeek() {
    if (this.onMove) return this.onMove(0);
    this.monday = mondayOf(localDay(this.today()));
    return this.run(this.load());
  }

  setMonday(monday) {
    this.monday = monday;
    if (this.started) this.run(this.load());
  }

  async load() {
    this.report = await this.api.week(this.monday);
    this.bar.week.textContent = `Week of ${dayText(this.monday, { today: localDay(this.today()) })}`;
    this.drawWeek();
    this.showTab(this.tab);
  }

  // ---- the week ---------------------------------------------------------------------

  drawWeek() {
    const report = this.report;
    const today = localDay(this.today());
    if (!(this.code in report.details)) this.code = Object.keys(report.details)[0] ?? null;
    // Days after today are what the calendar says will happen: projected, not logged yet.
    const projected = report.days.map((day) => day > today);
    const table = element("table", "time-grid");
    const head = element("tr", "");
    head.append(element("th", "", "Code"), ...report.days.map((day, index) => element("th", numClass(projected[index]), screenDay(day))),
      element("th", "time-grid__num", "Total"));
    const hubs = codeHubs(report);
    // The Default code past 30% of the week: too much of it isn't booked to anything.
    const heavy = report.total > 0 ? (report.rows.find((row) => row.code === report.default_code)?.total ?? 0) / report.total > 0.3 : false;
    const body = report.rows.map((row) => {
      const line = element("tr", row.code === report.default_code ? "time-grid__default" : "");
      const code = element("th", "time-grid__code");
      code.append(element("span", "time-grid__code-name", row.code));
      if (hubs[row.code]) code.append(element("span", "time-grid__hub", hubs[row.code]));
      const total = element("td", `time-grid__num time-grid__total${heavy && row.code === report.default_code ? " time-grid__total--heavy" : ""}`,
        row.total.toFixed(2));
      line.append(code, ...row.hours.map((hours, index) => element("td", numClass(projected[index]), hoursText(hours))), total);
      line.tabIndex = -1;
      line.addEventListener("click", () => this.pickCode(row.code));
      if (row.code === this.code) line.classList.add("time-grid__row--selected");
      return line;
    });
    const totals = element("tr", "time-grid__totals");
    totals.append(element("th", "", "Total"), ...report.totals.map((hours, index) => element("td", numClass(projected[index]), hours.toFixed(2))),
      element("td", "time-grid__num time-grid__total", report.total.toFixed(2)));
    const thead = element("thead", "");
    thead.append(head);
    const tbody = element("tbody", "");
    tbody.append(...body, totals);
    table.append(thead, tbody);
    const main = element("div", "time-week__main");
    main.append(table, element("p", "time-note", report.unbooked_hours
      ? `${report.unbooked_hours.toFixed(2)} h with nothing on the calendar went to ${report.default_code}.`
      : "Every hour of the working days is on the calendar."), this.whatMade(report, projected));
    const side = element("div", "time-week__side");
    const checks = [...report.warnings];
    if (heavy) checks.push(`${report.default_code} is over 30% of the week: book more of it to projects`);
    side.append(listSection("Check before you submit", checks.length ? checks.map((text) => [text])
      : [["Nothing to check", "every day adds up to the working day"]], checks.length ? "time-warnings" : ""));
    side.append(listSection("This week off", report.pto.length
      ? report.pto.map((entry) => [`${screenDay(entry.day)}: ${entry.name}`, `${KIND_LABELS[entry.kind]} · ${entry.hours.toFixed(2)} h`])
      : [["Nothing", "Add time off… in Settings"]]));
    if (report.not_counted.length) {
      side.append(listSection("Not counted", report.not_counted.map((entry) => [`${screenDay(entry.day)}: ${entry.label}`,
        [entry.hub, entry.reason, entry.minutes ? `${entry.minutes} min` : ""].filter(Boolean).join(" · ")])));
    }
    side.append(element("p", "time-explainer", "Each day is exactly the working day, in quarter hours: holidays and time off "
      + "first, then meetings and task blocks inside the working hours (overlaps shared), the rest to the Default code. Days "
      + "after today (in italics) are what the calendar says will happen."));
    this.weekView.replaceChildren(main, side);
  }

  /** What made the chosen code (the first with hours, until one is clicked): its meetings and blocks. */
  whatMade(report, projected) {
    const codes = Object.keys(report.details);
    if (!codes.includes(this.code)) this.code = codes[0] ?? null;
    const part = element("section", "time-details");
    if (!this.code) {
      part.append(element("p", "time-note", "Nothing on the calendar this week counts yet."));
      return part;
    }
    const heading = element("h2", "time-heading", "What made ");
    heading.append(element("span", "time-grid__code-name", this.code));
    part.append(heading);
    const later = new Set(report.days.filter((day, index) => projected[index]));
    const list = element("ul", "time-made");
    list.append(...report.details[this.code].map((item) => {
      const row = element("li", `time-made__row${later.has(item.day) ? " time-made__row--projected" : ""}`);
      row.append(element("span", "time-made__day", screenDay(item.day)),
        element("span", "time-made__label", [item.label, item.hub].filter(Boolean).join(" · ")),
        element("span", "time-made__hours", `${(item.minutes / 60).toFixed(2)} h`));
      return row;
    }));
    part.append(list);
    return part;
  }

  pickCode(code) {
    this.code = code;
    this.drawWeek();
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
    for (const [key, label] of HOUR_FIELDS) {
      inputs[key] = field(form, label, "time", settings[key]);
      inputs[key].step = 900; // quarter hours, as the report counts
    }
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
      element("p", "time-note", "Rules look like: Jul 4 · 4th Thu of Nov · last Mon of May · 4th Thu of Nov + 1 · 2026-12-24 (one day only)"));
    const holidayList = element("ul", "time-list");
    holidayList.append(...holidays.map((holiday) => {
      const row = element("li", holiday.ok ? "" : "time-list--bad");
      row.append(element("span", "time-list__main", holiday.name), element("span", "time-list__meta", holiday.ok ? holiday.rule : `${holiday.rule} (can't read this rule)`),
        removeButton(`Remove ${holiday.name}`, () => this.run(confirmDialog({ title: `Remove ${holiday.name}?`, confirm: "Remove", danger: true,
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
      ? `Next: ${upcoming.slice(0, 6).map((entry) => `${entry.name} ${screenDay(entry.day)}`).join(" · ")}` : "No holidays in the next year");
    holidaysPart.append(holidayList, addHoliday, next);

    const offPart = element("section", "time-part");
    offPart.append(element("h2", "time-heading", "Time off and sick time"));
    const offList = element("ul", "time-list");
    offList.append(...timeOff.map((entry) => {
      const row = element("li", "");
      const days = entry.first === entry.last ? entry.first : `${entry.first} to ${entry.last}`;
      row.append(element("span", "time-list__main", `${KIND_LABELS[entry.kind]}: ${days}`),
        element("span", "time-list__meta", [entry.hours ? `${entry.hours} h a day` : "whole days", entry.note].filter(Boolean).join(" · ")),
        removeButton("Remove it", () => this.run(this.api.removeTimeOff(entry.id).then((all) => {
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

function numClass(projected) {
  return `time-grid__num${projected ? " time-grid__num--projected" : ""}`;
}

/** Each code's hub, as its meetings and blocks name it most. */
function codeHubs(report) {
  return Object.fromEntries(Object.entries(report.details).map(([code, items]) => {
    const counts = new Map();
    for (const item of items) if (item.hub) counts.set(item.hub, (counts.get(item.hub) ?? 0) + item.minutes);
    return [code, [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ""];
  }));
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

/** A quiet × at the end of a settings row: shown on hover and when it has the focus. */
function removeButton(title, onClick) {
  const node = smallButton("×", title, onClick);
  node.classList.add("time-button--remove");
  node.setAttribute("aria-label", title);
  return node;
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

/** A day on screen: "Mon 9 Nov" (the clipboard copy keeps copy.js's "Mon 11/9"). */
function screenDay(day) {
  return dayText(day);
}
