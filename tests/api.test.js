import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
test('HTTP save, retrieve, update, validation, email preview and security', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'folio-test-'));
  const port = 31987;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dir, SMTP_HOST: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    let stderr = '';
    child.stderr.on('data', (chunk) => (stderr += chunk));
    const started = await Promise.race([
      once(child.stdout, 'data').then(() => true),
      once(child, 'exit').then(() => false),
      new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error('Startup timed out')), 8000);
        timer.unref();
      }),
    ]);
    if (!started) {
      if (stderr.includes('EPERM')) {
        t.skip('Environment prohibits binding local server ports.');
        return;
      }
      throw new Error(stderr || 'Server failed to start.');
    }
    const base = `http://127.0.0.1:${port}`;
    const body = {
      business: { name: '<script>alert(1)</script>', email: '', address: '' },
      customer: { name: 'Client', email: '', address: '' },
      number: 'TEST-1',
      issueDate: '2026-10-20',
      dueDate: '2026-10-21',
      notes: 'Thanks',
      items: [{ description: 'Work', quantity: '2', unitPrice: '50' }],
      discount: '10',
      taxRate: '10',
      customFields: [{ label: 'Secret', value: 'DO-NOT-PRINT', visible: false }],
    };
    const request = (url, method, data) =>
      fetch(base + url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    let res = await request('/api/invoices', 'POST', body);
    assert.equal(res.status, 201);
    const saved = await res.json();
    assert.equal(saved.totals.total, 9900);
    res = await fetch(base + `/api/invoices/${saved.id}`);
    assert.equal((await res.json()).number, 'TEST-1');
    res = await request(`/api/invoices/${saved.id}`, 'PUT', { ...body, number: 'TEST-2' });
    assert.equal(res.status, 200);
    for (const bad of [
      { ...body, discount: '101' },
      { ...body, taxRate: '-1' },
      { ...body, dueDate: '2026-10-19' },
      { ...body, issueDate: '2026-02-30' },
      { ...body, items: [{ description: 'X', quantity: '-1', unitPrice: '5' }] },
    ])
      assert.equal((await request('/api/invoices', 'POST', bad)).status, 400);
    res = await request(`/api/invoices/${saved.id}/email`, 'POST', {});
    assert.equal((await res.json()).mode, 'preview');
    const files = await readdir(join(dir, 'email-previews'));
    const html = await readFile(join(dir, 'email-previews', files[0]), 'utf8');
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(!html.includes('DO-NOT-PRINT'));
    assert.equal((await fetch(base + '/api/invoices/not-a-uuid')).status, 404);
    assert.equal((await fetch(base + '/data/invoices/' + saved.id + '.json')).status, 404);
    res = await fetch(base + '/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' },
      body: JSON.stringify(body),
    });
    assert.equal(res.status, 403);
    assert.ok((await fetch(base)).headers.get('content-security-policy'));
  } catch (error) {
    if (error.cause?.code === 'EPERM') {
      t.skip('Environment prohibits local HTTP connections.');
    } else throw error;
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await once(child, 'exit');
    }
    await rm(dir, { recursive: true, force: true });
  }
});
