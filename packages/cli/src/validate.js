// Static + dynamic validation of an experiment. Checks are safeguards, not proof: they never replace a human preview
// on the real site, and a passing build never implies compatibility with a given testing platform.
import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { JSDOM } from 'jsdom';
import { assertScoped } from '@cro-studio/core/style';
import { REQUIRED_FILES, readBrief, globalKeyFor } from './experiment.js';
import { BRIEF_SECTIONS } from './templates.js';

const STATUSES = ['draft', 'ready'];
const SEL_STATUS = ['verified-unique', 'verified-non-unique', 'fragile', 'not-tested', 'conditional'];
const ROLES = ['target', 'guard', 'context'];
const REVIEW_STATES = ['pending', 'approved', 'skipped', 'changes-requested'];
const LABEL_RE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

export class Result {
  constructor() { this.checks = []; }
  add(name, status, detail = '') { this.checks.push({ name, status, detail }); }
  pass(n, d) { this.add(n, 'pass', d); }
  fail(n, d) { this.add(n, 'fail', d); }
  warn(n, d) { this.add(n, 'warn', d); }
  get errors() { return this.checks.filter((c) => c.status === 'fail'); }
  get warnings() { return this.checks.filter((c) => c.status === 'warn'); }
  get ok() { return this.errors.length === 0; }
  merge(o) { this.checks.push(...o.checks); return this; }
}

