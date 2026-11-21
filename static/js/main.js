import { Connection } from "./connection/connection.js";
import { mountBanner } from "./connection/banner.js";
import { tabId } from "./connection/tab-id.js";
import "./editor/pd-editor.js";
import "./images/viewer.js";
import { imagesApi, notesApi } from "./notes/api.js";
import { NotesApp } from "./notes/app.js";

const connection = new Connection({ tabId: tabId() });
mountBanner(connection);
window.addEventListener("pagehide", () => connection.sendClosing());
connection.start();

const editor = document.querySelector("pd-editor");
const viewer = document.querySelector("pd-image-viewer");
editor.addEventListener("image", (event) => viewer.open(event.detail));

const app = new NotesApp({
  editor,
  tree: document.querySelector(".tree"),
  crumbs: document.querySelector(".crumbs"),
  api: notesApi,
  imagesApi,
});
app.start().catch((error) => app.fail(error));
