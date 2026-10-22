# Current verification results

Verified 20 October 2026 after changing quantity to whole numbers only. Earlier fractional-quantity examples are superseded by this contract.

## Automated verification

**56 tests passed, zero failures and zero skips.** Tests cover calculations, validation, HTTP middleware, persistence, PDFs, email adapters, email history, saved-invoice listing and editor state.

An additional 1,000 deterministic whole-quantity invoices matched independent Python Decimal calculations for every line, subtotal, discount, tax and grand total. No real email is sent by automated tests.

## Current quantity and monetary contract

| Field                 | Supported precision                            |
| --------------------- | ---------------------------------------------- |
| Quantity              | Whole numbers only, 0 to 1,000,000             |
| Unit price in USD     | Up to 2 decimal places                         |
| Fixed discount in USD | Up to 2 decimal places; cannot exceed subtotal |
| Tax percentage        | Up to 4 decimal places                         |
| Monetary totals       | Always 2 decimal places                        |

Quantity fractions, decimal notation such as `1.0`, exponents, negatives, empty values and quantities above the maximum are rejected. Quantities are never silently rounded. Whole-unit quantity multiplied by price in integer cents gives an exact line total; sum lines, subtract discount, calculate percentage tax and round tax half-up.

| Calculation                            | Verified result                          |
| -------------------------------------- | ---------------------------------------- |
| 2 × $50.00, discount $10.00, tax 10%   | $99.00                                   |
| 3 × $19.99, discount $0.01, tax 8.875% | Subtotal $59.97; tax $5.32; total $65.28 |
| 1 × $0.05, tax 10%                     | Tax $0.01; total $0.06                   |
| 100 lines of 1 × $0.01                 | Subtotal $1.00                           |

## Browser verification of the current rule and saved-invoice workflow

A separate fictional invoice named `QA-INTEGER-EDITOR-20261020-E6EFE738` was used. Existing invoices were not overwritten.

1. Entered quantity `1.5` and attempted Save: browser blocked it and displayed “Quantity must be a whole number from 0 to 1,000,000.” The field uses step 1 and numeric input mode.
2. Replaced quantity with `3` and saved. Exactly one saved invoice was created with ID `6d5c2bf2-c4cb-4c16-80c2-6b2717ae1a38`.
3. Used Saved invoices search and Open and edit to reopen that ID.
4. Added an item with quantity `2` and price `$19.99`, changed the first quantity to `4`, and selected Save changes.
5. Reopened from the list again. Quantities `4` and `2` persisted, the grand total was `$252.98`, and the ID remained unchanged.

The new Saved invoices section and dedicated `/invoices` page list invoice number, customer, item count, total, last-save time and a UUID-specific editor link. The live list now loads successfully after the server restart. Automated tests also cover removing items, refreshing list metadata, duplicate protection and reopening after app recreation.

## Existing fractional records

Older fractional quantities remain readable for correction. They are not automatically rounded, migrated or deleted. Save and new PDF/email generation require corrected whole quantities. Historical saved email snapshots/PDFs remain unchanged. An old fractional email snapshot cannot be resent; correct the linked invoice and send from the editor. Tests confirm old fractional records do not break history listing.

## Other verified features

Business/customer fields, dates, notes, line-item operations, custom-field add/edit/hide/show/remove, unchanged totals when custom fields change, HTML escaping, server-controlled test recipient, PDF attachment generation and safe email errors have automated coverage. Earlier browser checks confirmed live preview and invoice-only print output without controls or hidden fields. Server PDF tests include 100 long items across multiple pages.

Chrome was used for manual checks. No formal accessibility certification, complete cross-browser coverage or production security audit is claimed. SMTP provider acceptance is not proof of inbox delivery.

## Session update — 21 October 2026: input-based recipient, send confirmation, business logo

**63 automated tests passed, zero failures.** New/updated coverage: `business.logo` accepts valid PNG/JPEG data URLs and rejects oversized, malformed, SVG and other-format values (`tests/http.test.js`); `/api/invoices/:id/email` requires a valid `recipientEmail` and no longer depends on `TEST_EMAIL_TO` (`tests/http.test.js`, `tests/email.test.js`); SMTP-mode email embeds the logo as a `cid` inline attachment while preview mode and the saved history snapshot embed it as a data URI (`tests/email.test.js`); the PDF renders the logo as an embedded image without changing page count, and a corrupt logo degrades gracefully instead of failing generation (`tests/pdf.test.js`).

Browser verification (via a separate local instance on an isolated data directory, no existing invoices touched):

