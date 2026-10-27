import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { sanitizeHtml, sanitizeUrl } from '../src/capture/sanitize.js';
import { saveCapture, listCaptures, findCapture, validateCaptureDir, applyEvidence, detectMarket } from '../src/capture/store.js';
import { selectorReport } from '../src/capture/report.js';
import { parseTargets } from '../src/commands/capture.js';
import { runInit } from '../src/commands/init.js';
import { runNew } from '../src/commands/new.js';
import { loadConfig } from '../src/config.js';
import { parseArgs } from '../src/args.js';

const SNIPPET = readFileSync(new URL('../src/capture/collect.snippet.js', import.meta.url), 'utf8');
const HTML = `<!doctype html><html lang="en"><head><title>Shop</title></head><body>
<header><nav class="main-nav"><a href="/">Home</a></nav></header>
<main id="main"><section class="pdp"><h1>Mattress</h1>
<button data-test="add-to-cart" class="btn btn--primary">Add to cart</button>
<button class="btn">Wishlist</button><button class="btn">Share</button>
<input type="hidden" name="csrf" value="SECRET"><a href="/p?token=abc123&x=1">link</a></section></main><footer>f</footer>
<script>window.dataLayer=[{event:'page_view',user_email:'a@b.co'}]</script></body></html>`;

async function collect(opts) {
  const dom = new JSDOM(HTML, { runScripts: 'outside-only', url: 'https://shop.test/p/mattress?token=abc' });
  dom.window.eval("window.dataLayer=[{event:'page_view',user_email:'a@b.co'}]"); // inline <script> does not run with runScripts: outside-only
  dom.window.eval(SNIPPET);
  return dom.window.__croCollect({ market: 'main', pageType: 'product', checkDynamic: false, ...opts });
}
async function project() {
  const cwd = mkdtempSync(join(tmpdir(), 'cro-cap-'));
  await runInit({ cwd, flags: { yes: true, name: 'T', namespace: 'tt', host: 'shop.test' }, log: () => {} });
  return { cwd, ...loadConfig(cwd) };
}

test('sanitizer removes scripts, emails, token params, input values; share mode also queries, hidden inputs, data URIs', () => {
  const h = '<script>x</script><input value="pw"><a href="/a?token=zzz&b=1">e a@b.co</a><input type="hidden" value="v"><img src="data:image/png;base64,AAAA"><a href="/q?x=1">';
  const local = sanitizeHtml(h);
  assert.doesNotMatch(local, /<script|a@b\.co|zzz|"pw"/);
  const share = sanitizeHtml(h, { mode: 'share' });
  assert.doesNotMatch(share, /type="hidden"|base64|\?x=1/);
  assert.equal(sanitizeUrl('https://a.b/?token=1&q=2'), 'https://a.b/?token=[removed]&q=2');
});

test('collector: classifies selectors (unique, non-unique, positional/fragile, not found, invalid) and lists candidates', async () => {
  const raw = await collect({ targets: [
    { name: 'cta', selector: '[data-test="add-to-cart"]' }, { name: 'btns', selector: '.btn' },
    { name: 'pos', selector: 'main > section > button:nth-of-type(1)' }, { name: 'gone', selector: '.nope' }, { name: 'bad', selector: '[[' },
  ] });
  const by = Object.fromEntries(raw.targets.map((t) => [t.name, t]));
  assert.equal(by.cta.selectorAssessment.classification, 'verified-unique');
  assert.equal(by.btns.selectorAssessment.classification, 'verified-non-unique'); assert.equal(by.btns.matchCount, 3);
  assert.equal(by.pos.selectorAssessment.classification, 'fragile');
  assert.equal(by.gone.found, false); assert.match(by.gone.error, /not found/);
  assert.equal(by.bad.found, false);
  assert.equal(by.cta.candidates[0].classification, 'verified-unique');
  assert.equal(raw.meta.hadQueryString, true); assert.equal(raw.meta.frameworkHints.dataLayer, true);
});

test('survey: component classes, palette and tracking event KEYS only (never values)', async () => {
  const raw = await collect({ mode: 'survey' });
  assert.equal(raw.kind, 'survey');
  assert.ok(raw.componentClasses.some((c) => c.class === 'btn--primary'));
  const ev = raw.tracking.events.find((e) => e.event === 'page_view');
  assert.deepEqual([...ev.keys].sort(), ['event', 'user_email']); // spread: arrays from the jsdom realm differ by prototype
  assert.doesNotMatch(JSON.stringify(raw.tracking), /a@b\.co/);
});

