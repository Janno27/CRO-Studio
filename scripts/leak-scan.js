// Fails when the repo contains private-brand markers or secrets. Run in CI and before publishing.
// Edit FORBIDDEN to add your own company/brand names, then `npm run leak-scan`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const FORBIDDEN = [/emma[-_. ]?(sleep|matratze|\.fr)/i, /@emma/i, /emma-cro|__emmaCro/i];
const SECRET = [/(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"][A-Za-z0-9_-]{16,}['"]/i, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./, /\bsk-[A-Za-z0-9]{20,}/];
const SKIP_DIR = new Set(['node_modules', '.git', 'dist']);
const SKIP_FILE = new Set(['package-lock.json', 'leak-scan.js']);
const root = process.cwd();
const hits = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (SKIP_DIR.has(name)) continue;
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (SKIP_FILE.has(name) || !/\.(js|json|md|css|html|yml|yaml|txt|sh)$/.test(name)) continue;
    readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      [...FORBIDDEN, ...SECRET].forEach((re) => { if (re.test(line)) hits.push(`${relative(root, p)}:${i + 1}: ${re}`); });
    });
  }
})(root);
if (hits.length) { console.error(`leak-scan: ${hits.length} hit(s)\n${hits.join('\n')}`); process.exit(1); }
console.log('leak-scan: clean');
