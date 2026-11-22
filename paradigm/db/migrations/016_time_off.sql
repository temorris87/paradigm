-- The timesheet's settings: the codes for time off and for the hours nothing booked, and the
-- working day. Keys: default_code, holiday_code, time_off_code, sick_code, day_start,
-- day_end, lunch_start, lunch_end, observed ('1': a fixed-date holiday on a weekend moves
-- to the Friday or Monday).
CREATE TABLE time_settings (
    key         TEXT    PRIMARY KEY,
    value       TEXT    NOT NULL
);

-- Holidays as rules: "Jul 4", "4th Thu of Nov", "last Mon of May", "+ 1" after one, or a
-- single "2026-12-24".
CREATE TABLE holidays (
    id          INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL,
    rule        TEXT    NOT NULL
);

-- Days off: time off or sick, a day or a range of weekdays, whole days (minutes 0) or some
-- hours of each.
CREATE TABLE time_off (
    id          INTEGER PRIMARY KEY,
    kind        TEXT    NOT NULL CHECK (kind IN ('time_off', 'sick')),
    first       TEXT    NOT NULL,
    last        TEXT    NOT NULL,
    minutes     INTEGER NOT NULL DEFAULT 0,
    note        TEXT    NOT NULL DEFAULT ''
);
