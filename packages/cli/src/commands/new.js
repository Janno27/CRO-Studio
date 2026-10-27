import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../config.js';
import { briefMd, selectorsJson, stylesCss, variantJs } from '../templates.js';

export function runNew({ id, flags = {}, cwd = process.cwd(), log = console.log }) {
  const { config, root } = loadConfig(cwd);
  if (!id) throw new Error(`usage: cro-studio new <id> [--ref <tracker ref>] [--name "<title>"] [--market <id>] [--page <type>]\nid pattern: ${config.ids.pattern} (e.g. ${config.ids.example})`);
  if (!new RegExp(config.ids.pattern).test(id)) throw new Error(`id "${id}" must match ${config.ids.pattern} (e.g. ${config.ids.example})`);
  const dir = join(root, config.experimentsDir, id);
  if (existsSync(dir)) throw new Error(`${dir} already exists`);
  const markets = flags.market ? String(flags.market).split(',') : [config.markets[0].id];
  const pageTypes = flags.page ? String(flags.page).split(',') : [config.pageTypes[0]];
  const bad = [...markets.filter((m) => !config.markets.some((x) => x.id === m)).map((m) => `market "${m}"`), ...pageTypes.filter((p) => !config.pageTypes.includes(p)).map((p) => `page type "${p}"`)];
  if (bad.length) throw new Error(`unknown ${bad.join(', ')}: edit cro-studio.config.json or pick a configured value`);
  const ref = flags.ref ? String(flags.ref) : null;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'brief.md'), briefMd({ id, ref, name: flags.name || id.replace(/-/g, ' '), markets, pageTypes, cfg: config }));
  writeFileSync(join(dir, 'selectors.json'), selectorsJson({ market: markets[0], pageType: pageTypes[0], anchor: flags.anchor || 'main' }));
  writeFileSync(join(dir, 'variant.js'), variantJs({ id, ref, ns: config.namespace }));
  writeFileSync(join(dir, 'styles.css'), stylesCss({ id, ns: config.namespace }));
  log(`created ${config.experimentsDir}/${id}/ (brief.md, selectors.json, variant.js, styles.css)\nnext: complete the brief, verify selectors on the live page, then cro-studio validate ${id}`);
  return dir;
}
