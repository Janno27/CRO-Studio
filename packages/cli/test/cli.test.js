import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/commands/init.js';
import { runNew } from '../src/commands/new.js';
import { runValidate } from '../src/commands/validate.js';
import { runBuild } from '../src/commands/build.js';
import { loadConfig, validateConfig, DEFAULTS } from '../src/config.js';
import { parseArgs } from '../src/args.js';

const quiet = () => {};
const tmp = () => mkdtempSync(join(tmpdir(), 'cro-studio-'));
async function project(flags = { yes: true, name: 'Acme', namespace: 'acme', host: 'shop.acme.test' }) {
  const cwd = tmp();
  await runInit({ cwd, flags, log: quiet });
  return cwd;
}

test('parseArgs: positional + flags', () => {
  assert.deepEqual(parseArgs(['build', 'x', '--minify', '--url', 'https://a.b']), { cmd: 'build', pos: ['x'], flags: { minify: true, url: 'https://a.b' } });
});

test('config: defaults are valid; bad namespace, host and tracking are reported', () => {
  assert.deepEqual(validateConfig(structuredClone(DEFAULTS)), []);
  const bad = structuredClone(DEFAULTS);
  bad.namespace = 'Bad NS'; bad.markets[0].hosts = ['https://x.com/p']; bad.tracking = { mode: 'hook', hook: 'alert(1)' };
  const p = validateConfig(bad).join('\n');
  assert.match(p, /namespace/); assert.match(p, /hostnames/); assert.match(p, /tracking.hook/);
});

test('init --yes writes a valid config, AGENTS.md and folders; refuses to overwrite', async () => {
  const cwd = await project();
  const { config } = loadConfig(cwd);
  assert.equal(config.namespace, 'acme'); assert.deepEqual(config.markets[0].hosts, ['shop.acme.test']);
  assert.ok(existsSync(join(cwd, 'AGENTS.md')) && existsSync(join(cwd, 'experiments')));
  await assert.rejects(runInit({ cwd, flags: { yes: true }, log: quiet }), /already exists/);
  rmSync(cwd, { recursive: true });
});

test('init wizard accepts scripted answers (hook tracking, two markets, reviews on)', async () => {
  const cwd = tmp();
  const answers = ['Shop', 'shop', 'uk', 'www.shop.co.uk', 'en', 'y', 'fr', 'www.shop.fr, shop.fr', 'fr', '', 'home,product', 'hook', 'window.analytics.track', 'mcp', 'notion', 'figma', 'y', 'https://sb.example.com', 'y', 'y', 'n'];
  await runInit({ cwd, answers, flags: {}, log: quiet });
  const { config } = loadConfig(cwd);
  assert.deepEqual(config.markets.map((m) => m.id), ['uk', 'fr']);
  assert.deepEqual(config.markets[1].hosts, ['www.shop.fr', 'shop.fr']);
  assert.equal(config.tracking.mode, 'hook'); assert.equal(config.brief.mcp, 'notion');
  assert.equal(config.design.storybook.enabled, true); assert.deepEqual(config.reviews, { design: true, engineer: true });
  assert.ok(!existsSync(join(cwd, 'AGENTS.md')));
});

test('new -> validate -> build: scaffold passes, payload uses the configured namespace and leaks no local path', async () => {
  const cwd = await project();
  runNew({ id: 'my-test', flags: { ref: 'EXP-1', anchor: '#buy' }, cwd, log: quiet });
  assert.equal(runValidate({ id: 'my-test', cwd, log: quiet }), 0);
  assert.equal(await runBuild({ id: 'my-test', cwd, log: quiet, err: quiet }), 0);
  const payload = readFileSync(join(cwd, 'dist', 'my-test', 'payload.js'), 'utf8');
  assert.match(payload, /acme-my-test__badge/); assert.match(payload, /"acme"|acme-my-test/);
  assert.doesNotMatch(payload, /Users|tmp\.|\/var\/folders|node_modules/);
  const manifest = JSON.parse(readFileSync(join(cwd, 'dist', 'my-test', 'manifest.json'), 'utf8'));
  assert.match(manifest.platformCompatibility, /not verified/);
});

