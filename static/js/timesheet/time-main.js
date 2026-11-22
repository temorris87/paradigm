// The timesheet window (/time.html): its own link to the server, and the timesheet page.
import { Changes } from "../connection/changes.js";
import { Connection } from "../connection/connection.js";
import { mountBanner } from "../connection/banner.js";
import { tabId } from "../connection/tab-id.js";
import { timeApi } from "./api.js";
import { TimePage } from "./time-page.js";

const connection = new Connection({ tabId: tabId(sessionStorage, "time") });
mountBanner(connection);
window.addEventListener("pagehide", () => connection.sendClosing());
connection.start();

const page = new TimePage({
  bar: document.querySelector(".time-bar"),
  main: document.querySelector(".time-main"),
  api: timeApi,
  changes: new Changes(),
});
page.start().catch((error) => page.say(error?.message ?? String(error), true));
