// The Insert diagram picker (:diagram, the note menu, the text's right-click menu): the diagram
// types on the left, Most used first, the chosen one's line and the exact block it inserts on
// the right. Typing filters by name or keyword; Enter puts the block in below the cursor (with
// the cursor in a mermaid block, fences included, after that block's closing fence and an
// empty line; in one with no closing fence, above its opening fence and an empty line, since
// below it would still be inside), the editor in insert mode at its first ‹blank› (else at
// the end of its last line). Its keys are the "diagram" scope of ui-keys.js.
//
//   insertDiagramDialog(editor, fallbackFocus) -> Promise (resolves when it closes)
//   diagramPlace(lines, row) -> null, or when the cursor's row is in a mermaid block
//       { line, emptyLine }: the line the new block goes below (-1: above the first line),
//       the empty line "before" it (after a closed block) or "after" it (above an open one)
import { element, openModal, restoreFocus, uniqueId } from "../ui/dom.js";
import { uiAction } from "../ui/ui-keys.js";
import { mermaidBlockAt } from "./mermaid-syntax.js";
import { DIAGRAM_TYPES, diagramFence, diagramGroups } from "./mermaid-types.js";

export function diagramPlace(lines, row) {
  const block = mermaidBlockAt(lines, row, { fences: true });
  if (!block) return null;
  // A block running to the end has no closing fence: anything below it is still in it.
  if (block.close >= lines.length) return { line: block.open - 1, emptyLine: "after" };
  return { line: block.close, emptyLine: "before" };
}

export function insertDiagramDialog(editor, fallbackFocus = () => editor.focus()) {
  return new Promise((resolve) => {
    const before = document.activeElement;
    const dialog = element("dialog", "dialog diagram-picker");
    const heading = element("h2", "dialog__title", "Insert diagram");
    heading.id = uniqueId("diagram-title");
    dialog.setAttribute("aria-labelledby", heading.id);
    const box = element("input", "dialog__input diagram-picker__box");
    Object.assign(box, { type: "text", autocomplete: "off", placeholder: `Type to filter · ${DIAGRAM_TYPES.length} types` });
    box.setAttribute("role", "combobox");
    box.setAttribute("aria-expanded", "true");
    const list = element("ul", "diagram-picker__list");
    list.id = uniqueId("diagram-list");
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Diagram types");
    box.setAttribute("aria-controls", list.id);
    const about = element("p", "diagram-picker__about");
    const code = element("pre", "diagram-picker__code");
    const preview = element("div", "diagram-picker__preview");
    preview.append(about, code);
    const body = element("div", "diagram-picker__body");
    body.append(list, preview);
    dialog.append(heading, box, body);
    document.body.append(dialog);

    let types = [];
    let active = 0;
    const draw = () => {
      const groups = diagramGroups(box.value.trim());
      types = groups.flatMap((group) => group.types);
      active = Math.min(active, Math.max(0, types.length - 1));
      let index = 0;
      const rows = groups.flatMap((group) => [
        element("li", "diagram-picker__group", group.label),
        ...group.types.map((type) => typeRow(type, `${list.id}-${index}`, index++)),
      ]);
      for (const label of rows.filter((row) => !row.dataset.index)) label.setAttribute("role", "presentation");
      list.replaceChildren(...(rows.length ? rows : [element("li", "diagram-picker__empty", "No type matches")]));
      mark();
    };
    const mark = () => {
      const options = list.querySelectorAll("[role=option]");
      options.forEach((option, index) => option.setAttribute("aria-selected", String(index === active)));
      const chosen = options[active];
      if (chosen) {
        box.setAttribute("aria-activedescendant", chosen.id);
        chosen.scrollIntoView?.({ block: "nearest" });
      } else {
        box.removeAttribute("aria-activedescendant");
      }
      const type = types[active];
      about.textContent = type ? type.description : "";
      code.textContent = type ? diagramFence(type) : "";
    };
    let done = false;
    const finish = (type) => {
      if (done) return;
      done = true;
      dialog.close();
      dialog.remove();
      if (type) insertBlock(editor, diagramFence(type));
      else restoreFocus(before, fallbackFocus);
      resolve(type ?? null);
    };
    box.addEventListener("input", () => {
      active = 0;
      draw();
    });
    // j and k move while nothing is typed, and type once something is. A j or k that moved,
    // then a letter that with it begins a filter ("ka", "jo"), was the start of a word after all.
    let moved = "";
    box.addEventListener("keydown", (event) => {
      const action = uiAction(event, "diagram");
      const letter = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
      const word = moved + event.key;
      if (letter && moved && !box.value && !action && diagramGroups(word).length) {
        event.preventDefault();
        moved = "";
        box.value = word;
        box.dispatchEvent(new Event("input"));
        return;
      }
      moved = action && !box.value && (event.key === "j" || event.key === "k") ? event.key : "";
      if (!action || ((event.key === "j" || event.key === "k") && box.value)) return;
      event.preventDefault();
      event.stopPropagation();
      if (action === "next") active = Math.min(active + 1, types.length - 1);
      if (action === "previous") active = Math.max(active - 1, 0);
      // Nothing matches: stay open, so the filter can be fixed.
      if (action === "choose") return types[active] ? finish(types[active]) : undefined;
      if (action === "close") return finish(null);
      mark();
      return undefined;
    });
    list.addEventListener("click", (event) => {
      const option = event.target.closest?.("[role=option]");
      if (option) finish(types[Number(option.dataset.index)]);
    });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(null);
    });
    draw();
    openModal(dialog, box);
  });
}

function insertBlock(editor, text) {
  const cursor = editor.cursor;
  const place = cursor && typeof editor.value === "string" ? diagramPlace(editor.value.split("\n"), cursor.line) : null;
  const before = place?.emptyLine === "before" ? "\n" : "";
  const block = `${before}${text}${place?.emptyLine === "after" ? "\n" : ""}`;
  // A type whose lexer takes no ‹blank› (Sankey, Event modeling): the end of its last line.
  const options = { insert: true, cursorAt: text.split("\n").length - 2 + before.length };
  editor.insertLines(block, place === null ? options : { ...options, line: place.line });
}

function typeRow(type, id, index) {
  const row = element("li", "diagram-picker__row");
  row.id = id;
  row.dataset.index = String(index);
  row.setAttribute("role", "option");
  row.append(element("span", "diagram-picker__name", type.name), element("span", "diagram-picker__keyword", type.keyword));
  return row;
}
