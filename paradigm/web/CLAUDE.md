## Web security (paradigm/web/security.py, applied in handler.py to every request)
- Any page open in the browser can send requests to 127.0.0.1, so before routing:
  - Every request must have Host `127.0.0.1:PORT` or `localhost:PORT`. This stops DNS rebinding.
  - `/api/` requests must not come from another site: a `Sec-Fetch-Site` of cross-site or
    same-site, or a foreign `Origin`, gets 403. This stops CSRF.
- **Every endpoint that reads or changes data must live under `/api/`.** That is what puts it
  behind the Origin check. Use POST (never GET) for anything that changes data.
- Every response carries a CSP (`default-src 'self'`, `frame-ancestors 'none'`), `nosniff`,
  `X-Frame-Options: DENY` and `Referrer-Policy: same-origin`. Never use `no-referrer`: under it
  browsers send `Origin: null` on POSTs and our own requests get refused.
- The CSP forbids inline scripts, inline `style=""` attributes, `eval` and outside URLs. Keep JS
  in modules and styles in `static/css/`.
- Event streams are capped at `Config.max_streams` (50); past that, 503.
- Every security change is checked in a real browser too. Unit tests cannot see what headers a
  browser actually sends (that is how the `Origin: null` problem was caught).
