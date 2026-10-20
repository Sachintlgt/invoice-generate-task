# Email history

After restarting the server, open **http://localhost:3000/email-logs**, or use **Email logs** in the invoice editor header.

## What is saved

Every new email attempt stores its invoice snapshot, sender and recipient, subject, original creation time, status, safe error, HTML/plain-text body and PDF when generated. Records are private runtime files under `DATA_DIR/email-logs/`. JSON and PDF writes use temporary files followed by rename; writes are serialized within the single app process.

| Status            | Meaning                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| Sent              | The SMTP provider accepted the configured test recipient; inbox delivery is not confirmed       |
| Failed            | The attempt did not complete; a safe diagnostic is saved                                        |
| Preview           | Local preview only; nothing was sent                                                            |
| Pending / unknown | The attempt started but no final status is recorded; check provider history before another send |

Dates are stored as ISO UTC timestamps and displayed in the browser's local time zone. Newest entries appear first. Summary counts and Previous/Next pagination cover the whole saved history.

## View and send actions

- **Preview, Edit, Send** is one link to `/?invoice=<saved-invoice-id>#editor`. It opens the saved invoice with all fields, live preview, Save and Send controls. Clicking the link does not send an email.
- Save updates that invoice; previously logged email snapshots and PDFs stay unchanged. The editor shows the latest saved invoice, which may differ from the earlier email.
- Use the editor's Send button to save and email the edited invoice to the current server-configured test recipient. In preview mode it creates a local preview.
- Click the invoice number to view email metadata and its isolated body preview in a new tab.
- Older records without a saved invoice show **Invoice unavailable**.
- Original sends and resends share the same three-attempt-per-minute client IP rate limit.
- Pending/unknown attempts cannot be resent directly, to reduce duplicate sends when the provider's result is unknown.

The current configured test recipient is displayed above the list and detail page. A status link after sending from the editor opens the saved attempt.

## Older emails

Five existing local HTML previews were recovered in this workspace. Recovery is idempotent, keeps the original file timestamp, and labels them **Preview**. Unknown recipients and sender addresses are shown as **Not recorded**. An old matching PDF is recovered if it exists.

Earlier SMTP emails were not logged by the old application, so their delivery status cannot be reconstructed from saved invoice files. They remain in the provider's history. Older previews without an invoice snapshot can be viewed but cannot safely be resent from this page; send a saved invoice from the editor instead. No previously sent email is falsely marked as Sent during recovery.

## Security and limitations

Runtime history is excluded from Git and static file serving. List/detail APIs return metadata, not full invoice snapshots or SMTP credentials. The email-body endpoint and iframe are sandboxed with a restrictive CSP: no scripts, forms, remote images or tracking requests. User text is escaped in list/detail views. Only UUID log paths are accepted.

As with the existing invoice API, authentication is intentionally outside the trial scope. Anyone with access to this demo can read its history and trigger sends to the configured test address. Use fictional data. Multi-process JSON storage and provider delivery webhooks are not implemented.

An accepted email is not reported as a failed send if the final log update fails: its pending record remains and the response tells the user to check provider logs before resending.

Older HTML previews are linked to an existing invoice only when the entire rendered invoice matches exactly one saved invoice. Duplicate invoice numbers or ambiguous matches are never guessed. This restores the editor link without inventing a historical snapshot or delivery status.

Original saved email artifacts are historical and are not rewritten for the integer-only quantity rule. A resend snapshot with fractional quantities is rejected; open the associated invoice, correct quantities to whole units, save and send from the editor.
