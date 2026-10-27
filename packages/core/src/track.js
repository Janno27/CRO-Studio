// Tracking: the event shape is NOT hard-coded. It comes from cro-studio.config.json (`tracking`), compiled into the payload:
//   { mode: 'datalayer', dataLayer: 'dataLayer', template: { event: 'ab_test', section: '{section}' } }   push a rendered template
//   { mode: 'hook', hook: 'window.myAnalytics.track' }                                                   call your own function
//   { mode: 'none' }                                                                                       never send anything
// Template placeholders (string values, any depth): {id} {ref} {label} {section}  ({section} = "<ref> - <label>").
import { TRACKING } from './namespace.js';

const LABEL_RE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const PLACEHOLDER_RE = /\{(id|ref|label|section)\}/g;

export const isRef = (ref) => typeof ref === 'string' && ref.trim().length > 0 && ref.length <= 64;

export function sectionType(ref, label) {
  if (!isRef(ref)) throw new Error(`tracking: invalid ref "${ref}" (set \`ref\` in defineExperiment, e.g. "EXP-12")`);
  if (!LABEL_RE.test(String(label))) throw new Error(`tracking: label "${label}" must be snake_case (a-z, 0-9, _), e.g. compact_comparison_table`);
  return `${ref.trim()} - ${label}`;
}

/** Render a template: replaces placeholders in every string value, recursively. Pure; does not mutate the template. */
export function renderTemplate(tpl, vars) {
  if (typeof tpl === 'string') return tpl.replace(PLACEHOLDER_RE, (_, k) => String(vars[k]));
  if (Array.isArray(tpl)) return tpl.map((x) => renderTemplate(x, vars));
  if (tpl && typeof tpl === 'object') {
    const out = {};
    Object.keys(tpl).forEach((k) => { out[k] = renderTemplate(tpl[k], vars); });
    return out;
  }
  return tpl;
}

export function buildEvent({ id, ref, label }, tracking = TRACKING) {
  const vars = { id, ref: String(ref).trim(), label, section: sectionType(ref, label) };
  return renderTemplate(tracking.template || {}, vars);
}

function resolveHook(path) {
  const parts = String(path || '').replace(/^window\./, '').split('.').filter(Boolean);
  let cur = window;
  for (const p of parts) { if (cur == null) return null; cur = cur[p]; }
  return typeof cur === 'function' ? { fn: cur, thisArg: parts.length > 1 ? parts.slice(0, -1).reduce((o, p) => o[p], window) : window } : null;
}

/** Send one tracking event according to the compiled config. Never throws into the host page. Returns true if something was sent. */
export function sendEvent(vars, tracking = TRACKING) {
  try {
    const payload = { id: vars.id, ref: String(vars.ref).trim(), label: vars.label, section: sectionType(vars.ref, vars.label) };
    if (tracking.mode === 'datalayer') {
      const name = tracking.dataLayer || 'dataLayer';
      window[name] = window[name] || [];
      window[name].push(buildEvent(vars, tracking));
      return true;
    }
    if (tracking.mode === 'hook') {
      const h = resolveHook(tracking.hook);
      if (!h) return false;
      h.fn.call(h.thisArg, payload);
      return true;
    }
    return false;
  } catch (e) { return false; }
}

/** Share of the element's height inside the viewport (0..1). Elements taller than twice the viewport can never reach 0.5, so
 *  `tall` fallback: for those, the share of the VIEWPORT covered by the element is used instead. */
export function visibleShare(el, { tall = true } = {}) {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  if (!(r.height > 0) || !(vh > 0)) return 0;
  const visible = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
  const own = visible / r.height;
  return tall && r.height > 2 * vh ? Math.max(own, visible / vh) : own;
}
