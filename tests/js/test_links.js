import { HUB_SECTIONS, sectionsFor } from "../../static/js/hubs/hub-sections.js";
import { CATCH_UP_BATCH, LinkIndex } from "../../static/js/notes/link-index.js";
import { Links, linksInto, wikiTargets } from "../../static/js/notes/links.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const NOTES = [
  { id: 1, parent_id: null, title: "Style guide", kind: "resource", updated_at: "2026-11-10T12:00:00.000Z" },
  { id: 2, parent_id: 1, title: "Colours", updated_at: "2026-11-10T12:00:00.000Z" },
  { id: 3, parent_id: null, title: "Pilot", kind: "project", updated_at: "2026-11-10T12:00:00.000Z" },
  { id: 4, parent_id: 3, title: "Rollout", updated_at: "2026-11-20T12:00:00.000Z" },
  { id: 5, parent_id: 3, title: "2026-11-19 Kickoff", kind: "meeting", updated_at: "2026-11-21T12:00:00.000Z" },
  { id: 6, parent_id: null, title: "Old", kind: "project", archived_at: "2026-11-01T12:00:00.000Z", updated_at: "2026-11-22T12:00:00.000Z" },
  { id: 7, parent_id: null, title: "Loose", updated_at: "2026-11-05T12:00:00.000Z" },
  { id: 8, parent_id: 3, title: "Colours", updated_at: "2026-11-05T12:00:00.000Z" },
  { id: 9, parent_id: null, title: "Second", kind: "resource", updated_at: "2026-11-05T12:00:00.000Z" },
];
const LINKS = [
  { id: 4, targets: ["Style guide", "Style guide"] },
  { id: 5, targets: ["Style guide/Colours"] },
  { id: 2, targets: ["Style guide"] },
  { id: 6, targets: ["/Style guide"] },
  { id: 7, targets: ["Colours", "Nowhere"] },
  { id: 99, targets: ["Style guide"] },
];
const tree = () => new NoteTree(NOTES);

test("links: wiki link texts skip code spans and fences", () => {
  assertEqual(wikiTargets("[[A]] `[[B]]`\n\n```\n[[C]]\n```\n\n[[D#H|d]]").join(), "A,D");
});

test("links: notes outside a resource that reach it or a note under it", () => {
  const entries = linksInto(tree(), new Links(LINKS), tree().get(1));
  assertEqual(entries.map((e) => e.note.title).join(), "2026-11-19 Kickoff,Rollout,Old",
    "newest first, archived last; links from inside, trashed notes and ambiguous ones left out");
  assertEqual(entries[0].reached.map((n) => n.id).join(), "2");
  assertEqual(entries[1].reached.length, 1, "two links to the same note make one");
  assertTrue(entries[2].archived);
});

test("links: a link counts where it resolves today", () => {
  // "Colours" from Rollout's project: the nearer Colours (8), not the guide's.
  const links = new Links([{ id: 4, targets: ["Colours"] }]);
  assertEqual(linksInto(tree(), links, tree().get(1)).length, 0);
  assertEqual(linksInto(tree(), links, tree().get(3)).length, 0, "links inside a hub are its own");
});

test("links: resources are plain notes: no Linked from section on any page", () => {
  const t = tree();
  assertTrue(!sectionsFor(t.get(1)).some((section) => section.key === "linked"));
  assertTrue(!HUB_SECTIONS.some((section) => section.key === "linked"));
  // The index still answers who links where (a person's Backlinks use it).
  assertEqual(linksInto(t, new Links(LINKS), t.get(1)).length, 3);
});

test("links: a save sends the body's links and remembers them", async () => {
  const index = new LinkIndex({ api: {} });
  const sent = [];
  const save = index.saver(async (note, options) => { sent.push([note, options]); return { version: 2 }; });
  await save({ id: 4, body: "[[A]] [[B|b]]", version: 1 }, { keepalive: true });
  assertEqual(sent[0][0].links.join(), "A,B");
  assertEqual(sent[0][1].keepalive, true);
  assertEqual(index.links.targetsOf(4).join(), "A,B");
  const failing = index.saver(async () => { throw new Error("409"); });
  let threw = false;
  await failing({ id: 7, body: "[[C]]", version: 1 }).catch(() => { threw = true; });
  assertTrue(threw && index.links.targetsOf(7).length === 0, "a failed save changes nothing");
});

test("links: stale notes are read and sent back in batches, once", async () => {
  const stale = Array.from({ length: CATCH_UP_BATCH + 1 }, (_, i) => ({ id: i + 1, version: 1, body: `[[N${i}]]` }));
  const batches = [];
  let changes = 0;
  const api = {
    list: async () => ({ links: [{ id: 500, targets: ["X"] }], stale }),
    // The server skips note 2: it was saved meanwhile.
    catchUp: async (entries) => { batches.push(entries); return { stored: entries.map((e) => e.id).filter((id) => id !== 2) }; },
  };
  const index = new LinkIndex({ api, onChange: () => { changes += 1; } });
  await index.refresh();
  await index.refresh();
  await index.catching;
  assertEqual(batches.map((b) => b.length).join(), `${CATCH_UP_BATCH},1`, "a second refresh doesn't start another");
  assertEqual(index.links.targetsOf(1).join(), "N0");
  assertEqual(index.links.targetsOf(2).length, 0);
  assertEqual(index.links.targetsOf(500).join(), "X");
  assertEqual(changes, 1);
});
