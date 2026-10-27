// cro-studio.config.json: loading, defaults and validation. Everything project-specific lives here.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

export const CONFIG_FILE = 'cro-studio.config.json';

export const DEFAULTS = Object.freeze({
  project: { name: 'My project' },
  namespace: 'cro',
  experimentsDir: 'experiments',
  outDir: 'dist',
  capturesDir: 'captures',
  ids: { pattern: '^[a-z0-9][a-z0-9-]*$', example: 'checkout-trust-badges' },
  markets: [{ id: 'main', hosts: ['www.example.com'], locale: 'en' }],
  pageTypes: ['home', 'category', 'product', 'cart', 'checkout', 'other'],
  platform: { target: 'generic' },
  tracking: { mode: 'datalayer', dataLayer: 'dataLayer', template: { event: 'cro_experiment', experiment_ref: '{ref}', experiment_label: '{label}' } },
  brief: { source: 'conversation', mcp: null },
  design: { figma: { mcp: 'figma' }, storybook: { enabled: false, url: null } },
  reviews: { design: false, engineer: false },
  browser: { headless: true },
});

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const merge = (base, over) => {
  if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
  const out = { ...base };
  Object.keys(over).forEach((k) => { out[k] = k in base ? merge(base[k], over[k]) : over[k]; });
  return out;
};

/** @returns {string[]} human-readable problems; empty when the config is valid. */
export function validateConfig(cfg) {
  const e = [];
  if (!isObj(cfg)) return ['config must be a JSON object'];
  if (typeof cfg.namespace !== 'string' || !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(cfg.namespace)) e.push('namespace: lowercase letters/digits/hyphens, starting with a letter (e.g. "cro", "acme-cro")');
  try { new RegExp(cfg.ids.pattern); } catch { e.push('ids.pattern: not a valid regular expression'); }
  if (!Array.isArray(cfg.markets) || !cfg.markets.length) e.push('markets: at least one market is required');
  else {
    const seen = new Set();
    cfg.markets.forEach((m, i) => {
      if (!isObj(m) || !/^[a-z0-9][a-z0-9-]*$/.test(m.id || '')) e.push(`markets[${i}].id: lowercase id required`);
      else if (seen.has(m.id)) e.push(`markets[${i}].id: duplicate "${m.id}"`); else seen.add(m.id);
      if (!isObj(m) || !Array.isArray(m.hosts) || !m.hosts.length || m.hosts.some((h) => typeof h !== 'string' || /[/\s:]/.test(h))) e.push(`markets[${i}].hosts: list of bare hostnames (no scheme, path or port)`);
    });
  }
  if (!Array.isArray(cfg.pageTypes) || !cfg.pageTypes.length) e.push('pageTypes: non-empty list required');
  if (!['datalayer', 'hook', 'none'].includes(cfg.tracking.mode)) e.push('tracking.mode: datalayer | hook | none');
  if (cfg.tracking.mode === 'datalayer' && !isObj(cfg.tracking.template)) e.push('tracking.template: object required for mode "datalayer"');
  if (cfg.tracking.mode === 'hook' && !/^(window\.)?[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(cfg.tracking.hook || '')) e.push('tracking.hook: a global function path such as "window.analytics.track"');
  if (cfg.platform.target !== 'generic') e.push('platform.target: only "generic" is supported in this version');
  return e;
}

export function findConfigFile(cwd = process.cwd()) {
  let dir = resolve(cwd);
  for (;;) {
    const f = join(dir, CONFIG_FILE);
    if (existsSync(f)) return f;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** Load the project config (defaults + file). Throws with an actionable message. `root` is the folder holding the config. */
export function loadConfig(cwd = process.cwd()) {
  const file = findConfigFile(cwd);
  if (!file) throw new Error(`no ${CONFIG_FILE} found (run \`npx cro-studio init\` in your project folder)`);
  let raw;
  try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new Error(`${CONFIG_FILE} is not valid JSON: ${e.message}`, { cause: e }); }
  const config = merge(structuredClone(DEFAULTS), raw);
  // lists in the file replace the defaults instead of merging element-wise
  ['markets', 'pageTypes'].forEach((k) => { if (Array.isArray(raw[k])) config[k] = raw[k]; });
  const problems = validateConfig(config);
  if (problems.length) throw new Error(`invalid ${CONFIG_FILE}:\n  - ${problems.join('\n  - ')}`);
  return { config, root: dirname(file), file };
}

export function writeConfig(root, config) {
  writeFileSync(join(root, CONFIG_FILE), JSON.stringify({ $schema: './node_modules/cro-studio/schema/cro-studio.config.schema.json', ...config }, null, 2) + '\n');
}
