import { loadConfig } from '../config.js';
import { listExperiments, resolveExperiment } from '../experiment.js';
import { validateSources, summarize } from '../validate.js';

const ICON = { pass: 'PASS', warn: 'WARN', fail: 'FAIL' };

/** Source validation of one experiment (or all when no id). Returns the process exit code. */
export function runValidate({ id, cwd = process.cwd(), log = console.log }) {
  const { config, root } = loadConfig(cwd);
  const dirs = id ? [resolveExperiment(id, root, config)] : listExperiments(root, config);
  if (id && !dirs[0]) throw new Error(`experiment not found: ${id}`);
  if (!dirs.length) { log('no experiments yet: run `cro-studio new <id>`'); return 0; }
  let failed = 0;
  for (const dir of dirs) {
    const { r } = validateSources(dir, config);
    log(`\n${dir.split(/[\\/]/).pop()}`);
    r.checks.forEach((c) => log(`  ${ICON[c.status]} ${c.name}${c.detail ? `: ${c.detail}` : ''}`));
    const s = summarize(r);
    log(`  => ${s.status} (${s.errors} errors, ${s.warnings} warnings). Built-artifact checks run in \`cro-studio build\`.`);
    if (!r.ok) failed++;
  }
  return failed ? 1 : 0;
}
