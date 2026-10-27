/* global __CRO_NS__, __CRO_TRACKING__ */
// Build-time settings. `cro-studio build` injects them with esbuild `define` from cro-studio.config.json;
// when the sources run unbundled (tests, tooling) the defaults below apply.
export const NS = typeof __CRO_NS__ === 'string' ? __CRO_NS__ : 'cro';
/** The single global a payload may create, e.g. window.__cro (namespace "cro") or window.__acme_cro ("acme-cro"). */
export const GLOBAL_KEY = `__${NS.replace(/[^a-z0-9]+/gi, '_')}`;
export const TRACKING = typeof __CRO_TRACKING__ === 'object' && __CRO_TRACKING__
  ? __CRO_TRACKING__
  : { mode: 'datalayer', dataLayer: 'dataLayer', template: { event: 'cro_experiment', experiment_ref: '{ref}', experiment_label: '{label}' } };
