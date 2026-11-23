// What both windows start with: their link to the server (so Paradigm keeps running while
// either is open), the banner when it stops, the image viewer, the notes navigator, and the
// NotesApp in their role. main.js starts the main window, note-main.js the note window.
//
//   const app = boot({ role, kind, build(common) -> NotesApp options });
import { Connection } from "./connection/connection.js";
import { mountBanner } from "./connection/banner.js";
import { tabId } from "./connection/tab-id.js";
import "./editor/pd-editor.js";
import "./images/viewer.js";
import { Navigator } from "./layout/navigator.js";
import { calendarApi } from "./calendar/api.js";
import { filesApi } from "./files/api.js";
import { meetingsApi } from "./meetings/api.js";
import { imagesApi, linksApi, notesApi } from "./notes/api.js";
import { NotesApp } from "./notes/app.js";
import { peopleApi } from "./people/api.js";
import { planApi, planTemplatesApi } from "./plan/api.js";
import { recordsApi } from "./records/api.js";
import { foldersApi } from "./resources/api.js";
import { statusApi } from "./status/api.js";
import { tasksApi } from "./tasks/api.js";
import { templatesApi } from "./templates/api.js";
import { timeApi } from "./timesheet/api.js";
import { trashApi } from "./trash/api.js";
import { onCallApi } from "./oncall/api.js";

export const APIS = { api: notesApi, imagesApi, peopleApi, meetingsApi, recordsApi, trashApi, linksApi, tasksApi, calendarApi,
  planApi, planTemplatesApi, filesApi, templatesApi, foldersApi, statusApi, timeApi, onCallApi };

export function boot({ role, kind, options }) {
  const connection = new Connection({ tabId: tabId(sessionStorage, kind) });
  let app = null;
  mountBanner(connection, { unsaved: () => Boolean(app?.session.dirty || app?.agenda?.dirty) });
  window.addEventListener("pagehide", () => connection.sendClosing());
  connection.start();

  const editor = document.querySelector(".app__editor");
  const viewer = document.querySelector("pd-image-viewer");
  for (const box of document.querySelectorAll("pd-editor")) box.addEventListener("image", (event) => viewer.open(event.detail));

  const navigator = new Navigator({
    panel: document.querySelector(".app__sidebar"),
    button: document.querySelector(".topbar__nav"),
    backdrop: document.querySelector(".navigator__backdrop"),
    onShow: () => app.focusTree(),
    onHide: () => app.focusNote(),
  });
  app = new NotesApp({
    role,
    editor,
    tree: document.querySelector(".tree"),
    crumbs: document.querySelector(".crumbs"),
    navigator,
    hub: {
      page: document.querySelector(".app__note"),
      line: document.querySelector(".hub-line"),
      section: document.querySelector(".hub"),
      sheet: document.querySelector(".sheet"),
      labels: {
        main: document.querySelector(".field-label--main"),
        agenda: document.querySelector(".field-label--agenda"),
        agendaField: document.querySelector(".app__agenda"),
      },
    },
    agenda: {
      editor: document.querySelector(".app__agenda-editor"),
      field: document.querySelector(".app__agenda"),
    },
    goTo: document.querySelector(".topbar__goto"),
    pins: document.querySelector(".navigator__pins"),
    prep: document.querySelector(".prep"),
    contextStrip: document.querySelector(".context-strip"),
    saveState: document.querySelector(".navigator__save"),
    connection,
    ...APIS,
    ...options(() => app),
  });
  app.start().catch((error) => app.fail(error));
  return app;
}
