import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../config.js';
import { listExperiments } from '../experiment.js';

const sh = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: process.platform === 'win32' }).trim(); } catch { return null; } };

export async function runDoctor({ cwd = process.cwd(), log = console.log } = {}) {
  const rows = [];
  const add = (status, name, detail = '') => rows.push({ status, name, detail });
  const major = Number(process.versions.node.split('.')[0]);
  add(major >= 20 ? 'ok' : 'fail', 'Node.js >= 20', process.version);
  let loaded = null;
  try { loaded = loadConfig(cwd); add('ok', 'cro-studio.config.json', `namespace "${loaded.config.namespace}", ${loaded.config.markets.length} market(s)`); } catch (e) { add('fail', 'cro-studio.config.json', e.message.split('\n')[0]); }
  if (loaded) {
    const { config, root } = loaded;
    add(existsSync(join(root, config.experimentsDir)) ? 'ok' : 'warn', `${config.experimentsDir}/ folder`, `${listExperiments(root, config).length} experiment(s)`);
    if (config.tracking.mode === 'hook') add('warn', 'tracking hook', `${config.tracking.hook} must exist on the page when events fire (checked at runtime; a missing hook sends nothing)`);
    add(config.brief.mcp ? 'ok' : 'info', 'Brief source', config.brief.mcp ? `MCP "${config.brief.mcp}" (connect it in your AI assistant)` : 'conversation (typed into your AI assistant)');
    add(config.design.figma ? 'ok' : 'info', 'Figma', config.design.figma ? `MCP "${config.design.figma.mcp}" (connect it in your AI assistant)` : 'not configured');
  }
  let pw = null; try { pw = await import('playwright-core'); } catch { /* optional */ }
  add(pw ? 'ok' : 'warn', 'playwright-core (preview/capture)', pw ? 'installed' : 'not installed: npm i playwright-core');
  add(sh('git', ['--version']) ? 'ok' : 'warn', 'git', sh('git', ['--version']) || 'not found (optional)');
  const icon = { ok: 'OK  ', warn: 'WARN', fail: 'FAIL', info: 'INFO' };
  rows.forEach((r) => log(`${icon[r.status]} ${r.name}${r.detail ? `: ${r.detail}` : ''}`));
  return rows.some((r) => r.status === 'fail') ? 1 : 0;
}
