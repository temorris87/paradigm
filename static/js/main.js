// The main window (/): dashboards, Home, People, Meetings, the calendar, the timesheet and
// plan templates, wide. A note opens in the note window (windows/note-window.js).
import { boot } from "./boot.js";
import { CalendarPage } from "./calendar/calendar-page.js";
import { Changes } from "./connection/changes.js";
import { Dashboard } from "./hubs/dashboard.js";
import { setNotePath } from "./notes/app.js";
import { TemplatePage } from "./plan/template-page.js";
import { timeApi } from "./timesheet/api.js";
import { TimePage } from "./timesheet/time-page.js";
import { openMenu } from "./ui/menu.js";
import { MAIN_WINDOW, WINDOW_MODES, setWindowMode, windowMode } from "./windows/note-window.js";
import { calendarApi } from "./calendar/api.js";
import { meetingsApi } from "./meetings/api.js";
import { notesApi } from "./notes/api.js";
import { tasksApi } from "./tasks/api.js";

// The note window finds this one by name (its Dashboard button).
window.name = MAIN_WINDOW;
setNotePath("/");

const $ = (selector) => document.querySelector(selector);

boot({
  role: "main",
  kind: "",
  options: (app) => {
    const shown = (key) => () => app()?.views.shown === key;
    const calendarRoot = $(".cal-view");
    const calendar = new CalendarPage({
      root: calendarRoot,
      bar: $(".cal-bar"),
      side: $(".cal-side"),
      week: $(".cal-week"),
      api: { notes: notesApi, meetings: meetingsApi, tasks: tasksApi, calendar: calendarApi },
      changes: new Changes(),
      openNote: (id) => app().guard(app().open(id)),
      isShown: shown("calendar"),
    });
    const timeRoot = $(".time-view");
    const time = new TimePage({ root: timeRoot, bar: $(".time-bar"), main: $(".time-main"), api: timeApi, changes: new Changes(),
      isShown: shown("time") });
    const template = new TemplatePage($(".plan-template-view"), { app, onLeave: () => app().leaveView() });
    const pageOf = (section, page) => ({ section, show() {}, enter: () => page.show(), focus: () => page.focus() });
    const windowButton = $(".topbar__window");
    windowButton.addEventListener("click", () => openMenu(windowButton, WINDOW_MODES.map((mode) => ({
      label: mode.label,
      hint: mode.help,
      checked: windowMode() === mode.key,
      run: () => {
        setWindowMode(mode.key);
        app().say(`${mode.label} (${mode.help}). Close the note window for it to open there next time.`);
      },
    })), { label: "Note window" }));
    return {
      home: { section: $(".home"), button: $(".topbar__home") },
      people: { section: $(".people"), button: $(".topbar__people") },
      meetings: { section: $(".meetings"), button: $(".topbar__meetings") },
      trash: { section: $(".trash"), button: $(".navigator__trash") },
      extraPages: {
        calendar: pageOf(calendarRoot, calendar),
        time: pageOf(timeRoot, time),
        template: { section: $(".plan-template-view"), show: (ctx) => template.show(ctx), focus: () => template.focus() },
      },
      buttons: { calendar: $(".topbar__calendar"), time: $(".topbar__time") },
      status: $(".status-line"),
      dashboard: new Dashboard({
        text: { box: $(".dash-text"), label: $(".dash-text__label"), body: $(".dash-text__body"), edit: $(".dash-text__edit"),
          more: $(".dash-text__more") },
        chart: $(".dash-chart"),
      }),
    };
  },
});
