// Inject a built payload into a real page with Playwright (headless by default, --headed to watch). Human confirmation is still required.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../config.js';
import { resolveExperiment } from '../experiment.js';
import { globalKeyFor } from '../experiment.js';

export async function runPreview({ id, flags = {}, cwd = process.cwd(), log = console.log }) {
  const { config, root } = loadConfig(cwd);
  const dir = resolveExperiment(id, root, config);
  if (!dir) throw new Error(`experiment not found: ${id || '(none)'}`);
  const expId = dir.split(/[\\/]/).pop();
  const payloadFile = join(root, config.outDir, expId, 'payload.js');
  if (!existsSync(payloadFile)) throw new Error(`no build found: run \`cro-studio build ${expId}\` first`);
  if (!flags.url || flags.url === true) throw new Error('usage: cro-studio preview <id> --url <https page> [--headed] [--screenshot file]');
  const host = new URL(flags.url).hostname;
  if (host && !config.markets.some((m) => m.hosts.includes(host))) log(`warning: ${host} is not a host of any configured market (${config.markets.flatMap((m) => m.hosts).join(', ')})`);
  let pw;
  try { pw = await import('playwright-core'); } catch { throw new Error('playwright-core is not installed: npm i playwright-core (and a Chromium/Chrome: npx playwright-core install chromium)'); }
  const browser = await pw.chromium.launch({ headless: !flags.headed, channel: flags.channel || undefined }).catch((e) => { throw new Error(`cannot launch the browser: ${e.message.split('\n')[0]}`); });
  try {
    const page = await (await browser.newContext({ viewport: flags.mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 } })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
    await page.goto(flags.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const gk = globalKeyFor(config.namespace);
    await page.evaluate((code) => (0, eval)(code), readFileSync(payloadFile, 'utf8'));
    await page.waitForTimeout(1000);
    const st = await page.evaluate(([k, i]) => { const x = window[k] && window[k].instances && window[k].instances[i]; return x ? { status: x.status, detail: x.detail } : null; }, [gk, expId]);
    log(`status: ${st ? st.status : 'no instance'}${st && st.detail ? ` ${JSON.stringify(st.detail)}` : ''}; page errors during preview: ${errors.length}`);
    if (flags.screenshot) { await page.screenshot({ path: String(flags.screenshot), fullPage: false }); log(`screenshot: ${flags.screenshot}`); }
    if (flags.headed) { log('browser open: check the variation by eye, then close the window.'); await new Promise((res) => browser.on('disconnected', res)); }
    return st && st.status === 'applied' ? 0 : 1;
  } finally { await browser.close().catch(() => {}); }
}
