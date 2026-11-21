// Hands a file to the browser to save, as a download (Downloads, or wherever it asks).

/** A file name from a note title: characters Windows refuses dropped, never empty. */
export function exportFileName(title) {
  const base = String(title)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, ""); // Windows drops trailing dots and spaces
  return `${base || "note"}.html`;
}

export function downloadFile(name, text, { doc = document, type = "text/html;charset=utf-8" } = {}) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = doc.createElement("a");
  link.href = url;
  link.download = name;
  link.hidden = true;
  doc.body.append(link);
  link.click();
  link.remove();
  // The download has started from the URL by now; a minute leaves room for a slow prompt.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
