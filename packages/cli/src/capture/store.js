// Capture store: one directory per capture under <capturesDir>/<date>/<captureId>/ (git-ignored: captures can hold sensitive content).
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { sanitizeHtml, sanitizeUrl, sanitizeText } from './sanitize.js';

export const CLASSIFICATIONS = ['verified-unique', 'verified-non-unique', 'fragile', 'not-tested', 'not-found', 'wrong-element', 'invalid'];
const pad = (n) => String(n).padStart(2, '0');
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

export const slugify = (s) => String(s || 'capture').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'capture';

/** Market id whose hosts include `hostname`, or null (unknown hosts must not be assigned a market silently). */
export const detectMarket = (hostname, config) => {
  const h = String(hostname || '').toLowerCase();
  const m = config.markets.find((x) => x.hosts.some((x2) => x2.toLowerCase() === h));
  return m ? m.id : null;
};

export function validateMetadata(m, config) {
  const e = [];
  if (!isObj(m)) return ['metadata: must be an object'];
  if (m.schemaVersion !== 2) e.push('metadata.schemaVersion: must be 2');
  for (const k of ['captureId', 'capturedAt', 'url', 'captureMethod']) if (typeof m[k] !== 'string' || !m[k]) e.push(`metadata.${k}: required string`);
  if (m.market !== null && !config.markets.some((x) => x.id === m.market)) e.push(`metadata.market: one of ${config.markets.map((x) => x.id).join('|')} (or null when the host is not configured)`);
  if (!config.pageTypes.includes(m.pageType)) e.push(`metadata.pageType: one of ${config.pageTypes.join('|')}`);
  if (!isObj(m.viewport) || typeof m.viewport.width !== 'number') e.push('metadata.viewport: {width,height} required');
  if (!Array.isArray(m.limitations)) e.push('metadata.limitations: array required');
  if (/(cookie|authorization|bearer\s)/i.test(JSON.stringify(m))) e.push('metadata: contains secret-like keyword');
  return e;
}

export function validateTargets(targets) {
  const e = [];
  if (!Array.isArray(targets)) return ['targets: must be an array'];
  targets.forEach((t, i) => {
    const p = `targets[${i}]`;
    if (!isObj(t)) return e.push(`${p}: must be an object`);
    if (!t.name) e.push(`${p}.name: required`);
    if (!t.selector) e.push(`${p}.selector: required`);
    if (typeof t.found !== 'boolean') e.push(`${p}.found: boolean required`);
    if (typeof t.matchCount !== 'number') e.push(`${p}.matchCount: number required`);
    if (t.found) {
      if (!Array.isArray(t.candidates)) e.push(`${p}.candidates: array required`);
      else t.candidates.forEach((c, j) => { if (!CLASSIFICATIONS.includes(c.classification)) e.push(`${p}.candidates[${j}].classification: invalid`); });
    } else if (!t.error) e.push(`${p}.error: required when not found`);
  });
  return e;
}

function sanitizeDeep(v, opts) {
  if (typeof v === 'string') return sanitizeText(v, opts);
  if (Array.isArray(v)) return v.map((x) => sanitizeDeep(x, opts));
  if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sanitizeDeep(x, opts)]));
  return v;
}

/**
 * Persist a raw collector result (page capture, or survey when raw.kind === 'survey'). Throws a readable Error on malformed input.
 * @returns {{dir:string, captureId:string, warnings:string[]}}
 */
