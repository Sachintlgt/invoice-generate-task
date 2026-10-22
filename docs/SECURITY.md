# Security boundaries

- SMTP secrets exist only in server environment variables. `.env`, runtime files and dependencies are Git-ignored; `.env.example` contains placeholders only.
- Zod validates all saved invoice data, lengths, decimal precision, amounts, dates and counts. The backend recalculates totals.
- UUID-only invoice filenames prevent path traversal. Data and email previews are outside the static document root.
- Invoice user text is escaped before HTML insertion. No user HTML, inline scripts, external fonts or CDN dependencies are needed.
- Helmet supplies security headers, including a restrictive content security policy. The JSON parser limits request bodies to 600 KB (raised from 128 KB to allow an optional base64 business logo).
- Write endpoints require JSON and reject supplied foreign Origins. No permissive CORS headers are enabled. These are defense-in-depth controls, not authentication.
- SMTP requires TLS. Email recipients are supplied by the browser and validated server-side as a well-formed email address; send attempts are rate-limited in memory (3/minute/IP). This is a deliberate trade-off — the app has no authentication, so the rate limit (not recipient restriction) is the abuse control. Do not expose this instance publicly with real SMTP credentials without understanding that anyone who can reach it can trigger sends to an address of their choosing within that rate limit.
- The business logo is restricted to PNG/JPEG `data:` URLs matched by a strict regex and size cap; SVG and other formats are rejected (SVG can embed scripts). A logo that fails to decode is skipped rather than failing PDF generation. It is embedded only in the generated PDF, never in the email body or as a separate email attachment.
- Errors do not return SMTP credentials or raw internal stack traces.
- Local default binds loopback only. If exposed publicly, use HTTPS and persistent storage, do not use sensitive client data, and understand that authentication is intentionally absent.

## Limitations

There is no user isolation, authorization, durable distributed rate limit or optimistic concurrency. A public URL is not an access-control mechanism. Multiple Node workers and shared filesystem storage are unsupported. Proxy deployments must configure Express trusted proxies deliberately before relying on IP-based limiting; this app does not trust forwarded IP headers by default. App passwords should be revoked after the trial if no longer required.
