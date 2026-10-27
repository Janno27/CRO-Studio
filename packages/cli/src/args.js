export function parseArgs(argv) {
  const flags = {}; const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      flags[key] = key in flags ? [].concat(flags[key], val) : val; // repeated flags become arrays
    } else pos.push(a);
  }
  return { cmd: pos[0], pos: pos.slice(1), flags };
}
