// Decimal strings become scaled integers: no binary floating point in money arithmetic.
export function scaled(value, places = 2) {
  const text = String(value);
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error('Use a non-negative decimal number.');
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > places) throw new Error(`Use at most ${places} decimal places.`);
  return BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, '0'));
}
const round = (n, d) => (n + d / 2n) / d; // non-negative, half-up
const safe = n => {
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Amount is too large.');
  return Number(n);
};
// Optional fixed discount: clearing the field means no discount.
export function normalizeDiscount(value) {
  return value === undefined || (typeof value === 'string' && value.trim() === '') ? '0' : value;
}
export function quantityUnits(value) {
  const text=String(value);
  if (!/^\d{1,9}$/.test(text) || BigInt(text)>1000000n) {
    throw Object.assign(new Error('Quantity must be a whole number from 0 to 1,000,000.'), {status:400});
  }
  return BigInt(text);
}
export function calculate(invoice) {
  // Whole units multiplied by integer cents already produce exact line cents.
  const lines = invoice.items.map(item => quantityUnits(item.quantity) * scaled(item.unitPrice));
  const subtotal = lines.reduce((a, b) => a + b, 0n);
  const discount = scaled(normalizeDiscount(invoice.discount));
  if (discount > subtotal) throw new Error('Discount cannot exceed subtotal.');
  const taxable = subtotal - discount;
  const tax = round(taxable * scaled(invoice.taxRate, 4), 1000000n);
  return { lines: lines.map(safe), subtotal: safe(subtotal), discount: safe(discount), tax: safe(tax), total: safe(taxable + tax) };
}
const dollars = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
export function money(cents) {
  if (typeof cents !== 'bigint' && !Number.isSafeInteger(cents)) throw new Error('Money must be an integer number of cents.');
  const value = BigInt(cents), absolute = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}$${dollars.format(absolute / 100n)}.${String(absolute % 100n).padStart(2, '0')}`;
}
