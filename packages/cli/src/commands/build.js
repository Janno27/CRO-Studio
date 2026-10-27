import { loadConfig } from '../config.js';
import { listExperiments, resolveExperiment } from '../experiment.js';
import { buildExperiment } from '../build.js';

export async function runBuild({ id, flags = {}, cwd = process.cwd(), log = console.log, err = console.error }) {
  const { config, root } = loadConfig(cwd);
  const dirs = id ? [resolveExperiment(id, root, config)] : listExperiments(root, config);
  if (id && !dirs[0]) throw new Error(`experiment not found: ${id}`);
  if (!dirs.length) { log('no experiments yet: run `cro-studio new <id>`'); return 0; }
  let failed = 0;
  for (const dir of dirs) {
    const res = await buildExperiment(dir, { config, root, minify: !!flags.minify });
    if (!res.ok) {
      failed++;
      err(`BUILD FAILED (${dir.split(/[\\/]/).pop()}): ${res.message}`);
      (res.report ? res.report.checks.filter((c) => c.status === 'fail') : []).forEach((c) => err(`  - ${c.name}: ${c.detail}`));
      continue;
    }
    res.manifest.outputs.forEach((o) => log(`built ${config.outDir}/${res.manifest.id}/${o.file} (${o.bytes} bytes)`));
    log(`validation: ${res.report.status} (${res.report.errors} errors, ${res.report.warnings} warnings)`);
    res.report.checks.filter((c) => c.status === 'warn').forEach((c) => log(`  warn ${c.name}: ${c.detail}`));
  }
  log('platform compatibility: NOT VERIFIED (static + jsdom checks only). Preview in a real browser, then verify in your testing platform.');
  return failed ? 1 : 0;
}
