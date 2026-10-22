import { calculate, normalizeDiscount, money } from '/shared/calculations.js';
import { invoiceHTML, escapeHTML as e } from '/invoice-template.js';
import { showToast } from '/toast.js';

const $ = (s) => document.querySelector(s),
  form = $('#invoice-form');
const now = new Date();
const today = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, '0'),
  String(now.getDate()).padStart(2, '0'),
].join('-');

let invoice = {
  business: {
    name: 'Studio North',
    email: 'hello@studionorth.example',
    address: '128 Maple Street\nPortland, OR 97205',
    logo: '',
  },
  customer: {
    name: 'Bloom & Co.',
    email: 'accounts@bloom.example',
    address: '42 Garden Avenue\nAustin, TX 78701',
  },
  number: `INV-${now.getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
  issueDate: today,
  dueDate: today,
  items: [
    { description: 'Brand identity & creative direction', quantity: '2', unitPrice: '50.00' },
  ],
  discount: '10.00',
  taxRate: '10',
  notes:
    'Thank you for trusting us with your vision. Please include the invoice number with your payment.',
  customFields: [{ label: 'Payment method', value: 'Bank transfer', visible: true }],
};

let savedId = null,
  busy = false,
  emailMode = 'preview',
  dirty = false,
  lastSavedContent = null,
  loadBlocked = false,
  recipientTouched = false;
const MAX_LOGO_BYTES = 300 * 1024;
// Requires a dot-separated domain with a 2+ character label (matches the server's stricter check).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/**
 * Return a stable snapshot of editable fields only. Server IDs, totals and timestamps
 * are excluded so an unchanged invoice is not saved again.
 */
function contentKey() {
  return JSON.stringify({
    business: invoice.business,
    customer: invoice.customer,
    number: invoice.number,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    items: invoice.items,
    discount: invoice.discount,
    taxRate: invoice.taxRate,
    notes: invoice.notes,
    customFields: invoice.customFields,
  });
}
/**
 * Read native controls into the draft using dotted field paths such as items.0.quantity.
 * Keep numeric input as strings for exact validation and normalize an empty discount to zero.
 */
function read() {
  for (const input of form.querySelectorAll('[name]')) {
    const keys = input.name.split('.');
    let target = invoice;
    for (const key of keys.slice(0, -1)) target = target[key];
    target[keys.at(-1)] = input.type === 'checkbox' ? input.checked : input.value;
  }
  invoice.discount = normalizeDiscount(invoice.discount);
  return invoice;
}
/**
 * Rebuild item and custom-field controls from the current draft. Escape every user value
 * before inserting HTML; dotted names preserve each field’s position in the model.
 */
function rows() {
  $('#items').innerHTML = invoice.items
    .map(
      (r, n) =>
        `<fieldset class="item-row"><legend>Item ${n + 1}</legend><label class="description">Description<input name="items.${n}.description" value="${e(r.description)}" required maxlength="500"></label><label>Quantity<input name="items.${n}.quantity" type="number" value="${e(r.quantity)}" min="1" max="1000000" step="1" inputmode="numeric" required></label><label>Price (USD)<input name="items.${n}.unitPrice" type="number" value="${e(r.unitPrice)}" min="0" max="100000000" step="0.01" required></label><button type="button" data-remove-item="${n}" class="remove" aria-label="Remove item ${n + 1}" ${invoice.items.length === 1 ? 'disabled' : ''}>×</button></fieldset>`,
    )
    .join('');
  $('#custom-fields').innerHTML = invoice.customFields
    .map(
      (f, n) =>
        `<fieldset class="custom-row"><legend>Custom field ${n + 1}</legend><label>Label<input name="customFields.${n}.label" value="${e(f.label)}" required maxlength="100"></label><label>Value<input name="customFields.${n}.value" value="${e(f.value)}" maxlength="500"></label><label class="check"><input type="checkbox" name="customFields.${n}.visible" ${f.visible ? 'checked' : ''}> Show on invoice</label><button type="button" class="remove" data-remove-field="${n}" aria-label="Remove custom field ${n + 1}">×</button></fieldset>`,
    )
    .join('');
}
/**
 * Load the complete invoice model into the form, including hidden custom fields,
 * then refresh the preview and validation state.
 */
function populate() {
  rows();
  for (const input of form.querySelectorAll('[name]')) {
    let value = invoice;
    for (const key of input.name.split('.')) value = value[key];
    if (input.type === 'checkbox') input.checked = value;
    else input.value = value;
  }
  renderLogoPreview();
  recipientTouched = false;
  update();
}
/**
 * Show or hide the small logo thumbnail and remove button for the current draft's logo.
 */
function renderLogoPreview() {
  const has = !!invoice.business.logo;
  $('#logo-preview').hidden = !has;
  $('#logo-thumb').hidden = !has;
  $('#logo-thumb').src = has ? invoice.business.logo : '';
  $('#logo-broken-note').hidden = true;
}
// Defense in depth: if a saved logo ever fails to decode, show a clear message instead
// of the browser's broken-image icon; Remove logo stays available either way.
$('#logo-thumb').addEventListener('error', () => {
  if (!invoice.business.logo) return;
  $('#logo-thumb').hidden = true;
  $('#logo-broken-note').hidden = false;
});
/**
 * Default the recipient field to the customer's billing email until the user edits it
 * directly; once edited, further customer-email changes no longer overwrite their choice.
 */
function syncRecipientDefault() {
  if (!recipientTouched) $('#recipient-email').value = invoice.customer.email;
}
/**
 * Record unsaved edits for status feedback and the before-unload warning.
 */
function markDirty() {
  dirty = true;
  status(savedId ? 'Unsaved changes to this saved invoice.' : 'New invoice · Unsaved changes.');
}
/**
 * Choose the invoice to open: an explicit New invoice URL overrides remembered state,
 * and an explicit saved ID overrides the last ID stored by this browser.
 */
function initialInvoiceId() {
  const params = new URL(location.href).searchParams;
  if (params.has('new')) return null;
  if (params.has('invoice')) return params.get('invoice');
  try {
    return localStorage.getItem('folio.lastInvoiceId');
  } catch {
    return null;
  }
}
/**
 * Keep the URL, remembered ID and editor label tied to the saved record.
 * Only the ID is stored locally; draft contents remain in memory until saved.
 */
function syncURL() {
  const url = new URL(location.href);
  url.searchParams.delete('new');
  url.searchParams.set('invoice', savedId);
  history.replaceState(null, '', url);
  try {
    localStorage.setItem('folio.lastInvoiceId', savedId);
  } catch {}
  document.querySelector('.brand').href = `/?invoice=${encodeURIComponent(savedId)}#editor`;
  $('#save').textContent = 'Save changes';
  $('#editor-mode').textContent = `Editing saved invoice ${invoice.number} · ID: ${savedId}`;
}
/**
 * Show or clear the accessible error region without interpreting the message as HTML.
 * Also raises a top-right toast, but only when the message is new — update() re-runs
 * this on every keystroke, and a lingering validation error must not toast repeatedly.
 */
