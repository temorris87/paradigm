-- A name changed by hand on the on-call rota (a replacement). name stays the name shown and
-- used everywhere. changed is 1 once the cell has been changed by hand, and sheet_name then
-- holds the sheet's name, which may be '' when the sheet left the cell empty: so changed, not
-- sheet_name, says whether a cell is changed. A paste writes the sheet's names and clears both.
ALTER TABLE on_call ADD COLUMN sheet_name TEXT NOT NULL DEFAULT '';
ALTER TABLE on_call ADD COLUMN changed INTEGER NOT NULL DEFAULT 0;
