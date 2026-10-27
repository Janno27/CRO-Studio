import { NS } from './namespace.js';

const ATTR = `data-${NS}-style`;

/** Inject (or replace) the experiment's single <style> tag. Returns a remover. */
export function injectStyle(id, css) {
  const old = document.querySelector(`style[${ATTR}="${id}"]`);
  if (old) old.remove();
  const el = document.createElement('style');
  el.setAttribute(ATTR, id);
  el.textContent = css;
  (document.head || document.documentElement).appendChild(el);
  return () => el.remove();
}

const scopedPrefixes = (id, ns = NS) => [`.${ns}-${id}`, `#${ns}-${id}`, `[data-${ns}-${id}`];

/**
 * Verify every rule selector is prefixed with the experiment namespace
 * (.<namespace>-<id>, #<namespace>-<id>, [data-<namespace>-<id>]). @keyframes bodies and at-rule preludes are skipped.
 * @returns {{ok:boolean, offenders:string[]}}
 */
export function assertScoped(css, id, ns = NS) {
  const prefixes = scopedPrefixes(id, ns);
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const offenders = [];
  const re = /([^{}]*)([{}])/g;
  let m, depth = 0, keyframesDepth = null;
  while ((m = re.exec(src))) {
    const p = m[1].trim();
    if (m[2] === '}') {
      depth--;
      if (keyframesDepth !== null && depth < keyframesDepth) keyframesDepth = null;
      continue;
    }
    depth++;
    if (p.startsWith('@')) { if (/^@(-\w+-)?keyframes/i.test(p)) keyframesDepth = depth; continue; }
    if (keyframesDepth !== null) continue;
    p.split(',').map((s) => s.trim()).filter(Boolean).forEach((sel) => {
      if (!prefixes.some((pre) => sel.startsWith(pre))) offenders.push(sel);
    });
  }
  return { ok: offenders.length === 0, offenders };
}
