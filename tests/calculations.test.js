import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, scaled, money, quantityUnits } from '../shared/calculations.js';
const invoice = (items, discount = '0', taxRate = '0') => ({ items, discount, taxRate });
const item = (quantity, unitPrice) => ({ quantity, unitPrice });
test('assignment example totals $99.00', () =>
  assert.deepEqual(calculate(invoice([item('2', '50.00')], '10', '10')), {
    lines: [10000],
    subtotal: 10000,
    discount: 1000,
    tax: 900,
    total: 9900,
  }));
test('whole quantities multiplied by cents give exact line totals before summing', () => {
  const t = calculate(invoice([item('3', '19.99'), item('2', '0.01')]));
  assert.deepEqual(t.lines, [5997, 2]);
  assert.equal(t.subtotal, 5999);
});
test('integer quantity and fractional tax preserve decimal precision', () => {
  const t = calculate(invoice([item('3', '19.99')], '0.01', '8.875'));
  assert.equal(t.subtotal, 5997);
  assert.equal(t.tax, 532);
  assert.equal(t.total, 6528);
});
test('discount equal to subtotal gives zero taxable total', () =>
  assert.equal(calculate(invoice([item('1', '1')], '1', '10')).total, 0));
test('negative, excessive discount, unsupported precision and unsafe totals rejected', () => {
  assert.throws(() => scaled('-1'));
  assert.throws(() => scaled('1.001'));
  assert.throws(() => calculate(invoice([item('1', '1')], '2')));
  assert.throws(() => calculate(invoice([item('1000000', '999999999999')])));
});
test('zero quantity allowed and custom fields do not affect totals', () => {
  assert.equal(
    calculate({ ...invoice([item('0', '10')]), customFields: [{ value: '999' }] }).total,
    0,
  );
});
const cases = [
  ['binary-sensitive cents', [item('3', '0.10')], '0', '0', 30, 0, 30],
  ['zero quantity', [item('0', '0.01')], '0', '0', 0, 0, 0],
  ['maximum quantity', [item('1000000', '0.01')], '0', '0', 1000000, 0, 1000000],
  ['integer quantity with decimal price', [item('3', '19.99')], '0', '0', 5997, 0, 5997],
  ['half-cent tax rounds up', [item('1', '0.05')], '0', '10', 5, 1, 6],
  ['below half-cent tax rounds down', [item('1', '0.04')], '0', '10', 4, 0, 4],
  ['four-place tax rate', [item('1', '100.00')], '0', '7.1234', 10000, 712, 10712],
  ['tax after discount', [item('2', '50.00')], '10', '10', 10000, 900, 9900],
  ['zero price', [item('2', '0.00')], '0', '10', 0, 0, 0],
  ['full discount with tax', [item('1', '24.68')], '24.68', '1000', 2468, 0, 0],
  [
    '100 exact cent lines',
    Array.from({ length: 100 }, () => item('1', '0.01')),
    '0',
    '0',
    100,
    0,
    100,
  ],
];
for (const [name, items, discount, rate, subtotal, tax, total] of cases)
  test(`decimal case: ${name}`, () => {
    const actual = calculate(invoice(items, discount, rate));
    assert.equal(actual.subtotal, subtotal);
    assert.equal(actual.tax, tax);
    assert.equal(actual.total, total);
  });
test('reject decimal exponent, NaN, infinity, negative tax/price/discount and excess precision', () => {
  for (const value of ['1e2', 'NaN', 'Infinity', '-0.01', '1,000'])
    assert.throws(() => scaled(value));
  for (const data of [
    invoice([item('1', '-1')]),
    invoice([item('-1', '1')]),
    invoice([item('1', '1')], '-1'),
    invoice([item('1', '1')], '0', '-1'),
    invoice([item('0.00001', '1')]),
    invoice([item('1', '1')], '0', '1.00001'),
  ])
    assert.throws(() => calculate(data));
});
test('USD formatting preserves every cent including the safe integer limit', () => {
  assert.equal(money(29), '$0.29');
  assert.equal(money(1999), '$19.99');
  assert.equal(money(9007199254740991), '$90,071,992,547,409.91');
  assert.equal(money(-1), '-$0.01');
  assert.throws(() => money(0.5));
});
test('empty, whitespace or omitted discount defaults to zero without allowing negatives', () => {
  for (const discount of ['', '   ', undefined]) {
    const result = calculate({ items: [item('2', '50.00')], discount, taxRate: '10' });
    assert.equal(result.discount, 0);
    assert.equal(result.total, 11000);
  }
  assert.throws(() => calculate(invoice([item('2', '50.00')], '-0.01', '10')));
});
test('quantity accepts only whole units within bounds without rounding or truncating', () => {
  for (const value of ['0', '1', '3', '1000000']) assert.equal(quantityUnits(value), BigInt(value));
  for (const value of [
    '0.5',
    '1.0',
    '1.5',
    '1.2345',
    '-1',
    '1000001',
    '1e2',
    'NaN',
    'Infinity',
    '',
    ' 2',
    '2 ',
  ]) {
    assert.throws(() => quantityUnits(value), /Quantity must be a whole number/);
    assert.throws(
      () => calculate(invoice([item(value, '19.99')])),
      /Quantity must be a whole number/,
    );
  }
});
