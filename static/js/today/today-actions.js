// What the Today page's keys and buttons do (today-page.js asks; this runs it, with the same
// commands as the dashboards and the calendar). Each wraps its work in app.guard, so errors
// show in the status line.
//
//   const actions = todayActions(app);    { done, schedule, delegate, snooze, answer, extend, fileAll, log, onCall }
import { answerDialog } from "../hubs/hub-actions.js";
import { logStatusDialog } from "../status/status-commands.js";
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
    // The day's "Log status" line: the stalest project first.
    log: () => run(() => {
      const stale = projectRows({ tree: app.tree, statusLogs: app.statusLogs }, app.today())
        .filter((row) => row.stale).sort((a, b) => (b.age ?? 1e9) - (a.age ?? 1e9))[0];
      return logStatusDialog(app, stale ? app.tree.get(stale.id) : null);
    }),
  };
}
