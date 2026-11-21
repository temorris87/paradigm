// The notes endpoints (paradigm/api/notes.py). Every call resolves to the JSON answer or
// throws an ApiError carrying the server's message.

export class ApiError extends Error {
  constructor(status, message, payload = {}) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

async function call(path, { payload, keepalive = false } = {}) {
  const init = payload === undefined
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
  // keepalive: a save sent as the tab closes still arrives (bodies up to 64 KB).
  save: ({ id, body, version, force = false }, { keepalive = false } = {}) =>
    call("/api/note/save", { payload: { id, body, version, force }, keepalive }),
  rename: (id, title) => call("/api/note/rename", { payload: { id, title } }),
  move: (id, parentId) => call("/api/note/move", { payload: { id, parent_id: parentId } }),
  remove: (id, recursive = false) => call("/api/note/delete", { payload: { id, recursive } }),
};
