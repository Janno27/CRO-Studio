// Safe DOM helpers. Native APIs only; never uses innerHTML.

/** querySelector that returns null on an invalid selector instead of throwing. */
export function qs(selector, scope) {
  try { return (scope || document).querySelector(selector); } catch (e) { return null; }
}

export function qsa(selector, scope) {
  try { return Array.from((scope || document).querySelectorAll(selector)); } catch (e) { return []; }
}

export const exists = (selector, scope) => !!qs(selector, scope);

/** Build an element with native DOM methods. `text` and string children become text nodes. */
export function create(tag, { class: className, attrs, dataset, text } = {}, children = []) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (attrs) Object.keys(attrs).forEach((k) => el.setAttribute(k, attrs[k]));
  if (dataset) Object.keys(dataset).forEach((k) => { el.dataset[k] = dataset[k]; });
  if (text != null) el.textContent = text;
  children.forEach((c) => el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
  return el;
}

const POSITIONS = ['before', 'after', 'prepend', 'append'];

/** Insert `el` relative to a connected `anchor`. Returns true only if `el` ends up in the document. */
export function insert(el, anchor, position = 'after') {
  if (!el || !anchor || !anchor.isConnected || !POSITIONS.includes(position)) return false;
  if (position === 'before' || position === 'after') {
    if (!anchor.parentNode) return false;
    anchor.parentNode.insertBefore(el, position === 'before' ? anchor : anchor.nextSibling);
  } else if (position === 'prepend') anchor.insertBefore(el, anchor.firstChild);
  else anchor.appendChild(el);
  return el.isConnected;
}

/**
 * Resolve with the first match (immediately if present), or null after `timeout` ms.
 * Uses one short-lived observer scoped to `scope`. Experiments should prefer lifecycle `targets`/`watch`.
 */
export function waitFor(selector, { scope, timeout = 10000, signal } = {}) {
  return new Promise((resolve) => {
    const root = scope || document.documentElement;
    const found = qs(selector, root);
    if (found) return resolve(found);
    let timer = null;
    const obs = new MutationObserver(() => { const el = qs(selector, root); if (el) done(el); });
    function done(v) { obs.disconnect(); clearTimeout(timer); resolve(v); }
    timer = setTimeout(() => done(null), timeout);
    if (signal) signal.addEventListener('abort', () => done(null), { once: true });
    obs.observe(root, { childList: true, subtree: true });
  });
}
