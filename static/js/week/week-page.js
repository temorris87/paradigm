// The Week page, in the main window (&week): the calendar, the timesheet and the on-call rota
// as one page with Plan / Timesheet / On call (the timesheet's settings are on the Settings
// page, settings/settings-page.js). It owns the week shown (‹ This week ›,
// the keys [ ] t), the switch, the week's totals in its bar (focus planned, meetings, free),
// who is on call that week (on every tab; a click opens On call), and the footer under
// Plan: the hours so far by time code and the week projected, with Timesheet ↗. The calendar
// (calendar/calendar-page.js), the timesheet (timesheet/time-page.js) and the rota
// (oncall/oncall-page.js) draw the rest.
//
//   const page = new WeekPage({ root, bar, plan, time, oncall, foot, api: timeApi, changes, today, onView });
//     plan, time, oncall: the bodies; foot: Plan's footer; onView(view): a tab came up (the
//     key-hint bar follows it)
//   page.hold(calendar, timesheet, onCallPage)
//   page.show(view?)    view: "plan" | "timesheet" | "oncall" (the last one if none)
//   page.redraw(ctx)    the app drew: its tree and rota (ctx.onCall) for the bar's On call line
//   page.focus()
//   page.moveWeek(days) days: -7, 7, or 0 (this week)
import { addDays, dateOf, localDay } from "../meetings/meeting-days.js";
import { weekOf } from "../calendar/week-model.js";
import { weekRange } from "../ui/dates.js";
import { hoursText } from "./capacity.js";
import { weekSummary } from "./tray-model.js";
import { barText } from "../oncall/oncall-model.js";

export const WEEK_VIEWS = [
  { key: "plan", label: "Plan", title: "Meetings, blocks and the tasks to plan onto them" },
  { key: "timesheet", label: "Timesheet", title: "The week's hours by time code" },
  { key: "oncall", label: "On call", title: "Who is on call each week: paste the Excel sheet here" },
];

export class WeekPage {
  constructor({ root, bar, plan, time, oncall, foot, api, changes, today = () => new Date(), onView = () => {} }) {
    this.root = root;
    this.planBody = plan;
    this.timeBody = time;
    this.onCallBody = oncall;
    this.onCall = null;
    this.ctx = null;
    this.foot = foot;
    this.api = api;
    this.today = today;
    this.onView = onView;
    this.monday = weekOf(localDay(today()));
    this.view = "plan";
    this.calendar = null;
    this.timesheet = null;
    this.report = null;
    this.bar = this.makeBar(bar);
    changes?.listen((message) => {
      if (message.type === "changed" && !root.hidden) this.loadFoot();
    });
  }

  /** The two pages it holds (made with onMove pointing here). */
  hold(calendar, timesheet, onCall) {
    this.calendar = calendar;
    this.timesheet = timesheet;
    this.onCall = onCall;
  }

  redraw(ctx) {
    this.ctx = ctx;
    this.drawOnCall();
    if (this.view === "oncall") this.onCall?.draw();
  }

  makeBar(bar) {
    const make = (text, title, onClick, className = "cal-button") => {
      const node = element("button", className, text);
      Object.assign(node, { type: "button", title });
      node.addEventListener("click", onClick);
      return node;
    };
    const range = element("h1", "week-bar__range");
    const switcher = element("div", "segmented week-bar__views");
    switcher.setAttribute("role", "tablist");
    const tabs = WEEK_VIEWS.map((view) => {
      // A tab's keys listen on its body, so a click on the tab moves the focus there.
      const tab = make(view.label, view.title, () => {
        this.show(view.key);
        this.focus();
      }, "segmented__item");
      tab.setAttribute("role", "tab");
      tab.dataset.view = view.key;
      return tab;
    });
    switcher.append(...tabs);
    const summary = element("p", "week-bar__summary");
    const onCall = make("", "Who is on call this week", () => this.show("oncall"), "week-bar__oncall");
    onCall.hidden = true;
    const copy = make("Copy for timesheet", "Copy the grid: paste it into the timesheet, Excel or an email (c)",
      () => this.timesheet?.run(this.timesheet.copy()), "cal-button week-bar__primary");
    bar.replaceChildren(range, make("‹", "The week before ([)", () => this.moveWeek(-7)),
      make("This week", "This week (t)", () => this.moveWeek(0)), make("›", "The week after (])", () => this.moveWeek(7)),
      switcher, summary, onCall, copy);
    return { range, tabs, summary, onCall, copy };
  }

