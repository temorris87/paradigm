// Copying to the system clipboard as rich text (HTML, for Outlook, Teams and Word) with a
// plain-text twin (Excel, a web form, a chat box). Browsers without ClipboardItem get the
// text only.
//
//   await copyRich(html, text)
export async function copyRich(html, text, clipboard = navigator.clipboard) {
  if (typeof ClipboardItem === "function" && clipboard?.write) {
    await clipboard.write([new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([text], { type: "text/plain" }),
    })]);
  } else {
    await clipboard.writeText(text);
  }
}
