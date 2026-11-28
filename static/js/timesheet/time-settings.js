// The timesheet's settings as three parts: Codes and hours, Holidays, Time off and sick time.
// The Settings page (settings/settings-page.js) draws each in its own card; they call the
// timesheet routes (timesheet/api.js) and draw themselves again from what the route returns.
//
//   const parts = new TimeSettings({ api: timeApi, today, run(promise), say(text), onChanged() });
//     run: runs a call, its error said; onChanged: a save that changes the week's hours
//   parts.nodes            { hours, holidays, timeOff }: the cards' bodies (no headings)
//   await parts.load()     reads the settings and draws all three
import { localDay } from "../meetings/meeting-days.js";
import { confirmDialog } from "../ui/dialog.js";
import { dayText } from "../ui/dates.js";
import { focusFirstKey, focusedKey, keysAfterRemoving } from "../ui/dom.js";

export const KIND_LABELS = { holiday: "Holiday", time_off: "Time off", sick: "Sick" };
const CODE_FIELDS = [["default_code", "Default code", "the hours nothing is booked to"],
  ["holiday_code", "Holiday code", ""], ["time_off_code", "Time off code", ""], ["sick_code", "Sick code", ""]];
const HOUR_FIELDS = [["day_start", "Working day starts"], ["day_end", "Working day ends"],
  ["lunch_start", "Lunch starts"], ["lunch_end", "Lunch ends"]];

export class TimeSettings {
  constructor({ api, today = () => new Date(), run, say = () => {}, onChanged = () => {} }) {
    this.api = api;
    this.today = today;
    this.run = run;
    this.say = say;
    this.onChanged = onChanged;
    this.nodes = { hours: element("div", "time-settings__hours"), holidays: element("div", "time-settings__holidays"),
      timeOff: element("div", "time-settings__off") };
  }

  async load() {
    this.draw(await this.api.settings());
  }

  /** Draws all three again; the focus stays on the field or button it was on (Save, Add
   * holiday), or goes to the first of focus that is there (a row just removed). */
  draw({ settings, holidays, time_off: timeOff, upcoming }, focus = []) {
    const parts = Object.values(this.nodes);
    const kept = parts.map((part) => focusedKey(part)).find(Boolean);
    this.nodes.hours.replaceChildren(this.hoursForm(settings));
    this.nodes.holidays.replaceChildren(...this.holidayParts(holidays, upcoming));
    this.nodes.timeOff.replaceChildren(...this.timeOffParts(timeOff));
    this.focusFirst([kept, ...focus]);
  }

  focusFirst(keys) {
    return Object.values(this.nodes).some((part) => focusFirstKey(part, keys));
  }

  /** A change saved: drawn again from the route's answer, and the week told. */
  changed(all, message = "", focus = []) {
    this.draw(all, focus);
    if (message) this.say(message);
    this.onChanged();
  }

