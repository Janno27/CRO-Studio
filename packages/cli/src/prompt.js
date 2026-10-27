// Tiny prompt helper. `answers` (array) feeds scripted runs (tests, CI); otherwise readline on the terminal.
import { createInterface } from 'node:readline/promises';

export function createPrompter({ answers = null, input = process.stdin, output = process.stdout } = {}) {
  // Piped input (CI, `printf ... | cro-studio init`): readline would drop lines that arrive before the next question, so read it all up front.
  const piped = !answers && !input.isTTY;
  let queue = answers ? [...answers] : null;
  const rl = queue || piped ? null : createInterface({ input, output });
  const load = async () => {
    if (queue || !piped) return;
    let text = '';
    for await (const chunk of input) text += chunk;
    queue = text.split(/\r?\n/);
    if (queue[queue.length - 1] === '') queue.pop();
  };
  const ask = async (q) => {
    await load();
    if (!queue) return rl.question(q);
    if (piped) output.write(q);
    return queue.length ? String(queue.shift()) : '';
  };
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
