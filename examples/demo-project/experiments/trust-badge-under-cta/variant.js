// Adds a "30-day returns" trust badge under the add-to-cart button and tracks when half of it is visible.
import { defineExperiment, create, insert } from '@cro-studio/core';
import selectors from './selectors.json';
import css from './styles.css';

const ID = 'trust-badge-under-cta';
const S = Object.fromEntries(selectors.map((s) => [s.name, s.selector]));

defineExperiment({
  id: ID,
  ref: 'DEMO-1',
  targets: { cta: S.anchor },
  observe: 'persist',
  apply(ctx) {
    ctx.style(css);
    const badge = ctx.ensure(
      'badge',
      () => create('p', { class: `demo-${ID}__badge`, text: '30-day free returns' }),
      (n) => insert(n, ctx.targets.cta, 'after'),
    );
    if (!badge) return false;
    ctx.trackWhenVisible(badge, 'returns_badge_seen');
    return true;
  },
}).start();