  hoursForm(settings) {
    const form = element("form", "time-form");
    const inputs = {};
    for (const [key, label, hint] of CODE_FIELDS) inputs[key] = field(form, label, "text", settings[key], hint, `hours-${key}`);
    for (const [key, label] of HOUR_FIELDS) {
      inputs[key] = field(form, label, "time", settings[key], "", `hours-${key}`);
      inputs[key].step = 900; // quarter hours, as the report counts
    }
    const observed = element("input", "");
    Object.assign(observed, { type: "checkbox", checked: settings.observed === "1" });
    observed.dataset.focusKey = "hours-observed";
    const observedLabel = element("label", "time-check");
    observedLabel.append(observed, " A holiday on a Saturday is taken on the Friday, on a Sunday on the Monday");
    form.append(observedLabel);
    const save = element("button", "time-button", "Save");
    save.type = "submit";
    save.dataset.focusKey = "hours-save";
    form.append(save);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const values = Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.value.trim()]));
      this.run(this.api.setSettings({ ...values, observed: observed.checked }).then((all) => this.changed(all, "Settings saved")));
    });
    return form;
  }

  holidayParts(holidays, upcoming) {
    const note = element("p", "time-note", "Rules look like: Jul 4 · 4th Thu of Nov · last Mon of May · 4th Thu of Nov + 1 · 2026-12-24 (one day only)");
    const list = element("ul", "time-list");
    const rowKeys = holidays.map((holiday) => `holiday-remove-${holiday.id}`);
    list.append(...holidays.map((holiday, index) => {
      const row = element("li", holiday.ok ? "" : "time-list--bad");
      // Removed, the focus goes to the row now in its place: its button is gone with it.
      const after = keysAfterRemoving(rowKeys, index, ["holiday-name"]);
      row.append(element("span", "time-list__main", holiday.name), element("span", "time-list__meta", holiday.ok ? holiday.rule : `${holiday.rule} (can't read this rule)`),
        removeButton(`Remove ${holiday.name}`, rowKeys[index], () => this.run(confirmDialog({ title: `Remove ${holiday.name}?`, confirm: "Remove", danger: true,
          run: async () => this.changed(await this.api.removeHoliday(holiday.id)),
          fallbackFocus: () => this.focusFirst(after) }))));
      return row;
    }));
    const add = element("form", "time-inline");
    const name = field(add, "Name", "text", "", "", "holiday-name");
    const rule = field(add, "Rule", "text", "", "Jul 4", "holiday-rule");
    const button = element("button", "time-button", "Add holiday");
    button.type = "submit";
    button.dataset.focusKey = "holiday-add";
    add.append(button);
    add.addEventListener("submit", (event) => {
      event.preventDefault();
      this.run(this.api.addHoliday(name.value, rule.value).then((all) => this.changed(all)));
    });
    const next = element("p", "time-note", upcoming.length
      ? `Next: ${upcoming.slice(0, 6).map((entry) => `${entry.name} ${dayText(entry.day)}`).join(" · ")}` : "No holidays in the next year");
    return [note, list, add, next];
  }

  timeOffParts(timeOff) {
    const list = element("ul", "time-list");
    const rowKeys = timeOff.map((entry) => `timeoff-remove-${entry.id}`);
    list.append(...timeOff.map((entry, index) => {
      const row = element("li", "");
      const days = entry.first === entry.last ? entry.first : `${entry.first} to ${entry.last}`;
      row.append(element("span", "time-list__main", `${KIND_LABELS[entry.kind]}: ${days}`),
        element("span", "time-list__meta", [entry.hours ? `${entry.hours} h a day` : "whole days", entry.note].filter(Boolean).join(" · ")),
        removeButton("Remove it", rowKeys[index], () => this.run(this.api.removeTimeOff(entry.id)
          .then((all) => this.changed(all, "", keysAfterRemoving(rowKeys, index, ["timeoff-kind"]))))));
      return row;
    }));
    if (!timeOff.length) list.append(element("li", "time-note", "None yet"));
    const add = element("form", "time-inline");
    const kind = element("select", "time-input");
    kind.dataset.focusKey = "timeoff-kind";
    kind.append(option("time_off", "Time off"), option("sick", "Sick"));
    const kindLabel = element("label", "time-field");
    kindLabel.append(element("span", "time-field__label", "Kind"), kind);
    add.append(kindLabel);
    const first = field(add, "From", "date", localDay(this.today()), "", "timeoff-first");
    const last = field(add, "To (optional)", "date", "", "", "timeoff-last");
    const hours = field(add, "Hours a day (empty: whole day)", "number", "", "", "timeoff-hours");
    Object.assign(hours, { min: "0", max: "24", step: "0.25" });
    const note = field(add, "Note (optional)", "text", "", "", "timeoff-note");
    const button = element("button", "time-button", "Add");
    button.type = "submit";
    button.dataset.focusKey = "timeoff-add";
    add.append(button);
    add.addEventListener("submit", (event) => {
      event.preventDefault();
      this.run(this.api.addTimeOff(kind.value, first.value, last.value, hours.value === "" ? 0 : Number(hours.value), note.value)
        .then((all) => this.changed(all)));
    });
    return [list, add];
  }
}

function field(form, label, type, value, placeholder = "", focusKey = "") {
  const wrap = element("label", "time-field");
  const input = element("input", "time-input");
  Object.assign(input, { type, value: value ?? "", placeholder });
  if (focusKey) input.dataset.focusKey = focusKey;
  wrap.append(element("span", "time-field__label", label), input);
  form.append(wrap);
  return input;
}

/** A quiet × at the end of a settings row: shown on hover and when it has the focus. */
function removeButton(title, focusKey, onClick) {
  const node = element("button", "time-button time-button--small time-button--remove", "×");
  Object.assign(node, { type: "button", title });
  node.dataset.focusKey = focusKey;
  node.setAttribute("aria-label", title);
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
