import { escapeHTML as e } from '/invoice-template.js';
import { money } from '/shared/calculations.js';

const root = document.querySelector('#saved-invoices');
const rows = root.querySelector('[data-invoice-rows]'),
  status = root.querySelector('[data-invoice-status]'),
  error = root.querySelector('[data-invoice-error]'),
  search = root.querySelector('[data-invoice-search]'),
  refresh = root.querySelector('[data-invoice-refresh]');

let invoices = [],
  loading = false;

/**
 * Filter saved metadata by invoice number, customer or UUID and render escaped rows.
 * Open links use the UUID because older records may share an invoice number.
 */
function render() {
  const query = search.value.trim().toLowerCase();
  const visible = invoices.filter((invoice) =>
    [invoice.number, invoice.customerName, invoice.id].some((value) =>
      String(value).toLowerCase().includes(query),
    ),
  );
  rows.innerHTML = visible
    .map(
      (invoice) =>
        `<tr><td><strong>${e(invoice.number)}</strong><span class="saved-secondary">ID: ${e(invoice.id)}</span></td><td>${e(invoice.customerName)}</td><td>${invoice.itemCount}</td><td>${e(money(invoice.totalCents))}</td><td><time datetime="${e(invoice.updatedAt)}">${e(new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(invoice.updatedAt)))}</time></td><td><a class="saved-open" href="/?invoice=${e(invoice.id)}#editor" aria-label="Open and edit invoice ${e(invoice.number)} (${e(invoice.id.slice(0, 8))})">Open and edit</a></td></tr>`,
    )
    .join('');
  root.querySelector('[data-invoice-empty]').hidden = visible.length > 0;
  root.querySelector('[data-invoice-empty]').textContent = query
    ? 'No invoices match your search.'
    : 'No saved invoices yet. Create an invoice and select Save invoice.';
  status.textContent = `${visible.length} of ${invoices.length} saved invoice${invoices.length === 1 ? '' : 's'}. Open and edit loads all saved fields and updates the same invoice.`;
}

/**
 * Fetch fresh saved-invoice metadata without caching. Prevent overlapping refreshes,
 * announce loading/errors, and leave the current invoice editor untouched on failure.
 */
async function load() {
  if (loading) return;
  loading = true;
  refresh.disabled = true;
  root.setAttribute('aria-busy', 'true');
  error.hidden = true;
  try {
    const response = await fetch('/api/invoices', { cache: 'no-store' });
    if (!response.ok)
      throw new Error(
        'Could not load saved invoices. Please restart the server if it has not loaded the latest changes, then refresh this list.',
      );
    const data = await response.json();
    invoices = data.items;
    render();
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
    status.textContent =
      'Saved invoice list unavailable. Your current editor data has not been changed.';
  } finally {
    loading = false;
    refresh.disabled = false;
    root.setAttribute('aria-busy', 'false');
  }
}
search.addEventListener('input', render);
refresh.addEventListener('click', load);
window.addEventListener('invoice-saved', load);
window.addEventListener('pageshow', (event) => {
  if (event.persisted) load();
});
load();