test('store: saves a sanitized capture, validates it, lists it, reports uniqueness, never keeps secrets or query strings', async () => {
  const { cwd, config } = await project();
  const raw = await collect({ targets: [{ name: 'cta', selector: '[data-test="add-to-cart"]' }, { name: 'btns', selector: '.btn' }, { name: 'link', selector: 'a[href*="token"]' }] });
  const res = saveCapture(raw, { config, root: cwd, market: 'main', pageType: 'product', now: new Date(2026, 9, 27, 10, 0, 0) });
  assert.match(res.captureId, /^main-product-cta-100000$/);
  assert.deepEqual(validateCaptureDir(res.dir, config), []);
  const files = ['metadata.json', 'targets.json', 'computed-styles.json', 'dom-summary.json', 'dom.html'];
  files.forEach((f) => assert.ok(existsSync(join(res.dir, f)), f));
  const all = files.map((f) => readFileSync(join(res.dir, f), 'utf8')).join('\n');
  assert.doesNotMatch(all, /token=abc123|SECRET|a@b\.co/);
  assert.equal(JSON.parse(readFileSync(join(res.dir, 'metadata.json'), 'utf8')).url, 'https://shop.test/p/mattress');
  assert.equal(listCaptures(cwd, config).length, 1);
  assert.equal(findCapture(res.captureId, cwd, config), res.dir);
  const rep = selectorReport(res.dir);
  assert.match(rep, /verified-unique/); assert.match(rep, /verified-non-unique/); assert.match(rep, /A unique alternative/);
  const second = saveCapture(raw, { config, root: cwd, market: 'main', pageType: 'product', now: new Date(2026, 9, 27, 10, 0, 0) });
  assert.match(second.captureId, /-2$/);
});

test('store: unknown host keeps market null and records the limitation; bad page type is rejected', async () => {
  const { cwd, config } = await project();
  assert.equal(detectMarket('SHOP.test', config), 'main'); assert.equal(detectMarket('other.test', config), null);
  const raw = await collect({ targets: [] });
  const r = saveCapture(raw, { config, root: cwd, market: null, pageType: 'product' });
  assert.match(JSON.parse(readFileSync(join(r.dir, 'metadata.json'), 'utf8')).limitations.join(), /not listed/);
  assert.throws(() => saveCapture(raw, { config, root: cwd, market: 'main', pageType: 'nonsense' }), /pageType/);
});

test('evidence: stamps selectors.json from a capture so validate accepts "verified" entries', async () => {
  const { cwd, config } = await project();
  runNew({ id: 'ev-test', flags: { anchor: '[data-test="add-to-cart"]', page: 'product' }, cwd, log: () => {} });
  const flags = parseArgs(['capture', '--experiment', 'ev-test']).flags;
  const targets = parseTargets(flags, cwd, config);
  assert.deepEqual(targets.map((t) => t.name), ['anchor']);
  const raw = await collect({ targets });
  const res = saveCapture(raw, { config, root: cwd, market: 'main', pageType: 'product' });
  const f = join(cwd, 'experiments', 'ev-test', 'selectors.json');
  const out = applyEvidence(res.dir, f);
  assert.deepEqual(out.changed, ['anchor: verified-unique']);
  const sel = JSON.parse(readFileSync(f, 'utf8'))[0];
  assert.equal(sel.status, 'verified-unique'); assert.deepEqual(sel.evidence, [res.captureId]);
  writeFileSync(f, JSON.stringify([{ ...sel, name: 'x', selector: '.nope', status: 'not-tested', evidence: [] }]));
  assert.deepEqual(applyEvidence(res.dir, f).changed, []);
});

test('parseArgs: repeated --target becomes an array; parseTargets rejects malformed values', () => {
  assert.deepEqual(parseArgs(['capture', '--target', 'a=.x', '--target', 'b=.y', '--url', 'u']).flags, { target: ['a=.x', 'b=.y'], url: 'u' });
  assert.throws(() => parseTargets({ target: 'nonsense' }, '.', { experimentsDir: 'e' }), /name=css-selector/);
});
