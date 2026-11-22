// The buttons on the card (hub-line.js): a fact that can be changed is drawn as a button,
// or gets a small ✎ + × beside it. They only report the click; what it does is the app's
// (static/js/hubs/hub-actions.js), passed in as controls:
//
//   { file(button, hub), area(project), status(button, project), due(project),
//     addPerson(hub), details(person), when(meeting), addAttendee(meeting),
//     dropAttendee(meeting, person), day(record), answer(button, question), addWith(record),
//     dropWith(record, person), dates(phase or milestone), history(phase or milestone),
//     milestoneState(button, milestone) }
//
// Tests and pages without actions get NO_CONTROLS: the buttons are drawn and do nothing.
export const NO_CONTROLS = Object.freeze({
  file() {}, area() {}, status() {}, due() {}, addPerson() {}, details() {}, when() {}, addAttendee() {},
  dropAttendee() {}, day() {}, answer() {}, addWith() {}, dropWith() {}, dates() {}, history() {}, milestoneState() {},
});

/** A fact drawn as a button: "Project ▾", "Tue 2026-11-24 14:00". */
export function factButton(className, text, title, onClick, { caret = false } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `hub-line__control ${className}`;
  button.title = title;
  button.textContent = text;
  if (caret) {
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false");
    const mark = document.createElement("span");
    mark.className = "hub-line__caret";
    mark.textContent = "▾";
    mark.setAttribute("aria-hidden", "true");
    button.append(mark);
  }
  button.addEventListener("click", () => onClick(button));
  return button;
}

/** A small button beside a fact: ✎ (change it), + (add), × (take off). */
export function miniButton(glyph, label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mini-button hub-line__mini";
  button.textContent = glyph;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", () => onClick(button));
  return button;
}
