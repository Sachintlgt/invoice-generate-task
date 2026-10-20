# Folio — Invoice studio

A small, distinctive invoice editor for a full-stack interview exercise. Express serves a dependency-light browser UI, persists invoices as JSON, and sends test emails through SMTP. No frontend build step or database installation. No Decimal.js: calculation rules use scaled `BigInt` arithmetic.

## Run locally

Install **Node.js 22 or newer** (npm included), then from this folder:

```bash
npm ci
npm start
```

Open **http://localhost:3000**. No `.env` is required. The opening fictional invoice demonstrates `2 × $50 − $10 + 10% tax = $99.00`.

```bash
npm test          # arithmetic and HTTP integration tests
npm run dev      # restart server on source changes
```

Save an invoice, then use the saved URL or ID to retrieve it. Saving updates the URL with `?invoice=<id>`. Draft edits update the preview immediately; persistence requires Save. Print / PDF opens your browser's print dialog: select Save as PDF. Browser-added print headers/footers can be disabled in that dialog.

## SMTP (Brevo or Gmail)

For Brevo, use `SMTP_HOST=smtp-relay.brevo.com`, port `587`, `SMTP_SECURE=false`, the SMTP login and SMTP key from your Brevo account, and a verified sender. The SMTP key is different from an API key. Keep real values only in `.env`.

For Gmail, copy `.env.example` to `.env`. Enable Google 2-Step Verification and generate an App Password at https://myaccount.google.com/apppasswords (account policies may restrict availability). Set:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=yourname@gmail.com
SMTP_PASS=your-google-app-password
EMAIL_FROM=yourname@gmail.com
TEST_EMAIL_TO=your-own-address@gmail.com
```

Restart the server. `false` means STARTTLS on port 587, not unencrypted delivery; the SMTP transport requires TLS. Use a Google App Password rather than your normal account password. Never commit `.env` or share real credentials with a reviewer. Only use a recipient you control. The browser cannot choose recipients: the server uses `TEST_EMAIL_TO`.

Without `SMTP_HOST`, **Preview email** saves HTML plus the invoice PDF under `data/email-previews/`; it does not deliver mail. Open the generated file locally. This fallback alone does not demonstrate successful SMTP delivery. Real delivery remains unverified until credentials are configured and a test is received.

## Saved email history

Open **http://localhost:3000/email-logs** after restarting the server. View saved email/PDF in a new tab, inspect status and date/time, or resend the original invoice snapshot to the configured test address. Five older local previews were recovered; earlier SMTP deliveries were not stored by the old app. See [email history](docs/EMAIL-LOGS.md).

## Storage and configuration

Invoices are private JSON files in `data/invoices/`. The directory is created automatically. Writes are serialized within one process and use temporary-file rename. `DATA_DIR` overrides the storage root. Default bind address is `127.0.0.1`; set `HOST=0.0.0.0` for hosting and supply a persistent writable disk. `PORT` defaults to 3000. Relative `DATA_DIR` paths resolve from the working directory; run commands from the project root. Back up the data folder when needed.

## Stack and decisions

- Node.js / Express: one server for API and static frontend; no NestJS overhead.
- HTML, CSS, JavaScript modules: responsive UI without a bundler or frontend framework.
- Native filesystem: sufficient for a single-process demo; no database setup.
- Native BigInt: exact decimal scaling and half-up money rounding.
- Zod: authoritative backend schema validation.
- Nodemailer: configurable SMTP with a local preview fallback.
- Helmet and express-rate-limit: security headers and email abuse controls.
- dotenv: optional local configuration, validated at startup.
- Node test runner: calculation tests and actual HTTP API checks.
- PDFKit standalone distribution: server-side PDF attachments, kept under `vendor/pdfkit/` with its MIT license and verified provenance. No browser installation or extra npm setup is required.

Verification: **53 automated tests passed**; Chrome browser checks and one-page/21-page PDF exports passed. Real Gmail delivery remains pending. See [QA results](docs/QA-RESULTS.md).

See [architecture](docs/ARCHITECTURE.md), [API](docs/API.md), [security](docs/SECURITY.md), and [verification](docs/TESTING.md).

## Scope and limitations

This is a single-instance interview demo. Authentication was explicitly excluded; anyone with access to the running app and an invoice URL/ID can read or overwrite that invoice. Use fictional data. Public production use needs access control, HTTPS, durable database storage, stronger abuse controls, operational monitoring and backups. JSON storage is not designed for multiple app processes or replicas. Concurrent edits use last-write-wins.

Email contains an inline-styled HTML summary, a plain-text alternative and the complete invoice as a server-generated PDF attachment. Browser Print / Save as PDF remains available. Saved invoices can also be downloaded from `GET /api/invoices/:id/pdf`. The PDF attachment uses the same invoice data and calculation rules with a print-friendly server layout; it is not a screenshot of the browser preview. No automatic draft persistence, payments or native mobile app. SMTP/network errors show a safe message; inspect server logs/configuration for diagnosis.

## Contributing

Keep changes within the demo scope. Run `npm test`, review print/mobile behavior after UI edits, and update the relevant docs. Do not commit real invoices, SMTP credentials or runtime previews.

## AI assistance and time

OpenAI Codex assisted with architecture discussion, implementation, documentation and tests. The developer should review the modules and be able to explain their behavior. See [QA results](docs/QA-RESULTS.md) for verification details. Do not claim unperformed manual checks or SMTP delivery.

Invoice numbers must be unique (ignoring surrounding spaces and letter case). Duplicate create/rename requests return HTTP 409; edit the existing saved invoice instead. Repeated Save, or Send after an unchanged Save, reuses the saved invoice without another write. Existing duplicate files are not deleted automatically.

The editor remembers the last opened/saved invoice in this browser and resumes it from `/`. An explicit `?invoice=<id>` takes priority. Use **New invoice** (`/?new=1#editor`) to start a separate draft with a distinct suggested number. Existing invoices show **Save changes**. Local storage stores only the invoice ID.

## Saved invoices

The editor now includes a **Saved invoices** section. Open **http://localhost:3000/invoices** for the dedicated list. Search by invoice number, customer or ID and choose **Open and edit**. The editor clearly identifies the selected saved invoice and uses **Save changes** to update that same record, including added, edited or removed items. The list refreshes after saving. **New invoice** starts a separate draft.

A failed invoice load blocks saving instead of silently creating a replacement. A repeated unchanged save clears the unsaved warning without another write. Older invoices with identical numbers remain separate records and are distinguished by their IDs. No existing invoice or email-history records were deleted. Restart the server after adding these API routes.
