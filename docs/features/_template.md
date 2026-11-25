# NNN Feature name

Status: planned | built
Backlog item: (quoted exactly from backlog.md)
Decided with Tyson: YYYY-MM-DD
Lanes: backend, frontend (or just one)
Migration: NNN_name.sql (or none)

## What it does
How it looks and behaves for Tyson, in the style of `docs/spec/`: what he sees, where, and every
key. Each decision he made in the plan discussion, marked "(Tyson, YYYY-MM-DD)".

## Data
Tables and columns the migration adds or changes, and what happens to them on trash, restore,
archive and purge.

## API contract
Both lanes build against this at the same time, so it is exact.

| Method | Path | Request JSON | Response JSON | Errors |
|---|---|---|---|---|
| POST | /api/... | `{"id": 1}` | `{"ok": true}` | 404 not found |

## Files
- Backend lane: new and changed files under `paradigm/` and `tests/python/`.
- Frontend lane: new and changed files under `static/` and `tests/js/`, key tables and commands
  included.

## Acceptance checks
Numbered, each one something the browser check can do and see:
1. ...

## Not in this feature
What was discussed and left out.
