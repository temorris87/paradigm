// What a task's email rows say (task-emails.js), and the reply cycle. Pure.
//   email: { id, subject, sender, sender_email, sent_at ("YYYY-MM-DDTHH:MM:SS", local), reply
//            ("needed" | "replied" | "none"), replied_on ("YYYY-MM-DD" | null), ... }
//
//   nextReply(reply)              r: needed -> replied -> none -> needed
//   replyChip(email, today)       { text, tone } ("Reply needed" caution, "Replied Fri" /
//                                 "Replied 20 Nov" success), or null for "No reply"
//   senderLine(email, today)      "Priya Shah · Fri 20 Nov 14:05"
//   linkLabel(email)              "Reply ↗" while a reply is needed, else "Open ↗"
//   removeEmailText(email)        the remove confirm's question
//   isMsgName(name)               a file name Outlook's messages have
//   tooBigText(name)              the refusal of a file over MAX_EMAIL_BYTES
//   uploadError(error, name)      the line an upload's refusal shows
import { dayText } from "../ui/dates.js";

export const REPLY_CYCLE = ["needed", "replied", "none"];
// The upload route's own body cap (paradigm/api/emails.py MAX_EMAIL_BYTES). Checked here first:
// the server answers 413 and closes before reading the body, which a browser can report as a
// dropped connection rather than the 413.
export const MAX_EMAIL_BYTES = 30_000_000;
export const EMAIL_HINT = "Drag an email (.msg) from Outlook onto the task, or :attach";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// A reply this many days back or nearer is named by its weekday; one further back by its date,
// as a weekday a week ago would read as today's.
const WEEKDAY_DAYS = 6;

export function nextReply(reply) {
  const at = REPLY_CYCLE.indexOf(reply);
  return REPLY_CYCLE[(at + 1) % REPLY_CYCLE.length];
}

export function replyChip(email, today = new Date()) {
  if (email.reply === "needed") return { text: "Reply needed", tone: "caution" };
  if (email.reply !== "replied") return null;
  const day = dayNumber(email.replied_on);
  if (day === null) return { text: "Replied", tone: "success" };
  const ago = dayNumber(dayString(today)) - day;
  const when = ago >= 0 && ago <= WEEKDAY_DAYS ? WEEKDAYS[new Date(day * 86400000).getUTCDay()]
    : dayText(email.replied_on, { today, weekday: false });
  return { text: `Replied ${when}`, tone: "success" };
}

export function senderLine(email, today = new Date()) {
  const [day, time] = String(email.sent_at ?? "").split("T");
  const sent = day ? [dayText(day, { today }), (time ?? "").slice(0, 5)].filter(Boolean).join(" ") : "";
  return [email.sender || email.sender_email || "", sent].filter(Boolean).join(" · ");
}

export function linkLabel(email) {
  return email.reply === "needed" ? "Reply ↗" : "Open ↗";
}

export function removeEmailText(email) {
  return `Remove "${email.subject}" from this task? The saved copy is deleted.`;
}

export function isMsgName(name) {
  return /\.msg$/i.test(String(name ?? ""));
}

export function notMsgText(name) {
  return `E: not an Outlook message (.msg): ${name}`;
}

export function tooBigText(name) {
  return `E: over 30 MB: ${name}`;
}

export function uploadError(error, name) {
  if (error?.status === 400) return notMsgText(name);
  if (error?.status === 409) return "E: already on this task";
  if (error?.status === 413) return tooBigText(name);
  const text = error?.message ?? String(error);
  return /^E\d*:/.test(text) ? text : `E: ${text}`;
}

function dayString(today) {
  if (typeof today === "string") return today;
  const pad = (n) => String(n).padStart(2, "0");
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}

function dayNumber(day) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(day ?? ""));
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000 : null;
}
