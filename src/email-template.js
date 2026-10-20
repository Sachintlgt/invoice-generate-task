import { escapeHTML } from './invoice-template.js';
import { calculate, money } from '../shared/calculations.js';

// Email clients do not load the website stylesheet. Use a small inline-styled
// presentation table and attach the fully formatted invoice as a PDF.
/**
 * Create an email-safe HTML summary, plain-text alternative and subject.
 * The complete itemized invoice is supplied separately as a PDF attachment; escape all user text.
 */
export function invoiceEmail(invoice) {
  const e = escapeHTML,
    total = money(calculate(invoice).total);
  const subject = `Invoice ${invoice.number.replace(/[\r\n]/g, ' ')}`;
  const text = `Hello ${invoice.customer.name},\n\nPlease find invoice ${invoice.number} from ${invoice.business.name} attached as a PDF.\nTotal due: ${total} USD\nDue date: ${invoice.dueDate}\n\nThank you for your business.`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(subject)}</title></head><body style="margin:0;background:#f6f5ef;color:#253e35;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #d9dfd8"><tr><td style="padding:28px;word-break:break-word;overflow-wrap:anywhere"><p style="margin:0 0 12px;color:#234b41;font-size:12px;letter-spacing:2px">INVOICE</p><h1 style="margin:0 0 22px;font-size:24px;line-height:1.3;color:#234b41">${e(invoice.number)}</h1><p style="line-height:1.6">Hello ${e(invoice.customer.name)},</p><p style="line-height:1.6">Your invoice from <strong>${e(invoice.business.name)}</strong> is attached as a PDF.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0;border-top:1px solid #d9dfd8;border-bottom:1px solid #d9dfd8"><tr><td style="padding:14px 0;font-size:14px">Total due (USD)</td><td align="right" style="padding:14px 0;font-size:20px;font-weight:bold;color:#234b41">${e(total)}</td></tr><tr><td style="padding:0 0 14px;font-size:14px">Due date</td><td align="right" style="padding:0 0 14px;font-size:14px">${e(invoice.dueDate)}</td></tr></table><p style="font-size:14px;line-height:1.6">Open the attached PDF for the complete itemized invoice.</p><p style="font-size:14px;line-height:1.6">Thank you for your business.</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}