test('validate catches unscoped CSS, forbidden patterns and foreign imports; build then produces nothing', async () => {
  const cwd = await project();
  runNew({ id: 'bad-one', flags: {}, cwd, log: quiet });
  const dir = join(cwd, 'experiments', 'bad-one');
  writeFileSync(join(dir, 'styles.css'), '.acme-bad-one__x{color:red} body{margin:0}');
  writeFileSync(join(dir, 'variant.js'), `import _ from 'lodash';\nimport { defineExperiment } from '@cro-studio/core';\ndefineExperiment({ id: 'bad-one', targets: {}, apply(ctx) { document.body.innerHTML = 'x'; window.leak = 1; eval('1'); return true; } }).start();`);
  const out = [];
  assert.equal(runValidate({ id: 'bad-one', cwd, log: (l) => out.push(l) }), 1);
  const text = out.join('\n');
  assert.match(text, /FAIL css-scoped/); assert.match(text, /FAIL imports-local/); assert.match(text, /innerHTML/); assert.match(text, /window\.leak/); assert.match(text, /eval/);
  assert.equal(await runBuild({ id: 'bad-one', cwd, log: quiet, err: quiet }), 1);
  assert.ok(!existsSync(join(cwd, 'dist', 'bad-one')));
});

test('dynamic checks catch a payload that duplicates on double injection', async () => {
  const cwd = await project();
  runNew({ id: 'dupe', flags: { anchor: '#buy' }, cwd, log: quiet });
  const dir = join(cwd, 'experiments', 'dupe');
  writeFileSync(join(dir, 'variant.js'), `import { defineExperiment } from '@cro-studio/core';\nimport selectors from './selectors.json';\nconst S = Object.fromEntries(selectors.map((s) => [s.name, s.selector]));\ndefineExperiment({ id: 'dupe', targets: { a: S.anchor }, observe: false, apply(ctx) { const d = document.createElement('div'); d.setAttribute('data-acme-owner', 'dupe'); d.setAttribute('data-acme-key', 'k'); ctx.targets.a.after(d); return true; } }).start();`);
  const err = [];
  assert.equal(await runBuild({ id: 'dupe', cwd, log: quiet, err: (l) => err.push(l) }), 1);
  assert.match(err.join('\n'), /no-duplicates|idempotent|destroy-restores/);
});

test('reviews gate: "ready" needs approval when enabled in the config', async () => {
  const cwd = await project({ yes: true, name: 'A', namespace: 'acme', host: 'a.test' });
  const cfg = JSON.parse(readFileSync(join(cwd, 'cro-studio.config.json'), 'utf8'));
  cfg.reviews = { design: true, engineer: false };
  writeFileSync(join(cwd, 'cro-studio.config.json'), JSON.stringify(cfg));
  runNew({ id: 'gated', flags: {}, cwd, log: quiet });
  const f = join(cwd, 'experiments', 'gated', 'brief.md');
  writeFileSync(f, readFileSync(f, 'utf8').replace('status: draft', 'status: ready'));
  const out = [];
  assert.equal(runValidate({ id: 'gated', cwd, log: (l) => out.push(l) }), 1);
  assert.match(out.join('\n'), /reviews\.design must be "approved"/);
  writeFileSync(f, readFileSync(f, 'utf8').replace('design: pending', 'design: approved'));
  assert.equal(runValidate({ id: 'gated', cwd, log: quiet }), 0);
});

test('the shipped demo project builds cleanly', async () => {
  const demo = new URL('../../../examples/demo-project/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  assert.equal(runValidate({ cwd: demo, log: quiet }), 0);
  const cwd = tmp();
  writeFileSync(join(cwd, 'x'), '');
  const res = await runBuild({ cwd: demo, log: quiet, err: quiet });
  assert.equal(res, 0);
  rmSync(join(demo, 'dist'), { recursive: true, force: true });
});

test('init wizard reads piped stdin (CI / scripts) without losing answers', async () => {
  const { Readable } = await import('node:stream');
  const { createPrompter } = await import('../src/prompt.js');
  const sink = { write() {} };
  const p = createPrompter({ input: Readable.from(['Shop\nuk\n', 'y\nmaybe\n']), output: sink });
  assert.equal(await p.text('a', 'x'), 'Shop');
  assert.equal(await p.text('b', 'x'), 'uk');
  assert.equal(await p.yesNo('c', false), true);
  assert.equal(await p.choice('d', ['one', 'two'], 'two'), 'two'); // invalid -> default
  assert.equal(await p.text('e', 'fallback'), 'fallback'); // input exhausted -> default
});
