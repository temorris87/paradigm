// The meetings endpoints (paradigm/api/meetings.py). A meeting's title is its note's, so
// notesApi.rename renames it.
import { call } from "../notes/api.js";

export const meetingsApi = {
  // -> [{ id, day, time, end_time, cancelled, location, join_url, attendees: [person ids],
  //      agenda_version }]
  list: async () => (await call("/api/meetings")).meetings,
  // -> { note, meeting }: the note is called name, directly under the hub
  create: (hubId, name, day, time, endTime = "") =>
    call("/api/meeting/create", { payload: { hub_id: hubId, name, day, time, end_time: endTime } }),
  // -> { note, meeting }; endTime undefined: it keeps its length
  update: (id, day, time, endTime) => call("/api/meeting/update", { payload: { id, day, time, end_time: endTime } }),
  // -> { note, meeting }: a cancelled meeting stays, struck through, and never counts as time
  cancel: (id, cancelled) => call("/api/meeting/cancel", { payload: { id, cancelled } }),
  // -> { id, agenda, version }; 409 when another tab saved it (as notesApi.save). links,
  // mentions are the whole meeting's (minutes and agenda).
  saveAgenda: ({ id, body, version, force = false, links, mentions }, { keepalive = false } = {}) =>
    call("/api/meeting/agenda", { payload: { id, agenda: body, version, force, links, mentions }, keepalive }),
  // -> { meeting, added: [person ids that were not attending] }
  attend: (meetingId, personIds) => call("/api/meeting/attend", { payload: { meeting_id: meetingId, person_ids: personIds } }),
  unattend: (meetingId, personId) => call("/api/meeting/unattend", { payload: { meeting_id: meetingId, person_id: personId } }),
};