export const summarize = (r) => ({ status: r.ok ? (r.warnings.length ? 'pass-with-warnings' : 'pass') : 'fail', errors: r.errors.length, warnings: r.warnings.length, checks: r.checks });

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Source checks: structure, brief, selectors, CSS scope, variant.js AST. No build needed. */
export function validateSources(dir, config) {
  const r = new Result();
  const id = basename(dir);
  const ns = config.namespace;
  const missing = REQUIRED_FILES.filter((f) => !existsSync(join(dir, f)));
  if (missing.length) { r.fail('required-files', `missing: ${missing.join(', ')}`); return { r, meta: null, selectors: null }; }
  r.pass('required-files', REQUIRED_FILES.join(', '));

  const { meta, body, error } = readBrief(dir);
  if (error) { r.fail('brief-front-matter', error); return { r, meta: null, selectors: null }; }
  const errs = [];
  if (!new RegExp(config.ids.pattern).test(id)) errs.push(`folder "${id}" must match ${config.ids.pattern} (e.g. ${config.ids.example})`);
  if (meta.id !== id) errs.push(`front matter id "${meta.id}" must equal the folder name "${id}"`);
  if (typeof meta.name !== 'string' || !meta.name.trim()) errs.push('name is required');
  if (!STATUSES.includes(meta.status)) errs.push(`status must be one of ${STATUSES.join('|')}`);
  const marketIds = config.markets.map((m) => m.id);
  if (!Array.isArray(meta.markets) || !meta.markets.length) errs.push('markets must be a non-empty list');
  else { const bad = meta.markets.filter((m) => !marketIds.includes(m)); if (bad.length) errs.push(`unknown market(s) ${bad.join(', ')} (configured: ${marketIds.join(', ')})`); }
  if (!Array.isArray(meta.pageTypes) || !meta.pageTypes.length) errs.push('pageTypes must be a non-empty list');
  else { const bad = meta.pageTypes.filter((p) => !config.pageTypes.includes(p)); if (bad.length) errs.push(`unknown pageType(s) ${bad.join(', ')} (configured: ${config.pageTypes.join(', ')})`); }
  if (meta.ref != null && (typeof meta.ref !== 'string' || !meta.ref.trim())) errs.push('ref must be a non-empty string or null');
  const tr = meta.tracking;
  if (tr !== undefined) {
    if (!isObj(tr)) errs.push('tracking must be a mapping');
    else {
      if (tr.required === true && config.tracking.mode === 'none') errs.push('tracking.required is true but tracking.mode is "none" in the config');
      if (tr.required === true && !meta.ref) errs.push('tracking is required: set a ref in the front matter and in defineExperiment');
      (Array.isArray(tr.events) ? tr.events : []).forEach((e, i) => { if (!isObj(e) || !LABEL_RE.test(e.label || '')) errs.push(`tracking.events[${i}].label must be snake_case`); });
    }
  }
  ['design', 'engineer'].forEach((k) => {
    const v = meta.reviews && meta.reviews[k];
    if (v !== undefined && !REVIEW_STATES.includes(v)) errs.push(`reviews.${k} must be one of ${REVIEW_STATES.join('|')}`);
    if (config.reviews[k] && meta.status === 'ready' && v !== 'approved') errs.push(`reviews.${k} must be "approved" before status "ready" (enabled in the config)`);
  });
  if (errs.length) r.fail('brief-metadata', errs.join('; ')); else r.pass('brief-metadata', `${meta.markets.join(',')} / ${meta.pageTypes.join(',')}`);
  const sections = BRIEF_SECTIONS.filter((s) => !new RegExp(`^##\\s+${s}\\s*$`, 'mi').test(body));
  if (sections.length) r.warn('brief-sections', `missing section(s): ${sections.join(', ')}`);
  if (meta.status === 'ready' && /^Unknown\s*$/m.test(body)) r.warn('brief-unknown', 'status is "ready" but the brief still contains "Unknown"');
  if (config.design.figma && meta.status === 'ready' && !(meta.design && meta.design.figma)) r.warn('design-figma', 'no Figma link in design.figma (Figma is part of the workflow)');

  let selectors = null;
  try { selectors = JSON.parse(readFileSync(join(dir, 'selectors.json'), 'utf8')); } catch (e) { r.fail('selectors.json', `invalid JSON: ${e.message}`); }
  if (selectors) {
    const se = [];
    if (!Array.isArray(selectors) || !selectors.length) se.push('must be a non-empty array');
    else {
      const doc = new JSDOM('<!doctype html><body></body>').window.document;
      const names = new Set();
      selectors.forEach((s, i) => {
        const p = `[${i}]${s && s.name ? ` ${s.name}` : ''}`;
        if (!isObj(s)) return se.push(`${p}: must be an object`);
        if (!/^[A-Za-z][\w-]*$/.test(s.name || '')) se.push(`${p}: name required (identifier)`); else if (names.has(s.name)) se.push(`${p}: duplicate name`); else names.add(s.name);
        try { doc.querySelector(s.selector); } catch { se.push(`${p}: invalid CSS selector "${s.selector}"`); }
        if (/\.(css-|sc-|jsx-)[\w-]+|:nth-child\(\d+\)\s*$/.test(s.selector || '')) se.push(`${p}: selector looks generated/positional (fragile)`);
        if (!SEL_STATUS.includes(s.status)) se.push(`${p}: status must be one of ${SEL_STATUS.join('|')}`);
        if (!ROLES.includes(s.role)) se.push(`${p}: role must be one of ${ROLES.join('|')}`);
        if (!Array.isArray(s.markets) || s.markets.some((m) => !meta.markets.includes(m))) se.push(`${p}: markets must be a subset of the brief markets`);
        if (!Array.isArray(s.pageTypes) || s.pageTypes.some((t) => !meta.pageTypes.includes(t))) se.push(`${p}: pageTypes must be a subset of the brief pageTypes`);
        if (s.status && s.status.startsWith('verified') && !(Array.isArray(s.evidence) && s.evidence.length)) se.push(`${p}: "${s.status}" needs evidence (capture id, URL or note)`);
      });
    }
    if (se.length) r.fail('selectors.json', se.join('; ')); else r.pass('selectors.json', `${selectors.length} selector(s)`);
    const unverified = Array.isArray(selectors) ? selectors.filter((s) => s && s.status === 'not-tested') : [];
    if (unverified.length) r.warn('selectors-verified', `${unverified.length} selector(s) still "not-tested": verify them on the live page before shipping`);
  }

  const css = readFileSync(join(dir, 'styles.css'), 'utf8');
  const scope = assertScoped(css, id, ns);
  if (scope.ok) r.pass('css-scoped', `all selectors prefixed with .${ns}-${id}`); else r.fail('css-scoped', `selectors outside .${ns}-${id}: ${scope.offenders.join(' | ')}`);
  if (/!important/.test(css)) r.warn('css-important', 'avoid !important unless a host rule forces it');

  analyzeVariant(readFileSync(join(dir, 'variant.js'), 'utf8'), id, r);
  return { r, meta, selectors };
}

