import { escapeHTML as e } from '/invoice-template.js';
import { money } from '/shared/calculations.js';
import { showToast } from '/toast.js';

const $ = (selector) => document.querySelector(selector),
  labels = { sent: 'Sent', failed: 'Failed', preview: 'Preview', pending: 'Pending / unknown' };

let config = { emailMode: 'preview' },
  offset = 0,
  total = 0,
  busy = false;
const limit = 25;

const time = (value) =>
  value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      )
    : 'Not recorded';
/**
 * Display a safe error and move keyboard focus to its accessible alert region.
 */
function showError(message) {
  $('#mail-error').hidden = !message;
  $('#mail-error').textContent = message;
  if (message) {
    $('#mail-error').focus();
    showToast(message, { kind: 'error' });
  }
}
/**
 * Fetch saved-email metadata or submit an empty JSON action body.
 * Convert failed responses into exceptions handled by the shared operation wrapper.
 */
async function api(path, method = 'GET') {
  const response = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: '{}' } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to complete this request.');
  return data;
}
/**
 * Link to the associated saved invoice for preview, editing and sending, plus a direct
 * link to the exact PDF that was attached to this historical send, when one was saved.
 */
function actions(record) {
  const edit = record.invoiceId
    ? `<a href="/?invoice=${e(record.invoiceId)}#editor" aria-label="Open invoice ${e(record.invoiceNumber)} to preview, edit and send">Preview, Edit, Send</a>`
    : '<span class="mail-secondary" title="This older email preview has no saved invoice to open.">Invoice unavailable</span>';
  const pdf = record.hasPdf
    ? `<a href="/api/email-logs/${e(record.id)}/pdf" target="_blank" rel="noopener" aria-label="View the invoice PDF sent with ${e(record.invoiceNumber)}">View sent invoice (PDF)</a>`
    : '';
  return edit + pdf;
}
/**
 * Render the recorded attempt status as escaped text; Sent means provider acceptance.
 */
function badge(record) {
  return `<span class="mail-badge ${e(record.status)}">${e(labels[record.status] || record.status)}</span>`;
}
/**
 * Load one page of attempt history and update counts, dates and pagination.
 * Each entry represents a separate saved attempt, including retries.
 */
async function loadList() {
  const data = await api(`/api/email-logs?offset=${offset}&limit=${limit}`);
  total = data.total;
  $('#count-all').textContent = total;
  for (const status of ['sent', 'failed', 'preview'])
    $(`#count-${status}`).textContent = data.stats[status];
  $('#email-rows').innerHTML = data.items
    .map(
      (record) =>
        `<tr><td><a class="mail-link" href="/email-logs/${e(record.id)}" target="_blank" rel="noopener">${e(record.invoiceNumber)}</a><span class="mail-secondary">${e(record.customerName)}</span>${record.totalCents !== null ? `<span class="mail-secondary">${e(money(record.totalCents))} USD</span>` : ''}</td><td>${e(record.recipient)}${record.legacy ? `<span class="mail-secondary">${record.invoiceId ? 'Older preview linked to saved invoice' : 'Older local preview; no saved invoice match'}</span>` : ''}</td><td><time datetime="${e(record.createdAt)}">${e(time(record.createdAt))}</time>${record.resendOf ? '<span class="mail-secondary">Resent from a saved email</span>' : ''}</td><td>${badge(record)}${record.error ? `<span class="mail-secondary">${e(record.error)}</span>` : ''}</td><td><div class="mail-actions">${actions(record)}</div></td></tr>`,
    )
    .join('');
  $('#empty-state').hidden = total !== 0;
  $('#previous').disabled = offset === 0;
  $('#next').disabled = offset + limit >= total;
  $('#page-info').textContent = total
    ? `${offset + 1}–${Math.min(offset + limit, total)} of ${total}`
    : '0 emails';
  $('#mail-status').textContent =
    `${total} saved email${total === 1 ? '' : 's'} · Times shown in ${Intl.DateTimeFormat().resolvedOptions().timeZone}.`;
}
/**
 * Show saved attempt metadata and its original body in a sandboxed iframe.
 * Read stored artifacts rather than regenerating them from a subsequently edited invoice.
 */
async function loadDetail() {
  const id = location.pathname.split('/').filter(Boolean).at(-1);
  const record = await api(`/api/email-logs/${encodeURIComponent(id)}`);
  document.title = `${record.invoiceNumber} — Saved Email — Folio`;
  $('#detail-title').textContent = record.invoiceNumber;
  const fields = [
    ['Status', labels[record.status] || record.status],
    ['Recipient', record.recipient],
    ['From', record.from],
    ['Created', time(record.createdAt)],
    ['Sent', time(record.sentAt)],
    ['Subject', record.subject],
    ...(record.error ? [['Error', record.error]] : []),
    ...(record.resendOf ? [['Original email ID', record.resendOf]] : []),
  ];
  $('#detail-meta').innerHTML = fields
    .map(([label, value]) => `<div><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`)
    .join('');
  $('#detail-actions').innerHTML = actions(record);
  $('#detail-content').hidden = false;
  const frame = $('#message-preview');
  if (record.hasBody) frame.src = `/api/email-logs/${encodeURIComponent(id)}/message`;
  frame.hidden = !record.hasBody;
  $('#no-body').hidden = record.hasBody;
  $('#mail-status').textContent = record.legacy
    ? 'Recovered local preview. Delivery and invoice snapshot were not recorded.'
    : record.status === 'sent'
      ? 'Accepted by the SMTP provider. Inbox delivery is not confirmed.'
      : record.status === 'preview'
        ? 'Preview only. No email was sent.'
        : record.status === 'pending'
          ? 'No final result is recorded. Check provider logs before sending again.'
          : 'The send attempt failed. See the recorded error above.';
}
/**
 * Refresh the list or detail view according to the elements present on the page.
 */
async function refresh() {
  showError('');
  if ($('#email-rows')) await loadList();
  else await loadDetail();
}
/**
 * Serialize history actions and restore button availability and keyboard focus afterward.
 */
async function run(operation) {
  if (busy) return;
  busy = true;
  const focused = document.activeElement;
  document.querySelectorAll('button').forEach((button) => (button.disabled = true));
  try {
    await operation();
  } catch (error) {
    showError(error.message);
  } finally {
    busy = false;
    document
      .querySelectorAll('button')
      .forEach((button) => (button.disabled = button.hasAttribute('data-unavailable')));
    if ($('#previous')) {
      $('#previous').disabled = offset === 0;
      $('#next').disabled = offset + limit >= total;
    }
    if (focused?.isConnected) focused.focus({ preventScroll: true });
  }
}

if ($('#refresh')) $('#refresh').onclick = () => run(refresh);
if ($('#previous'))
  $('#previous').onclick = () =>
    run(async () => {
      offset = Math.max(0, offset - limit);
      await refresh();
    });
if ($('#next'))
  $('#next').onclick = () =>
    run(async () => {
      offset += limit;
      await refresh();
    });
run(async () => {
  config = await api('/api/config');
  $('#send-note').textContent =
    config.emailMode === 'smtp'
      ? 'Open an invoice to preview, edit and send it to whichever address you enter in the editor.'
      : 'Preview mode: open an invoice to preview and edit it. Sending creates a local email preview.';
  await refresh();
});