1. Opened the editor; the **Send invoice to** field defaulted to the bill-to email (`accounts@bloom.example`) automatically.
2. Uploaded a PNG logo via the new file input: thumbnail appeared, the live preview updated immediately, and typing a different recipient correctly overrode the bill-to default (confirmed the "touched" flag stops the autofill from clobbering a manual edit).
3. Clicking **Preview email** opened the new confirmation `<dialog>` showing the correct invoice number, total and recipient; nothing was sent until the dialog's Send button was clicked.
4. After confirming, the status line showed the preview-mode message and a "View saved email" link; `/email-logs` listed the new entry with the typed recipient (not a fixed address) and a working **View sent invoice (PDF)** link (previously referenced in copy but not actually rendered — added during this session).
5. The email-log detail page's saved HTML body included the logo as a data URI; the saved PDF (`/api/email-logs/:id/pdf`) rendered the logo as a real embedded image in the top-right header area, clear of the business name and invoice number blocks (confirmed by rasterizing the PDF to an image).
6. Client-side validation correctly rejected an oversized (>300KB) file and a non-PNG/JPEG (SVG) file with an inline error message, without clearing the invoice draft; Remove logo correctly cleared the logo from both the thumbnail and the live preview.

Real SMTP delivery of a logo-bearing email (cid attachment) was exercised only via a mocked transport in automated tests, consistent with this project's existing practice of not claiming unperformed real SMTP verification; the cid-vs-data-URI logic was additionally traced by hand against Nodemailer's documented attachment/cid behavior.

## Follow-up — 21 October 2026: PDF header reworked, logo removed from the email body

Per client feedback the same day: the two bordered letterhead boxes added above were removed (kept the underlying side-by-side alignment, just without borders); the PDF header now shows INVOICE above both the sender details and the invoice number/date block, which sit top-aligned side by side below it; the live preview/print HTML was restructured to match. The "Send test email" button/label was renamed to "Send email" since it addresses a real, user-chosen recipient rather than a fixed test address. The business logo was removed from the email body and from the SMTP attachment list entirely — it now appears only inside the generated PDF (both the download and the emailed attachment), never as a second image alongside it. Tests and docs were updated to match; 65 automated tests passed, zero failures.

Two further rounds of header feedback followed the same day, each verified by rendering a fresh PDF and measuring live-preview element positions directly (not just visual inspection): the sender column and the invoice-number column were given fixed, matched proportions after a narrow/tall logo exposed an unpredictable gap between them (shrink-to-fit flex columns were only as wide as their content); a vertical divider was added and then removed again as the design moved to its final form — logo and letterhead on the left, INVOICE/number/dates stacked and right-aligned on the right, both columns top-aligned with each other, the second row of each column (business name / invoice number) also aligned to each other so the two columns read as a matched pair rather than two independently-spaced blocks. A fixed-height logo box (`height: 80px` with `object-fit: contain`) was added along the way, which also fixed a latent bug where a logo smaller than the display box rendered at its tiny native size instead of being scaled up to fill it.

## Session update — 21 October 2026: top-right toast notifications, full responsive/functional sweep

Added `public/toast.js`: a small, dependency-free module providing `showToast(message, { kind, duration })`, used from the editor (`app.js`), saved invoices (`saved-invoices.js`) and email logs (`email-logs.js`). Every existing error/warning path (`error()`, `status(..., 'failure')`, and each page's own `showError`) now also raises a dismissible, auto-expiring (7s) toast fixed to the top-right corner, deduplicated so a lingering validation error does not toast again on every keystroke. The existing inline alert regions and focus-management behavior are unchanged — the toast supplements them rather than replacing them. 65 automated tests still pass (no behavior the test suite covers was changed); toast-specific behavior (appearance, position, dedup, manual dismiss) was verified via direct DOM/computed-style inspection in a live browser session, including forcing a real client-side validation error, a simulated network failure on the email-logs page, and repeated identical errors to confirm no duplicate toast is raised.

Full responsive and functional sweep performed on an isolated instance (separate port and data directory, no real data touched), across mobile (375×812), tablet (768×1024) and desktop widths:

- No horizontal page overflow at any width; the saved-invoices table scrolls inside its own container on narrow screens instead of breaking the page.
- The invoice header's two-column letterhead correctly collapses to a stacked single column below 380px and sits side by side at tablet/desktop widths.
- The send-confirmation `<dialog>` fits within the mobile viewport without overflowing.
- A complete real flow was exercised end to end on desktop width: new invoice → upload logo → set a custom recipient → Save → confirm → Send (preview mode) → verify the resulting entry in `/email-logs` shows the correct recipient and total → open its PDF and confirm the header layout (logo/INVOICE alignment) and embedded logo image are correct.
- Email-logs and saved-invoices pages were checked at all three widths; both remain usable and readable with no clipped or overlapping content.
