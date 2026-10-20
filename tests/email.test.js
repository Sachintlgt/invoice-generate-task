import test from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { mailer } from '../src/email.js';
import { calculate } from '../shared/calculations.js';
const invoice = () => {
  const i = {
    business: { name: 'Demo', email: 'demo@example.com', address: '' },
    customer: { name: 'Client', email: 'never-used@example.com', address: '' },
    number: 'QA\r\nSubject',
    issueDate: '2026-10-20',
    dueDate: '2026-10-21',
    items: [{ description: 'Test', quantity: '2', unitPrice: '50' }],
    discount: '10',
    taxRate: '10',
    notes: 'Demo only',
    customFields: [{ label: 'Private', value: 'HIDDEN-MARKER', visible: false }],
  };
  i.totals = calculate(i);
  return i;
};
test('SMTP adapter requires TLS, uses configured recipient and escapes invoice', async (t) => {
  let options, message;
  t.mock.method(nodemailer, 'createTransport', (input) => {
    options = input;
    return {
      sendMail: async (payload) => {
        message = payload;
      },
    };
  });
  const send = mailer({
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: 587,
    SMTP_SECURE: 'false',
    SMTP_USER: 'demo',
    SMTP_PASS: 'placeholder',
    EMAIL_FROM: 'sender@example.com',
    TEST_EMAIL_TO: 'controlled@example.com',
  });
  assert.equal((await send(invoice())).mode, 'smtp');
  assert.equal(options.secure, false);
  assert.equal(options.requireTLS, true);
  assert.equal(message.to, 'controlled@example.com');
  assert.equal(message.from, 'sender@example.com');
  assert.ok(!/[\r\n]/.test(message.subject));
  assert.ok(!message.html.includes('HIDDEN-MARKER'));
  assert.ok(!message.text.includes('HIDDEN-MARKER'));
  assert.ok(message.text.includes('$99.00'));
  assert.equal(message.attachments.length, 1);
  assert.equal(message.attachments[0].contentType, 'application/pdf');
  assert.equal(message.attachments[0].contentDisposition, 'attachment');
  assert.ok(Buffer.isBuffer(message.attachments[0].content));
  assert.ok(message.attachments[0].content.subarray(0, 5).equals(Buffer.from('%PDF-')));
  assert.ok(!/[\r\n/]/.test(message.attachments[0].filename));
  assert.ok(message.html.includes('role="presentation"'));
  assert.ok(!message.html.includes('invoice-paper'));
});
test('SMTP adapter propagates delivery failures instead of claiming success', async (t) => {
  t.mock.method(nodemailer, 'createTransport', () => ({
    sendMail: async () => {
      throw new Error('SMTP authentication failed');
    },
  }));
  await assert.rejects(
    mailer({ SMTP_HOST: 'smtp.example.com', SMTP_SECURE: 'true' })(invoice()),
    /SMTP authentication failed/,
  );
});

test('SMTP rejected recipient is a failure even if transport resolves', async (t) => {
  t.mock.method(nodemailer, 'createTransport', () => ({
    sendMail: async () => ({ accepted: [], rejected: ['controlled@example.com'] }),
  }));
  await assert.rejects(
    mailer({ SMTP_HOST: 'smtp.example.com', SMTP_SECURE: 'true' })(invoice()),
    /did not accept/,
  );
});
test('real Nodemailer MIME contains a PDF attachment and HTML/plain-text alternatives', async (t) => {
  const originalCreate = nodemailer.createTransport.bind(nodemailer);
  let raw;
  t.mock.method(nodemailer, 'createTransport', () => {
    const stream = originalCreate({ streamTransport: true, buffer: true, newline: 'unix' });
    return {
      sendMail: async (message) => {
        const info = await stream.sendMail(message);
        raw = info.message.toString();
        return info;
      },
    };
  });
  await mailer({
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: 587,
    SMTP_SECURE: 'false',
    EMAIL_FROM: 'sender@example.com',
    TEST_EMAIL_TO: 'controlled@example.com',
  })(invoice());
  assert.match(raw, /Content-Type: multipart\/mixed/);
  assert.match(raw, /Content-Type: text\/plain/);
  assert.match(raw, /Content-Type: text\/html/);
  assert.match(raw, /Content-Type: application\/pdf/);
  assert.match(raw, /Content-Disposition: attachment; filename=invoice-QA-Subject\.pdf/);
  assert.match(raw, /Content-Transfer-Encoding: base64/);
  assert.ok(raw.includes('JVBERi0xLjM'));
});
