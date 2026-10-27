// Experiment folders: <experimentsDir>/<id>/{brief.md, selectors.json, variant.js, styles.css}
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';

export const REQUIRED_FILES = ['brief.md', 'selectors.json', 'variant.js', 'styles.css'];
const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

export const globalKeyFor = (ns) => `__${ns.replace(/[^a-z0-9]+/gi, '_')}`;

export function splitFrontMatter(text) {
  const m = String(text).match(FM);
  if (!m) return { meta: null, body: String(text), error: 'brief.md must start with a YAML front matter block (--- ... ---)' };
  let meta;
  try { meta = parse(m[1]); } catch (e) { return { meta: null, body: text.slice(m[0].length), error: `invalid YAML front matter: ${String(e.message).split('\n')[0]}` }; }
  if (!isObj(meta)) return { meta: null, body: text.slice(m[0].length), error: 'front matter must be a YAML mapping' };
  return { meta, body: text.slice(m[0].length) };
}

export const joinFrontMatter = (meta, body) => `---\n${stringify(meta, { lineWidth: 0 }).trimEnd()}\n---\n${body}`;

export function readBrief(dir) {
  const f = join(dir, 'brief.md');
  return existsSync(f) ? splitFrontMatter(readFileSync(f, 'utf8')) : { meta: null, body: '', error: 'brief.md missing' };
}

export function listExperiments(root, config) {
  const dir = join(root, config.experimentsDir);
  if (!existsSync(dir)) return [];
  const re = new RegExp(config.ids.pattern);
  return readdirSync(dir).filter((d) => re.test(d) && statSync(join(dir, d)).isDirectory()).sort().map((d) => join(dir, d));
}

/** Resolve an experiment by folder id (case-insensitive) or by `ref` from the brief. Returns the directory or null. */
export function resolveExperiment(idOrRef, root, config) {
  const dir = join(root, config.experimentsDir);
  if (!existsSync(dir)) return null;
  const want = String(idOrRef || '').trim().toLowerCase();
  if (!want) return null;
  const names = readdirSync(dir).filter((d) => statSync(join(dir, d)).isDirectory());
  const exact = names.find((d) => d.toLowerCase() === want);
  if (exact) return join(dir, exact);
  const byRef = names.find((d) => { const { meta } = readBrief(join(dir, d)); return meta && meta.ref && String(meta.ref).toLowerCase() === want; });
  return byRef ? join(dir, byRef) : null;
}
