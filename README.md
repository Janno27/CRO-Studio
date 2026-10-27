# CRO Studio

**Ship A/B test variations as safe, self-contained JS/CSS payloads, for any testing platform.**

CRO Studio is a small, open-source toolkit for experimentation teams. You describe a test, it helps you build the variation, **validates it automatically**, and produces a payload you paste into AB Tasty, Optimizely, VWO, Convert, GTM or any tool that accepts JS/CSS.

- **Safe by construction**: idempotent apply, CSS scoped to the experiment, a single observer, a single namespaced global, `destroy()` that removes only what the test created, and never an exception thrown into the host page.
- **Checked before you ship**: static analysis (AST), CSS scope, selector documentation, then the *built* payload is executed in jsdom: blank page, synthetic page, double injection, destroy-restores-the-page.
- **Configurable, not opinionated**: your markets and hosts, page types, id format, namespace, tracking shape (dataLayer template or your own hook), brief source, design source, optional review gates. Nothing is tied to a company or a tool.
- **Works with or without AI**: a plain CLI first. Optional `AGENTS.md` + Claude Code command so an assistant follows the same rules, can read briefs from any MCP server and design from Figma.
- **Honest**: reports never claim platform compatibility. Static checks are safeguards, not proof; the human preview stays in the loop.

## Quick start

```bash
mkdir my-experiments && cd my-experiments
npx cro-studio init            # guided setup -> cro-studio.config.json
npm install
npx cro-studio new checkout-trust-badge --ref EXP-12 --page checkout
npx cro-studio capture --url https://shop.example.com/checkout --page checkout --target cta='#pay' # verify selectors
# edit experiments/checkout-trust-badge/{brief.md,selectors.json,variant.js,styles.css}
npx cro-studio validate
npx cro-studio build           # dist/<id>/payload.js, variant.js, styles.css, manifest.json, validation-report.md
npx cro-studio preview checkout-trust-badge --url https://shop.example.com/checkout --headed
```

Paste `dist/<id>/payload.js` (JS + CSS in one file) into your platform, or `variant.js` + `styles.css` if it has separate fields.

## Commands

| Command | What it does |
|---|---|
| `init` | Guided setup (`--yes` for defaults). Writes `cro-studio.config.json`, `.gitignore`, optional AI files |
| `new <id>` | Scaffolds `experiments/<id>/` (brief, selectors, variant, styles) |
| `validate [id]` | Static checks on one or all experiments |
| `build [id] [--minify]` | Validates, bundles (esbuild, IIFE, ES2019), runs built-artifact checks, writes `dist/<id>/` |
| `capture --url <page>` | Observes a live page: selector uniqueness report, ranked alternatives, DOM, styles, sanitized output; `capture evidence` stamps proof into `selectors.json` |
| `preview <id> --url <page>` | Injects the built payload in a real page via Playwright (headless or `--headed`) |
| `doctor` | Checks Node, config, optional tools |

## A variation in 20 lines

```js
import { defineExperiment, create, insert } from '@cro-studio/core';
import selectors from './selectors.json';
import css from './styles.css';

const ID = 'trust-badge-under-cta';
const S = Object.fromEntries(selectors.map((s) => [s.name, s.selector]));

defineExperiment({
  id: ID,
  ref: 'DEMO-1',
  targets: { cta: S.anchor },
  observe: 'persist',                      // re-apply after framework re-renders
  apply(ctx) {
    ctx.style(css);                        // refuses CSS outside .<namespace>-<id>
    const badge = ctx.ensure('badge', () => create('p', { class: `demo-${ID}__badge`, text: '30-day free returns' }),
      (n) => insert(n, ctx.targets.cta, 'after'));
    if (!badge) return false;
    ctx.trackWhenVisible(badge, 'returns_badge_seen');   // shape comes from your config
    return true;
  },
}).start();
```

See [`examples/demo-project`](examples/demo-project) for two complete experiments.

## Documentation

- [Quick start and workflow](docs/workflow.md)
- [Configuration reference](docs/configuration.md)
- [Runtime API (`@cro-studio/core`)](docs/runtime.md)
- [Tracking: templates and hooks](docs/tracking.md)
- [Page capture and selector evidence](docs/capture.md)
- [Validation and QA levels](docs/validation.md)
- [Using it with an AI assistant, MCP briefs and Figma](docs/ai-and-mcp.md)
- [Roadmap](docs/roadmap.md)

## Repository layout

```
packages/core   @cro-studio/core  the dependency-free payload runtime
packages/cli    cro-studio        the CLI (init, new, validate, build, capture, preview, doctor)
examples/       demo-project      two complete experiments
docs/           documentation
```

## Requirements

Node.js 20.19+. macOS, Linux and Windows (CI runs on all three). `preview` additionally needs `playwright-core` and a Chromium or Chrome.

## License

[MIT](LICENSE)
