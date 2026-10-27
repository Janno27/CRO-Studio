// Experiment lifecycle: define -> start (immediate apply) -> optional single observer -> destroy.
// The only global is window[GLOBAL_KEY].instances[id] (default window.__cro; configurable namespace) (needed so a second injection of the same experiment
// reuses the live instance instead of duplicating UI). It never blocks later runs: start() re-runs apply().
import { qs } from './dom.js';
import { injectStyle, assertScoped } from './style.js';
import { createEvents } from './events.js';
import { createWatcher } from './watch.js';
import { createLogger } from './log.js';
import { sessionStore } from './storage.js';
import { isRef, sectionType, sendEvent, visibleShare } from './track.js';
import { NS, GLOBAL_KEY } from './namespace.js';

export const OWNER_ATTR = `data-${NS}-owner`;
const KEY_ATTR = `data-${NS}-key`;
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const OBSERVE_MODES = ['when-needed', 'persist', false];

const instances = () => {
  const w = window;
  w[GLOBAL_KEY] = w[GLOBAL_KEY] || { instances: {} };
  return w[GLOBAL_KEY].instances;
};

function build(def) {
  const id = def.id;
  const log = createLogger(id);
  const events = createEvents();
  const cleanups = [];
  const styleRemovers = new Map();
  const setups = new Set();
  const sent = new Set();
  const armed = new Set();
  let status = 'pending';
  let detail = null;
  let destroyed = false;
  let watcher = null;
  let running = false;
  const store = sessionStore(id);
  let overrides = {}; // instance.setConfig() values, kept for the browser session (QA/console), cleared by destroy()
  try { const saved = store.get('config', null); if (saved && typeof saved === 'object') overrides = { ...saved }; } catch (e) { /* storage blocked: memory only */ }

  const ownerSel = `[${OWNER_ATTR}="${id}"]`;
  const isOwned = (node) => !!node && node.nodeType === 1 && (node.getAttribute(OWNER_ATTR) === id || !!(node.closest && node.closest(ownerSel)));
  const hasOwned = (node) => !!node && node.nodeType === 1 && !!node.querySelector(ownerSel);

  function setStatus(s, d) {
    status = s; detail = d || null;
    if (typeof def.onStatus === 'function') {
      try { def.onStatus(s, detail); } catch (e) { log.error('onStatus failed', e); }
    }
  }

  const ctx = {
    id,
    log,
    qs,
    store,
    /** Experiment options: defaults from defineExperiment({ config }) overlaid with instance.setConfig() overrides (session-persisted). */
    get config() { return { ...(def.config || {}), ...overrides }; },
    isOwned,
    on: events.on,
    delegate: events.delegate,
    own: (fn) => { cleanups.push(fn); },
    /** Run fn once per key for the life of this instance (use for ctx.on/ctx.delegate registrations made in apply). */
    setup(key, fn) {
      if (setups.has(key)) return false;
      setups.add(key);
      fn();
      return true;
    },
    /**
     * Create-once owned element. Finds an existing one by key (idempotent), removes duplicates,
     * otherwise builds it with create() and places it with place(el). Returns the element or null if placement failed.
     */
    ensure(key, create, place) {
      const sel = `${ownerSel}[${KEY_ATTR}="${key}"]`;
      const found = Array.from(document.querySelectorAll(sel));
      found.slice(1).forEach((x) => x.remove());
      if (found[0]) return found[0];
      const el = create();
      el.setAttribute(OWNER_ATTR, id);
      el.setAttribute(KEY_ATTR, key);
      const placed = typeof place === 'function' ? place(el) : false;
      if (!placed || !el.isConnected) { el.remove(); return null; }
      return el;
    },
    /**
     * Send the tracking event (shape from the project's `tracking` config, see track.js) once per page (path) and label. Returns true if it was sent now.
     * Throws (-> status 'error') when the definition has no valid `ref` or the label is not snake_case.
     */
    track(label, { once = true } = {}) {
      sectionType(def.ref, label); // validates ref + label
      const key = `${window.location.pathname}|${label}`;
      if (once && sent.has(key)) return false;
      sent.add(key);
      return sendEvent({ id, ref: def.ref, label });
    },
    /**
     * Send the event once when >= `ratio` (default 0.5) of the target is visible. `target`: element, selector or () => element
     * (re-resolved on every check, so re-rendered nodes are fine). Uses scroll/resize listeners removed on destroy.
     */
    trackWhenVisible(target, label, { ratio = 0.5, tall = true } = {}) {
      sectionType(def.ref, label); // validate now, not at scroll time
      const armKey = `${window.location.pathname}|${label}`;
      if (sent.has(armKey) || armed.has(armKey)) return false;
      armed.add(armKey);
      const resolve = () => (typeof target === 'function' ? target() : typeof target === 'string' ? qs(target) : target);
      let off = [];
      const stop = () => { off.forEach((f) => f()); off = []; armed.delete(armKey); };
      const check = () => {
        if (window.location.pathname + "|" + label !== armKey) return stop(); // navigated away: a new page view arms again
        const el = resolve();
        if (!el || !el.isConnected) return;
        if (visibleShare(el, { tall }) >= ratio) { stop(); ctx.track(label); }
      };
      off.push(events.on(window, 'scroll', check, { passive: true }), events.on(window, 'resize', check));
      check();
      return true;
    },
    /**
     * Send the event when the user clicks `selector` (delegated on document, so re-rendered nodes work). Repeats on every click
     * unless `once` (default false: one event per click is the usual meaning of a click goal).
     */
    trackOnClick(selector, label, { once = false } = {}) {
      sectionType(def.ref, label); // validate now
      return ctx.setup(`click|${selector}|${label}`, () => {
        ctx.delegate(document, 'click', selector, () => { ctx.track(label, { once }); });
      });
    },
    /** Inject scoped CSS; refuses (throws) if any selector is outside the experiment namespace. Empty CSS is a no-op (CSS delivered separately). */
    style(css) {
      if (!css || !css.trim()) return;
      const check = assertScoped(css, id);
      if (!check.ok) throw new Error(`unscoped CSS selectors: ${check.offenders.join(' | ')}`);
      if (styleRemovers.has(css)) return;
      styleRemovers.forEach((rm) => rm());
      styleRemovers.clear();
      styleRemovers.set(css, injectStyle(id, css));
    },
    destroy: () => api.destroy(),
  };

  function resolveTargets() {
    const found = {};
    const missing = [];
    Object.keys(def.targets || {}).forEach((name) => {
      const el = qs(def.targets[name]);
      found[name] = el;
      if (!el) missing.push(name);
    });
    return { found, missing };
  }

  function urlMatches() {
    try { return !!def.match(window.location); } catch (e) { log.error('match failed', e); return false; }
  }

  /** Remove what the experiment applied (style, owned nodes, optional def.leave hook) without destroying the instance: it re-applies when the URL matches again. */
  function deactivate() {
    styleRemovers.forEach((rm) => rm());
    styleRemovers.clear();
    document.querySelectorAll(ownerSel).forEach((n) => n.remove());
    if (typeof def.leave === 'function') { try { def.leave(ctx); } catch (e) { log.error('leave failed', e); } }
  }

  function run(reason) {
    if (destroyed || running) return status;
    running = true;
    try {
      if (typeof def.match === 'function' && !urlMatches()) {
        // SPA navigation to a page the experiment does not target (the testing platform keeps the script alive): revert everything it owns.
        deactivate();
        setStatus('inactive', { reason: 'url' });
        return status;
      }
      const { found, missing } = resolveTargets();
      ctx.targets = found;
      if (missing.length) {
        setStatus('target-missing', { missing });
      } else {
        const res = def.apply(ctx, reason);
        if (res === true) setStatus('applied');
        else if (res === false) setStatus('target-missing', { missing: [] });
        else if (res && Array.isArray(res.missing)) setStatus('target-missing', { missing: res.missing });
        else setStatus('error', { error: 'apply() must return true, false or { missing: [...] }' });
      }
    } catch (e) {
      log.error('apply failed', e);
      setStatus('error', { error: String((e && e.message) || e) });
    } finally {
      if (watcher) watcher.flush(); // discard records caused by our own synchronous DOM work
      running = false;
      syncWatcher();
    }
    return status;
  }

  function wantsObserver() {
    const mode = def.observe === undefined ? 'when-needed' : def.observe;
    if (mode === false) return false;
    if (mode === 'persist') return true;
    return status !== 'applied'; // when-needed: only until the first successful apply
  }

  function syncWatcher() {
    if (destroyed) return;
    if (wantsObserver()) {
      if (!watcher) {
        watcher = createWatcher({
          scope: def.scope,
          targets: Object.keys(def.targets || {}).map((n) => def.targets[n]),
          isOwned,
          hasOwned,
          onChange: (reason) => run(reason),
        });
      }
      if (!watcher.active) watcher.start();
    } else if (watcher && watcher.active) watcher.stop();
  }

  const api = {
    id,
    get status() { return status; },
    get detail() { return detail; },
    get observing() { return !!(watcher && watcher.active); },
    /** Experiment ref given in the definition (e.g. "EXP-12"), used for tracking and checked by validation. */
    get ref() { return def.ref || null; },
    /** Declared target selectors (read-only copy), used by validation tooling. */
    get targets() { return { ...(def.targets || {}) }; },
    run: (reason = 'manual') => run(reason),
    /** Live options (defaults + overrides), read-only copy. */
    get config() { return ctx.config; },
    /** Change options at runtime (console / testing platform / QA): merges `patch` (a null value removes the override), persists for the session and re-applies. */
    setConfig(patch) {
      if (!patch || typeof patch !== 'object') return status;
      Object.keys(patch).forEach((k) => { if (patch[k] === null) delete overrides[k]; else overrides[k] = patch[k]; });
      store.set('config', overrides);
      return run('config');
    },
    /** Swap in a newer definition (e.g. the same experiment injected twice) without duplicating resources. */
    update(next) {
      const targetsChanged = JSON.stringify(next.targets || {}) !== JSON.stringify(def.targets || {}) || next.scope !== def.scope;
      Object.assign(def, next);
      if (targetsChanged && watcher) { watcher.stop(); watcher = null; }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (watcher) watcher.stop();
      events.destroy();
      sent.clear(); armed.clear();
      store.remove('config');
      cleanups.splice(0).reverse().forEach((fn) => { try { fn(); } catch (e) { log.error('cleanup failed', e); } });
      styleRemovers.forEach((rm) => rm());
      styleRemovers.clear();
      document.querySelectorAll(ownerSel).forEach((n) => n.remove()); // only nodes this experiment owns
      delete instances()[id];
      setStatus('destroyed');
    },
  };
  return api;
}

