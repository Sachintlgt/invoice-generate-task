import nodemailer from 'nodemailer';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { invoiceEmail } from './email-template.js';
import { invoicePDF, invoicePdfFilename } from './invoice-pdf.js';
import { safeEmailError } from './email-history.js';

/** Create an SMTP sender, or a local HTML/PDF preview writer when SMTP is not configured. */
export function mailer(config, history) {
  const transport = config.SMTP_HOST
    ? nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: config.SMTP_SECURE === 'true',
        requireTLS: config.SMTP_SECURE !== 'true',
        auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
        connectionTimeout: 10000,
        socketTimeout: 15000,
      })
    : null;
  // Persist the pending attempt before generating artifacts so interrupted sends remain traceable.
  return async (invoice, { resendOf = null } = {}) => {
    const message = invoiceEmail(invoice);
    const record = history
      ? await history.create({
          invoice,
          from: config.EMAIL_FROM,
          recipient: config.TEST_EMAIL_TO,
          mode: transport ? 'smtp' : 'preview',
          subject: message.subject,
          resendOf,
        })
      : null;
    const log = record ? { logId: record.id, logUrl: `/email-logs/${record.id}` } : {};
    let accepted = false;
    try {
      const pdf = await invoicePDF(invoice);
      if (record) await history.attach(record.id, message, pdf);
      if (!transport) {
        const directory = resolve(config.DATA_DIR, 'email-previews');
        await mkdir(directory, { recursive: true });
        const id = record?.id || randomUUID(),
          previewFile = `${id}.html`,
          previewPdfFile = `${id}.pdf`;
        await writeFile(resolve(directory, previewFile), message.html, { mode: 0o600 });
        await writeFile(resolve(directory, previewPdfFile), pdf, { mode: 0o600 });
        if (record) await history.finish(record.id, 'preview');
        return {
          ...log,
          mode: 'preview',
          message: 'Email preview and invoice PDF saved on the server. No email was sent.',
          previewFile,
          previewPdfFile,
        };
      }
      const result = await transport.sendMail({
        from: config.EMAIL_FROM,
        // The browser cannot override the controlled test recipient.
        to: config.TEST_EMAIL_TO,
        ...message,
        attachments: [
          {
            filename: invoicePdfFilename(invoice.number),
            content: pdf,
            contentType: 'application/pdf',
            contentDisposition: 'attachment',
          },
        ],
      });
      if (result?.rejected?.length || (Array.isArray(result?.accepted) && !result.accepted.length))
        throw Object.assign(new Error('The SMTP provider did not accept the test recipient.'), {
          code: 'ERECIPIENT',
        });
      accepted = true;
      if (record) await history.finish(record.id, 'sent');
      return {
        ...log,
        mode: 'smtp',
        message: 'Invoice email with PDF attachment accepted by the SMTP provider.',
      };
    } catch (error) {
      // A log-write failure after SMTP acceptance must not be reported as a failed send:
      // retrying automatically here could deliver the same email twice.
      if (accepted)
        return {
          ...log,
          mode: 'smtp',
          message:
            'Email accepted, but its final log status could not be saved. Check provider logs before resending.',
        };
      if (record) {
        try {
          await history.finish(record.id, 'failed', safeEmailError(error));
        } catch {
          /* The pending record remains; do not hide the original send error. */
        }
      }
      throw error;
    }
  };
}
