# Verification results — 20 October 2026

## Outcome

**30 automated tests passed, 0 failed, 0 skipped in `npm test`.** Chrome browser workflows and actual one-page and 21-page PDF exports were also verified. Real Gmail delivery remains pending; SMTP adapter tests use a stub and are not proof of delivery.

## Requirement-by-requirement results

| Requirement | Method and result |
| --- | --- |
| Business/customer details, invoice number, dates, notes | PASS — editable browser form and live preview; required names, invalid email and due-date ordering checked |
| Add/edit/remove line items | PASS — browser actions update totals; final row removal disabled; new row gets focus; remove returns focus to Add |
| USD line/subtotal/discount/tax/grand total | PASS — exact scaled-integer arithmetic and required $99 example |
| Decimal values | PASS — fractional quantities, cents, percentage precision, half-cent rounding, 100 individually rounded rows and safe-integer currency formatting |
| Custom fields | PASS — add/edit/show/hide/remove in browser; visibility survives saving/reload; show/hide leaves totals unchanged |
| Live preview | PASS — updates on field edits; escaped HTML displayed literally |
| PDF | PASS — actual Chrome Save as PDF; short invoice one page; 100 long items across 21 pages |
| Print exclusions | PASS — no editing controls or hidden field marker in exported PDF |
| Responsive layout | PASS — checked widths 320, 360, 768 and 1440px; narrow-screen overflow found and fixed; retested at 320px |
| Long unbroken text | PASS — 491-character description at 360px; no document or preview-cell horizontal overflow |
| Keyboard/focus | PASS — skip link followed by Tab enters business name; Tab shows a 3px visible focus outline; focus restored after add/remove and asynchronous save |
| Validation | PASS — negatives, discount above subtotal, excessive decimal precision, invalid dates, missing names, invalid email and excessive collection sizes rejected |
| Save/retrieve/update | PASS — in-memory HTTP tests run the real Express middleware; browser save/reload; loading another invoice updates its URL |
| Unsaved changes | PASS — cancelling the replacement prompt preserves edits |
| JSON storage | PASS — concurrent writes remain valid and a new storage instance retrieves saved values |
| Email preview | PASS — UI generates a local preview; service verifies content, hidden-field exclusions and escaping |
| SMTP wiring | PASS with stub — TLS required on port 587, server-controlled recipient, sanitized subject, HTML/plain text, and delivery failures propagated |
| Real Gmail receipt | PENDING — configure App Password and confirm receipt at an address you control |
| Security boundaries | PASS for tested cases — private files inaccessible, malformed IDs rejected, foreign-origin writes rejected, request size/content type enforced, headers present and email rate limit returns 429 |
| Documentation/configuration | PASS — README, architecture, API, security, testing, submission notes and placeholder-only `.env.example` included |

## Decimal examples

| Input | Expected and observed |
| --- | --- |
| 2 × $50 − $10 + 10% tax | $99.00 |
| 1.2345 × $19.99 − $0.01 + 8.875% tax | Line $24.68; tax $2.19; total $26.86 |
| 0.5 × $0.01 | $0.01 (half-up line rounding) |
| 0.4999 × $0.01 | $0.00 |
| 2.5 × $19.99 | $49.98 |
| $0.05 taxable at 10% | Tax $0.01; total $0.06 |
| $0.04 taxable at 10% | Tax $0.00; total $0.04 |
| 100 lines of 0.5 × $0.01 | $1.00 subtotal (round each line first) |
| Discount equals subtotal | Zero taxable amount, tax and total |
| 9,007,199,254,740,991 cents | $90,071,992,547,409.91 without losing the final cent |

## Long-invoice PDF inspection

Fixture `QA-100-LONG` contains 100 rows with descriptions of approximately 489 characters each, quantity `1.2345`, unit price `19.99`, fixed discount `10.01`, tax `8.875%`, visible and hidden custom fields, and long notes.