let lastToastedError = '';
function error(message) {
  $('#error').hidden = !message;
  $('#error').textContent = message;
  if (message && message !== lastToastedError) showToast(message, { kind: 'error' });
  lastToastedError = message;
}
/**
 * Set the status line's text and, optionally, a visual success/failure tone so an
 * outcome (like a send result) is never mistaken for a leftover unrelated message.
 */
function status(message, tone) {
  $('#status').textContent = message;
  $('#status').classList.remove('status-success', 'status-failure');
  if (tone) $('#status').classList.add(`status-${tone}`);
  if (tone === 'failure') showToast(message, { kind: 'error' });
}
/**
 * Validate current quantities and required fields, then recalculate and render the preview.
 * Clear stale output and disable printing while the draft contains invalid amounts.
 */
function update() {
  read();
  syncRecipientDefault();
  for (const input of form.querySelectorAll(
    'input[required]:not([type="number"]):not([type="date"])',
  ))
    input.setCustomValidity(
      input.value.trim() ? '' : 'Please enter a value; spaces alone are not allowed.',
    );
  for (const input of form.querySelectorAll('[name$=".quantity"]'))
    input.setCustomValidity(
      /^\d{1,9}$/.test(input.value) && Number(input.value) >= 1 && Number(input.value) <= 1000000
        ? ''
        : 'Quantity must be a whole number from 1 to 1,000,000.',
    );
  // Browsers accept far looser strings (e.g. "a@b") as type="email"; this mirrors the
  // server's stricter shape so a mismatch surfaces here instead of after a round trip.
  // Required-but-empty is left to the required-field loop above.
  for (const input of form.querySelectorAll('input[type="email"]')) {
    const value = input.value.trim();
    if (!value) continue;
    input.setCustomValidity(
      EMAIL_RE.test(value) && value.length <= 254
        ? ''
        : 'Enter a valid email address, like name@example.com.',
    );
  }
  $('#print').disabled = true;
  try {
    invoice.totals = calculate(invoice);
    $('#preview').innerHTML = invoiceHTML(invoice);
    error('');
    $('#print').disabled = false;
  } catch (err) {
    $('#preview').textContent =
      'Correct the highlighted values to preview this invoice. ' + err.message;
    error(err.message);
  }
  const due = form.elements.namedItem('dueDate');
  due.min = invoice.issueDate;
  due.setCustomValidity(
    invoice.dueDate < invoice.issueDate ? 'Due date must be on or after issue date.' : '',
  );
}
// The recipient field is send-time input, not saved invoice content: keep it out of the
// dirty/content tracking that governs Save and the unsaved-changes warning.
form.addEventListener('input', (event) => {
  if (event.target.id === 'recipient-email') return;
  markDirty();
  update();
});
form.addEventListener('change', (event) => {
  // The logo input manages its own validation, dirty-tracking and preview refresh
  // (including rejecting a file without clobbering its own error message).
  if (event.target.id === 'recipient-email' || event.target.id === 'logo-input') return;
  markDirty();
  update();
});
$('#recipient-email').addEventListener('input', () => {
  recipientTouched = true;
  update(); // Live format feedback only; recipient is excluded from dirty/content tracking above.
});
form.elements.namedItem('discount').addEventListener('blur', (event) => {
  if (event.target.value === '' && !event.target.validity.badInput) {
    event.target.value = '0.00';
    update();
  }
});
$('#add-item').onclick = () => {
  read();
  if (invoice.items.length >= 100) return error('Maximum 100 line items.');
  invoice.items.push({ description: '', quantity: '1', unitPrice: '0.00' });
  rows();
  markDirty();
  update();
  form.querySelector(`[name="items.${invoice.items.length - 1}.description"]`).focus();
};
$('#add-field').onclick = () => {
  read();
  if (invoice.customFields.length >= 30) return error('Maximum 30 custom fields.');
  invoice.customFields.push({ label: '', value: '', visible: true });
  rows();
  markDirty();
  update();
  form.querySelector(`[name="customFields.${invoice.customFields.length - 1}.label"]`).focus();
};
form.addEventListener('click', (event) => {
  const b = event.target.closest('[data-remove-item],[data-remove-field]');
  if (!b) return;
  read();
  const item = b.dataset.removeItem;
  if (item !== undefined) invoice.items.splice(Number(item), 1);
  else invoice.customFields.splice(Number(b.dataset.removeField), 1);
  rows();
  markDirty();
  update();
  (item !== undefined ? $('#add-item') : $('#add-field')).focus();
});
/**
 * Read a chosen file into the business logo field. Validate type and size client-side for
 * fast feedback; the server independently re-validates the same constraints as the authority.
 */
