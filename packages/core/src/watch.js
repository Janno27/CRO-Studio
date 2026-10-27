// One MutationObserver per experiment instance, with a deliberate scope and a relevance filter.
// - Mutations inside experiment-owned nodes are ignored (no feedback loops).
// - Records produced synchronously by the experiment's own apply() are discarded with flush().
// - No debounce: the callback runs once per mutation batch, synchronously after the DOM change.
// Scope: `scope` selector (default '#main-content', present in SSR HTML on UK/FR/DE). If it is absent or gets
// detached (route swap), we temporarily fall back to documentElement - the only justified full-document case -
// and narrow again as soon as the scope element exists.
export function createWatcher({ scope = '#main-content', targets, isOwned, hasOwned, onChange }) {
  let observer = null;
  let root = null;
  let lastHref = null;

  const test = (node) => {
    if (!node || node.nodeType !== 1) return false;
    return targets.some((sel) => {
      try { return node.matches(sel) || !!node.querySelector(sel); } catch (e) { return false; }
    });
  };

  const resolveRoot = () => {
    let el = null;
    try { el = document.querySelector(scope); } catch (e) { /* invalid scope */ }
    return el || document.documentElement;
  };

  function attach() {
    const next = resolveRoot();
    if (observer && next === root && root.isConnected) return;
    if (observer) observer.disconnect();
    root = next;
    observer.observe(root, { childList: true, subtree: true });
  }

  function handle(records) {
    let reason = null;
    for (const r of records) {
      if (r.type !== 'childList' || isOwned(r.target)) continue;
      for (const n of r.addedNodes) if (!isOwned(n) && test(n)) reason = reason || 'target-added';
      for (const n of r.removedNodes) {
        if (isOwned(n) || hasOwned(n)) reason = reason || 'owned-removed';
        else if (test(n)) reason = reason || 'target-removed';
      }
    }
    try {
      if (window.location.href !== lastHref) { lastHref = window.location.href; reason = reason || 'navigation'; }
    } catch (e) { /* ignore */ }
    attach(); // re-narrow / re-attach if the scope changed
    if (reason) onChange(reason);
  }

  return {
    start() {
      if (observer) return;
      try { lastHref = window.location.href; } catch (e) { lastHref = null; }
      observer = new MutationObserver(handle);
      attach();
    },
    /** Drop pending records (used after the experiment's own synchronous DOM work). */
    flush() { if (observer) observer.takeRecords(); },
    stop() { if (observer) { observer.disconnect(); observer = null; root = null; } },
    get active() { return !!observer; },
    get scopeElement() { return root; },
  };
}
