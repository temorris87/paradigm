-- Outlook emails (.msg) attached to a task. The bytes live on disk, at
-- <data>/emails/<task_id>/<id>.msg, because Outlook opens a real file; the row holds what the
-- reader took from it. reply: whether a reply is owed ('needed'), was sent ('replied', on
-- replied_on, YYYY-MM-DD) or isn't wanted ('none'). sent_at is local ISO time, NULL when the
-- message holds no time. file_name is the name it was dropped with.
CREATE TABLE task_emails (
  id INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  sender TEXT NOT NULL DEFAULT '',
  sender_email TEXT NOT NULL DEFAULT '',
  sent_at TEXT,
  reply TEXT NOT NULL DEFAULT 'needed' CHECK (reply IN ('needed', 'replied', 'none')),
  replied_on TEXT,
  file_name TEXT NOT NULL,
  added_at TEXT NOT NULL
);
CREATE INDEX task_emails_task ON task_emails(task_id);
