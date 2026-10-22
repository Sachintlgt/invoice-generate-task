import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
// Exercise actual editor functions in an isolated context without a browser or live email service.
function functionSource(name, next) {
  return source.slice(
    source.indexOf(`function ${name}(`),
    source.indexOf(next, source.indexOf(`function ${name}(`)),
  );
}
test('editor saves actual changed data even without an input event and skips unchanged repeat saves', async () => {
  const calls = [],
    elements = new Map();
  const context = {
    invoice: { number: 'EDIT-1', notes: 'Before' },
    savedId: 'saved-id',
    dirty: false,
    lastSavedContent: null,
    loadBlocked: false,
    Event,
    window: { dispatchEvent() {} },
    populate() {},
    read() {},
    syncURL() {},
    status() {},
    $: (key) => {
      if (!elements.has(key)) elements.set(key, {});
      return elements.get(key);
    },
    api: async (url, method, body) => {
      calls.push({ url, method, body: structuredClone(body) });
      return { ...body, id: 'saved-id' };
    },
  };
  runInNewContext(
    functionSource('contentKey', '\nfunction read') +
      '\nasync ' +
      functionSource('save', '\nasync function action') +
      '\nlastSavedContent=contentKey();',
    context,
  );
  context.invoice.notes = 'After';
  await context.save();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'PUT');
  assert.equal(calls[0].body.notes, 'After');
  await context.save();
  assert.equal(calls.length, 1);
  context.invoice.notes = 'Failed edit';
  context.api = async () => {
    throw new Error('Save failed');
  };
  await assert.rejects(context.save(), /Save failed/);
  assert.notEqual(context.lastSavedContent, context.contentKey());
});

test('editor resumes its saved identity while explicit invoice and New invoice take priority', () => {
  const context = {
    URL,
    location: { href: 'http://localhost:3000/' },
    localStorage: { getItem: () => 'remembered-id' },
  };
  runInNewContext(functionSource('initialInvoiceId', '\nfunction syncURL'), context);
  assert.equal(context.initialInvoiceId(), 'remembered-id');
  context.location.href = 'http://localhost:3000/?invoice=explicit-id#editor';
  assert.equal(context.initialInvoiceId(), 'explicit-id');
  context.location.href = 'http://localhost:3000/?new=1#editor';
  assert.equal(context.initialInvoiceId(), null);
  context.location.href = 'http://localhost:3000/';
  context.localStorage.getItem = () => {
    throw new Error('Blocked storage');
  };
  assert.equal(context.initialInvoiceId(), null);
});

test('failed invoice load blocks save instead of creating a new invoice', async () => {
  let requests = 0;
  const elements = new Map();
  const context = {
    invoice: { number: 'NEW-DRAFT' },
    savedId: null,
    dirty: false,
    lastSavedContent: null,
    loadBlocked: false,
    read() {},
    populate() {},
    syncURL() {},
    status() {},
    window: { dispatchEvent() {} },
    Event,
    $: (key) => {
      if (!elements.has(key)) elements.set(key, {});
      return elements.get(key);
    },
    api: async () => {
      requests++;
      throw new Error('Invoice not found.');
    },
  };
  runInNewContext(
    functionSource('contentKey', '\nfunction read') +
      '\nasync ' +
      functionSource('save', '\nasync function action') +
      '\nasync ' +
      functionSource('load', "\n$('#load')"),
    context,
  );
  await assert.rejects(context.load('missing-id', { initial: true }), /Invoice not found/);
  assert.equal(context.loadBlocked, true);
  await assert.rejects(context.save(), /could not be loaded/);
  assert.equal(requests, 1);
  assert.equal(context.savedId, null);
});

test('reopening an invoice binds edits to its original ID and unchanged save clears dirty state', async () => {
  const calls = [],
    elements = new Map();
  const original = {
    id: 'original-id',
    number: 'ORIGINAL',
    notes: 'Before',
    items: [{ description: 'Work', quantity: '1', unitPrice: '50' }],
  };
  const context = {
    invoice: { number: 'Draft' },
    savedId: null,
    dirty: false,
    lastSavedContent: null,
    loadBlocked: false,
    Event,
    window: { dispatchEvent() {} },
    read() {},
    populate() {},
    syncURL() {},
    status() {},
    $: (key) => {
      if (!elements.has(key)) elements.set(key, {});
      return elements.get(key);
    },
    api: async (url, method, body) => {
      calls.push({ url, method });
      return method === 'PUT' ? { ...body, id: original.id } : structuredClone(original);
    },
  };
  runInNewContext(
    functionSource('contentKey', '\nfunction read') +
      '\nasync ' +
      functionSource('save', '\nasync function action') +
      '\nasync ' +
      functionSource('load', "\n$('#load')"),
    context,
  );
  await context.load(original.id, { initial: true });
  context.invoice.items.push({ description: 'Added', quantity: '2', unitPrice: '10' });
  await context.save();
  assert.equal(calls[1].url, '/api/invoices/original-id');
  assert.equal(calls[1].method, 'PUT');
  assert.equal(context.savedId, original.id);
  context.dirty = true;
  await context.save();
  assert.equal(calls.length, 2);
  assert.equal(context.dirty, false);
});
