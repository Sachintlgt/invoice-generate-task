/**
 * Lightweight top-right toast notifications for errors/warnings, supplementing (not
 * replacing) each page's existing accessible inline alert region. Dynamically creates
 * its stack container so no page markup changes are required.
 */
let stack;
function ensureStack() {
  if (stack) return stack;
  stack = document.createElement('div');
  stack.id = 'toast-stack';
  stack.setAttribute('aria-live', 'assertive');
  document.body.appendChild(stack);
  return stack;
}
/**
 * Show a dismissible toast. `kind` is 'error' (default) or 'warning'.
 * Auto-dismisses after `duration` ms; pass 0 to require manual dismissal.
 */
export function showToast(message, { kind = 'error', duration = 7000 } = {}) {
  if (!message) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${kind}`;
  toast.setAttribute('role', 'alert');
  const text = document.createElement('span');
  text.textContent = message;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast-close';
  close.setAttribute('aria-label', 'Dismiss notification');
  close.textContent = '×';
  close.onclick = () => toast.remove();
  toast.append(text, close);
  ensureStack().prepend(toast);
  if (duration) setTimeout(() => toast.remove(), duration);
}
