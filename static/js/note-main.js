// The note window (/note.html): one note at a time, written here, with its card and sections.
// Today, People, a hub's dashboard... show in the main window (the navigator's Today and Week,
// the palette), and its Live page shows the note as it is typed here (live/live-sender.js).
import { boot } from "./boot.js";
import { startLiveSender } from "./live/live-sender.js";
import { setNotePath } from "./notes/app.js";

setNotePath("/note.html");

const $ = (selector) => document.querySelector(selector);

const app = boot({
  role: "note",
  kind: "note",
  options: () => ({ buttons: { dashboard: $(".topbar__dashboard") } }),
});
startLiveSender(app);
