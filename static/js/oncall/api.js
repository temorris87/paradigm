// The on-call endpoints (paradigm/api/oncall.py).
import { call } from "../notes/api.js";

export const onCallApi = {
  // -> [{ week, role, name, sheet_name, changed, position }]; changed: set by hand, and then
  // sheet_name is the sheet's name ('' when the sheet left it empty)
  list: async () => (await call("/api/oncall")).rows,
  // weeks: [{ week: Monday, roles: [{ role, name }] }]; those weeks are replaced -> rows
  paste: async (weeks) => (await call("/api/oncall/paste", { payload: { weeks } })).rows,
  // One cell's name; "" or the sheet's own name puts the sheet's back -> rows
  set: async ({ week, role, name }) => (await call("/api/oncall/set", { payload: { week, role, name } })).rows,
  clear: async () => (await call("/api/oncall/clear", { payload: {} })).rows,
};