export function saveCapture(raw, { config, root = '.', now = new Date(), name, screenshot, share = false, limitations = [], market, pageType } = {}) {
  if (!isObj(raw)) throw new Error('malformed capture: not an object');
  if (raw.error) throw new Error(`collector reported error: ${raw.error}`);
  if (raw.schemaVersion !== 2 || !raw.meta) throw new Error('malformed capture: schemaVersion 2 and meta are required');
  const isSurvey = raw.kind === 'survey';
  if (!isSurvey && !Array.isArray(raw.targets)) throw new Error('malformed capture: targets[] is required');
  const opts = { mode: share ? 'share' : 'local' };
  const mk = market !== undefined ? market : raw.meta.market;
  const pt = pageType || raw.meta.pageType;

  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const slug = slugify(name || (isSurvey ? 'survey' : raw.targets[0] && raw.targets[0].name));
  const base = join(root, config.capturesDir, date, `${mk || 'unknown'}-${pt}-${slug}-${time}`);
  let dir = base;
  for (let n = 2; existsSync(dir); n++) dir = `${base}-${n}`;
  const captureId = basename(dir);

  const targets = isSurvey ? [] : raw.targets.map((t) => {
    const c = structuredClone(t);
    if (c.outerHTML) c.outerHTML = sanitizeHtml(c.outerHTML, opts);
    if (c.attributes) Object.keys(c.attributes).forEach((k) => { c.attributes[k] = sanitizeText(c.attributes[k], opts); });
    return c;
  });
  const warnings = targets.filter((t) => !t.found).map((t) => `target "${t.name}" not found (${t.selector})`);
  const lim = [...limitations];
  if (raw.meta.hadQueryString) lim.push('URL query string removed from the stored url');
  if (targets.some((t) => t.htmlTruncated)) lim.push('one or more target outerHTML values were truncated');
  if (targets.some((t) => t.dynamicallyRendered === null)) lim.push('dynamic-render check unavailable for some targets');
  if (share) lim.push('stored in share (strict-sanitized) mode');
  if (mk === null) lim.push('host is not listed in any configured market');

  const metadata = {
    schemaVersion: 2, captureId, kind: isSurvey ? 'survey' : 'page', capturedAt: raw.capturedAt || now.toISOString(),
    url: sanitizeUrl(raw.meta.url), title: sanitizeText(raw.meta.title, opts), market: mk, pageType: pt,
    locale: raw.meta.locale, viewport: raw.meta.viewport, browser: { userAgent: raw.meta.userAgent }, frameworkHints: raw.meta.frameworkHints,
    captureMethod: 'cro-studio capture (playwright)', sanitizeMode: opts.mode,
    targetsFound: targets.filter((t) => t.found).length, targetsRequested: targets.length, limitations: lim,
  };
  const errs = [...validateMetadata(metadata, config), ...validateTargets(targets)];
  if (errs.length) throw new Error(`invalid capture:\n  ${errs.join('\n  ')}`);

  mkdirSync(dir, { recursive: true });
  const write = (f, v) => writeFileSync(join(dir, f), JSON.stringify(v, null, 2) + '\n');
  write('metadata.json', metadata);
  if (isSurvey) write('survey.json', sanitizeDeep({ landmarks: raw.landmarks, sections: raw.sections, controls: raw.controls, componentClasses: raw.componentClasses, palette: raw.palette, tracking: raw.tracking }, opts));
  else {
    write('targets.json', targets.map((t) => { const c = { ...t }; delete c.outerHTML; delete c.styles; return c; }));
    write('computed-styles.json', Object.fromEntries(targets.filter((t) => t.found).map((t) => [t.name, t.styles])));
    write('dom-summary.json', sanitizeDeep({ landmarks: raw.landmarks, sections: raw.sections, controls: raw.controls, tagCounts: raw.tagCounts }, opts));
    writeFileSync(join(dir, 'dom.html'), targets.filter((t) => t.found).map((t) => `<!-- target: ${t.name} | ${t.selector} -->\n${t.outerHTML}`).join('\n\n'));
  }
  if (screenshot && existsSync(screenshot)) copyFileSync(screenshot, join(dir, 'screenshot.png'));
  return { dir, captureId, warnings };
}

export function listCaptures(root, config) {
  const base = join(root, config.capturesDir);
  const out = [];
  if (!existsSync(base)) return out;
  for (const date of readdirSync(base).sort()) {
    const dd = join(base, date);
    if (!statSync(dd).isDirectory()) continue;
    for (const id of readdirSync(dd).sort()) {
      const mf = join(dd, id, 'metadata.json');
      if (!existsSync(mf)) continue;
      const m = JSON.parse(readFileSync(mf, 'utf8'));
      out.push({ captureId: m.captureId, date, dir: join(dd, id), kind: m.kind, market: m.market, pageType: m.pageType, url: m.url, targets: `${m.targetsFound}/${m.targetsRequested}` });
    }
  }
  return out;
}

export function findCapture(idOrPath, root, config) {
  if (idOrPath && existsSync(join(idOrPath, 'metadata.json'))) return resolve(idOrPath);
  const hit = listCaptures(root, config).find((c) => c.captureId === idOrPath);
  if (!hit) throw new Error(`capture not found: ${idOrPath}`);
  return resolve(hit.dir);
}

export const readCapture = (dir) => ({
  metadata: JSON.parse(readFileSync(join(dir, 'metadata.json'), 'utf8')),
  targets: existsSync(join(dir, 'targets.json')) ? JSON.parse(readFileSync(join(dir, 'targets.json'), 'utf8')) : [],
});

/** Validate a stored capture directory. Returns a list of problems. */
export function validateCaptureDir(dir, config) {
  const { metadata, targets } = readCapture(dir);
  return [...validateMetadata(metadata, config), ...validateTargets(targets)];
}

/**
 * Stamp selectors.json of an experiment with what a capture proved: status from the selector assessment, capture id as evidence.
 * Targets match selectors.json entries by name, else by identical selector string. Returns what changed and what was skipped.
 */
export function applyEvidence(captureDir, selectorsFile) {
  const { metadata, targets } = readCapture(captureDir);
  const sels = JSON.parse(readFileSync(selectorsFile, 'utf8'));
  const changed = []; const skipped = [];
  const MAP = { 'verified-unique': 'verified-unique', 'verified-non-unique': 'verified-non-unique', fragile: 'fragile' };
  sels.forEach((s) => {
    const t = targets.find((x) => x.name === s.name) || targets.find((x) => x.selector === s.selector);
    if (!t) return;
    const cls = t.found && t.selectorAssessment ? t.selectorAssessment.classification : 'not-found';
    if (!MAP[cls]) { skipped.push(`${s.name}: ${cls} on ${metadata.captureId}, selector left unchanged`); return; }
    if (Array.isArray(s.markets) && metadata.market && !s.markets.includes(metadata.market)) skipped.push(`${s.name}: capture market "${metadata.market}" is not listed in the selector markets`);
    s.status = MAP[cls];
    s.evidence = [...new Set([...(Array.isArray(s.evidence) ? s.evidence : []), metadata.captureId])];
    changed.push(`${s.name}: ${MAP[cls]}`);
  });
  if (changed.length) writeFileSync(selectorsFile, JSON.stringify(sels, null, 2) + '\n');
  return { changed, skipped };
}