function analyzeVariant(code, id, r) {
  let ast;
  try { ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' }); } catch (e) { r.fail('variant-parse', e.message); return; }
  const bad = []; const errors = []; const warns = [];
  ast.body.filter((n) => n.type === 'ImportDeclaration').forEach((n) => {
    const s = n.source.value;
    if (!(s === '@cro-studio/core' || s.startsWith('./'))) bad.push(s);
  });
  if (bad.length) r.fail('imports-local', `only "@cro-studio/core" and "./" imports are allowed (payloads are dependency-free): ${bad.join(', ')}`); else r.pass('imports-local', 'ok');
  let defines = 0;
  walk.full(ast, (n) => {
    if (n.type === 'CallExpression') {
      const c = n.callee;
      if (c.type === 'Identifier' && (c.name === 'eval' || c.name === 'Function')) errors.push(`${c.name}()`);
      if (c.type === 'Identifier' && c.name === 'defineExperiment') defines++;
      if (c.type === 'MemberExpression' && c.object.type === 'Identifier' && c.object.name === 'console' && c.property.name === 'log') warns.push('console.log (use ctx.log)');
      if (c.type === 'MemberExpression' && c.object.name === 'document' && c.property.name === 'write') errors.push('document.write');
    }
    if (n.type === 'NewExpression' && n.callee.type === 'Identifier' && n.callee.name === 'Function') errors.push('new Function()');
    if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && ['innerHTML', 'outerHTML'].includes(n.left.property.name)) errors.push(`${n.left.property.name} assignment (use create()/textContent)`);
    if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && n.left.object.name === 'window') errors.push(`window.${n.left.property.name || '?'} assignment (no globals)`);
  });
  const uniq = (a) => [...new Set(a)];
  if (errors.length) r.fail('forbidden-patterns', uniq(errors).join('; ')); else r.pass('forbidden-patterns', 'none found (AST checks)');
  uniq(warns).forEach((w) => r.warn('patterns', w));
  if (defines !== 1) r.fail('define-once', `variant.js must call defineExperiment exactly once (found ${defines})`); else r.pass('define-once', id);
}