  show(view = this.view) {
    this.view = view;
    const plan = view === "plan";
    const onCall = view === "oncall";
    this.planBody.hidden = !plan;
    this.timeBody.hidden = plan || onCall;
    this.onCallBody.hidden = !onCall;
    for (const tab of this.bar.tabs) tab.setAttribute("aria-selected", String(tab.dataset.view === view));
    this.bar.copy.hidden = view !== "timesheet";
    this.bar.summary.hidden = !plan;
    this.drawRange();
    if (plan) this.calendar.show();
    else if (onCall) {
      this.onCall.show();
      this.onCall.focus();
    }
    else this.timesheet.show();
    this.loadFoot();
    this.onView(view);
  }

  moveWeek(days) {
    this.monday = days === 0 ? weekOf(localDay(this.today())) : localDay(addDays(dateOf(this.monday), days));
    this.calendar.setMonday(this.monday);
    this.timesheet.setMonday(this.monday);
    this.onCall?.setMonday(this.monday);
    this.drawRange();
    this.loadFoot();
  }

  drawRange() {
    this.bar.range.textContent = weekRange(this.monday, localDay(this.today()));
    this.drawOnCall();
  }

  /** Who is on call the week shown, from the app's rota. */
  drawOnCall() {
    const { text, title } = this.ctx?.onCall ? barText(this.ctx.tree, this.ctx.onCall.of(this.monday)) : { text: "" };
    this.bar.onCall.hidden = !text;
    this.bar.onCall.textContent = text;
    this.bar.onCall.title = text ? `${title}\n(On call: the whole rota)` : "";
  }

  /** The calendar drew: the week's totals in the bar. */
  drawSummary() {
    const calendar = this.calendar;
    if (!calendar) return;
    const total = weekSummary(calendar.data, calendar.days(), calendar.settings);
    const part = (label, value, tone) => {
      const span = element("span", "week-bar__part", `${label} `);
      span.append(element("strong", `week-bar__value week-bar__value--${tone}`, hoursText(value)));
      return span;
    };
    this.bar.summary.replaceChildren(part("Focus planned", total.focusMin, "focus"), " · ", part("meetings", total.meetingMin, "meetings"),
      " · ", part("free", total.freeMin, "free"));
  }

  async loadFoot() {
    if (this.view !== "plan" || this.root.hidden) return;
    try {
      this.report = await this.api.week(this.monday);
    } catch {
      this.report = null;
    }
    this.drawFoot();
  }

  /** Time so far: each code's hours up to today (the rest of the week is projected). */
  drawFoot() {
    const report = this.report;
    if (!report) {
      this.foot.replaceChildren();
      return;
    }
    const today = localDay(this.today());
    const sofar = report.rows.map((row) => ({ code: row.code,
      hours: row.hours.reduce((sum, hours, index) => sum + (report.days[index] <= today ? hours : 0), 0) }));
    const coded = report.rows.filter((row) => row.code !== report.default_code).reduce((sum, row) => sum + row.total, 0);
    const parts = [element("span", "week-foot__label", "Time so far")];
    for (const { code, hours } of sofar) {
      const item = element("span", "week-foot__code");
      item.append(element("span", "week-foot__name", code), ` ${formatHours(hours)} h`);
      parts.push(item);
    }
    const open = element("button", "cal-button week-foot__open", "Timesheet ↗");
    open.type = "button";
    open.title = "The week's hours by code, to copy into the timesheet";
    open.addEventListener("click", () => this.show("timesheet"));
    parts.push(element("span", "week-foot__projected", `Projected week: ${formatHours(report.total)} h, ${formatHours(coded)} h coded`), open);
    this.foot.replaceChildren(...parts);
  }

  focus() {
    // On call takes its keys and Ctrl-V where the focus is: on its own body.
    if (this.view === "oncall") this.onCall.focus();
    // The calendar's keys ([ ] t, s) listen on its own body, so Plan starts there.
    else if (this.view === "plan") this.calendar.focus();
    // So do the timesheet's ([ ] t, c): on .week-time, inside this page's root.
    else if (this.timesheet) this.timesheet.focus();
    else this.root.focus({ preventScroll: true });
  }
}

function formatHours(hours) {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(hours * 2 === Math.round(hours * 2) ? 1 : 2);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
