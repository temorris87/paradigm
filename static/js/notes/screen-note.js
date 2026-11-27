// Which note "this note" means to a command: the one on screen. In the main window a page
// (Today, Week, a task's page, Live...) is drawn over the dashboard, which stays open under it,
// so the app's currentId is a hub that cannot be seen; acting on it can trash a whole hub by
// mistake. Pure: reads only app.role, app.views, app.currentId and app.tree.
//
//   screenNote(app)    { id, refusal }: id the note on screen (null: none); refusal the error a
//                      note command gives when a page hides the dashboard and shows no note
//   screenNoteId(app)  just the id
//   refusalOf(app)     just the refusal ("" when a note command may run)
//   liveBodyOf(app, id) the body the Live page shows for note id, as typed in the note window
//                      (null: Live shows another note, or none)

export const NO_NOTE = "E: no note on this page";
export const TASK_PAGE = "E: this page shows a task: x deletes it";

// Plan is the dashboard's own chart: the hub under it is the one on screen.
const HUB_VIEWS = new Set(["plan"]);

export function screenNote(app) {
  const shown = app.role === "main" ? app.views?.shown ?? null : null;
  if (!shown || HUB_VIEWS.has(shown)) return { id: app.currentId ?? null, refusal: "" };
  if (shown === "live") {
    const id = liveNoteId(app);
    return id === null ? { id, refusal: NO_NOTE } : { id, refusal: "" };
  }
  // A task's note is easy to mistake for the task: refuse rather than act on it.
  if (shown === "task") return { id: null, refusal: TASK_PAGE };
  return { id: null, refusal: NO_NOTE };
}

export function screenNoteId(app) {
  return screenNote(app).id;
}

export function refusalOf(app) {
  return screenNote(app).refusal;
}

export function liveBodyOf(app, id) {
  const state = app.views?.pages?.live?.state ?? null;
  if (!state || state.trashed || state.id !== id) return null;
  const body = (state.fields ?? []).find((field) => field.name === "body");
  return typeof body?.text === "string" ? body.text : null;
}

// The note window's note as the Live page shows it: none while it is empty, after a trash, or
// once the note left the tree.
function liveNoteId(app) {
  const state = app.views?.pages?.live?.state ?? null;
  if (!state || state.trashed || state.id === undefined || state.id === null) return null;
  return app.tree?.has(state.id) ? state.id : null;
}
