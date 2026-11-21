// The line of a heading in Markdown text, for [[Note#Heading]] links. Pure.
import { slugify } from "../markdown/slug.js";

const ATX = /^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;

export function headingLine(text, heading) {
  const want = slugify(heading);
  const lines = String(text).split("\n");
  let fence = null;
  for (const [index, line] of lines.entries()) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (marker) {
      if (fence === null) fence = marker[1][0];
      else if (marker[1][0] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const match = ATX.exec(line);
    if (match && slugify(match[1]) === want) return index;
  }
  return null;
}
