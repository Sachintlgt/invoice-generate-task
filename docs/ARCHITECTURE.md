# Architecture and code guide

## Request flow

The browser edits one invoice in memory and renders a live preview. It calls the same-origin Express API to persist or retrieve the invoice. The backend validates incoming data, recalculates totals, assigns a UUID and writes JSON. The email endpoint loads the saved invoice and generates an invoice PDF and uses the configured SMTP transport, or writes a local HTML summary plus PDF preview.

## Files and responsibilities

| File                      | Responsibility                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `server.js`               | Small app factory, middleware, routing, safe errors, static serving and startup     |
| `src/config.js`           | Environment defaults and validation                                                 |
| `src/validation.js`       | Bounded input schemas and date ordering                                             |
| `src/storage.js`          | UUID path validation, JSON persistence and serialized atomic writes                 |
| `src/email-history.js`    | Atomic history records, immutable invoice snapshots, saved PDFs and legacy recovery |
| `src/email.js`            | SMTP, server-controlled recipient, PDF attachment and preview fallback              |
| `src/email-template.js`   | Email-safe inline-styled HTML summary and plain-text alternative                    |
| `src/invoice-pdf.js`      | Server PDF layout, page breaks, repeated column headings and filenames              |
| `src/invoice-template.js` | Escaped invoice HTML and plain-text email                                           |
| `shared/calculations.js`  | Exact arithmetic, rounding, safe conversion and USD formatting                      |
| `public/app.js`           | Form state, repeated fields, preview, API operations and error/status feedback      |
| `public/styles.css`       | Layout, focus, responsive behavior and print rules                                  |

Only `public/`, the calculation module and the explicitly exposed invoice template are served. Configuration, invoice files and email previews have no static route.

## Monetary contract

API numeric values are strings. Quantity accepts only whole numbers from 1 to 1,000,000. Unit prices and discount support two decimal places; percentage tax supports four. Decimal quantity notation such as `1.0` or `1.5` is rejected, never truncated or rounded. Negative numbers, zero, exponents and excess precision are rejected — a line item always represents at least one unit rather than silently appearing with a zero amount. Input sizes and ranges are bounded.

1. Parse unit price to integer cents and quantity to a whole-unit BigInt.
2. Multiply whole units by integer cents. Every line is already an exact integer-cent amount; fractional-cent line rounding is unnecessary under this input contract.
3. Sum rounded lines.
4. Subtract fixed discount, rejecting discount greater than subtotal.
5. Multiply the remainder by the scaled percentage, divide by 1,000,000 and round half-up.
6. Add the rounded tax to the discounted subtotal.

BigInt handles intermediate arithmetic; totals must fit JavaScript's safe integer range before JSON conversion. `Intl.NumberFormat` formats whole dollar integers; the cent remainder is appended directly so display never loses a cent through floating-point division. Client-provided totals and IDs are not trusted or stored as authoritative inputs.

## UI behavior

Native form controls have visible labels. Add/remove actions are buttons and restore focus to a useful control. Errors use an alert region; asynchronous results use a status region. Every error/warning also raises a dismissible, auto-expiring toast fixed to the top-right corner (`public/toast.js`, shared across the editor, saved invoices and email logs pages) so it's visible even when the inline region is scrolled out of view; a repeated identical message does not spam a second toast. A skip link, focus outlines, responsive layouts and invoice-only print stylesheet are included. Custom field visibility affects invoice preview, print and the attached PDF, but never arithmetic. The email body is a summary; the complete invoice is its PDF attachment. The app warns before closing with unsaved changes.

An optional business logo (PNG/JPEG, ≤300 KB) can be uploaded in the editor; it renders in the live preview, the print layout and the PDF header, each capped to a 160×80px box that preserves aspect ratio. It is never embedded in or attached to the email body — only the PDF carries it, so a send contains exactly one image, not two. The recipient email is a browser-supplied field (defaulted to the bill-to email, user-editable) rather than a fixed server address; sending always goes through a native `<dialog>` confirmation step that summarizes the invoice, total and recipient before anything is sent.

## Deliberate trade-offs

One process, one small data directory and no frontend build pipeline minimize reviewer setup. Serialized atomic replacement avoids partial writes in one process, but does not provide distributed locking, edit conflict detection or database transactions. Existing invoice IDs use PUT; new invoices use POST. No authentication or payment scope is added.

Email logging starts before PDF generation and SMTP. Final states are persisted after the attempt. Viewing reads original artifacts; resending uses the saved snapshot and adds a new log rather than overwriting history. List and detail pages are plain HTML/JavaScript at `/email-logs` and `/email-logs/:id`. See `EMAIL-LOGS.md`.

Previously saved fractional quantities remain readable for correction. No automatic migration rounds or overwrites them. Save, new PDF generation and email require whole-number quantities; original email artifacts remain historical records.
