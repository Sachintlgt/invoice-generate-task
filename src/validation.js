import { z } from 'zod';
import { normalizeDiscount } from '../shared/calculations.js';
const text = z.string().trim().max(2000);
/** Build a bounded decimal-string rule; parsing must not round or accept exponent notation. */
const amount = (places, max) =>
  z
    .string()
    .regex(
      new RegExp(`^\\d{1,9}(\\.\\d{1,${places}})?$`),
      'Enter a non-negative decimal with valid precision.',
    )
    .refine((v) => Number(v) <= max, 'Value exceeds the supported limit.');
// Trim surrounding whitespace before checking shape, and bound length to the RFC 5321
// maximum (254) so an oversized string shaped like an email can't pass format checks alone.
const email = (max = 254) =>
  z
    .string()
    .trim()
    .max(max, 'Email address is too long.')
    .pipe(z.email('Enter a valid email address.'));
const party = z.object({
  name: text.min(1, 'Name is required.').max(150),
  email: z.union([z.literal(''), email()]),
  address: text,
});
// PNG/JPEG only (the two raster formats PDFKit embeds natively) and bounded size;
// never SVG, which could carry scripts. ~300KB binary is comfortably under the base64 cap below.
// Optional and defaulted so invoices saved before this field existed keep validating.
const logo = z
  .union([
    z.literal(''),
    z
      .string()
      .max(410000, 'Logo file is too large.')
      .regex(
        /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/,
        'Logo must be a PNG or JPEG image.',
      ),
  ])
  .default('');
const business = party.extend({ logo });
const date = z.iso.date();
// Quantities are whole units of at least 1; prices/discount retain two decimals and tax rates four.
const quantity = z
  .string()
  .regex(/^\d{1,9}$/, 'Quantity must be a whole number from 1 to 1,000,000.')
  .refine(
    (value) => Number(value) >= 1 && Number(value) <= 1000000,
    'Quantity must be a whole number from 1 to 1,000,000.',
  );
/**
 * Authoritative save/resend contract shared by all server write paths.
 * Unknown fields such as client-supplied IDs and totals are stripped by Zod objects.
 */
export const invoiceSchema = z
  .object({
    business,
    customer: party,
    number: text.min(1).max(80),
    issueDate: date,
    dueDate: date,
    notes: text,
    items: z
      .array(
        z.object({ description: text.min(1).max(500), quantity, unitPrice: amount(2, 100000000) }),
      )
      .min(1)
      .max(100),
    discount: z.preprocess(normalizeDiscount, amount(2, 100000000)),
    taxRate: amount(4, 1000),
    customFields: z
      .array(z.object({ label: text.min(1).max(100), value: text.max(500), visible: z.boolean() }))
      .max(30),
  })
  .refine((v) => v.dueDate >= v.issueDate, {
    message: 'Due date must be on or after issue date.',
    path: ['dueDate'],
  });

/** Recipient supplied by the browser for a send/resend request; the server no longer picks it. */
export const emailRequestSchema = z.object({ recipientEmail: email() });
