// The meetings endpoints (paradigm/api/meetings.py). A meeting's title is its note's, so
// notesApi.rename renames it.
import { call } from "../notes/api.js";

export const meetingsApi = {
  // -> [{ id, day, time, attendees: [person ids] }]
  list: async () => (await call("/api/meetings")).meetings,
  // -> { note, meeting }: the note is "{day} {name}", directly under the hub
  create: (hubId, name, day, time) => call("/api/meeting/create", { payload: { hub_id: hubId, name, day, time } }),
  // -> { note, meeting }: a title starting with the old date gets the new one
  update: (id, day, time) => call("/api/meeting/update", { payload: { id, day, time } }),
  // -> { meeting, added: [person ids that were not attending] }
  attend: (meetingId, personIds) => call("/api/meeting/attend", { payload: { meeting_id: meetingId, person_ids: personIds } }),
  unattend: (meetingId, personId) => call("/api/meeting/unattend", { payload: { meeting_id: meetingId, person_id: personId } }),
};
