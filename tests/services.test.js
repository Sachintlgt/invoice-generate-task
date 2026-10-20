import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { storage } from '../src/storage.js';
import { invoiceSchema } from '../src/validation.js';
import { calculate } from '../shared/calculations.js';
import { invoiceHTML, invoiceText } from '../src/invoice-template.js';
import { mailer } from '../src/email.js';
const fixture = () => ({
  business: { name: '<script>alert(1)</script>', email: '', address: '' },
  customer: { name: 'Client', email: '', address: '' },
  number: 'INV-1',
  issueDate: '2026-10-20',
  dueDate: '2026-10-21',
  notes: 'Thank you',
  items: [{ description: 'Work', quantity: '2', unitPrice: '50.00' }],
  discount: '10',
  taxRate: '10',
  customFields: [
    { label: 'Private', value: 'HIDDEN-VALUE', visible: false },
    { label: 'PO', value: '42', visible: true },
  ],
});
test('schema rejects negatives, impossible dates, reversed dates, missing names and too many rows', () => {
  const good = fixture();
  assert.equal(invoiceSchema.safeParse(good).success, true);
  for (const bad of [
    { ...good, taxRate: '-1' },
    { ...good, issueDate: '2026-02-30' },
    { ...good, dueDate: '2026-10-19' },
    { ...good, business: { ...good.business, name: '' } },
    { ...good, items: Array(101).fill(good.items[0]) },
  ])
    assert.equal(invoiceSchema.safeParse(bad).success, false);
});
test('server schema strips supplied authoritative fields', () => {
  const parsed = invoiceSchema.parse({ ...fixture(), id: 'spoof', totals: { total: 1 } });
  assert.equal(parsed.id, undefined);
  assert.equal(parsed.totals, undefined);
});
test('invoice HTML escapes input and both email formats exclude hidden fields', () => {
  const i = fixture();
  i.totals = calculate(i);
  const html = invoiceHTML(i),
    text = invoiceText(i);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('HIDDEN-VALUE'));
  assert.ok(!text.includes('HIDDEN-VALUE'));
  assert.ok(html.includes('$99.00'));
  assert.ok(text.includes('PO: 42'));
});
test('JSON persistence survives new storage instance and concurrent writes stay valid', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'folio-storage-'));
  try {
    const id = randomUUID(),
      store = storage(dir);
    await Promise.all(Array.from({ length: 10 }, (_, n) => store.save(id, { number: n })));
    assert.equal((await storage(dir).get(id)).number, 9);
    assert.equal((await readdir(join(dir, 'invoices'))).length, 1);
    await assert.rejects(store.get('../../secret'));
    await assert.rejects(store.get(randomUUID()), { status: 404 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('preview mail creates escaped HTML outside public assets without sending', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'folio-mail-'));
  try {
    const i = fixture();
    i.totals = calculate(i);
    const result = await mailer({ DATA_DIR: dir })(i);
    assert.equal(result.mode, 'preview');
    const html = await readFile(join(dir, 'email-previews', result.previewFile), 'utf8');
    assert.ok(html.includes('$99.00'));
    assert.ok(!html.includes('HIDDEN-VALUE'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
