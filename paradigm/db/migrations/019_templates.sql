-- Templates.
--
-- Note templates: a note_templates row makes a top-level note a template (the Templates
-- group). Its text is put into another note on request.
CREATE TABLE note_templates (
    note_id     INTEGER PRIMARY KEY REFERENCES notes (id)
);

-- Plan templates, kept on an area: phases and milestones placed in working days from the
-- start (weekends and the timesheet's holidays skipped), each phase with its standard tasks.
-- Applying one to a project makes real phases, milestones and tasks from them.
CREATE TABLE plan_templates (
    id          INTEGER PRIMARY KEY,
    area_id     INTEGER NOT NULL REFERENCES notes (id),
    title       TEXT    NOT NULL,
    created_at  TEXT    NOT NULL
);

CREATE TABLE plan_items (
    id          INTEGER PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES plan_templates (id),
    kind        TEXT    NOT NULL CHECK (kind IN ('phase', 'milestone')),
    title       TEXT    NOT NULL,
    start       INTEGER NOT NULL,                  -- working days from the start, from 0
    end         INTEGER NOT NULL,                  -- a phase's last working day; a milestone's = start
    phase_id    INTEGER REFERENCES plan_items (id),-- a milestone inside a phase
    position    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE plan_item_tasks (
    id          INTEGER PRIMARY KEY,
    item_id     INTEGER NOT NULL REFERENCES plan_items (id),
    parent_id   INTEGER REFERENCES plan_item_tasks (id),
    title       TEXT    NOT NULL,
    position    INTEGER NOT NULL DEFAULT 0
);

-- Which template a project's plan came from (the card says so).
CREATE TABLE project_plans (
    project_id  INTEGER PRIMARY KEY REFERENCES notes (id),
    template_id INTEGER REFERENCES plan_templates (id),
    title       TEXT    NOT NULL,                  -- the template's title then
    applied_at  TEXT    NOT NULL
);
