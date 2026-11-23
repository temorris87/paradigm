// The note window (/note.html): one note at a time, written here, with its card and sections.
// Today, People, a hub's dashboard... show in the main window (the navigator's Today and Week,
// the palette).
import { boot } from "./boot.js";
import { setNotePath } from "./notes/app.js";

setNotePath("/note.html");

const $ = (selector) => document.querySelector(selector);

boot({
  role: "note",
  kind: "note",
  options: () => ({ buttons: { dashboard: $(".topbar__dashboard") } }),
});
