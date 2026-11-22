// The note window (/note.html): one note at a time, written here, with its card and sections.
// Home, People, a hub's dashboard... show in the main window.
import { boot } from "./boot.js";
import { setNotePath } from "./notes/app.js";

setNotePath("/note.html");

const $ = (selector) => document.querySelector(selector);

boot({
  role: "note",
  kind: "note",
  options: (app) => {
    $(".topbar__home").addEventListener("click", () => app().showView("home", "push"));
    return { buttons: { dashboard: $(".topbar__dashboard") } };
  },
});
