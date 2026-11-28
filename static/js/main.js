// The main window (/): dashboards, Home, People, Meetings, the calendar, the timesheet, plan
// templates, folders, a task's page, a project's History and the Live note, wide. A note opens in the note window (windows/note-window.js),
// and the Live page here shows it as it is typed there (live/live-page.js).
import { boot } from "./boot.js";
import { installMainKeys } from "./layout/main-keys.js";
import { openPalette } from "./palette/palette.js";
import { CalendarPage } from "./calendar/calendar-page.js";
import { Changes } from "./connection/changes.js";
import { Dashboard } from "./hubs/dashboard.js";
import { setNotePath } from "./notes/app.js";
import { PlanPage } from "./plan/plan-page.js";
import { TemplatePage } from "./plan/template-page.js";
import { FolderPage } from "./resources/folder-page.js";
import { TaskPage } from "./tasks/task-page.js";
import { HistoryPage } from "./history/history-page.js";
import { LivePage } from "./live/live-page.js";
import { timeApi } from "./timesheet/api.js";
import { TimePage } from "./timesheet/time-page.js";
import { WeekPage } from "./week/week-page.js";
import { OnCallPage } from "./oncall/oncall-page.js";
import { onCallApi } from "./oncall/api.js";
import { planApi } from "./plan/api.js";
import { openMenu } from "./ui/menu.js";
import { drawKeyHints } from "./ui/key-hints.js";
import { openKeysDialog } from "./ui/keys-dialog.js";
import { shadowedMainActions, viewHints, viewKeyGroups, viewTable } from "./layout/view-keys.js";
import { statusHubOf } from "./status/status-commands.js";
import { MAIN_WINDOW, WINDOW_MODES, forgetPlaced, setWindowMode, windowMode } from "./windows/note-window.js";
import { calendarApi } from "./calendar/api.js";
import { meetingsApi } from "./meetings/api.js";
import { notesApi } from "./notes/api.js";
import { tasksApi } from "./tasks/api.js";
import { emailsApi } from "./tasks/emails-api.js";

// The note window finds this one by name (its Dashboard button).
window.name = MAIN_WINDOW;
// Opened from the note window, this one has a copy of its "placed" mark: the next note
// window would inherit it and skip its first-load place.
forgetPlaced();
setNotePath("/");

const $ = (selector) => document.querySelector(selector);

// The Week page, once made: its tab says which keys the bar shows. The app as boot() holds it
// (the Week's first tab can come up while the app starts, before boot returns).
let weekPage = null;
let appNow = () => null;
const weekTab = () => weekPage?.view ?? "plan";
const hintBar = $(".key-hints");
// L on a dashboard logs status only when the note belongs to a project or an area; a
// project's page has a bar of its own, and a person's dashboard its own keys (Tab, a, r, n, o).
const hintOptions = (app) => {
  const note = app?.tree?.get(app.currentId);
  return { logStatus: Boolean(app?.tree && statusHubOf(app)),
    project: note?.kind === "project" && app.tree.parentId(note.id) === null,
    person: note?.kind === "person" };
};
const drawHints = () => drawKeyHints(hintBar, viewHints(appNow()?.views?.shown ?? null, weekTab(), hintOptions(appNow())));