$('#logo-input').addEventListener('change', () => {
  const file = $('#logo-input').files[0];
  $('#logo-input').value = '';
  if (!file) return;
  if (!['image/png', 'image/jpeg'].includes(file.type))
    return error('Logo must be a PNG or JPEG image.');
  if (file.size > MAX_LOGO_BYTES) return error('Logo must be 300KB or smaller.');
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result;
    // A file can report an image MIME type by extension alone without being a real,
    // decodable image (e.g. a renamed or corrupted file) — confirm it actually decodes
    // before accepting it, so a broken logo never silently reaches Save, the PDF or email.
    const probe = new Image();
    probe.onload = () => {
      invoice.business.logo = dataUrl;
      renderLogoPreview();
      markDirty();
      update();
    };
    probe.onerror = () =>
      error("This file doesn't appear to be a valid PNG or JPEG image. Try a different file.");
    probe.src = dataUrl;
  };
  reader.onerror = () => error('Could not read the selected image.');
  reader.readAsDataURL(file);
});
$('#logo-remove').onclick = () => {
  invoice.business.logo = '';
  renderLogoPreview();
  markDirty();
  update();
};
/**
 * Send same-origin JSON requests and surface server validation issues to the editor.
 * Reject failed responses so callers never mark unsuccessful operations as saved.
 */
