// The "Paradigm has stopped" banner, shown while the connection is lost. With unsaved
// changes in this window it says they are kept here and save once the server is back (the
// app saves them on reconnecting: NotesApp.saveAfterReconnect). A reload while it is down
// would lose them, so it never promises more than "in this window".
//
//   mountBanner(connection, { unsaved: () => boolean }, parent?)

export const STOPPED_MESSAGE = "Paradigm has stopped. Run paradigm.py to reconnect.";

export function stoppedText(unsaved, since) {
  return unsaved ? `Paradigm has stopped — changes since ${since} are kept in this window and will save when it’s back.`
    : STOPPED_MESSAGE;
}

export function mountBanner(connection, { unsaved = () => false } = {}, parent = document.body) {
  const banner = parent.ownerDocument.createElement("div");
  banner.className = "connection-banner";
  banner.setAttribute("role", "alert");
  const text = parent.ownerDocument.createElement("span");
  const retry = parent.ownerDocument.createElement("span");
  retry.className = "connection-banner__retry";
  retry.textContent = "retrying…";
  banner.append(text, retry);
  text.textContent = STOPPED_MESSAGE;
  banner.hidden = true;
  parent.prepend(banner);

  let since = "";
  let timer = null;
  const draw = () => {
    text.textContent = stoppedText(unsaved(), since);
  };
  connection.addEventListener("lost", () => {
    const now = new Date();
    since = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    draw();
    banner.hidden = false;
    // Typing while it is down turns the words to "kept in this window".
    timer = setInterval(draw, 2000);
  });
  connection.addEventListener("connected", () => {
    banner.hidden = true;
    clearInterval(timer);
  });
  return banner;
}
