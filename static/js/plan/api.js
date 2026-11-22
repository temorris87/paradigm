// The plan endpoints (paradigm/api/plans.py): a project's phases and milestones, the history
// of their dates, and the plan templates kept on areas.
import { call } from "../notes/api.js";

export const planApi = {
  // -> { phases, milestones, changes, applied }
  list: () => call("/api/plan"),
  createPhase: (projectId, title, start, end) => call("/api/phase/create", { payload: { project_id: projectId, title, start, end } }),
  makePhase: (id, start, end) => call("/api/phase/make", { payload: { id, start, end } }),
  unmakePhase: (id) => call("/api/phase/unmake", { payload: { id } }),
  createMilestone: (ownerId, title, day) => call("/api/milestone/create", { payload: { owner_id: ownerId, title, day } }),
  setMilestoneDone: (id, done) => call("/api/milestone/done", { payload: { id, done } }),
  // values: { start?, end? } of a phase, { day? } of a milestone -> { changes }
  setDates: (id, values, reason = "") => call("/api/plan/dates", { payload: { id, ...values, reason } }),
};

export const planTemplatesApi = {
  list: async () => (await call("/api/plan_templates")).templates,
  create: (areaId, title) => call("/api/plan_template/create", { payload: { area_id: areaId, title } }),
  rename: (id, title) => call("/api/plan_template/rename", { payload: { id, title } }),
  remove: (id) => call("/api/plan_template/remove", { payload: { id } }),
  addItem: (templateId, { kind, title, start, end = null, phaseId = null }) =>
    call("/api/plan_template/item", { payload: { template_id: templateId, kind, title, start, end, phase_id: phaseId } }),
  updateItem: (id, values) => call("/api/plan_template/item/update", { payload: { id, ...values } }),
  removeItem: (id) => call("/api/plan_template/item/remove", { payload: { id } }),
  addTask: (itemId, title, parentId = null) => call("/api/plan_template/task", { payload: { item_id: itemId, title, parent_id: parentId } }),
  removeTask: (id) => call("/api/plan_template/task/remove", { payload: { id } }),
  // -> { phases, milestones, tasks }: how many were made
  apply: (id, projectId, start) => call("/api/plan_template/apply", { payload: { id, project_id: projectId, start } }),
  saveFrom: (projectId, title) => call("/api/plan_template/save", { payload: { project_id: projectId, title } }),
};
