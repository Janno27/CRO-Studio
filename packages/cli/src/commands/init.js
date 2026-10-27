// `cro-studio init`: guided setup. Writes cro-studio.config.json (+ package.json, .gitignore, optional AI assistant files).
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CONFIG_FILE, DEFAULTS, validateConfig, writeConfig } from '../config.js';
import { createPrompter } from '../prompt.js';
import { agentsMd, claudeCommand } from '../ai-files.js';

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export async function runInit({ cwd = process.cwd(), flags = {}, answers = null, log = console.log } = {}) {
  const root = resolve(cwd);
  if (existsSync(join(root, CONFIG_FILE)) && !flags.force) throw new Error(`${CONFIG_FILE} already exists here (use --force to overwrite)`);
  const yes = !!flags.yes;
  const p = createPrompter({ answers: yes ? [] : answers });
  const t = (label, def) => (yes ? def : p.text(label, def));
  const yn = (label, def) => (yes ? def : p.yesNo(label, def));
  try {
    const cfg = structuredClone(DEFAULTS);
    log('CRO Studio setup: every answer can be changed later in cro-studio.config.json\n');
    cfg.project.name = await t('Project / brand name', flags.name || 'My project');
    cfg.namespace = slug(await t('Namespace for generated CSS classes, attributes and the single global', flags.namespace || 'cro')) || 'cro';

    cfg.markets = [];
    let more = true;
    while (more) {
      const id = slug(await t('Market id (e.g. uk, fr, main)', cfg.markets.length ? 'fr' : (flags.market || 'main')));
      const hosts = (await t('Hostnames of that market, comma separated (no https://)', flags.host || 'www.example.com')).split(',').map((h) => h.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(Boolean);
      const locale = await t('Locale', 'en');
      cfg.markets.push({ id, hosts, locale });
      more = yes ? false : await yn('Add another market?', false);
    }
    cfg.pageTypes = (await t('Page types you test on, comma separated', cfg.pageTypes.join(','))).split(',').map(slug).filter(Boolean);

    const mode = yes ? (flags.tracking || 'datalayer') : await p.choice('Tracking', ['datalayer', 'hook', 'none'], 'datalayer');
    cfg.tracking = { mode };
    if (mode === 'datalayer') {
      cfg.tracking.dataLayer = await t('dataLayer variable name', 'dataLayer');
      cfg.tracking.template = DEFAULTS.tracking.template;
      log('  Event template (edit in the config; placeholders {id} {ref} {label} {section}):\n  ' + JSON.stringify(cfg.tracking.template));
    } else if (mode === 'hook') {
      cfg.tracking.hook = await t('Global function called with { id, ref, label, section }', 'window.analytics.track');
    }

    const src = yes ? 'conversation' : await p.choice('Where do experiment briefs come from', ['conversation', 'mcp'], 'conversation');
    cfg.brief = { source: src, mcp: src === 'mcp' ? await t('MCP server name that exposes your test ideas (e.g. jira, notion, linear)', '') || null : null };
    cfg.design.figma = { mcp: await t('Figma MCP server name', 'figma') };
    const sb = await yn('Use Storybook as a component source?', false);
    cfg.design.storybook = { enabled: sb, url: sb ? (await t('Storybook URL', '')) || null : null };
    cfg.reviews = { design: await yn('Require a Design review before an experiment is "ready"?', false), engineer: await yn('Require an Engineer review before "ready"?', false) };
    const ai = await yn('Generate AI assistant files (AGENTS.md + Claude Code commands)?', true);

    const problems = validateConfig(cfg);
    if (problems.length) throw new Error(`invalid answers:\n  - ${problems.join('\n  - ')}`);

    mkdirSync(root, { recursive: true });
    writeConfig(root, cfg);
    mkdirSync(join(root, cfg.experimentsDir), { recursive: true });
    const pkg = join(root, 'package.json');
    if (!existsSync(pkg)) writeFileSync(pkg, JSON.stringify({ name: slug(cfg.project.name) || 'cro-experiments', private: true, type: 'module', scripts: { validate: 'cro-studio validate', build: 'cro-studio build', doctor: 'cro-studio doctor' }, dependencies: { '@cro-studio/core': '^0.1.0' }, devDependencies: { 'cro-studio': '^0.1.0' } }, null, 2) + '\n');
    const gi = join(root, '.gitignore');
    const ignore = ['node_modules/', `${cfg.outDir}/`, `${cfg.capturesDir}/`, '.env*', '.DS_Store'];
    const prev = existsSync(gi) ? readFileSync(gi, 'utf8') : '';
    writeFileSync(gi, prev + ignore.filter((l) => !prev.split('\n').includes(l)).join('\n') + '\n');
    if (ai) {
      writeFileSync(join(root, 'AGENTS.md'), agentsMd(cfg));
      mkdirSync(join(root, '.claude', 'commands'), { recursive: true });
      writeFileSync(join(root, '.claude', 'commands', 'experiment.md'), claudeCommand(cfg));
    }
    log(`\nCreated ${CONFIG_FILE}${ai ? ', AGENTS.md, .claude/commands/experiment.md' : ''}.\nNext: npm install && npx cro-studio new <experiment-id>`);
    return { root, config: cfg };
  } finally { p.close(); }
}
