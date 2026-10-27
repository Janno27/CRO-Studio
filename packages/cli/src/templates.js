// File templates used by `cro-studio new`. Placeholders are plain functions: no template engine.
export const variantJs = ({ id, ref, ns }) => `// Experiment ${id}. Fill in apply(); keep the safe patterns (ctx.ensure, ctx.setup, ctx.style, scoped CSS).
import { defineExperiment, create, insert } from '@cro-studio/core';
import selectors from './selectors.json';
import css from './styles.css';

const ID = '${id}'; // must equal the folder name and the brief front matter id
const S = Object.fromEntries(selectors.map((s) => [s.name, s.selector]));

defineExperiment({
  id: ID,${ref ? `\n  ref: '${ref}', // used by ctx.track(); must equal the brief ref` : ''}
  targets: { anchor: S.anchor },
  observe: 'persist', // keep re-applying after framework re-renders (use 'when-needed' for static pages)
  apply(ctx) {
    ctx.style(css);
    const el = ctx.ensure('badge', () => create('div', { class: \`${ns}-\${ID}__badge\`, text: 'TODO' }), (n) => insert(n, ctx.targets.anchor, 'after'));
    return !!el;
  },
}).start();
`;

export const stylesCss = ({ id, ns }) => `/* Every selector MUST start with .${ns}-${id} (checked by validate/build and by ctx.style). */
.${ns}-${id}__badge { font: 600 14px/1.4 system-ui, sans-serif; padding: 8px 12px; }
`;

export const selectorsJson = ({ market, pageType, anchor }) => JSON.stringify([{
  name: 'anchor',
  selector: anchor,
  purpose: 'Element the variation is inserted next to. Replace with a selector you verified on the live page.',
  pageTypes: [pageType],
  markets: [market],
  status: 'not-tested',
  role: 'target',
  evidence: [],
}], null, 2) + '\n';

export const briefMd = ({ id, ref, name, markets, pageTypes, cfg }) => {
  const figma = cfg.design && cfg.design.figma;
  const rev = cfg.reviews;
  return `---
id: ${id}
ref: ${ref ? JSON.stringify(ref) : 'null'}   # your tracker reference (optional unless the experiment tracks events)
name: ${JSON.stringify(name)}
status: draft       # draft | ready
owner: null
markets: [${markets.join(', ')}]
pageTypes: [${pageTypes.join(', ')}]
urls: []            # [{ market, label, url }]
design:
  figma: null       # Figma link (file or frame) for the variation${figma ? '' : ' (Figma is disabled in your config)'}
tracking:
  required: unknown # true | false | unknown
  events: []        # [{ label: snake_case, trigger: visible|click|immediate|custom, target: selector name }]
reviews:            # pending | approved | skipped ; enforced for status "ready" when enabled in ${'cro-studio.config.json'}
  design: ${rev.design ? 'pending' : 'skipped'}
  engineer: ${rev.engineer ? 'pending' : 'skipped'}
---
# ${name}

Write \`Unknown\` instead of inventing content.

## Hypothesis
Unknown

## Context
Unknown

## Control
Unknown

## Variation
Unknown

## Success criteria
Unknown

## Design
Unknown

## Tracking
Unknown

## Technical risks
Unknown

## Open questions
- (none)
`;
};

export const BRIEF_SECTIONS = ['Hypothesis', 'Context', 'Control', 'Variation', 'Success criteria', 'Design', 'Tracking', 'Technical risks', 'Open questions'];
