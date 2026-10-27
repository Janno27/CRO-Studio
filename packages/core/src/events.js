// Listener registry for one experiment: de-duplicates registrations and removes everything on destroy.
export function createEvents() {
  const regs = [];
  const delegates = [];

  function on(target, type, fn, opts) {
    const dup = regs.find((r) => r.target === target && r.type === type && r.fn === fn);
    if (dup) return dup.off;
    target.addEventListener(type, fn, opts);
    const reg = { target, type, fn, opts };
    reg.off = () => {
      const i = regs.indexOf(reg);
      if (i >= 0) { regs.splice(i, 1); target.removeEventListener(type, fn, opts); }
    };
    regs.push(reg);
    return reg.off;
  }

  /** One real listener per (root,type); handlers matched with closest(selector). */
  function delegate(root, type, selector, fn) {
    let d = delegates.find((x) => x.root === root && x.type === type);
    if (!d) {
      d = { root, type, handlers: [] };
      d.listener = (e) => {
        let t = e.target;
        if (t && t.nodeType !== 1) t = t.parentElement;
        if (!t || !t.closest) return;
        d.handlers.slice().forEach((h) => {
          const el = t.closest(h.selector);
          if (el && root.contains(el)) h.fn(e, el);
        });
      };
      root.addEventListener(type, d.listener);
      delegates.push(d);
    }
    if (!d.handlers.some((h) => h.selector === selector && h.fn === fn)) d.handlers.push({ selector, fn });
    return () => { d.handlers = d.handlers.filter((h) => !(h.selector === selector && h.fn === fn)); };
  }

  function destroy() {
    regs.slice().forEach((r) => r.off());
    delegates.splice(0).forEach((d) => d.root.removeEventListener(d.type, d.listener));
  }

  return { on, delegate, destroy, size: () => regs.length + delegates.length };
}
