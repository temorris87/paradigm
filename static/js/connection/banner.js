// The "Paradigm has stopped" banner, shown while the connection is lost.

export const STOPPED_MESSAGE = "Paradigm has stopped. Run paradigm.py to reconnect.";

export function mountBanner(connection, parent = document.body) {
  const banner = parent.ownerDocument.createElement("div");
  banner.className = "connection-banner";
  banner.setAttribute("role", "alert");
  banner.textContent = STOPPED_MESSAGE;
  banner.hidden = true;
  parent.prepend(banner);

  connection.addEventListener("lost", () => {
    banner.hidden = false;
  });
  connection.addEventListener("connected", () => {
    banner.hidden = true;
  });
  return banner;
}
