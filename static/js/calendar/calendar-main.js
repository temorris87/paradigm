// The calendar window (/calendar.html): its own link to the server (so Paradigm keeps running
// while it is open), and the calendar page.
import { Changes } from "../connection/changes.js";
import { Connection } from "../connection/connection.js";
import { mountBanner } from "../connection/banner.js";
import { tabId } from "../connection/tab-id.js";
import { meetingsApi } from "../meetings/api.js";
import { notesApi } from "../notes/api.js";
import { tasksApi } from "../tasks/api.js";
import { calendarApi } from "./api.js";
import { CalendarPage } from "./calendar-page.js";

const connection = new Connection({ tabId: tabId(sessionStorage, "calendar") });
mountBanner(connection);
window.addEventListener("pagehide", () => connection.sendClosing());
connection.start();

const page = new CalendarPage({
  bar: document.querySelector(".cal-bar"),
  side: document.querySelector(".cal-side"),
  week: document.querySelector(".cal-week"),
  api: { notes: notesApi, meetings: meetingsApi, tasks: tasksApi, calendar: calendarApi },
  changes: new Changes(),
});
page.start().catch((error) => page.say(error?.message ?? String(error)));