/**
 * def: { id, ref?, targets: {name: selector}, apply(ctx, reason) -> true|false|{missing}, scope?, observe?, onStatus?, config?, match?, leave? }
 * match(location) -> boolean: pages the experiment applies to. On a SPA navigation to another page it reverts (status 'inactive', def.leave(ctx) for extra cleanup) and re-applies when the URL matches again.
 * config: plain-object defaults exposed as ctx.config; overridable at runtime with instance.setConfig({ ... }) (session-persisted).
 * ref: free-form experiment reference from your tracker ("EXP-12", "FR #86"), required only when the experiment tracks (ctx.track / ctx.trackWhenVisible).
 * observe: 'when-needed' (default; observe until first applied) | 'persist' (keep re-applying after re-renders) | false.
 */
export function defineExperiment(def) {
  if (!def || !ID_RE.test(def.id || '')) throw new Error('defineExperiment: id must match /^[a-z0-9][a-z0-9-]*$/');
  if (typeof def.apply !== 'function') throw new Error('defineExperiment: apply must be a function');
  if (def.ref !== undefined && !isRef(def.ref)) throw new Error('defineExperiment: ref must be a non-empty string (e.g. "EXP-12")');
  if (def.observe !== undefined && !OBSERVE_MODES.includes(def.observe)) throw new Error("defineExperiment: observe must be 'when-needed', 'persist' or false");
  return {
    id: def.id,
    /** Start (or re-run) the experiment. Returns the live instance; check instance.status. */
    start() {
      const reg = instances();
      const existing = reg[def.id];
      if (existing) { existing.update(def); existing.run('restart'); return existing; }
      const inst = build({ ...def });
      reg[def.id] = inst;
      inst.run('start');
      return inst;
    },
    destroy() { const inst = instances()[def.id]; if (inst) inst.destroy(); },
  };
}
