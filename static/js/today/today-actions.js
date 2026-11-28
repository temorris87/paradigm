// What the Today page's keys and buttons do (today-page.js asks; this runs it, with the same
// commands as the dashboards and the calendar). Each wraps its work in app.guard, so errors
// show in the status line.
//
//   const actions = todayActions(app);    { done, schedule, delegate, snooze, answer, extend, fileAll, log, onCall,
//                                           importCalendar, toFile, followedUp, closeFollowUp,
//                                           followUpAgain }
import { hasError, uploadText } from "../calendar/import-state.js";
import { ONLY_CALENDAR_FILES, uploadCalendarFiles } from "../calendar/import-upload.js";
import { answerDialog } from "../hubs/hub-actions.js";
import { logStatusDialog } from "../status/status-commands.js";
import { closeFollowUp, followUpDialog } from "../tasks/follow-up-dialog.js";
import { delegateDialog, extendBlock, scheduleTask, setTaskDone, snoozeTask } from "../tasks/task-commands.js";
import { projectRows } from "./today-model.js";
import { triageInbox } from "../triage/triage.js";

export function todayActions(app) {
  const run = (work) => app.guard(work());
  return {
    done: (taskId, done) => run(() => setTaskDone(app, taskId, done)),
    schedule: (taskId) => run(() => scheduleTask(app, taskId)),
    delegate: (taskId) => run(() => delegateDialog(app, taskId)),
    snooze: (taskId) => run(() => snoozeTask(app, taskId)),
    answer: (questionId) => run(() => answerDialog(app, app.tree.get(questionId))),
    extend: (sessionId) => run(() => extendBlock(app, sessionId)),
    fileAll: () => run(() => triageInbox(app)),
    onCall: () => app.onCallCommand(),
    // An event still to file: the Week, whose To file tab files it.
    toFile: () => app.calendarCommand(),
    importCalendar: (files) => run(() => importCalendar(app, files)),
    // A follow-up row: Space logs it (the dialog), c closes it, r asks only the next day.
    followedUp: (taskId) => run(() => followUpDialog(app, taskId)),
    closeFollowUp: (taskId) => run(() => closeFollowUp(app, taskId)),
    followUpAgain: (taskId) => run(() => followUpDialog(app, taskId, { dateOnly: true })),
    // The day's "Log status" line: the stalest project first.
    log: () => run(() => {
      const stale = projectRows({ tree: app.tree, statusLogs: app.statusLogs }, app.today())
        .filter((row) => row.stale).sort((a, b) => (b.age ?? 1e9) - (a.age ?? 1e9))[0];
      return logStatusDialog(app, stale ? app.tree.get(stale.id) : null);
    }),
  };
}

// The same uploads as the Week's (calendar/import-upload.js); once one goes in, everything is
// read again, so Today redraws without its panel, and the other windows hear of it.
async function importCalendar(app, files) {
  const results = await uploadCalendarFiles((file) => app.calendarApi.upload(file), files);
  if (!results) return app.say(ONLY_CALENDAR_FILES);
  if (results.some((each) => !each.error)) {
    await app.refreshTree();
    app.changes.send({ type: "changed", what: ["meetings"] });
  }
  const text = uploadText(results);
  return app.say(text, { error: hasError(text) });
}
