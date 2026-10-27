// Tiny prompt helper. `answers` (array) feeds scripted runs (tests, CI); otherwise readline on the terminal.
import { createInterface } from 'node:readline/promises';

export function createPrompter({ answers = null, input = process.stdin, output = process.stdout } = {}) {
  const queue = answers ? [...answers] : null;
  const rl = queue ? null : createInterface({ input, output });
  const ask = async (q) => (queue ? (queue.length ? String(queue.shift()) : '') : (await rl.question(q)));
  return {
    async text(label, def = '') {
      const a = (await ask(`${label}${def ? ` (${def})` : ''}: `)).trim();
      return a || def;
    },
    async yesNo(label, def = false) {
      const a = (await ask(`${label} [${def ? 'Y/n' : 'y/N'}]: `)).trim().toLowerCase();
      return a ? a.startsWith('y') : def;
    },
    async choice(label, options, def) {
      const a = (await ask(`${label} (${options.join(' / ')}) [${def}]: `)).trim().toLowerCase();
      return options.includes(a) ? a : def;
    },
    close() { if (rl) rl.close(); },
  };
}
