// The people endpoints (paradigm/api/people.py). A person's note title is "First Last":
// changing the first or last name renames it.
import { call } from "../notes/api.js";

export const peopleApi = {
  // -> [{ id, first, last, email, phone, org, job, hubs: [{ hub_id, role }] }]
  list: async () => (await call("/api/people")).people,
  // -> { note, person }
  create: (name) => call("/api/person/create", { payload: { name } }),
  createNamed: (first, last) => call("/api/person/create", { payload: { first, last } }),
  // field: "first" | "last" | "email" | "phone" | "org" | "job"; "" clears it
  update: (id, field, value) => call("/api/person/update", { payload: { id, field, value } }),
  // -> { person, created }: again on the same hub changes the role
  link: (hubId, personId, role) => call("/api/person/link", { payload: { hub_id: hubId, person_id: personId, role } }),
  unlink: (hubId, personId) => call("/api/person/unlink", { payload: { hub_id: hubId, person_id: personId } }),
};
