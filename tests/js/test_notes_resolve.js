// Which note a [[wiki link]] names, from where it is written; and heading lines.
import { headingLine } from "../../static/js/notes/headings.js";
import { resolveLink, splitTarget } from "../../static/js/notes/resolve.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { assertEqual, test } from "./harness.js";

// Projects(1) > Acme(2) > Kickoff(3), Notes(4)
//            > Northwind(5) > Notes(6)
// Meetings(7) > Kickoff(8)
// Inbox(9)
const TREE = new NoteTree([
  { id: 1, parent_id: null, title: "Projects" },
  { id: 2, parent_id: 1, title: "Acme" },
  { id: 3, parent_id: 2, title: "Kickoff" },
  { id: 4, parent_id: 2, title: "Notes" },
  { id: 5, parent_id: 1, title: "Northwind" },
  { id: 6, parent_id: 5, title: "Notes" },
  { id: 7, parent_id: null, title: "Meetings" },
  { id: 8, parent_id: 7, title: "Kickoff" },
  { id: 9, parent_id: null, title: "Inbox" },
]);

const idOf = (from, text) => resolveLink(TREE, from, text).note?.id ?? null;

test("resolve: a child of the current note comes first", () => {
  assertEqual(idOf(2, "Notes"), 4);
  assertEqual(idOf(5, "Notes"), 6);
});

test("resolve: then siblings, then the ancestors' siblings", () => {
  assertEqual(idOf(3, "Notes"), 4, "sibling");
  assertEqual(idOf(3, "Northwind"), 5, "parent's sibling");
  assertEqual(idOf(3, "Inbox"), 9, "top level");
  assertEqual(idOf(3, "Kickoff"), 3, "itself, as its own sibling");
  assertEqual(idOf(8, "Kickoff"), 8);
});

test("resolve: elsewhere only when the title is unique", () => {
  assertEqual(idOf(9, "Acme"), 2);
  const found = resolveLink(TREE, 9, "Kickoff");
  assertEqual(found.note, null);
  assertEqual(found.reason, "ambiguous");
  assertEqual(found.create, null);
});

test("resolve: case and spaces don't matter", () => {
  assertEqual(idOf(3, "  northWIND "), 5);
});

test("resolve: paths", () => {
  assertEqual(idOf(9, "Acme/Kickoff"), 3);
  assertEqual(idOf(9, "Meetings/Kickoff"), 8);
  assertEqual(idOf(3, "/Projects/Northwind/Notes"), 6);
  assertEqual(idOf(3, "/Acme"), null, "an absolute path starts at the top");
  assertEqual(idOf(3, "Projects//Acme"), null);
  assertEqual(resolveLink(TREE, 3, "a//b").reason, "bad");
});

test("resolve: where a missing note would be made", () => {
  assertEqual(JSON.stringify(resolveLink(TREE, 3, "Ideas").create), JSON.stringify({ parentId: 2, title: "Ideas" }));
  assertEqual(JSON.stringify(resolveLink(TREE, 9, "Ideas").create), JSON.stringify({ parentId: null, title: "Ideas" }));
  assertEqual(JSON.stringify(resolveLink(TREE, 3, "Acme/New").create), JSON.stringify({ parentId: 2, title: "New" }));
  assertEqual(JSON.stringify(resolveLink(TREE, 3, "/Top").create), JSON.stringify({ parentId: null, title: "Top" }));
  assertEqual(resolveLink(TREE, 3, "Nowhere/New").create, null, "only the last part may be missing");
});

test("resolve: from no note, the top level", () => {
  assertEqual(idOf(null, "Inbox"), 9);
  assertEqual(idOf(null, "Acme"), 2);
});

test("resolve: splitTarget takes the heading off", () => {
  assertEqual(JSON.stringify(splitTarget("Acme#Next steps")), JSON.stringify({ link: "Acme", heading: "Next steps" }));
  assertEqual(JSON.stringify(splitTarget("Acme")), JSON.stringify({ link: "Acme", heading: "" }));
});

test("headings: the line of a heading, by its slug, outside code", () => {
  const text = "# Top\n```\n# Fake\n```\n## Next  steps ##\n# Fake";
  assertEqual(headingLine(text, "Next steps"), 4);
  assertEqual(headingLine(text, "fake"), 5);
  assertEqual(headingLine(text, "Missing"), null);
});
