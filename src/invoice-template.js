import { money, scaled } from '../shared/calculations.js';
/** Encode text for HTML text/attribute contexts; invoice fields never contain trusted markup. */
export const escapeHTML = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
/**
 * Render the invoice document from a model with calculated integer-cent totals.
 * Escape user text and include only visible custom fields; this HTML is shared by preview and print.
 */
export function invoiceHTML(i) {
  const e = escapeHTML,
    t = i.totals;
  return `<article class="invoice-paper"><header class="paper-header"><div><span class="eyebrow">INVOICE</span><h2>${e(i.business.name)}</h2><p>${e(i.business.address)}</p><p>${e(i.business.email)}</p></div><div><strong>${e(i.number)}</strong><p>Issued ${e(i.issueDate)}</p><p>Due ${e(i.dueDate)}</p></div></header><section class="bill-to"><span class="eyebrow">BILL TO</span><h3>${e(i.customer.name)}</h3><p>${e(i.customer.address)}</p><p>${e(i.customer.email)}</p></section><table><caption class="sr-only">Invoice line items in USD</caption><thead><tr><th scope="col">Description</th><th scope="col">Qty</th><th scope="col">Price</th><th scope="col">Amount</th></tr></thead><tbody>${i.items.map((r, n) => `<tr><td>${e(r.description)}</td><td>${e(r.quantity)}</td><td>${money(scaled(r.unitPrice))}</td><td>${money(t.lines[n])}</td></tr>`).join('')}</tbody></table><dl class="totals"><div><dt>Subtotal</dt><dd>${money(t.subtotal)}</dd></div><div><dt>Discount</dt><dd>−${money(t.discount)}</dd></div><div><dt>Tax (${e(i.taxRate)}%)</dt><dd>${money(t.tax)}</dd></div><div class="grand"><dt>Total due <small>USD</small></dt><dd>${money(t.total)}</dd></div></dl>${i.customFields
    .filter((f) => f.visible)
    .map((f) => `<p><strong>${e(f.label)}:</strong> ${e(f.value)}</p>`)
    .join(
      '',
    )}${i.notes ? `<section class="notes"><h3>A little note</h3><p>${e(i.notes)}</p></section>` : ''}<footer class="paper-footer">Thank you for your business.</footer></article>`;
}
/**
 * Build a readable plain-text invoice using the same totals and custom-field visibility rules.
 */
export function invoiceText(i) {
  return [
    `Invoice ${i.number}`,
    `From: ${i.business.name}`,
    `To: ${i.customer.name}`,
    `Issued: ${i.issueDate} | Due: ${i.dueDate}`,
    ...i.items.map(
      (x, n) => `${x.description}: ${x.quantity} × ${x.unitPrice} = ${money(i.totals.lines[n])}`,
    ),
    `Subtotal: ${money(i.totals.subtotal)}`,
    `Discount: ${money(i.totals.discount)}`,
    `Tax: ${money(i.totals.tax)}`,
    `Total: ${money(i.totals.total)}`,
    ...i.customFields.filter((x) => x.visible).map((x) => `${x.label}: ${x.value}`),
    i.notes,
  ].join('\n');
}
