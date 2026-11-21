import { Connection } from "./connection/connection.js";
import { mountBanner } from "./connection/banner.js";
import { tabId } from "./connection/tab-id.js";
import "./editor/pd-editor.js";
import { notesApi } from "./notes/api.js";
import { NotesApp } from "./notes/app.js";

const connection = new Connection({ tabId: tabId() });
mountBanner(connection);
window.addEventListener("pagehide", () => connection.sendClosing());
connection.start();

const app = new NotesApp({
  editor: document.querySelector("pd-editor"),
  tree: document.querySelector(".tree"),
  crumbs: document.querySelector(".crumbs"),
  api: notesApi,
});
app.start().catch((error) => app.fail(error));
