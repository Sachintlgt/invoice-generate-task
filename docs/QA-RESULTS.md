# Current verification results

Verified 20 October 2026 after changing quantity to whole numbers only. Earlier fractional-quantity examples are superseded by this contract.

## Automated verification

**56 tests passed, zero failures and zero skips.** Tests cover calculations, validation, HTTP middleware, persistence, PDFs, email adapters, email history, saved-invoice listing and editor state.

An additional 1,000 deterministic whole-quantity invoices matched independent Python Decimal calculations for every line, subtotal, discount, tax and grand total. No real email is sent by automated tests.

## Current quantity and monetary contract

| Field | Supported precision |
| --- | --- |
| Quantity | Whole numbers only, 0 to 1,000,000 |
| Unit price in USD | Up to 2 decimal places |
| Fixed discount in USD | Up to 2 decimal places; cannot exceed subtotal |
| Tax percentage | Up to 4 decimal places |
| Monetary totals | Always 2 decimal places |

Quantity fractions, decimal notation such as `1.0`, exponents, negatives, empty values and quantities above the maximum are rejected. Quantities are never silently rounded. Whole-unit quantity multiplied by price in integer cents gives an exact line total; sum lines, subtract discount, calculate percentage tax and round tax half-up.

| Calculation | Verified result |
| --- | --- |
| 2 × $50.00, discount $10.00, tax 10% | $99.00 |
| 3 × $19.99, discount $0.01, tax 8.875% | Subtotal $59.97; tax $5.32; total $65.28 |
| 1 × $0.05, tax 10% | Tax $0.01; total $0.06 |
| 100 lines of 1 × $0.01 | Subtotal $1.00 |

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
