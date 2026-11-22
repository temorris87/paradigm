import { Connection } from "./connection/connection.js";
import { mountBanner } from "./connection/banner.js";
import { tabId } from "./connection/tab-id.js";
import "./editor/pd-editor.js";
import "./images/viewer.js";
import { Navigator } from "./layout/navigator.js";
import { meetingsApi } from "./meetings/api.js";
import { recordsApi } from "./records/api.js";
import { imagesApi, linksApi, notesApi } from "./notes/api.js";
import { NotesApp } from "./notes/app.js";
import { peopleApi } from "./people/api.js";

const connection = new Connection({ tabId: tabId() });
mountBanner(connection);
window.addEventListener("pagehide", () => connection.sendClosing());
connection.start();

const editor = document.querySelector("pd-editor");
const viewer = document.querySelector("pd-image-viewer");
editor.addEventListener("image", (event) => viewer.open(event.detail));

const notesNavigator = new Navigator({
  panel: document.querySelector(".app__sidebar"),
  button: document.querySelector(".topbar__nav"),
  backdrop: document.querySelector(".navigator__backdrop"),
  onShow: () => app.focusTree(),
  onHide: () => editor.focus(),
});

const app = new NotesApp({
  editor,
  tree: document.querySelector(".tree"),
  crumbs: document.querySelector(".crumbs"),
  hub: {
    page: document.querySelector(".app__note"),
    line: document.querySelector(".hub-line"),
    section: document.querySelector(".hub"),
  },
  home: {
    section: document.querySelector(".home"),
    button: document.querySelector(".topbar__home"),
  },
  people: {
    section: document.querySelector(".people"),
    button: document.querySelector(".topbar__people"),
  },
  meetings: {
    section: document.querySelector(".meetings"),
    button: document.querySelector(".topbar__meetings"),
  },
  goTo: document.querySelector(".topbar__goto"),
  navigator: notesNavigator,
  api: notesApi,
  imagesApi,
  peopleApi,
  meetingsApi,
  recordsApi,
  linksApi,
});
app.start().catch((error) => app.fail(error));
