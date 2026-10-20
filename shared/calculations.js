/**
 * Convert a non-negative decimal into a scaled integer without floating-point arithmetic.
 * For example, scaled('19.99', 2) returns 1999n cents; excess precision is rejected.
 * @param {string | number} value Decimal input without currency symbols or exponents.
 * @param {number} places Number of supported fractional digits.
 * @returns {bigint} The value multiplied by 10 raised to places.
 */
export function scaled(value, places = 2) {
  const text = String(value);
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error('Use a non-negative decimal number.');
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > places) throw new Error(`Use at most ${places} decimal places.`);
  return BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, '0'));
}
/** Divide non-negative integers and round halfway values up; the divisor must be positive. */
const round = (n, d) => (n + d / 2n) / d;
/** Reject totals that would lose integer precision when serialized as JSON numbers. */
const safe = (n) => {
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Amount is too large.');
  return Number(n);
};
/** Treat an omitted or blank optional discount as zero; leave invalid inputs for validation. */
export function normalizeDiscount(value) {
  return value === undefined || (typeof value === 'string' && value.trim() === '') ? '0' : value;
}
/** Reject fractional quantities instead of silently rounding an invoice's units. */
export function quantityUnits(value) {
  const text = String(value);
  if (!/^\d{1,9}$/.test(text) || BigInt(text) > 1000000n) {
    throw Object.assign(new Error('Quantity must be a whole number from 0 to 1,000,000.'), {
      status: 400,
    });
  }
  return BigInt(text);
}
/** Return integer cents: sum exact lines, subtract discount, then round percentage tax half-up. */
export function calculate(invoice) {
  // Whole units multiplied by integer cents already produce exact line cents.
  const lines = invoice.items.map((item) => quantityUnits(item.quantity) * scaled(item.unitPrice));
  const subtotal = lines.reduce((a, b) => a + b, 0n);
  const discount = scaled(normalizeDiscount(invoice.discount));
  if (discount > subtotal) throw new Error('Discount cannot exceed subtotal.');
  const taxable = subtotal - discount;
  // Four tax-rate decimal places and the percent conversion together require division by 10^6.
  const tax = round(taxable * scaled(invoice.taxRate, 4), 1000000n);
  return {
    lines: lines.map(safe),
    subtotal: safe(subtotal),
    discount: safe(discount),
    tax: safe(tax),
    total: safe(taxable + tax),
  };
}
const dollars = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
/** Format cents without floating-point division, including amounts near the safe integer limit. */
export function money(cents) {
  if (typeof cents !== 'bigint' && !Number.isSafeInteger(cents))
    throw new Error('Money must be an integer number of cents.');
  const value = BigInt(cents),
    absolute = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}$${dollars.format(absolute / 100n)}.${String(absolute % 100n).padStart(2, '0')}`;
}
