-- OneDrive files linked to a task (the Task page's Files card). As with file_links, the file
-- is a row in files, read from a folder linked to a hub; the file on disk is never touched.
-- A task's links go with it when it is removed, and with the folder when that is unlinked.
CREATE TABLE task_files (
    task_id   INTEGER NOT NULL REFERENCES tasks (id),
    file_id   INTEGER NOT NULL REFERENCES files (id),
    added_at  TEXT    NOT NULL,
    PRIMARY KEY (task_id, file_id)
);
CREATE INDEX task_files_task ON task_files (task_id);