async function api(url, method = 'GET', body) {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.issues
        ? data.issues.map((x) => `${x.path}: ${x.message}`).join(' ')
        : data.error || 'Request failed.',
    );
  return data;
}
/**
 * Run shared calculations and native form validation before save, email or print.
 * Return false when invalid input or a calculation error prevents the action.
 */
function valid() {
  read();
  update();
  if (!form.reportValidity()) return false;
  if (!$('#error').hidden) {
    $('#error').focus();
    return false;
  }
  return true;
}
/**
 * Persist a new draft with POST or update the opened record with PUT.
 * Block saving after a failed load, skip unchanged data, and refresh the saved-invoice list
 * only after the server confirms persistence.
 */
async function save() {
  if (loadBlocked)
    throw new Error(
      'The saved invoice could not be loaded. Reopen it from Saved invoices, or choose New invoice. Your changes have not been saved as a new invoice.',
    );
  read();
  if (savedId && contentKey() === lastSavedContent) {
    dirty = false;
    status(`Already saved · Invoice ID: ${savedId}`);
    return invoice;
  }
  const result = await api(
    savedId ? `/api/invoices/${savedId}` : '/api/invoices',
    savedId ? 'PUT' : 'POST',
    invoice,
  );
  savedId = result.id;
  invoice = result;
  populate();
  lastSavedContent = contentKey();
  dirty = false;
  $('#load-id').value = savedId;
  syncURL();
  status(`Saved changes to ${invoice.number} · Invoice ID: ${savedId}`);
  window.dispatchEvent(new Event('invoice-saved'));
  return result;
}
/**
 * Allow one asynchronous editor operation at a time. Preserve disabled states and
 * keyboard focus, and report failures without discarding the current draft.
 */
async function action(fn) {
  if (busy) return;
  busy = true;
  const previouslyFocused = document.activeElement;
  let failed = false;
  const controls = [...document.querySelectorAll('input,textarea,button')].map((control) => [
    control,
    control.disabled,
  ]);
  for (const [control] of controls) control.disabled = true;
  try {
    await fn();
  } catch (err) {
    failed = true;
    error(err.message);
    if (loadBlocked) {
      $('#editor-mode').textContent =
        'Invoice unavailable · Reopen from Saved invoices or start a New invoice.';
      status('No invoice was created or overwritten.', 'failure');
    }
    $('#error').focus();
  } finally {
    busy = false;
    for (const [control, wasDisabled] of controls) control.disabled = wasDisabled;
    if (!failed && previouslyFocused?.isConnected && !previouslyFocused.disabled)
      previouslyFocused.focus({ preventScroll: true });
  }
}
form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!busy && valid()) action(save);
});
/**
 * Show the recipient/invoice summary and require an explicit confirmation before any send,
 * whether it delivers over SMTP or writes a local preview.
 */
