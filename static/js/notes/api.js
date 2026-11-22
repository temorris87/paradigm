// The notes, images and links endpoints (paradigm/api/notes.py, images.py, links.py). Every
// call resolves to the JSON answer or throws an ApiError carrying the server's message.

export class ApiError extends Error {
  constructor(status, message, payload = {}) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

// payload is sent as JSON; blob (an image) is sent as its raw bytes.
export async function call(path, { payload, blob, keepalive = false } = {}) {
  const init = blob !== undefined
    ? { method: "POST", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob }
    : payload === undefined
      ? { method: "GET" }
      : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), keepalive };
  let response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError(0, "Paradigm is not answering");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body.error ?? `HTTP ${response.status}`, body);
  return body;
}

export const notesApi = {
  list: async () => (await call("/api/notes")).notes,
  get: (id) => call(`/api/note?id=${encodeURIComponent(id)}`),
  create: (parentId, title, body = "") => call("/api/note/create", { payload: { parent_id: parentId, title, body } }),
  // keepalive: a save sent as the tab closes still arrives (bodies up to 64 KB). links: the
  // [[wiki link]] texts in body (links.js wikiTargets), mentions its @mentions (mentions.js);
  // links left out, the server marks the note stale.
  save: ({ id, body, version, force = false, links, mentions, tasks }, { keepalive = false } = {}) =>
    call("/api/note/save", { payload: { id, body, version, force, links, mentions, tasks }, keepalive }),
  rename: (id, title) => call("/api/note/rename", { payload: { id, title } }),
  // kind: "project" | "area" | "resource" | null (the Inbox)
  setKind: (id, kind) => call("/api/note/kind", { payload: { id, kind } }),
  // areaId: an area's id, or null for no area (projects only)
  setArea: (id, areaId) => call("/api/note/area", { payload: { id, area_id: areaId } }),
  // a project's status: "active" | "on_hold"; its due date "YYYY-MM-DD" ("" for none)
  setStatus: (id, status) => call("/api/note/status", { payload: { id, status } }),
  setDue: (id, due) => call("/api/note/due", { payload: { id, due } }),
  // a project's or an area's timesheet code ("" for none)
  setTimeCode: (id, code) => call("/api/note/time_code", { payload: { id, code } }),
  // -> { note, inside }: archived true archives a hub with everything in it, false restores it
  archive: (id, archived) => call("/api/note/archive", { payload: { id, archived } }),
  move: (id, parentId) => call("/api/note/move", { payload: { id, parent_id: parentId } }),
  remove: (id, recursive = false) => call("/api/note/delete", { payload: { id, recursive } }),
};

export const imagesApi = {
  // -> { id, url, mime, width, height, size }
  upload: (noteId, blob) => call(`/api/image/upload?note=${encodeURIComponent(noteId)}`, { blob }),
};

export const linksApi = {
  // -> { links: [{ id, targets }], mentions: [{ id, field, line, name, context }],
  //      stale: [{ id, version, body, agenda? }] }
  list: () => call("/api/links"),
  // entries: [{ id, version, links, mentions, tasks }] -> { stored: [ids] }
  catchUp: (entries) => call("/api/links/index", { payload: { entries } }),
};
