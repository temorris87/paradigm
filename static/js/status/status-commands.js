// What Log status…, its key (L), :log and the digest do. Each takes the NotesApp
// (static/js/notes/app.js); errors are thrown for the app (or the dialog) to show.
//
//   statusHubOf(app, id?)          the project or area a note belongs to (its top note), or null
//   logStatusDialog(app, hub)      health (1 2 3), a few words, "since last log" lines to add
//   statusHistoryDialog(app, hub)  every entry, newest first
//   statusCommand(app, { bang })   :log (the open note's hub), :log! its history
//   copyDigest(app, area)          the area's weekly digest, as rich text and Markdown
import { localDay } from "../meetings/meeting-days.js";
import { topNoteOf } from "../notes/hub-groups.js";
import { copyRich } from "../ui/clipboard.js";
import { dayText } from "../ui/dates.js";
import { formDialog } from "../ui/dialog.js";
import { HEALTHS, digest, digestHtml, healthLabel, sinceLastLog } from "./status-model.js";

const HEALTH_KEYS = { on_track: "1", at_risk: "2", blocked: "3" };

function changed(app) {
  app.changes.send({ type: "changed", what: ["status"] });
  return app.refreshTree();
}

export function statusHubOf(app, id = app.currentId) {
  const top = id === null || id === undefined ? null : topNoteOf(app.tree, id);
  return top && (top.kind === "project" || top.kind === "area") ? top : null;
}

function ctxOf(app) {
  return { tree: app.tree, plan: app.plan, records: app.records, tasks: app.tasks, statusLogs: app.statusLogs };
}

export function logStatusDialog(app, hub) {
  if (!hub) throw new Error("E: Log status is for a project or an area (or a note inside one)");
  const today = localDay(app.today());
  const last = app.statusLogs.latest(hub.id);
  const since = sinceLastLog(ctxOf(app), hub, today).map((line) => line.text);
  return formDialog({
    title: `Log ${hub.kind === "area" ? "area " : ""}status · ${hub.title}`,
    fields: [
      { key: "health", label: "Health", type: "choice", value: last?.health ?? "on_track",
        options: HEALTHS.map(({ key, label }) => [key, label, HEALTH_KEYS[key]]) },
      { key: "text", label: "Where it is", type: "textarea", rows: 4,
        add: { label: last ? `Since last log (${dayText(last.day, { today })}) — click to add:` : "Lately — click to add:", lines: since } },
    ],
    submit: "Log it (Ctrl-Enter)",
    run: async ({ health, text }) => {
      await app.statusApi.create(hub.id, today, health, text);
      await changed(app);
      app.say(`Logged: ${hub.title} is ${healthLabel(health).toLowerCase()}`);
      return true;
    },
  });
}

export function statusHistoryDialog(app, hub) {
  if (!hub) throw new Error("E: a status log is kept on a project or an area");
  const today = localDay(app.today());
  const entries = app.statusLogs.of(hub.id);
  return formDialog({
    title: `Status history · ${hub.title}`,
    text: entries.length ? "" : "Nothing logged yet: Log status… (L) makes the first entry.",
    lines: entries.map((entry) => `${dayText(entry.day, { today })} · ${healthLabel(entry.health)} — ${entry.text}`),
    submit: "Close",
    run: async () => true,
  });
}

export function statusCommand(app, { bang }) {
  const hub = statusHubOf(app);
  return bang ? statusHistoryDialog(app, hub) : logStatusDialog(app, hub);
}

export async function copyDigest(app, area) {
  const text = digest(ctxOf(app), area, app.today());
  await copyRich(digestHtml(text), text);
  app.say(`The weekly digest of ${area.title} is on the clipboard`);
}