$('#email').onclick = () => {
  if (busy || !valid()) return;
  // Match the dialog's wording to what will actually happen: preview mode never emails anyone.
  if (emailMode === 'smtp') {
    $('#send-confirm-title').textContent = 'Send this invoice?';
    $('#send-confirm-desc').textContent =
      'This saves the invoice, then emails it to the address below.';
    $('#send-confirm-button').textContent = 'Send email';
  } else {
    $('#send-confirm-title').textContent = 'Preview this invoice email?';
    $('#send-confirm-desc').textContent =
      'This saves the invoice, then saves a local preview of the email below. No email is actually sent.';
    $('#send-confirm-button').textContent = 'Create preview';
  }
  $('#confirm-number').textContent = invoice.number;
  $('#confirm-total').textContent = `${money(invoice.totals.total)} USD`;
  $('#confirm-recipient').textContent = $('#recipient-email').value.trim();
  $('#send-confirm').showModal();
};
$('#send-cancel').onclick = () => $('#send-confirm').close();
$('#send-confirm-button').onclick = () => {
  $('#send-confirm').close();
  action(async () => {
    const recipientEmail = $('#recipient-email').value.trim();
    try {
      await save();
      const result = await api(`/api/invoices/${savedId}/email`, 'POST', { recipientEmail });
      status(result.message, 'success');
      if (result.logUrl) {
        const link = document.createElement('a');
        link.href = result.logUrl;
        link.textContent = ' View saved email ↗';
        link.target = '_blank';
        link.rel = 'noopener';
        $('#status').append(link);
      }
    } catch (err) {
      // Leave no ambiguity: a failed send must not look like the earlier "Saved changes" status.
      status(`Email not sent: ${err.message}`, 'failure');
      throw err; // action() still shows/focuses the accessible error region.
    }
  });
};
$('#print').onclick = () => {
  if (valid()) window.print();
};
/**
 * Retrieve a saved invoice and bind later edits to its original ID. Confirm before replacing
 * unsaved edits; keep saving blocked if retrieval fails instead of creating a replacement.
 */
async function load(id, { initial = false } = {}) {
  if (dirty && !initial && !confirm('Replace your unsaved changes with the saved invoice?')) return;
  loadBlocked = true;
  $('#editor-mode').textContent = 'Loading saved invoice…';
  const loaded = await api(`/api/invoices/${encodeURIComponent(id)}`);
  invoice = loaded;
  savedId = id;
  populate();
  lastSavedContent = contentKey();
  dirty = false;
  loadBlocked = false;
  syncURL();
  $('#load-id').value = savedId;
  status(`Opened invoice ${invoice.number} · Add or edit items, then Save changes.`);
}
$('#load').onclick = () => action(() => load($('#load-id').value.trim()));
window.addEventListener('beforeunload', (event) => {
  if (dirty) {
    event.preventDefault();
    event.returnValue = '';
  }
});
populate();
api('/api/config')
  .then((config) => {
    emailMode = config.emailMode;
    $('#email').textContent = emailMode === 'smtp' ? 'Send email' : 'Preview email';
    $('#email-note').textContent =
      emailMode === 'smtp'
        ? 'Includes an invoice PDF attachment, sent to the recipient entered below.'
        : 'Preview mode: email HTML is saved locally; nothing is sent.';
  })
  .catch(() => {
    $('#email-note').textContent = 'Could not check email configuration. Please reload.';
  });
const initialId = initialInvoiceId();
if (initialId) action(() => load(initialId, { initial: true }));
else status('New invoice · Save creates a new invoice. Open a saved invoice to update it.');
