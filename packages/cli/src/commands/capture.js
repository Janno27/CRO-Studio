// `cro-studio capture`: observe a live page and record verified selector evidence.
//   capture --url <page> [--target name=css]... [--experiment <id>] [--survey] [--page type] [--mobile] [--headed] [--share]
//   capture list | show <id> | report <id> | validate [id] | evidence <id> --experiment <id>
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig } from '../config.js';
import { resolveExperiment } from '../experiment.js';
import { saveCapture, listCaptures, findCapture, validateCaptureDir, applyEvidence, detectMarket } from '../capture/store.js';
import { selectorReport } from '../capture/report.js';

const SNIPPET = new URL('../capture/collect.snippet.js', import.meta.url);
const arr = (v) => (v === undefined || v === true ? [] : Array.isArray(v) ? v : [v]);

export function parseTargets(flags, root, config) {
  const out = [];
  arr(flags.target).forEach((t) => {
    const i = String(t).indexOf('=');
    if (i < 1) throw new Error(`--target must look like name=css-selector (got "${t}")`);
    out.push({ name: t.slice(0, i), selector: t.slice(i + 1) });
  });
  if (flags.experiment) {
    const dir = resolveExperiment(flags.experiment, root, config);
    if (!dir) throw new Error(`experiment not found: ${flags.experiment}`);
    JSON.parse(readFileSync(join(dir, 'selectors.json'), 'utf8')).forEach((s) => { if (!out.some((o) => o.name === s.name)) out.push({ name: s.name, selector: s.selector, description: s.purpose }); });
  }
  return out;
}

export async function runCapture({ sub, pos = [], flags = {}, cwd = process.cwd(), log = console.log }) {
  const { config, root } = loadConfig(cwd);
  if (sub === 'list') {
    const rows = listCaptures(root, config);
    rows.forEach((c) => log(`${c.captureId}  ${c.kind}  ${c.market || '?'}  ${c.pageType}  targets ${c.targets}  ${c.url}`));
    if (!rows.length) log('no captures yet: cro-studio capture --url <page> --target name=css');
    return 0;
  }
  if (sub === 'report' || sub === 'show') { log(selectorReport(findCapture(pos[0], root, config))); return 0; }
  if (sub === 'validate') {
    const dirs = pos[0] ? [findCapture(pos[0], root, config)] : listCaptures(root, config).map((c) => c.dir);
    let bad = 0;
    dirs.forEach((d) => { const e = validateCaptureDir(d, config); log(`${e.length ? 'FAIL' : 'PASS'} ${d}${e.length ? `\n  ${e.join('\n  ')}` : ''}`); if (e.length) bad++; });
    return bad ? 1 : 0;
  }
  if (sub === 'evidence') {
    if (!pos[0] || !flags.experiment) throw new Error('usage: cro-studio capture evidence <captureId|path> --experiment <id>');
    const exp = resolveExperiment(flags.experiment, root, config);
    if (!exp) throw new Error(`experiment not found: ${flags.experiment}`);
    const res = applyEvidence(findCapture(pos[0], root, config), join(exp, 'selectors.json'));
    res.changed.forEach((c) => log(`updated ${c}`));
    res.skipped.forEach((c) => log(`skipped ${c}`));
    if (!res.changed.length) log('nothing updated');
    return 0;
  }

  // default: take a capture
  if (!flags.url || flags.url === true) throw new Error('usage: cro-studio capture --url <https page> [--target name=css]... [--experiment <id>] [--survey] [--page <type>] [--mobile] [--headed] [--share]\n       cro-studio capture list | report <id> | validate [id] | evidence <id> --experiment <id>');
  const url = new URL(flags.url);
  const market = detectMarket(url.hostname, config);
  if (market === null && url.hostname) log(`warning: ${url.hostname} is not a host of any configured market; the capture is stored with market "unknown"`);
  const pageType = flags.page && flags.page !== true ? flags.page : config.pageTypes.includes('other') ? 'other' : config.pageTypes[0];
  if (!config.pageTypes.includes(pageType)) throw new Error(`unknown page type "${pageType}" (configured: ${config.pageTypes.join(', ')})`);
  const targets = flags.survey ? [] : parseTargets(flags, root, config);
  if (!flags.survey && !targets.length) log('note: no targets given (--target name=css or --experiment <id>): only the page structure will be captured');

  let pw;
  try { pw = await import('playwright-core'); } catch { throw new Error('playwright-core is not installed: npm i playwright-core (and a Chromium/Chrome: npx playwright-core install chromium)'); }
  const headless = flags.headed ? false : config.browser.headless !== false;
  const browser = await pw.chromium.launch({ headless, channel: flags.channel || undefined }).catch((e) => { throw new Error(`cannot launch the browser: ${e.message.split('\n')[0]}`); });
  const tmp = mkdtempSync(join(tmpdir(), 'cro-capture-'));
  try {
    const page = await (await browser.newContext({ viewport: flags.mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 } })).newPage();
    await page.goto(flags.url, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(Number(flags.wait) || 1500);
    if (flags.headed && flags.pause) { log('browser open: log in / dismiss banners / open the state you want, then press Enter here.'); await new Promise((r) => process.stdin.once('data', r)); }
    await page.evaluate(readFileSync(SNIPPET, 'utf8'));
    const raw = await page.evaluate((o) => window.__croCollect(o), { mode: flags.survey ? 'survey' : 'page', market, pageType, targets, controlsScope: flags.scope && flags.scope !== true ? flags.scope : 'main', checkDynamic: flags['no-dynamic'] ? false : undefined });
    const shot = join(tmp, 'shot.png');
    await page.screenshot({ path: shot, fullPage: false });
    const res = saveCapture(raw, { config, root, name: flags.name && flags.name !== true ? flags.name : undefined, screenshot: shot, share: !!flags.share, market, pageType });
    log(`saved ${res.dir}`);
    res.warnings.forEach((w) => log(`warning: ${w}`));
    if (!flags.survey && targets.length) log(`\n${selectorReport(res.dir)}`);
    return res.warnings.length ? 1 : 0;
  } finally { await browser.close().catch(() => {}); rmSync(tmp, { recursive: true, force: true }); }
}
