// The Settings page (spec 035): its sections, the index's lit entry, the note window's
// choices, the linked folders, how it opens (g , :settings, &settings, the old &week=settings)
// and the page drawn with its cards.
import { NOTE_COMMANDS } from "../../static/js/notes/commands.js";
import { MAIN_KEYS, mainAction } from "../../static/js/layout/main-keys.js";
import { PageViews } from "../../static/js/notes/page-views.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { findCommand } from "../../static/js/palette/palette-model.js";
import { Files } from "../../static/js/files/files-model.js";
import { NO_FOLDERS, SETTINGS_SECTIONS, linkedFolderRows, litSection, windowChoices } from "../../static/js/settings/settings-model.js";
import { settingsAction } from "../../static/js/settings/settings-keys.js";
import { SettingsPage } from "../../static/js/settings/settings-page.js";
import { WEEK_VIEWS } from "../../static/js/week/week-page.js";
import { WINDOW_MODES } from "../../static/js/windows/note-window.js";
import { resetSequences } from "../../static/js/ui/key-sequence.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("settings: the sections in order, as the index lists them", () => {
  assertEqual(SETTINGS_SECTIONS.map((section) => section.label).join(),
    "Note window,Codes and hours,Holidays,Time off and sick time,Linked folders,Data folder");
});

test("settings: the lit entry is the card at the top; at the foot, the one clicked", () => {
  const cards = [{ key: "window", top: -300 }, { key: "hours", top: -10 }, { key: "holidays", top: 0 }, { key: "timeoff", top: 200 }];
  assertEqual(litSection(cards), "holidays", "the last card whose top reached the scroller's");
  assertEqual(litSection(cards.map((card) => ({ ...card, top: card.top + 400 }))), "window", "nothing reached: the first");
  assertEqual(litSection(cards, { picked: "timeoff", atEnd: true }), "timeoff", "at the foot the clicked card stays lit");
  assertEqual(litSection(cards, { picked: "timeoff", atEnd: false }), "holidays", "scrolled away: the top rule again");
  assertEqual(litSection(cards, { picked: "window", atEnd: true }), "holidays", "a picked card scrolled out of view isn't lit");
  assertEqual(litSection([]), null);
});

test("settings: the note window's three choices, the saved one checked", () => {
  const choices = windowChoices(WINDOW_MODES, "split");
  assertEqual(choices.map((choice) => choice.label).join(), "By screen,Right third,Whole screen");
  assertEqual(choices.filter((choice) => choice.checked).map((choice) => choice.key).join(), "split");
  assertTrue(choices.every((choice) => choice.help), "each with its help");
});

test("settings: linked folders by hub title, then path; a hub not in the tree is 'its hub'", () => {
  const tree = new NoteTree([{ id: 1, parent_id: null, title: "Northwind", kind: "project" }, { id: 2, parent_id: null, title: "Acme", kind: "project" }]);
  const rows = linkedFolderRows([
    { id: 7, note_id: 1, name: "Docs", path: "C:/OneDrive/Northwind/Docs" },
    { id: 8, note_id: 2, name: "Specs", path: "C:/OneDrive/Acme/Specs" },
    { id: 9, note_id: 2, name: "Art", path: "C:/OneDrive/Acme/Art" },
    { id: 10, note_id: 99, name: "Old", path: "C:/Old" },
  ], tree);
  assertEqual(rows.map((row) => `${row.hubTitle}:${row.name}`).join(), "Acme:Art,Acme:Specs,its hub:Old,Northwind:Docs");
  assertEqual(rows[0].hubId, 2);
});

test("settings: g , and :settings open it; :set stays the editor's", () => {
  resetSequences();
  const press = (key) => mainAction({ key, target: document.body });
  assertEqual(press("g"), "pending");
  assertEqual(press(","), "settings");
  assertEqual(MAIN_KEYS.find((entry) => entry.action === "settings").command, "settings");
  assertEqual(findCommand(NOTE_COMMANDS, "settings").name, "settings");
  assertEqual(findCommand(NOTE_COMMANDS, "set"), null, ":set is the editor's options");
  const shown = [];
  findCommand(NOTE_COMMANDS, "settings").run({ showView: (key, history) => shown.push(`${key} ${history}`) }, { arg: "", bang: false });
  assertEqual(shown.join(), "settings push");
});

