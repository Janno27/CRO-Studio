import { NS } from './namespace.js';

const DEBUG_PARAM = `${NS.replace(/[^a-z0-9]+/gi, '_')}_debug`;
// Namespaced diagnostics. Silent unless debug is enabled (?<namespace>_debug=1 or localStorage '<namespace>-debug' = '1').
export function debugEnabled() {
  try { if (new RegExp(`[?&]${DEBUG_PARAM}=1(&|$)`).test(window.location.search)) return true; } catch (e) { /* ignore */ }
  try { return window.localStorage.getItem(`${NS}-debug`) === '1'; } catch (e) { return false; }
}

export function createLogger(id) {
  const prefix = `[${NS}:${id}]`;
  const out = (level, args) => {
    if (!debugEnabled()) return;
    try { console[level](prefix, ...args); } catch (e) { /* ignore */ }
  };
  return {
    debug: (...a) => out('debug', a),
    info: (...a) => out('info', a),
    error: (...a) => out('error', a),
  };
}
