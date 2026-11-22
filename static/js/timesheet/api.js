// The timesheet endpoints (paradigm/api/timesheet.py).
import { call } from "../notes/api.js";

export const timeApi = {
  // -> { monday, days, rows: [{ code, hours: [5], total }], totals, total, unbooked_hours,
  //      default_code, warnings, not_counted, pto, details: { code: [{ day, label, hub, kind, minutes }] } }
  week: (monday) => call(`/api/time/week?monday=${encodeURIComponent(monday)}`),
  // -> { settings, holidays: [{ id, name, rule, ok }], time_off: [...], upcoming: [{ day, name }] }
  settings: () => call("/api/time/settings"),
  setSettings: (values) => call("/api/time/settings", { payload: values }),
  addHoliday: (name, rule) => call("/api/time/holiday/add", { payload: { name, rule } }),
  updateHoliday: (id, name, rule) => call("/api/time/holiday/update", { payload: { id, name, rule } }),
  removeHoliday: (id) => call("/api/time/holiday/remove", { payload: { id } }),
  addTimeOff: (kind, first, last, hours, note) => call("/api/time/off/add", { payload: { kind, first, last, hours, note } }),
  removeTimeOff: (id) => call("/api/time/off/remove", { payload: { id } }),
};