test("settings: &settings and the old &week=settings open it, with its own history step over a page", () => {
  const main = document.createElement("main");
  const pages = Object.fromEntries(["week", "settings"].map((key) => [key, { section: document.createElement("section"), focus() {}, show() {} }]));
  const steps = [];
  const history = { state: null, pushState: (state, _t, url) => { history.state = state; steps.push(`push ${url}`); },
    replaceState: (state, _t, url) => { history.state = state; steps.push(`replace ${url}`); }, back() {} };
  const views = new PageViews({ main, pages, history, noteUrl: () => "/?note=2" });
  assertEqual(views.fromUrl(new URLSearchParams("note=2&settings")), "settings");
  assertEqual(views.fromUrl(new URLSearchParams("note=2&week=settings")), "settings");
  assertEqual(views.fromUrl(new URLSearchParams("note=2&week=timesheet")), "week");
  views.show("week", "push");
  views.show("settings", "push");
  assertEqual(steps.join(" | "), "push /?note=2&week | push /?note=2&settings", "Back from Settings returns to the Week");
  assertEqual(main.dataset.view, "settings");
  assertEqual(WEEK_VIEWS.map((view) => view.label).join(), "Plan,Timesheet,On call", "the Week has no Settings tab");
});

test("settings: Escape on the page is back; in a field it is the field's", () => {
  const input = document.createElement("input");
  const button = document.createElement("button");
  assertEqual(settingsAction({ key: "Escape", target: button }), "leave");
  assertEqual(settingsAction({ key: "Escape", target: input }), null);
});

function fakeTimeApi() {
  const state = {
    settings: { default_code: "GEN", holiday_code: "HOL", time_off_code: "PTO", sick_code: "SICK", day_start: "09:00", day_end: "17:30",
      lunch_start: "12:00", lunch_end: "13:00", observed: "1" },
    holidays: [{ id: 1, name: "New Year", rule: "Jan 1", ok: true }],
    time_off: [],
    upcoming: [{ day: "2027-01-01", name: "New Year" }],
  };
  const calls = [];
  const answer = () => Promise.resolve(structuredClone(state));
  return {
    calls,
    settings: answer,
    setSettings: (values) => {
      calls.push(["setSettings", values]);
      Object.assign(state.settings, values);
      return answer();
    },
    addHoliday: (name, rule) => {
      calls.push(["addHoliday", name, rule]);
      state.holidays.push({ id: 2, name, rule, ok: true });
      return answer();
    },
    removeHoliday: (id) => {
      state.holidays = state.holidays.filter((holiday) => holiday.id !== id);
      return answer();
    },
    addTimeOff: () => answer(),
    removeTimeOff: () => answer(),
  };
}

function fakeApp() {
  const said = [];
  return { said, say: (text) => said.push(text), guard: (promise) => Promise.resolve(promise), refreshTree: async () => {},
    open: async () => true, redraw() {} };
}

test("settings page: one card per section; the timesheet's fields; the data folder; the folders", async () => {
  const section = document.createElement("section");
  document.body.append(section);
  const app = fakeApp();
  const time = fakeTimeApi();
  const sent = [];
  const page = new SettingsPage(section, { app: () => app, changes: { send: (message) => sent.push(message) }, timeApi: time,
    aboutApi: { get: async () => ({ data_folder: "/tmp/sample-notes", version: "1.2" }) }, onLeave: () => {} });
  try {
    page.enter();
    await tick();
    await tick();
    assertEqual([...section.querySelectorAll(".settings-card__title")].map((node) => node.textContent).join(),
      SETTINGS_SECTIONS.map((each) => each.label).join());
    assertEqual(section.querySelectorAll(".settings__entry").length, 6);
    assertEqual(section.querySelectorAll('input[type="radio"]').length, 3);
    assertEqual(section.querySelector(".settings-data__path").textContent, "/tmp/sample-notes");
    assertTrue(section.textContent.includes("Version 1.2"));
    const form = section.querySelector("#settings-hours form");
    const end = [...form.querySelectorAll("label")].find((label) => label.textContent.startsWith("Working day ends")).querySelector("input");
    end.value = "17:00";
    form.requestSubmit();
    await tick();
    await tick();
    assertEqual(time.calls[0][0], "setSettings");
    assertEqual(time.calls[0][1].day_end, "17:00");
    assertTrue(app.said.includes("Settings saved"));
    assertTrue(sent.some((message) => message.type === "changed"), "the other windows read the hours again");
    page.show({ files: new Files(), tree: new NoteTree([]) });
    assertEqual(section.querySelector("#settings-folders").textContent.includes(NO_FOLDERS), true);
    const tree = new NoteTree([{ id: 1, parent_id: null, title: "Northwind", kind: "project" }]);
    page.show({ files: new Files({ folders: [{ id: 4, note_id: 1, name: "Docs", path: "/od/Northwind/Docs" }] }), tree });
    assertEqual(section.querySelector(".settings-folder__hub").textContent, "Northwind");
    assertEqual(section.querySelector(".settings-folder__path").textContent, "/od/Northwind/Docs");
    assertEqual(section.querySelector(".settings-folder__unlink").textContent, "Unlink…");
  } finally {
    section.remove();
  }
});