const app = boot({
  role: "main",
  kind: "",
  options: (app) => {
    appNow = app;
    const shown = (key) => () => app()?.views.shown === key;
    const weekRoot = $(".week-view");
    const changes = new Changes();
    const week = new WeekPage({ root: weekRoot, bar: $(".week-bar"), plan: $(".week-plan"), time: $(".week-time"),
      oncall: $(".week-oncall"), foot: $(".week-foot"), api: timeApi, changes, onView: () => drawHints() });
    weekPage = week;
    const calendar = new CalendarPage({
      root: $(".week-plan"),
      bar: $(".cal-bar"),
      side: $(".cal-side"),
      week: $(".cal-week"),
      api: { notes: notesApi, meetings: meetingsApi, tasks: tasksApi, calendar: calendarApi, plan: planApi, time: timeApi },
      changes,
      openNote: (id) => app().guard(app().open(id)),
      openTask: (id) => app().guard(app().showTask(id)),
      isShown: shown("week"),
      onMove: (days) => week.moveWeek(days),
      onDrawn: () => week.drawSummary(),
    });
    // The Plan tab's keys hold on the whole Week page, as its hint bar says: a key typed with the
    // focus on the Week's bar (its tabs, This week, the arrows) or on the page body goes to the
    // calendar too. Keys typed inside .week-plan reach it there, on its own listener; keys typed
    // elsewhere (the navigator tree, its own scope) never do.
    window.addEventListener("keydown", (event) => {
      if (event.defaultPrevented || !shown("week")() || week.view !== "plan") return;
      if (calendar.root.contains(event.target) || !onWeekPage(event.target)) return;
      calendar.onKey(event);
    });
    const time = new TimePage({ root: $(".week-time"), bar: $(".time-bar"), main: $(".time-main"), api: timeApi, changes,
      isShown: shown("week"), onMove: (days) => week.moveWeek(days) });
    const onCall = new OnCallPage({ root: $(".week-oncall"), api: onCallApi, app, changes,
      onMove: (days) => week.moveWeek(days) });
    week.hold(calendar, time, onCall);
    const template = new TemplatePage($(".plan-template-view"), { app, onLeave: () => app().leaveView() });
    const folder = new FolderPage($(".folder-view"), { app, onLeave: () => app().leaveView() });
    const task = new TaskPage($(".task-view"), { app, onLeave: () => app().leaveView(), emailsApi, changes });
    const plan = new PlanPage($(".plan-view"), { app, onLeave: () => app().leaveView() });
    const historyPage = new HistoryPage($(".history-view"), { app, onLeave: () => app().leaveView() });
    // A note newly opened in the note window, any way, brings the Live page up here.
    const live = new LivePage($(".live-view"), { changes, app, viewer: $("pd-image-viewer"),
      onNewNote: () => app().showView("live", "push"), ready: () => app()?.started ?? null });
    const windowButton = $(".topbar__window");
    windowButton.addEventListener("click", () => openMenu(windowButton, [
      { label: "Live note", hint: "the note window's note, rendered as it is typed (gn)", run: () => app().showView("live", "push") },
      "separator",
      ...WINDOW_MODES.map((mode) => ({
        label: mode.label,
        hint: mode.help,
        checked: windowMode() === mode.key,
        run: () => {
          setWindowMode(mode.key);
          if (mode.key === "split") {
            // An open note window moves there now; else it opens there next time.
            changes.send({ type: "place", to: "note", mode: "split" });
            app().say(`${mode.label} (${mode.help}). An open note window moves there now.`);
          } else {
            app().say(`${mode.label} (${mode.help}). Close the note window for it to open there next time.`);
          }
        },
      })),
    ], { label: "Window" }));
    return {
      home: { section: $(".home"), button: null },
      people: { section: $(".people"), button: null },
      meetings: { section: $(".meetings"), button: null },
      trash: { section: $(".trash"), button: $(".navigator__trash") },
      extraPages: {
        week: { section: weekRoot, show: (ctx) => week.redraw(ctx), enter: () => week.show(app().weekView), focus: () => week.focus() },
        template: { section: $(".plan-template-view"), show: (ctx) => template.show(ctx), focus: () => template.focus() },
        folder: { section: $(".folder-view"), show: (ctx) => folder.show(ctx), focus: () => folder.focus() },
        // attach: :attach's file picker (tasks/task-emails.js).
        task: { section: $(".task-view"), show: (ctx) => task.show(ctx), focus: () => task.focus(), attach: () => task.attach() },
        plan: { section: $(".plan-view"), show: (ctx) => plan.show(ctx), focus: () => plan.focus() },
        history: { section: $(".history-view"), show: (ctx) => historyPage.show(ctx), enter: () => historyPage.enter(),
          focus: () => historyPage.focus(), crumbs: (ctx) => historyPage.crumbs(ctx) },
        // state: what the Live page shows, which note commands read (notes/screen-note.js).
        live: { section: $(".live-view"), show: () => live.show(), focus: () => live.focus(), get state() { return live.state; } },
      },
      buttons: { today: $(".topbar__today"), week: $(".topbar__week"), palette: $(".topbar__palette") },
      status: $(".status-line"),
      dashboard: new Dashboard({
        head: $(".dash-head"),
        strip: $(".plan-strip"),
        text: { box: $(".dash-text"), label: $(".dash-text__label"), body: $(".dash-text__body"), edit: $(".dash-text__edit"),
          more: $(".dash-text__more") },
      }),
    };
  },
});

// The key-hint bar follows the view shown: every redraw (a page shown, left, the note opened),
// and the Week's tabs.
app.events.addEventListener("redraw", drawHints);
drawHints();

/** Whether a key's target is on the Week page, or on the page body (the focus nowhere). The
 * navigator and the top bar are other scopes: the Plan tab's keys don't reach past the page. */
function onWeekPage(target) {
  return target === document.body || target === document.documentElement
    || Boolean(target instanceof Node && document.querySelector(".week-view")?.contains(target));
}

/** ? : every key of the view shown, in a list. */
function showKeys() {
  const view = app.views?.shown ?? null;
  return openKeysDialog({ title: `Keys: ${viewTable(view, weekTab(), hintOptions(app)).name}`,
    groups: viewKeyGroups(view, weekTab(), hintOptions(app)) });
}

// Keys of the whole main window (layout/main-keys.js): the palette, Today, the Week, the plan,
// a project's History, the Live note, the ? list.
// The Week Plan's own gt (the tray) is read first while that tab is shown and the focus is on
// the Week page: the calendar takes the keys typed outside .week-plan too (above). With the focus
// in the navigator, gt is Today again.
const shadowed = (event) => {
  const view = app.views?.shown ?? null;
  if (view !== "week" || weekTab() !== "plan" || !onWeekPage(event?.target)) return [];
  return shadowedMainActions(view, weekTab());
};

installMainKeys(window, {
  // Typed, : starts a command, as in the editor; the bar's field opens it empty.
  palette: () => app.guard(openPalette(app, ":")),
  today: () => app.showView("home", "push"),
  week: () => app.calendarCommand(),
  plan: () => app.guard(app.planKey()),
  history: () => app.guard(app.historyKey()),
  live: () => app.showView("live", "push"),
  keys: () => app.guard(showKeys()),
}, { shadowed });
