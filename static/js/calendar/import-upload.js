// The calendar import's browser side, shared by the Week Plan (calendar-page.js) and Today
// (today/today-page.js, today-actions.js): the hidden file input, the uploads one file at a
// time, and the day Plan without it / Not today was chosen (localStorage, per browser).
//
//   const input = calendarPicker((files) => ...)   a hidden <input type=file> (.ics, several);
//                                                  input.click() opens the browser's picker
//   calendarFiles(files)            the ones that are calendar files (.ics or text/calendar)
//   await uploadCalendarFiles(upload, files)   upload: calendarApi.upload; -> [{ name, counts } |
//                                  { name, error }] (import-state.js uploadText words it), or null
//                                  when none of the files is a calendar file
//   ONLY_CALENDAR_FILES             what to say then
//   planWithoutDay(storage)         the stored day ("YYYY-MM-DD") or null
//   setPlanWithout(storage, day)    stores it; storage refused (private mode): nothing kept
import { PLAN_WITHOUT_STORE } from "./import-state.js";

export const ONLY_CALENDAR_FILES = "Only calendar files (.ics) can be imported";

export function calendarPicker(onFiles) {
  const input = document.createElement("input");
  Object.assign(input, { type: "file", accept: ".ics", multiple: true, hidden: true });
  input.addEventListener("change", () => {
    onFiles(input.files);
    // Picking the same file again still fires change.
    input.value = "";
  });
  return input;
}

export function calendarFiles(files) {
  return [...(files ?? [])].filter((file) => /\.ics$/i.test(file.name) || file.type === "text/calendar");
}

// Each file is its own upload, so one that fails leaves the others in.
export async function uploadCalendarFiles(upload, files) {
  const list = calendarFiles(files);
  if (!list.length) return null;
  const results = [];
  for (const file of list) {
    try {
      results.push({ name: file.name, counts: await upload(file) });
    } catch (error) {
      results.push({ name: file.name, error });
    }
  }
  return results;
}

export function planWithoutDay(storage) {
  try {
    return storage?.getItem(PLAN_WITHOUT_STORE) ?? null;
  } catch {
    return null;
  }
}

export function setPlanWithout(storage, day) {
  try {
    storage?.setItem(PLAN_WITHOUT_STORE, day);
  } catch {
    // Storage refused: the panel goes for now all the same.
  }
}
