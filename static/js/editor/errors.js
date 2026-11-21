// An error the user caused (bad pattern, nothing to undo...). The editor shows its message in
// the status line instead of letting it escape.
export class EditorError extends Error {}
