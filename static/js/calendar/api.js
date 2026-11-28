// The Outlook import endpoints (paradigm/api/calendar.py): a calendar file is uploaded, never
// read from a folder.
import { call } from "../notes/api.js";

export const calendarApi = {
  // -> { imported_today, last_day, last_at } (last_day, last_at null when never; last_at local time)
  status: () => call("/api/calendar/status"),
  // file: an .ics File from a picker or a drop
  // -> { new, to_file, updated, moved, cancelled, back_on, skipped, people, files, errors }; 400 not a calendar file
  upload: (file) => call("/api/calendar/upload", { blob: file }),
  // -> [{ id, uid, day, time, end_time, title, recurring, location, join_url, agenda, attendees, hub_guess }]
  pending: async () => (await call("/api/calendar/pending")).pending,
  // -> { meetings: [ids] }
  file: (ids, hubId) => call("/api/calendar/file", { payload: { ids, hub_id: hubId } }),
  ignore: (ids) => call("/api/calendar/ignore", { payload: { ids } }),
};
