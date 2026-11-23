// The on-call endpoints (paradigm/api/oncall.py).
import { call } from "../notes/api.js";

export const onCallApi = {
  // -> [{ week, role, name, position }]
  list: async () => (await call("/api/oncall")).rows,
  // weeks: [{ week: Monday, roles: [{ role, name }] }]; those weeks are replaced -> rows
  paste: async (weeks) => (await call("/api/oncall/paste", { payload: { weeks } })).rows,
  clear: async () => (await call("/api/oncall/clear", { payload: {} })).rows,
};