- Pages: **21**, A4 from Chrome's browser printing.
- Subtotal: **$2,468.00**; discount **$10.01**; tax **$218.15**; total **$2,676.14**.
- Item markers: **100 unique markers**, each present exactly once.
- All full descriptions present; no row description split across pages.
- All notes present; no blank pages.
- Column headings repeated on all 21 pages.
- Visible reference present; hidden reference absent.
- Editing controls and browser-added URL/date headers absent (Headers and footers disabled in Chrome's print dialog).
- All pages reviewed as a rendered contact sheet; first and final pages inspected at larger size. No visible overlaps or clipping found in the tested PDF.

Proof files in this workspace: `../outputs/qa/invoice-100-long-items.pdf`, `../outputs/qa/invoice-decimal-example.pdf`, `../outputs/qa/desktop-decimal.jpg`, `../outputs/qa/mobile-360.jpg`. These generated QA files are not required in the public source repository. The invoice fixtures are fictional runtime data and remain Git-ignored.

## Fixes made during verification

1. Restored keyboard focus after asynchronous save/email actions.
2. Synchronized the URL when opening a different saved invoice.
3. Protected unsaved drafts before loading another invoice; initial URL loads do not prompt unnecessarily.
4. Marked structural add/remove changes as unsaved; removed misleading “preview updated” text during invalid input.
5. Derived default dates from the browser's local date rather than UTC.
6. Fixed 4px horizontal overflow at 320px with bounded grid tracks.
7. Improved input/control borders to about 3.09:1 against their background and darkened the preview footnote after its original text contrast measured 4.10:1.
8. Fixed a formatting edge case that could lose a cent near the safe-integer limit; USD formatting now preserves integer cents through display.
9. Exposed a small app factory so middleware tests can run without a network port; no new runtime dependency.

## Scope and remaining limits

- Chrome on macOS was used. No Safari/Firefox, physical-device, screen-reader or full WCAG conformance audit is claimed.
- The real Express middleware was tested using Node HTTP request/response streams without TCP. The optional `npm run test:network` test remains available; this sandbox cannot make loopback HTTP connections. Browser actions exercised the running local server successfully.
- Real SMTP receipt and a live dependency vulnerability audit remain unverified. No real email was sent in this verification pass.
- No sensitive business data, authentication or multi-process storage was added. The documented single-process JSON limitations remain.
- GitHub work is deferred as requested. The original assignment's second link is a camera-on narrated Loom or unlisted YouTube walkthrough, not a deployment link. Show editing, custom fields, reload persistence, actual email delivery, design choices and limitations.

## Follow-up: PDF email attachment fix

Latest test run: **35 passed, 0 failed, 0 skipped**. The original email reused browser HTML without its stylesheet, causing misalignment and providing no PDF attachment. Email now uses an inline-styled summary and attaches the complete PDF. Real Nodemailer MIME serialization was tested for a multipart message with HTML, plain text and an application/pdf attachment. PDF download, local preview PDF, safe filenames and SMTP recipient rejection are covered.

The new server-generated PDF was visually inspected: short sample one page; 100 long items plus long notes 22 pages. There are 100 unique item markers, zero missing descriptions, zero split rows, complete notes, no blank pages and no hidden fields. The separate server layout may paginate differently from browser printing. Brevo sending was confirmed by the user before this change; the new attachment still needs a received-email test after a server restart.

## Follow-up: optional fixed discount

An empty fixed-discount field now calculates as zero immediately and displays `0.00` on blur. Empty, whitespace-only and omitted API discounts normalize to `"0"` for create/update; negative and excessive discounts remain invalid. Browser verification confirmed no error and a $110.00 total for 2 × $50 with no discount and 10% tax. Latest suite: **37 passed, 0 failed, 0 skipped**.

## Follow-up: email history page

Latest suite: **44 passed, 0 failed, 0 skipped**. Added `/email-logs`, saved email detail pages, new-tab HTML/PDF viewing and controlled snapshot resends. Five existing local previews were recovered without inventing earlier delivery statuses. Actual earlier SMTP sends were never saved locally and cannot be recovered from invoice JSON. Automated checks cover restart persistence, statuses, safe errors, snapshot immutability, recipients, artifacts, recovery, pagination and rate limits. The running server still needed a restart for browser review of the new routes.

## Saved invoice identity regression

49 automated tests pass. Browser check on localhost: opened INV-2026-001 by saved ID, added a tenth line, saved successfully under the same ID, then removed the temporary line and saved to restore the original invoice. Opening `/` subsequently resumed that same saved ID. The original failing tab was a new draft at `/` using the same invoice number, not a loaded saved invoice. New drafts now have distinct suggested numbers and an explicit New invoice action; existing invoices show Save changes.

## Invoice editor and line items — browser verification

Verified using a separate fictional invoice QA-EDITOR-REQUIREMENTS-20261020 (ID 65076b48-b6f4-4032-821f-b2cf5915e7f9), without sending email or changing existing client invoices.

| Requirement | Result |
| --- | --- |
| Business name, email, address | Edited, previewed, saved and reopened successfully |
| Customer name, email, address | Edited, previewed, saved and reopened successfully |
| Invoice number, issue date, due date, notes | Edited, saved and reopened successfully |
| Add line item | Added description, quantity 1.5 and price 19.99; line rounded to $29.99 |
| Edit line item | Updated description, quantity to 3.25 and unit price to 12.34; line total $40.11 |
| Remove line item | Removed second item; saved and reopened with one remaining item |
| Required and numeric validation | Blank/whitespace business name, blank description, negative quantity and reversed due date blocked in browser |
| Persistence | Independently checked saved JSON fields and remaining item after browser actions |

The final remaining item cannot be removed, enforcing at least one item. Automated suite rerun: 49 passed, zero failures. The fictional QA invoice remains saved for review.

## USD calculation order and rounding verification

Calculation source reviewed: each quantity × unit price is rounded half-up to integer cents, rounded lines are summed, the fixed discount is subtracted, percentage tax is calculated on that discounted subtotal and rounded half-up, then added for the grand total. Integer BigInt arithmetic avoids floating point currency errors.

All 20 calculation tests passed. An additional 1,000 deterministic randomized invoices (1–14 items, fractional quantities, fixed discounts and fractional tax rates) matched independent Python Decimal ROUND_HALF_UP calculations for every line, subtotal, discount, tax and total.

Browser preview checks:
- Assignment example: 2 × $50.00 = $100.00; discount $10.00; tax 10% = $9.00; total $99.00.
- Fractional case: 1.2345 × $19.99 → $24.68; 0.5 × $0.01 → $0.01; subtotal $24.69; discount $0.01; tax 8.875% on $24.68 → $2.19; total $26.87.

No calculation defect found; no invoice was saved or emailed for this totals check.

## Custom fields verification

Browser checks passed for adding label/value, editing both, hiding, showing again and removing. A numeric-looking value of 1000000.99 did not affect totals. Subtotal stayed $100.00, fixed discount $10.00, tax $9.00 and grand total $99.00 throughout. Hidden fields retained their editable value while disappearing from the invoice preview. Removing the field removed it from editor and preview and returned keyboard focus to Add a custom field.

A separate temporary Express/storage lifecycle verified each state after saving and reopening, with all totals identical and hidden values excluded from invoice HTML and plain text. The PDF renderer also filters fields by visibility; print uses the same filtered invoice preview and hides editor controls. No emails sent and no existing saved invoices changed. Automated suite: 49 passed, zero failures. No defects found in this requirement.

## Live preview, PDF and browser print verification

Browser draft check: changed the description to LIVE-PREVIEW-EDIT-VERIFIED and quantity to 3 at $50; preview immediately showed $150 subtotal, $10 discount, $14 tax and $154 grand total without saving. Added a hidden custom field with value HIDDEN-PRINT-VERIFY: absent from preview.

Opened the actual Chrome Print / Save as PDF dialog. Its one-page PDF accessibility content included the edited description, updated $154 total and visible Payment method field; no editor controls, site navigation or hidden marker appeared. Save as PDF was available and Headers and footers was unchecked. The dialog's content was verified directly; no physical print or email was sent.

Independent PDF stream checks before/after editing confirmed updated description and $99 → $154 total, visible custom-field inclusion, hidden-field exclusion and absence of Save/Send/Print/Add-item controls. All 3 PDF tests passed, including a 100-long-item multi-page invoice. No application changes required.