test("settings page: the focus stays put when a card draws itself again", async () => {
  const section = document.createElement("section");
  document.body.append(section);
  const app = fakeApp();
  const time = fakeTimeApi();
  const page = new SettingsPage(section, { app: () => app, changes: { send() {} }, timeApi: time,
    aboutApi: { get: async () => ({ data_folder: "/tmp/sample-notes" }) }, onLeave: () => {} });
  const focusedKey = () => document.activeElement?.dataset?.focusKey ?? "(none)";
  try {
    page.enter();
    await tick();
    const save = section.querySelector('#settings-hours [data-focus-key="hours-save"]');
    save.focus();
    save.click();
    await tick();
    await tick();
    assertTrue(!save.isConnected, "the form was drawn again");
    assertEqual(focusedKey(), "hours-save");
    const holidays = section.querySelector("#settings-holidays");
    holidays.querySelector('[data-focus-key="holiday-name"]').value = "Founders Day";
    holidays.querySelector('[data-focus-key="holiday-rule"]').value = "Jun 2";
    holidays.querySelector('[data-focus-key="holiday-add"]').focus();
    holidays.querySelector('[data-focus-key="holiday-add"]').click();
    await tick();
    await tick();
    assertEqual(focusedKey(), "holiday-add");
    // Removing the first holiday puts the focus on the one now in its place.
    holidays.querySelector('[data-focus-key="holiday-remove-1"]').focus();
    holidays.querySelector('[data-focus-key="holiday-remove-1"]').click();
    await tick();
    document.querySelector("dialog .dialog__button--ok").click();
    await tick();
    await tick();
    assertEqual(focusedKey(), "holiday-remove-2");
    // Cancelled, the focus goes back to the button.
    holidays.querySelector('[data-focus-key="holiday-remove-2"]').focus();
    holidays.querySelector('[data-focus-key="holiday-remove-2"]').click();
    await tick();
    document.querySelector("dialog").dispatchEvent(new Event("cancel"));
    await tick();
    assertEqual(focusedKey(), "holiday-remove-2");
    // A redraw of the linked folders keeps the focus on the same folder's button.
    const tree = new NoteTree([{ id: 1, parent_id: null, title: "Northwind", kind: "project" }]);
    const ctx = () => ({ files: new Files({ folders: [{ id: 4, note_id: 1, name: "Docs", path: "/od/Northwind/Docs" },
      { id: 5, note_id: 1, name: "Specs", path: "/od/Northwind/Specs" }] }), tree });
    page.show(ctx());
    section.querySelector('[data-focus-key="folder-unlink-5"]').focus();
    page.show(ctx());
    assertEqual(focusedKey(), "folder-unlink-5");
    page.focusFolders(["folder-unlink-4"]);
    assertEqual(focusedKey(), "folder-unlink-4");
    page.focusFolders(["folder-unlink-9"]);
    assertEqual(document.activeElement, section.querySelector("#settings-folders"), "no folder left: the card");
  } finally {
    document.querySelectorAll("dialog").forEach((dialog) => dialog.remove());
    section.remove();
  }
});
