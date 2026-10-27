// Portable test runner: `node --test <glob>` fails on Windows/Node 20 (cmd.exe does not expand globs, Node 20 does not either).
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const dir = join(process.cwd(), 'test');
const files = readdirSync(dir).filter((f) => f.endsWith('.test.js')).sort().map((f) => join(dir, f));
if (!files.length) { console.error(`no *.test.js files in ${dir}`); process.exit(1); }
process.exit(spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' }).status ?? 1);
