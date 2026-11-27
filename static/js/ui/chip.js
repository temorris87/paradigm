// THE status chip (css/chip.css): a short label in a tone, with an optional dot before it.
// Which tone a state or kind takes is ui/chip-tones.js's.
//
//   chip(text, tone, { dot = false, title, tag = "span" } = {})  -> the element
//     tone: one of CHIP_TONES; tag "button" makes a chip you can press (a filter pill)
import { CHIP_TONES } from "./chip-tones.js";

export function chip(text, tone, { dot = false, title, tag = "span" } = {}) {
  const node = document.createElement(tag);
  if (tag === "button") node.type = "button";
  setChipTone(node, tone);
  if (dot) {
    const mark = document.createElement("span");
    mark.className = "chip__dot";
    mark.setAttribute("aria-hidden", "true");
    node.append(mark);
  }
  node.append(String(text ?? ""));
  if (title) node.title = title;
  return node;
}

/** Gives a chip another tone (a filter pill turning on), keeping its other classes. */
export function setChipTone(node, tone) {
  for (const each of CHIP_TONES) node.classList.remove(`chip--${each}`);
  node.classList.add("chip", `chip--${CHIP_TONES.includes(tone) ? tone : "neutral"}`);
}
