// Replaces the add-to-cart label and restores it on destroy(). Tracks clicks on the button.
import { defineExperiment } from '@cro-studio/core';
import selectors from './selectors.json';
import css from './styles.css';

const ID = 'cta-label-test';
const S = Object.fromEntries(selectors.map((s) => [s.name, s.selector]));

defineExperiment({
  id: ID,
  ref: 'DEMO-2',
  targets: { cta: S.anchor },
  observe: 'persist',
  apply(ctx) {
    ctx.style(css);
    const btn = ctx.targets.cta;
    if (!btn.hasAttribute('data-demo-original')) btn.setAttribute('data-demo-original', btn.textContent);
    btn.textContent = 'Add to basket, ships tomorrow';
    ctx.own(() => { btn.textContent = btn.getAttribute('data-demo-original'); btn.removeAttribute('data-demo-original'); });
    ctx.trackOnClick(S.anchor, 'cta_clicked');
    return true;
  },
}).start();
