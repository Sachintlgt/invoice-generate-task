# HTTP API

All write requests require `Content-Type: application/json`. Validation failures return 400 with `error` and optional `issues`. Unknown invoice IDs return 404. Payloads are limited to 128 KB. All amounts are USD.

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/config` | `{ "emailMode": "preview" }` or `smtp`; no credentials |
| POST | `/api/invoices` | 201, invoice including generated ID, totals and timestamp |
| GET | `/api/invoices/:id` | 200, saved invoice |
| GET | `/api/invoices/:id/pdf` | 200, application/pdf attachment with a safe filename |
| PUT | `/api/invoices/:id` | 200, replaced existing invoice |
| POST | `/api/invoices/:id/email` | 200, mode and delivery/preview status |

## Invoice body

```json
{
  "business": {"name":"Studio North","email":"hello@example.com","address":"128 Maple St"},
  "customer": {"name":"Bloom & Co.","email":"accounts@example.com","address":"42 Garden Ave"},
  "number":"INV-001",
  "issueDate":"2026-10-20",
  "dueDate":"2026-10-30",
  "items":[{"description":"Design work","quantity":"2","unitPrice":"50.00"}],
  "discount":"10.00",
  "taxRate":"10",
  "notes":"Thank you.",
  "customFields":[{"label":"Reference","value":"PO-42","visible":true}]
}
```

Backend totals are integer cents: `lines: [10000], subtotal: 10000, discount: 1000, tax: 900, total: 9900`. Unknown object fields are stripped by validation. Custom fields are limited to 30; items to 100. The send endpoint ignores browser-supplied recipients and always uses the server's test recipient. Email rate limit: 3 requests per minute per client IP; excess returns 429. SMTP failures return a safe 500 response.

Invoice emails include a real PDF attachment and a short HTML/plain-text summary. Preview mode returns both `previewFile` and `previewPdfFile`, saved privately under the email preview directory. Successful SMTP status means accepted by the provider, not confirmed inbox delivery.

An empty, whitespace-only or omitted `discount` defaults to the string `"0"`. Negative discounts and discounts above the rounded subtotal remain invalid. Other numeric fields retain their required validation.

## Email history endpoints

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/email-logs?offset=0&limit=50` | Paginated metadata, total and status counts; limit 1–100 |
| GET | `/api/email-logs/:id` | Metadata and text alternative; no private invoice snapshot |
| GET | `/api/email-logs/:id/pdf` | Exact saved PDF with inline content disposition |
| GET | `/api/email-logs/:id/message` | Sandboxed saved HTML with restrictive CSP |
| POST | `/api/email-logs/:id/resend` | New logged attempt using the saved snapshot and current configured recipient |

Email-send responses include `logId` and `logUrl`. Resends share the original send rate limiter. Older previews without snapshots and pending/unknown attempts return 409 for resend. Invalid UUIDs or missing artifacts return 404. See [email history](EMAIL-LOGS.md).

## Saved invoice list

- `GET /api/invoices` returns `{items:[{id,number,customerName,issueDate,dueDate,updatedAt,totalCents,itemCount}]}` sorted by most recent save. Totals are integer cents. Full addresses, notes and custom fields are omitted from the list; use `GET /api/invoices/:id` when opening a selected invoice.
- `GET /invoices` serves the Saved invoices page. The editor includes the same section.
- Creating uses `POST /api/invoices`; editing always uses `PUT /api/invoices/:id`. A missing update ID returns 404 and never creates another invoice.

Quantity is a decimal-free numeric string such as `"0"`, `"1"` or `"1000000"`. Fractions, decimal notation (`"1.0"`), negatives, exponents and values over 1,000,000 return 400 on create/update. Unit price and discount retain two-decimal support, and tax rate retains four-decimal support. Existing fractional records can be retrieved for correction; new PDFs/emails require valid whole quantities.