const PAGE = '<!doctype html><body><main id="main"></main></body>';
const compound = /^([a-zA-Z][\w-]*)?(#[\w-]+)?((?:\.[\w-]+)*)((?:\[[\w-]+(?:="[^"]*")?\])*)$/;

/** Build a synthetic page from simple selectors so apply() can really run. Returns how many selectors could not be represented. */
export function populateFromSelectors(doc, selectors) {
  const main = doc.getElementById('main');
  let unsupported = 0;
  for (const entry of selectors) {
    let parent = main; let ok = true; const chain = [];
    for (const part of entry.selector.trim().split(/\s*>\s*|\s+/)) {
      const m = part.match(compound);
      if (!m || !part) { ok = false; break; }
      const el = doc.createElement(m[1] || 'div');
      if (m[2]) el.id = m[2].slice(1);
      (m[3] || '').split('.').filter(Boolean).forEach((c) => el.classList.add(c));
      (m[4] || '').replace(/\[([\w-]+)(?:="([^"]*)")?\]/g, (_, k, v) => { el.setAttribute(k, v === undefined ? '' : v); return ''; });
      chain.push(el);
    }
    if (!ok) { unsupported++; continue; }
    chain.forEach((el) => { parent.appendChild(el); parent = el; });
  }
  return unsupported;
}

/** Run a built payload in jsdom: blank page (safe when targets are missing, no leaks) and synthetic page (idempotent, destroy restores). */
export function dynamicChecks(code, label, { meta, selectors, config }, r) {
  const ns = config.namespace;
  const gk = globalKeyFor(ns);
  const allowed = [gk, config.tracking.dataLayer || 'dataLayer'];
  const owner = `[data-${ns}-owner]`; const style = `style[data-${ns}-style]`;

  const w = new JSDOM(PAGE, { runScripts: 'outside-only', url: 'https://example.test/' }).window;
  const before = new Set(Object.keys(w));
  try { w.eval(code); } catch (e) { r.fail(`${label}:runs`, `payload threw on load: ${e.message}`); w.close(); return; }
  r.pass(`${label}:runs`, 'evaluates without throwing (blank page)');
  const leaked = Object.keys(w).filter((k) => !before.has(k) && !allowed.includes(k));
  if (leaked.length) r.fail(`${label}:no-globals`, `leaked window properties: ${leaked.join(', ')}`); else r.pass(`${label}:no-globals`, `only window.${gk}`);
  const inst = (w[gk] && w[gk].instances) || {};
  const ids = Object.keys(inst);
  if (ids.length !== 1 || ids[0] !== meta.id) r.fail(`${label}:instance-id`, `expected exactly one instance "${meta.id}", found [${ids.join(', ')}] (ID must equal the brief id)`);
  else {
    const i = inst[meta.id];
    r.pass(`${label}:instance-id`, meta.id);
    if (meta.ref && i.ref && i.ref !== meta.ref) r.fail(`${label}:ref-matches-brief`, `defineExperiment ref "${i.ref}" differs from brief ref "${meta.ref}"`);
    else if (meta.tracking && meta.tracking.required === true && !i.ref) r.fail(`${label}:ref-matches-brief`, 'tracking is required: defineExperiment must pass ref');
    else r.pass(`${label}:ref-matches-brief`, i.ref || 'no tracking ref');
    const targets = Object.values(i.targets || {});
    const documented = new Set((selectors || []).map((s) => s.selector));
    const undoc = targets.filter((t) => !documented.has(t));
    if (!targets.length) r.warn(`${label}:targets-declared`, 'experiment declares no targets');
    else if (undoc.length) r.fail(`${label}:targets-documented`, `targets not in selectors.json: ${undoc.join(' | ')}`);
    else r.pass(`${label}:targets-documented`, `${targets.length} target(s) documented`);
    if (i.status === 'applied') r.warn(`${label}:blank-page`, 'reported "applied" on a blank page: apply() may not verify its targets');
    else r.pass(`${label}:missing-target-safe`, `status "${i.status}" when targets are absent`);
    i.destroy();
    const left = w.document.querySelectorAll(`${owner},${style}`).length;
    if (left) r.fail(`${label}:destroy`, `${left} owned node(s) left after destroy()`); else r.pass(`${label}:destroy`, 'nothing left behind');
  }
  w.close();

  const w2 = new JSDOM(PAGE, { runScripts: 'outside-only', url: 'https://example.test/' }).window;
  const unsupported = populateFromSelectors(w2.document, selectors || []);
  if (unsupported) { r.warn(`${label}:synthetic-apply`, `${unsupported} selector(s) too complex for the synthetic page: apply() was not exercised`); w2.close(); return; }
  const snapshot = w2.document.body.innerHTML;
  const before2 = new Set(Object.keys(w2));
  try { w2.eval(code); w2.eval(code); } catch (e) { r.fail(`${label}:synthetic-apply`, `payload threw: ${e.message}`); w2.close(); return; }
  const leaked2 = Object.keys(w2).filter((k) => !before2.has(k) && !allowed.includes(k));
  if (leaked2.length) r.fail(`${label}:no-globals-apply`, `leaked while apply() ran: ${leaked2.join(', ')}`); else r.pass(`${label}:no-globals-apply`, 'no leaks while apply() ran');
  const i2 = w2[gk] && w2[gk].instances && w2[gk].instances[meta.id];
  if (!i2) { r.fail(`${label}:synthetic-apply`, 'instance missing'); w2.close(); return; }
  if (i2.status !== 'applied') r.warn(`${label}:synthetic-apply`, `status "${i2.status}" on the synthetic page (apply() may need conditions the stub cannot provide)`);
  else r.pass(`${label}:synthetic-apply`, 'applied on a synthetic page built from selectors.json');
  const owned = w2.document.querySelectorAll(owner).length; const styles = w2.document.querySelectorAll(style).length;
  if (styles > 1) r.fail(`${label}:idempotent`, `double injection produced ${styles} style tags`);
  else r.pass(`${label}:idempotent`, `double injection: ${owned} owned node(s), ${styles} style tag(s)`);
  const keyed = new Map();
  w2.document.querySelectorAll(owner).forEach((n) => { const k = n.getAttribute(`data-${ns}-key`); keyed.set(k, (keyed.get(k) || 0) + 1); });
  const dup = [...keyed].filter(([, c]) => c > 1).map(([k]) => k);
  if (dup.length) r.fail(`${label}:no-duplicates`, `duplicated keyed element(s) after double injection: ${dup.join(', ')}`);
  i2.destroy();
  if (w2.document.body.innerHTML !== snapshot) r.fail(`${label}:destroy-restores`, 'page differs from its original state after destroy()'); else r.pass(`${label}:destroy-restores`, 'destroy() restores the synthetic page exactly');
  w2.close();
}

export function validateBuilt(files, ctx) {
  const r = new Result();
  for (const name of ['variant.js', 'payload.js']) {
    if (typeof files[name] !== 'string') { r.fail(`${name}:present`, 'not produced'); continue; }
    if (/\bconsole\.log\b/.test(files[name]) && !/\.debug|createLogger/.test(files[name])) r.warn(`${name}:console`, 'console.log present in bundle');
    dynamicChecks(files[name], name, ctx, r);
  }
  return r;
}
