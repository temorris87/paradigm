import { Connection } from "./connection/connection.js";
import { mountBanner } from "./connection/banner.js";
import { tabId } from "./connection/tab-id.js";
import { mountScratchEditor } from "./scratch.js";

const connection = new Connection({ tabId: tabId() });
mountBanner(connection);
window.addEventListener("pagehide", () => connection.sendClosing());
connection.start();

mountScratchEditor(document.querySelector("pd-editor"));
