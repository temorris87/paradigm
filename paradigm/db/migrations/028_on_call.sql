-- The on-call rota, pasted from the Excel sheet: who holds each role in a week. week is that
-- week's Monday (YYYY-MM-DD); position is the role's row in the paste it came from, so the
-- roles keep the sheet's order; name is the cell as pasted (matched to people in the page).
CREATE TABLE on_call (
    week      TEXT    NOT NULL,
    role      TEXT    NOT NULL,
    name      TEXT    NOT NULL DEFAULT '',
    position  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (week, role)
);
