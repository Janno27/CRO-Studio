import { NS } from './namespace.js';

// Optional session-scoped persistence (e.g. "banner dismissed"). Falls back to memory when storage is blocked.
export function sessionStore(id) {
  const prefix = `${NS}:${id}:`;
  const mem = new Map();
  const storage = () => { try { return window.sessionStorage; } catch (e) { return null; } };
  return {
    get(key, fallback = null) {
      const s = storage();
      try {
        const raw = s ? s.getItem(prefix + key) : null;
        if (raw !== null) return JSON.parse(raw);
      } catch (e) { /* fall through to memory */ }
      return mem.has(key) ? mem.get(key) : fallback;
    },
    set(key, value) {
      mem.set(key, value);
      try { const s = storage(); if (s) s.setItem(prefix + key, JSON.stringify(value)); } catch (e) { /* memory only */ }
    },
    remove(key) {
      mem.delete(key);
      try { const s = storage(); if (s) s.removeItem(prefix + key); } catch (e) { /* ignore */ }
    },
  };
}
