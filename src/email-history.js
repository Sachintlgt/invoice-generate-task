import { mkdir, readFile, writeFile, rename, readdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { calculate } from '../shared/calculations.js';
import { invoiceHTML } from './invoice-template.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const notFound = () => Object.assign(new Error('Saved email not found.'), { status: 404 });
const decode = (value) =>
  value.replace(
    /&(amp|lt|gt|quot|#39);/g,
    (_, key) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[key],
  );
/**
 * Manage private email attempts, immutable invoice snapshots and generated artifacts.
 * Writes are serialized within one process; historical artifacts are never rebuilt from live invoices.
 */
export function emailHistory(directory) {
  const root = resolve(directory, 'email-logs');
  let queue = Promise.resolve(),
    migration;
  /**
   * Resolve an artifact only after validating its UUID to prevent arbitrary file paths.
   */
  function path(id, extension = 'json') {
    if (!UUID.test(id)) throw notFound();
    return join(root, `${id}.${extension}`);
  }
  /**
   * Read the original attempt record and translate a missing artifact into a public 404.
   */
  async function get(id) {
    try {
      return JSON.parse(await readFile(path(id), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') throw notFound();
      throw error;
    }
  }
  /**
   * Chain writes while allowing later operations to continue after an earlier failure.
   * The returned promise still rejects so the caller sees its own operation’s error.
   */
  function serial(operation) {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  }
  /**
   * Replace an artifact using a private temporary file so incomplete contents stay invisible.
   */
  async function atomic(target, content) {
    await mkdir(root, { recursive: true });
    const temp = `${target}.${randomUUID()}.tmp`;
    await writeFile(temp, content, { mode: 0o600 });
    await rename(temp, target);
  }
  /**
   * Persist a complete JSON attempt record using the atomic replacement helper.
   */
  async function put(record) {
    await atomic(path(record.id), JSON.stringify(record, null, 2));
    return record;
  }
  /**
   * Expose list/detail metadata without sending the full invoice snapshot or raw email HTML.
   */
  function summary(record) {
    const {
      id,
      invoiceId,
      invoiceNumber,
      customerName,
      recipient,
      from,
      subject,
      status,
      mode,
      createdAt,
      updatedAt,
      sentAt,
      error,
      legacy,
      resendOf,
      hasPdf,
      totalCents,
    } = record;
    return {
      id,
      invoiceId,
      invoiceNumber,
      customerName,
      recipient,
      from,
      subject,
      status,
      mode,
      createdAt,
      updatedAt,
      sentAt,
      error,
      legacy,
      resendOf,
      hasPdf,
      totalCents,
      hasBody: !!record.html,
      canResend: !!record.invoice,
    };
  }
  /**
   * Recover old local previews once per history instance without inventing delivery status.
   * Associate an invoice only when its complete rendered content matches uniquely.
   */
  async function migratePreviews() {
    if (!migration)
      migration = serial(async () => {
        const old = resolve(directory, 'email-previews');
        let files;
        try {
          files = await readdir(old);
        } catch (error) {
          if (error.code === 'ENOENT') return;
          throw error;
        }
        for (const file of files.filter(
          (file) => file.endsWith('.html') && UUID.test(file.slice(0, -5)),
        )) {
          const id = file.slice(0, -5);
          try {
            await get(id);
            continue;
          } catch (error) {
            if (error.status !== 404) throw error;
          }
          const html = await readFile(join(old, file), 'utf8'),
            info = await stat(join(old, file));
          const number = decode(
            (html.match(/<h1\b[^>]*>([^<]*)<\/h1>/i) ||
              html.match(/<strong\b[^>]*>([^<]*)<\/strong>/i) || [, 'Legacy preview'])[1],
          );
          let hasPdf = false;
          try {
            const pdf = await readFile(join(old, `${id}.pdf`));
            await atomic(path(id, 'pdf'), pdf);
            hasPdf = true;
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
          }
          await put({
            id,
            invoiceId: null,
            invoiceNumber: number,
            customerName: 'Not recorded',
            recipient: 'Not recorded',
            from: 'Not recorded',
            subject: `Invoice ${number}`,
            status: 'preview',
            mode: 'preview',
            createdAt: info.mtime.toISOString(),
            updatedAt: info.mtime.toISOString(),
            sentAt: null,
            error: null,
            legacy: true,
            resendOf: null,
            hasPdf,
            totalCents: null,
            invoice: null,
            html,
            text: 'Saved before email logging was enabled. No delivery status or resend snapshot was recorded.',
          });
        }
        // Link older previews only when their complete rendered invoice uniquely
        // matches a saved invoice. Invoice numbers alone are not unique.
        let invoiceFiles = [];
        try {
          invoiceFiles = await readdir(resolve(directory, 'invoices'));
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        const candidates = [];
        for (const file of invoiceFiles.filter(
          (file) => file.endsWith('.json') && UUID.test(file.slice(0, -5)),
        )) {
          const invoice = JSON.parse(await readFile(resolve(directory, 'invoices', file), 'utf8'));
          try {
            candidates.push({
              id: file.slice(0, -5),
              html: invoiceHTML({ ...invoice, totals: calculate(invoice) }),
            });
          } catch (error) {
            if (error.status !== 400) throw error;
          } // Old fractional quantities must be corrected in the editor.
        }
        await mkdir(root, { recursive: true });
        for (const file of (await readdir(root)).filter(
          (file) => file.endsWith('.json') && UUID.test(file.slice(0, -5)),
        )) {
          const record = await get(file.slice(0, -5));
          if (!record.legacy || record.invoiceId || !record.html) continue;
          const matches = candidates.filter((candidate) => record.html.includes(candidate.html));
          if (matches.length === 1) await put({ ...record, invoiceId: matches[0].id });
        }
      });
    return migration;
  }
  return {
    get,
    summary,
    /**
     * Record a pending attempt before PDF generation or SMTP. Deep-copy the invoice so later
     * editor changes cannot alter the historical snapshot; keep resend attempts as separate records.
     */
    async create({ invoice, from, recipient, mode, subject, resendOf = null }) {
      const now = new Date().toISOString();
      return serial(() =>
        put({
          id: randomUUID(),
          invoiceId: UUID.test(invoice.id || '') ? invoice.id : null,
          invoiceNumber: invoice.number,
          customerName: invoice.customer.name,
          recipient: recipient || 'Not configured',
          from: from || invoice.business.email || 'Not configured',
          subject,
          status: 'pending',
          mode,
          createdAt: now,
          updatedAt: now,
          sentAt: null,
          error: null,
          legacy: false,
          resendOf,
          hasPdf: false,
          totalCents: calculate(invoice).total,
          invoice: JSON.parse(JSON.stringify(invoice)),
          html: '',
          text: '',
        }),
      );
    },
    /**
     * Store the generated PDF and message before delivery so the original content is reviewable.
     */
    async attach(id, { html, text }, pdf) {
      return serial(async () => {
        const record = await get(id);
        await atomic(path(id, 'pdf'), pdf);
        return put({ ...record, html, text, hasPdf: true, updatedAt: new Date().toISOString() });
      });
    },
    /**
     * Record the final outcome. Only provider-accepted attempts receive a sent timestamp.
     */
    async finish(id, status, error = null) {
      return serial(async () => {
        const record = await get(id),
          now = new Date().toISOString();
        return put({
          ...record,
          status,
          error,
          updatedAt: now,
          sentAt: status === 'sent' ? now : null,
        });
      });
    },
    /**
     * Return the original saved PDF, or 404 when the attempt never produced one.
     */
    async pdf(id) {
      const record = await get(id);
      if (!record.hasPdf) throw notFound();
      return readFile(path(id, 'pdf'));
    },
    /**
     * Recover legacy previews, then return paginated summaries and counts across all attempts.
     */
    async list({ offset = 0, limit = 50 } = {}) {
      await migratePreviews();
      await mkdir(root, { recursive: true });
      const records = await Promise.all(
        (await readdir(root))
          .filter((file) => file.endsWith('.json') && UUID.test(file.slice(0, -5)))
          .map((file) => get(file.slice(0, -5))),
      );
      records.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      const stats = { sent: 0, failed: 0, preview: 0, pending: 0 };
      for (const record of records) if (record.status in stats) stats[record.status]++;
      return {
        items: records.slice(offset, offset + limit).map(summary),
        total: records.length,
        offset,
        limit,
        stats,
      };
    },
  };
}

/**
 * Map provider failures to useful diagnostics without exposing credentials or raw SMTP responses.
 */
export function safeEmailError(error) {
  if (error.code === 'EAUTH') return 'SMTP authentication failed. Check the server configuration.';
  if (error.code === 'EDNS') return 'Could not resolve the SMTP server hostname.';
  if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKET' || error.code === 'ECONNRESET')
    return 'SMTP connection failed. Delivery is not confirmed; check provider logs before resending.';
  if (error.code === 'ERECIPIENT') return 'The SMTP provider rejected the recipient address.';
  return 'Email could not be completed. Check the server configuration and provider logs.';
}
