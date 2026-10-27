// Build one experiment into <outDir>/<id>/: variant.js, styles.css, payload.js (+ payload.min.js), manifest.json, validation-report.md.
// Output is written only if source AND built-artifact validation pass. A successful bundle never implies platform compatibility.
import { build as esbuild, version as esbuildVersion } from 'esbuild';
import { mkdirSync, writeFileSync, readFileSync, rmSync, renameSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateSources, validateBuilt, Result, summarize } from './validate.js';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const coreEntry = fileURLToPath(import.meta.resolve('@cro-studio/core'));

async function bundle(dir, config, { withCss, minify }) {
  const cssPlugin = {
    name: 'css',
    setup(b) {
      b.onLoad({ filter: /\.css$/ }, (args) => ({ contents: `export default ${withCss ? JSON.stringify(readFileSync(args.path, 'utf8')) : '""'};`, loader: 'js' }));
    },
  };
  const res = await esbuild({
    entryPoints: [join(dir, 'variant.js')], bundle: true, write: false, format: 'iife', target: 'es2019', minify,
    legalComments: 'none', treeShaking: true, metafile: true, plugins: [cssPlugin], loader: { '.json': 'json' }, logLevel: 'silent',
    alias: { '@cro-studio/core': coreEntry },
    define: { __CRO_NS__: JSON.stringify(config.namespace), __CRO_TRACKING__: JSON.stringify(config.tracking) },
  });
  const out = Object.values(res.metafile.outputs)[0];
  // esbuild annotates each module with its (machine-specific) path: strip those comments so payloads never leak local paths
  const code = res.outputFiles[0].text.replace(/^[ \t]*\/\/ (?:<define:\w+>|[^\n]*\.(?:js|json|css))[ \t]*\r?\n/gm, '');
  return { code, inputs: Object.entries(out.inputs).filter(([, v]) => v.bytesInOutput > 0).map(([k]) => k) };
}

export function renderReport({ manifest, validation }) {
  const rows = validation.checks.map((c) => `| ${c.status.toUpperCase()} | ${c.name} | ${String(c.detail).replace(/\|/g, '\\|')} |`).join('\n');
  return `# Validation report: ${manifest.id}\n\nBuilt ${manifest.builtAt}. Result: **${validation.status}** (${validation.errors} errors, ${validation.warnings} warnings).\n\n| Result | Check | Detail |\n|---|---|---|\n${rows}\n\n## What this report does NOT prove\n- Behaviour on the real site: preview the payload in a real browser and check it by eye.\n- Compatibility with your testing platform (activation, field order, re-activation on navigation): verify in the platform.\n`;
}

export async function buildExperiment(dir, { config, root = '.', minify = false, now = new Date() }) {
  const distRoot = join(root, config.outDir);
  const { r: src, meta, selectors } = validateSources(dir, config);
  const id = meta ? meta.id : dir.split(/[\\/]/).pop();
  const distDir = join(distRoot, id);
  const clean = () => { if (existsSync(distDir)) rmSync(distDir, { recursive: true, force: true }); };
  if (!src.ok) { clean(); return { ok: false, message: 'source validation failed', report: summarize(src), dir }; }

  const css = readFileSync(join(dir, 'styles.css'), 'utf8');
  let combined, jsOnly;
  try { [combined, jsOnly] = await Promise.all([bundle(dir, config, { withCss: true, minify: false }), bundle(dir, config, { withCss: false, minify: false })]); }
  catch (e) { clean(); return { ok: false, message: `bundling failed: ${e.message.split('\n')[0]}`, dir }; }

  const stamp = now.toISOString();
  const banner = (kind) => `/* ${config.namespace} | ${id} | ${kind} | built ${stamp} | generated: do not edit, change ${relative(root, dir).replace(/\\/g, '/')}/ */\n`;
  const files = {
    'variant.js': banner('variant.js (CSS delivered separately via styles.css)') + jsOnly.code,
    'payload.js': banner('payload.js (JS + CSS in one file)') + combined.code,
    'styles.css': `/* ${config.namespace} | ${id} | styles.css | built ${stamp} */\n${css}`,
  };
  const built = validateBuilt(files, { meta, selectors, config });
  const all = new Result().merge(src).merge(built);
  const validation = summarize(all);
  if (!all.ok) { clean(); return { ok: false, message: 'built-artifact validation failed', report: validation, dir }; }
  if (minify) files['payload.min.js'] = banner('payload.min.js (minified)') + (await bundle(dir, config, { withCss: true, minify: true })).code;

  const manifest = {
    id, ref: meta.ref || null, name: meta.name, status: meta.status, builtAt: stamp,
    markets: meta.markets, pageTypes: meta.pageTypes, namespace: config.namespace, platformTarget: config.platform.target,
    tools: { node: process.version, esbuild: esbuildVersion, target: 'es2019' },
    sources: ['brief.md', 'selectors.json', 'variant.js', 'styles.css'].map((f) => ({ file: `${relative(root, dir).replace(/\\/g, '/')}/${f}`, sha256: sha(readFileSync(join(dir, f))) })),
    bundledModules: combined.inputs.filter((i) => /core[\\/]src/.test(i)).map((i) => i.replace(/^.*core[\\/]src[\\/]/, '')).sort(),
    outputs: Object.keys(files).map((f) => ({ file: f, bytes: Buffer.byteLength(files[f]), sha256: sha(files[f]) })),
    validation: { status: validation.status, errors: validation.errors, warnings: validation.warnings },
    platformCompatibility: 'not verified: a successful bundle and static validation do not establish compatibility with any testing platform',
  };
  const tmp = join(distRoot, `.tmp-${id}-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  for (const [f, c] of Object.entries(files)) writeFileSync(join(tmp, f), c);
  writeFileSync(join(tmp, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(join(tmp, 'validation-report.md'), renderReport({ manifest, validation }));
  rmSync(distDir, { recursive: true, force: true });
  renameSync(tmp, distDir);
  return { ok: true, dir, distDir, manifest, report: validation };
}
