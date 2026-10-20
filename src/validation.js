import { z } from 'zod';
import { normalizeDiscount } from '../shared/calculations.js';
const text = z.string().trim().max(2000);
const amount = (places, max) => z.string().regex(new RegExp(`^\\d{1,9}(\\.\\d{1,${places}})?$`), 'Enter a non-negative decimal with valid precision.').refine(v => Number(v) <= max, 'Value exceeds the supported limit.');
const party = z.object({name: text.min(1, 'Name is required.').max(150), email: z.union([z.literal(''), z.email()]), address: text});
const date = z.iso.date();
export const invoiceSchema = z.object({
  business: party, customer: party, number: text.min(1).max(80), issueDate: date, dueDate: date, notes: text,
  items: z.array(z.object({description: text.min(1).max(500), quantity: amount(4, 1000000), unitPrice: amount(2, 100000000)})).min(1).max(100),
  discount: z.preprocess(normalizeDiscount, amount(2, 100000000)), taxRate: amount(4, 1000),
  customFields: z.array(z.object({label: text.min(1).max(100), value: text.max(500), visible: z.boolean()})).max(30)
}).refine(v => v.dueDate >= v.issueDate, {message:'Due date must be on or after issue date.', path:['dueDate']});
