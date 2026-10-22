# HTTP API

All write requests require `Content-Type: application/json`. Validation failures return 400 with `error` and optional `issues`. Unknown invoice IDs return 404. Payloads are limited to 600 KB (to allow an optional base64 business logo). All amounts are USD.

| Method | Path                      | Result                                                    |
| ------ | ------------------------- | --------------------------------------------------------- |
| GET    | `/api/config`             | `{ "emailMode": "preview" }` or `smtp`; no credentials    |
| POST   | `/api/invoices`           | 201, invoice including generated ID, totals and timestamp |
| GET    | `/api/invoices/:id`       | 200, saved invoice                                        |
| GET    | `/api/invoices/:id/pdf`   | 200, application/pdf attachment with a safe filename      |
| PUT    | `/api/invoices/:id`       | 200, replaced existing invoice                            |
| POST   | `/api/invoices/:id/email` | 200, mode and delivery/preview status                     |

## Invoice body

```json
{
  "business": {
    "name": "Studio North",
    "email": "hello@example.com",
    "address": "128 Maple St",
    "logo": "data:image/png;base64,iVBORw0KGgo..."
  },
  "customer": {
    "name": "Bloom & Co.",
    "email": "accounts@example.com",
    "address": "42 Garden Ave"
  },
  "number": "INV-001",
  "issueDate": "2026-10-20",
  "dueDate": "2026-10-30",
  "items": [{ "description": "Design work", "quantity": "2", "unitPrice": "50.00" }],
  "discount": "10.00",
  "taxRate": "10",
  "notes": "Thank you.",
  "customFields": [{ "label": "Reference", "value": "PO-42", "visible": true }]
}
```

`business.logo` is optional (defaults to `""`), must be a `data:image/png` or `data:image/jpeg` base64 payload, and is capped at ~300 KB of binary data. It is never required of `customer`. PDFKit only embeds PNG/JPEG natively and SVG is rejected outright (it can carry scripts), so no other format is accepted. The logo renders in the live preview, the print layout and the PDF (both the download and the emailed attachment) — it is never embedded or attached separately in the email body itself, so a send never carries more than one image.

Backend totals are integer cents: `lines: [10000], subtotal: 10000, discount: 1000, tax: 900, total: 9900`. Unknown object fields are stripped by validation. Custom fields are limited to 30; items to 100. Email rate limit: 3 requests per minute per client IP; excess returns 429. SMTP failures return a safe 500 response.

### Sending an email

```json
POST /api/invoices/:id/email
{ "recipientEmail": "customer@example.com" }
```

The recipient is supplied by the browser and validated as an email address (400 if missing/invalid) — the server no longer forces a fixed address. The editor defaults this field to the invoice's bill-to email but lets the user change it, and asks for confirmation before sending. There is no authentication in this app, so this is a deliberate trade-off: the per-IP rate limit above is the abuse control, not recipient restriction.

Invoice emails include a real PDF attachment and a short HTML/plain-text summary. Preview mode returns both `previewFile` and `previewPdfFile`, saved privately under the email preview directory. Successful SMTP status means accepted by the provider, not confirmed inbox delivery.

An empty, whitespace-only or omitted `discount` defaults to the string `"0"`. Negative discounts and discounts above the rounded subtotal remain invalid. Other numeric fields retain their required validation.

## Email history endpoints

| Method | Path                                | Result                                                                 |
| ------ | ----------------------------------- | ---------------------------------------------------------------------- |
| GET    | `/api/email-logs?offset=0&limit=50` | Paginated metadata, total and status counts; limit 1–100               |
| GET    | `/api/email-logs/:id`               | Metadata and text alternative; no private invoice snapshot             |
| GET    | `/api/email-logs/:id/pdf`           | Exact saved PDF with inline content disposition                        |
| GET    | `/api/email-logs/:id/message`       | Sandboxed saved HTML with restrictive CSP                              |
| POST   | `/api/email-logs/:id/resend`        | New logged attempt using the saved snapshot and its original recipient |

Email-send responses include `logId` and `logUrl`. Resends share the original send rate limiter. Older previews without snapshots and pending/unknown attempts return 409 for resend. Invalid UUIDs or missing artifacts return 404. See [email history](EMAIL-LOGS.md).

## Saved invoice list

- `GET /api/invoices` returns `{items:[{id,number,customerName,issueDate,dueDate,updatedAt,totalCents,itemCount}]}` sorted by most recent save. Totals are integer cents. Full addresses, notes and custom fields are omitted from the list; use `GET /api/invoices/:id` when opening a selected invoice.
- `GET /invoices` serves the Saved invoices page. The editor includes the same section.
- Creating uses `POST /api/invoices`; editing always uses `PUT /api/invoices/:id`. A missing update ID returns 404 and never creates another invoice.

Quantity is a decimal-free numeric string such as `"1"` or `"1000000"`. Fractions, decimal notation (`"1.0"`), negatives, zero (`"0"`), exponents and values over 1,000,000 return 400 on create/update. Unit price and discount retain two-decimal support, and tax rate retains four-decimal support. Existing fractional or zero-quantity records can be retrieved for correction; new PDFs/emails require valid whole quantities of at least 1.
