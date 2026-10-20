# Testing

```bash
npm test
```

Current result: **44 passed, 0 failed, 0 skipped**. See [detailed QA results](QA-RESULTS.md) for browser checks, decimal examples, 100-item/21-page print validation, fixes and remaining limits.

## Test layers

- `tests/calculations.test.js`: required example, exact decimal arithmetic, rounding order, invalid amounts and exact USD formatting.
- `tests/services.test.js`: schema validation, field stripping, HTML/text escaping and visibility, JSON durability and local email previews.
- `tests/http.test.js`: actual Express middleware, POST/GET/PUT, server totals, errors, request limits, private paths, origins, headers, rate limiting and maximum-size invoice collections.
- `tests/http-helper.js`: Node IncomingMessage/ServerResponse over in-memory streams. It exercises middleware without a TCP listener; it is not a network/proxy test.
- `tests/email.test.js`: SMTP wiring, PDF attachment bytes, rejected recipients, failure propagation, and real Nodemailer MIME serialization (HTML, plain text and application/pdf attachment). No external email is sent by tests.
- `tests/pdf.test.js`: PDF signature/trailer, one-page layout, multi-page 100-item output, safe filenames and invalid-total rejection.

For an optional actual TCP integration check on an unrestricted computer:

```bash
npm run test:network
```

This test uses port 31987 and temporary storage. It skips only when the execution environment denies local sockets. Test data is fictional and temporary; tests never send real SMTP mail.

## Repeat browser checks after UI changes

1. Edit invoice details, add/remove items, and add/edit/show/hide/remove custom fields.
2. Confirm the $99 example and decimal $26.86 case in `QA-RESULTS.md`.
3. Save and reload; load another invoice and check the URL; cancel loading while edits are unsaved.
4. Check native errors for required fields, email, dates and numeric ranges.
5. Use keyboard Tab, Enter and Space; check focus after dynamic changes and saving.
6. Review 320/360/768/1440px layouts and long unbroken descriptions.
7. Print short and long invoices; disable browser-added headers/footers; confirm no controls or hidden custom fields.
8. Configure Gmail privately and confirm actual delivery only to an address you control.

Actual Gmail delivery is still pending. Browser testing covers Chrome only and is not a claim of complete accessibility certification or cross-browser coverage.

## PDF email fix verification

The server-generated email PDFs were rendered and checked separately from the original browser-print PDF. The short example is one page; the 100-item/long-notes sample is 22 pages. All 100 complete descriptions are present, no line item is split, all notes are present, and hidden fields are absent. The final page holds the full notes section and closing, rather than an orphaned thank-you line. Real receipt of the new attachment remains to be tested after restarting the server.

## Email history verification

`tests/email-history.test.js` checks persisted statuses and artifacts across app recreation, inline PDF viewing, sandboxed message responses, immutable snapshot resend, server-controlled recipient, safe SMTP failures, legacy preview recovery without duplicates, pagination, routing, invalid paths, shared rate limits, pending attempts and accepted-mail/log-write failure handling. No live SMTP messages are sent by these tests. The already running server must restart before its new `/email-logs` routes can be reviewed in the browser. Browser review of the new history page was blocked until that restart; no visual pass is claimed yet.

Duplicate-save regression: concurrent creates with the same invoice number produce one invoice and conflicts for the remaining requests. Updating the same ID works; renaming another invoice to an existing number is rejected. Whitespace-only required names/numbers are invalid.
