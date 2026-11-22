// The meetings endpoints (paradigm/api/meetings.py). A meeting's title is its note's, so
// notesApi.rename renames it.
import { call } from "../notes/api.js";

export const meetingsApi = {
  // -> [{ id, day, time, attendees: [person ids], agenda_version }]
  list: async () => (await call("/api/meetings")).meetings,
  // -> { note, meeting }: the note is called name, directly under the hub
  create: (hubId, name, day, time) => call("/api/meeting/create", { payload: { hub_id: hubId, name, day, time } }),
  // -> { note, meeting }
  update: (id, day, time) => call("/api/meeting/update", { payload: { id, day, time } }),
  // -> { id, agenda, version }; 409 when another tab saved it (as notesApi.save). links and
  // mentions are the whole meeting's (minutes and agenda).
  saveAgenda: ({ id, body, version, force = false, links, mentions }, { keepalive = false } = {}) =>
    call("/api/meeting/agenda", { payload: { id, agenda: body, version, force, links, mentions }, keepalive }),
  // -> { meeting, added: [person ids that were not attending] }
  attend: (meetingId, personIds) => call("/api/meeting/attend", { payload: { meeting_id: meetingId, person_ids: personIds } }),
  unattend: (meetingId, personId) => call("/api/meeting/unattend", { payload: { meeting_id: meetingId, person_id: personId } }),
};
