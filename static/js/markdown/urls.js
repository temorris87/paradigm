// URLs from a note decide where a click goes, so they pass an allowlist. A URL is
// percent-encoded first: then the browser cannot read a scheme the check did not see
// (tabs or newlines inside "javascript:", a backslash read as a slash, and so on).

const LINK_SCHEMES = new Set(["http", "https", "mailto"]);
const IMAGE_SCHEMES = new Set(["http", "https"]);
const SAFE_CHARS = /[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=]/;

export function encodeUrl(url) {
  let out = "";
  for (const char of String(url)) {
    if (SAFE_CHARS.test(char)) out += char;
    else if (char === "%") out += "%";
    else out += encodeChar(char);
  }
  // A % that does not start an escape is a literal percent sign.
  return out.replace(/%(?![0-9A-Fa-f]{2})/g, "%25");
}

function encodeChar(char) {
  try {
    return encodeURIComponent(char);
  } catch {
    return "%EF%BF%BD"; // a lone surrogate: the replacement character
  }
}

/** The encoded URL if a link may point there, otherwise null. */
export function safeLinkUrl(url) {
  return checkScheme(encodeUrl(url), LINK_SCHEMES);
}

/** The encoded URL if an image may load from there, otherwise null. */
export function safeImageUrl(url) {
  return checkScheme(encodeUrl(url), IMAGE_SCHEMES);
}

// Anything with a colon before the first / ? or # could be read as a scheme, so it must be
// an allowed one; the rest are relative URLs, #anchors or //host.
function checkScheme(encoded, allowed) {
  const head = /^[^/?#]*/.exec(encoded)[0];
  if (!head.includes(":")) return encoded;
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(head);
  return scheme && allowed.has(scheme[1].toLowerCase()) ? encoded : null;
}

/** Links that leave the note open in a new tab. */
export function isExternal(url) {
  return /^(?:https?:)?\/\//i.test(url);
}
