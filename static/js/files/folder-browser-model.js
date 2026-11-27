// The folder browser's lists (folder-browser.js), worked out from the server's answers to
// /api/folders/browse. Paths are the computer's own ("C:\Users\…" or "/home/…"): a path's
// separator is the one it already uses. Pure.
//
//   entriesOf(listing)          one folder's rows: [{ kind: "folder" | "file", name, path, size?,
//                               modified? }], folders first, then files, each by name; only
//                               the folder's own subfolders, however many the answer lists
//   rootEntries(roots)          the roots' rows (where h goes from a root), full path as name
//   filterEntries(rows, query)  the rows whose name holds every word typed, ignoring case
//   moveActive(active, action, count)   next / previous / first / last, kept in the list
//   joinPath(dir, name) / baseName(path)
//   sizeText(bytes)             "812 B", "14 KB", "3.2 MB"

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });

function separatorOf(path) {
  return String(path).includes("\\") ? "\\" : "/";
}

/** The path without separators at its end, unless the separator is the root itself. */
function trimmed(path) {
  const text = String(path);
  const cut = text.replace(/[\\/]+$/, "");
  return cut === "" || /^[A-Za-z]:$/.test(cut) ? text : cut;
}

export function baseName(path) {
  const text = trimmed(path).replace(/[\\/]+$/, "");
  const at = Math.max(text.lastIndexOf("/"), text.lastIndexOf("\\"));
  return at < 0 ? text : text.slice(at + 1) || text;
}

export function joinPath(dir, name) {
  const base = trimmed(dir);
  return /[\\/]$/.test(base) ? `${base}${name}` : `${base}${separatorOf(base)}${name}`;
}

/** Whether child sits right inside dir (not deeper, not dir itself). */
function directlyIn(dir, child) {
  const base = trimmed(dir);
  const start = /[\\/]$/.test(base) ? base : `${base}${separatorOf(base)}`;
  if (!String(child).startsWith(start)) return false;
  const rest = String(child).slice(start.length).replace(/[\\/]+$/, "");
  return rest !== "" && !/[\\/]/.test(rest);
}

export function entriesOf(listing) {
  const path = listing?.path ?? "";
  const folders = (listing?.folders ?? []).filter((folder) => directlyIn(path, folder))
    .map((folder) => ({ kind: "folder", name: baseName(folder), path: folder }));
  const files = (listing?.files ?? []).map((file) => ({ kind: "file", name: file.name, path: joinPath(path, file.name),
    size: file.size, modified: file.modified }));
  return [...folders.sort(byName), ...files.sort(byName)];
}

export function rootEntries(roots) {
  return (roots ?? []).map((root) => ({ kind: "folder", name: root, path: root }));
}

export function filterEntries(rows, query) {
  const words = String(query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return rows.slice();
  return rows.filter((row) => words.every((word) => row.name.toLowerCase().includes(word)));
}

export function moveActive(active, action, count) {
  if (count <= 0) return 0;
  const last = count - 1;
  if (action === "next") return Math.min(active + 1, last);
  if (action === "previous") return Math.max(active - 1, 0);
  if (action === "first") return 0;
  if (action === "last") return last;
  return Math.min(Math.max(active, 0), last);
}

export function sizeText(bytes) {
  if (typeof bytes !== "number" || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 && unit ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
