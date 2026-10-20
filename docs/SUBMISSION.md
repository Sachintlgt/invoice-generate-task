# Submission notes

## Exercise requirements

Implemented: invoice details and notes; add/edit/remove line items; USD totals with specified rounding order; custom field editing and visibility; live preview; browser print/PDF; responsive layout; semantic labels, keyboard controls and focus styling; server validation; JSON save/retrieve/update; SMTP integration and local email preview.

## Decisions

Express and vanilla browser modules keep the solution small. JSON storage avoids reviewer database setup. BigInt decimal scaling replaces Decimal.js. Gmail SMTP is optional for a zero-configuration local preview, but real sending requires server-side credentials. Browser Print is the allowed PDF approach. Email includes an inline-styled HTML/plain-text summary and a server-generated PDF attachment.

## AI usage

OpenAI Codex assisted with planning, source generation, test cases and Markdown documentation. Human review and ownership are expected. Arithmetic is readable in `shared/calculations.js`; server validation is in `src/validation.js`; persistence and SMTP are isolated in small modules.

## Time record

Initial implementation: approximately 10 minutes. Follow-up automated/browser/PDF verification and fixes: approximately 25 minutes on 20 October 2026. Planning discussion and idle conversation are excluded. Approximate active total: 35 minutes; update this record for subsequent work and stop at the three-hour cap.

Verification: **44 automated tests passed, 0 failed, 0 skipped**. Chrome desktop/mobile-size, keyboard, save/reload, custom-field and validation workflows were checked. Actual one-page and 21-page PDFs were exported and inspected. See [QA results](QA-RESULTS.md). The user confirmed Brevo sending before the PDF fix; receipt of the new PDF attachment still needs a test after restarting the server. No complete cross-browser/accessibility audit is claimed.

## Remaining submission work

- Configure Gmail App Password privately and confirm real delivery to an address you control.
- Create/push the public GitHub repository after checking for secrets (deferred at the user's request).
- Record a Loom or unlisted YouTube walkthrough with camera on and spoken narration: show invoice editing, custom fields, saved invoice after reload, actual email delivery, design choices and limitations.
- Submit exactly two links: public GitHub repository and the walkthrough URL. Do not upload ZIPs or video files. Keep credentials and confidential/personal contact details out of both.

The original PDF was read during verification and confirms the walkthrough requirement. Public hosting is not listed as a required link.

## Known limitations

No authentication (excluded by brief); use fictional data. Single-process JSON storage with last-write-wins updates. SMTP recipient is intentionally restricted. Browser printing depends on print settings; email attachments use a separate PDFKit layout with the same data and totals. No auto-save or invoice listing. Email preview mode does not prove real delivery.

The final client submission must contain two links only, per the original brief. Repository documentation can contain the detailed explanation above.

## Email/PDF follow-up

Added a PDF attachment, email-safe summary and saved-invoice PDF endpoint after the user reported that the unstyled browser template looked misaligned in email. New PDF exports were inspected at one page and 22 pages (100 long items plus long notes), with all descriptions, notes and visible custom fields intact and hidden fields excluded. The official standalone PDFKit build is vendored with its license to preserve zero-extra-setup local execution. Allow approximately 25 additional active minutes for SMTP/PDF follow-up; approximate total active work is one hour including the earlier recorded phases.

## Email history follow-up

Added durable email attempt history and list/detail pages with original-artifact viewing and snapshot resend. Recovery is limited to existing local previews; earlier SMTP sends were not recorded. See `EMAIL-LOGS.md`. Allow approximately 15 additional active minutes for implementation and automated checks; total active work remains below the three-hour cap.
