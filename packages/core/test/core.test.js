// Unit tests (jsdom). They prove the runtime logic, NOT behavior on the real real site.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, tick, el } from './helpers.js';
import { defineExperiment } from '../src/lifecycle.js';
import { qs, create, insert, waitFor } from '../src/dom.js';
import { assertScoped } from '../src/style.js';
import { createEvents } from '../src/events.js';
import { createLogger } from '../src/log.js';
import { sessionStore } from '../src/storage.js';

const main = () => document.getElementById('main-content');
const addTarget = () => { const b = el('div', 'buybox'); b.appendChild(el('button', 'atc', 'Add')); main().appendChild(b); return b; };
const badges = () => document.querySelectorAll('[data-cro-owner="t1"]');

function exp(over = {}) {
  const calls = { apply: 0 };
  const def = defineExperiment({
    id: 't1',
    targets: { atc: '.atc' },
    apply(ctx) {
      calls.apply++;
      const b = ctx.ensure('badge', () => create('span', { class: 'cro-t1__badge', text: 'Hi' }), (n) => insert(n, ctx.targets.atc, 'after'));
      return !!b;
    },
    ...over,
  });
  return { def, calls };
}

test('idempotent start: twice -> one element, same instance, still applied', () => {
  setupDom(); addTarget();
  const { def } = exp();
  const a = def.start(), b = def.start();
  assert.equal(a, b);
  assert.equal(badges().length, 1);
  assert.equal(a.status, 'applied');
});

test('second injection with a newer definition reuses the instance and does not duplicate', () => {
  setupDom(); addTarget();
  const a = exp().def.start();
  const second = exp({ apply(ctx) { ctx.ensure('badge', () => create('span', { text: 'NEW' }), (n) => insert(n, ctx.targets.atc, 'after')); return true; } }).def.start();
  assert.equal(a, second);
  assert.equal(badges().length, 1);
});

test('missing target: status target-missing, apply not called, DOM untouched', () => {
  setupDom();
  const { def, calls } = exp();
  const inst = def.start();
  assert.equal(inst.status, 'target-missing');
  assert.deepEqual(inst.detail.missing, ['atc']);
  assert.equal(calls.apply, 0);
  assert.equal(badges().length, 0);
  inst.destroy();
});

test('dynamic insertion: applies once the target appears, then stops observing (when-needed)', async () => {
  setupDom();
  const inst = exp().def.start();
  assert.equal(inst.observing, true);
  addTarget();
  await tick();
  assert.equal(inst.status, 'applied');
  assert.equal(badges().length, 1);
  assert.equal(inst.observing, false);
});

test('removal and reinsertion (persist): re-applied, no duplicates', async () => {
  setupDom(); const first = addTarget();
  const { def, calls } = exp({ observe: 'persist' });
  const inst = def.start();
  assert.equal(inst.observing, true);
  first.remove(); // site re-render removes target (and our sibling stays orphaned in main)
  await tick();
  assert.equal(inst.status, 'target-missing');
  addTarget();
  await tick();
  assert.equal(inst.status, 'applied');
  assert.equal(badges().length, 1);
  assert.ok(calls.apply >= 2);
});

test('site wiping our element is detected and re-applied (persist)', async () => {
  setupDom(); addTarget();
  const inst = exp({ observe: 'persist' }).def.start();
  badges()[0].remove();
  await tick();
  assert.equal(badges().length, 1);
  inst.destroy();
});

test('destroy removes only owned nodes, styles, listeners, observer; allows a fresh start', async () => {
  setupDom(); addTarget();
  let clicks = 0;
  const { def } = exp({
    observe: 'persist',
    apply(ctx) {
      ctx.style('.cro-t1__badge{color:red}');
      ctx.setup('click', () => ctx.on(document.body, 'click', () => { clicks++; }));
      const b = ctx.ensure('badge', () => create('span', { class: 'cro-t1__badge', text: 'x' }), (n) => insert(n, ctx.targets.atc, 'after'));
      return !!b;
    },
  });
  const inst = def.start();
  document.body.click();
  assert.equal(clicks, 1);
  inst.destroy();
  document.body.click();
  assert.equal(clicks, 1);
  assert.equal(badges().length, 0);
  assert.equal(document.querySelectorAll('style[data-cro-style="t1"]').length, 0);
  assert.ok(document.querySelector('.atc') && document.getElementById('outside'));
  assert.equal(inst.status, 'destroyed');
  assert.equal(inst.observing, false);
  const again = def.start();
  assert.notEqual(again, inst);
  assert.equal(again.status, 'applied');
});

test('scoped CSS validation and style replace-not-duplicate', () => {
  setupDom();
  assert.equal(assertScoped('.cro-t1__a{color:red} .cro-t1__b:hover, [data-cro-t1] x{top:0}', 't1').ok, true);
  assert.equal(assertScoped('@media (min-width:1px){.cro-t1__a{color:red}} @keyframes k{from{opacity:0}to{opacity:1}}', 't1').ok, true);
  const bad = assertScoped('button{color:red} .cro-t1__a,h1{x:y} body.x{a:b}', 't1');
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.offenders, ['button', 'h1', 'body.x']);
  addTarget();
  const inst = exp({ apply(ctx) { ctx.style(`.cro-t1__badge{order:${Math.random()}}`); return true; } }).def.start();
  inst.run(); inst.run();
  assert.equal(document.querySelectorAll('style[data-cro-style="t1"]').length, 1);
});

test('unscoped CSS is refused: status error, page intact', () => {
  setupDom(); addTarget();
  const inst = exp({ apply(ctx) { ctx.style('button{display:none}'); return true; } }).def.start();
  assert.equal(inst.status, 'error');
  assert.match(inst.detail.error, /unscoped CSS/);
  assert.equal(document.querySelectorAll('style').length, 0);
});

test('event registry: dedupes, delegates once, removes everything', () => {
  setupDom();
  const ev = createEvents();
  const b = el('button', 'x'); document.body.appendChild(b);
  let n = 0; const fn = () => { n++; };
  ev.on(b, 'click', fn); ev.on(b, 'click', fn);
  b.click();
  assert.equal(n, 1);
  let d = 0; const h = () => { d++; };
  ev.delegate(document.body, 'click', '.x', h); ev.delegate(document.body, 'click', '.x', h);
  b.click();
  assert.equal(d, 1);
  assert.equal(ev.size(), 2);
  ev.destroy();
  b.click();
  assert.equal(n, 2); assert.equal(d, 1);
});

test('observer ignores irrelevant mutations and mutations inside owned nodes', async () => {
  setupDom(); addTarget();
  const { def, calls } = exp({ observe: 'persist' });
  const inst = def.start();
  const base = calls.apply;
  main().appendChild(el('p', 'unrelated', 'x'));            // irrelevant to targets
  await tick();
  assert.equal(calls.apply, base, 'irrelevant mutation must not re-run apply');
  // owned subtree receives something that WOULD match the target selector if it were not owned
  badges()[0].appendChild(el('button', 'atc', 'inside owned'));
  await tick();
  assert.equal(calls.apply, base, 'owned mutation must be ignored');
  // removing a child that lives inside the owned element is also our own business
  badges()[0].querySelector('button.atc').remove();
  await tick();
  assert.equal(calls.apply, base, 'removal inside owned subtree must be ignored');
  inst.destroy();
});

test('feedback loop 1: apply adding target-like nodes inside its own element does not loop', async () => {
  setupDom(); addTarget();
  let n = 0;
  const inst = exp({
    observe: 'persist',
    apply(ctx) {
      n++;
      const b = ctx.ensure('badge', () => create('span', { text: '0' }), (x) => insert(x, ctx.targets.atc, 'after'));
      if (b) b.appendChild(el('button', 'atc', String(n))); // own write that matches the watched selector
      return !!b;
    },
  }).def.start();
  const second = el('div', 'buybox'); second.appendChild(el('button', 'atc')); main().appendChild(second); // genuine relevant change
  await tick(30);
  assert.ok(n <= 3, `apply ran ${n} times`);
  inst.destroy();
});

test('feedback loop 2: apply that removes/re-adds its own element is flushed, not re-triggered', async () => {
  setupDom(); addTarget();
  let n = 0;
  const inst = exp({
    observe: 'persist',
    apply(ctx) {
      n++;
      const place = (x) => insert(x, ctx.targets.atc, 'after');
      const mk = () => create('span', { text: 'o' });
      const b = ctx.ensure('badge', mk, place);
      if (!b) return false;
      b.remove();                       // own removal -> would look like "owned-removed"
      return !!ctx.ensure('badge', mk, place);
    },
  }).def.start();
  addTarget();                           // genuine relevant change
  await tick(30);
  assert.ok(n <= 3, `apply ran ${n} times`);
  inst.destroy();
});

test('apply errors are caught, namespaced and only logged in debug', async () => {
  setupDom(); addTarget();
  const logs = [];
  const orig = console.error; console.error = (...a) => logs.push(a);
  try {
    const bad = exp({ apply() { throw new Error('boom'); } });
    const inst = bad.def.start();
    assert.equal(inst.status, 'error');
    assert.equal(inst.detail.error, 'boom');
    assert.equal(logs.length, 0);
    inst.destroy();
    window.localStorage.setItem('cro-debug', '1');
    const inst2 = exp({ apply() { throw new Error('boom'); } }).def.start();
    assert.equal(logs.length, 1);
    assert.equal(logs[0][0], '[cro:t1]');
    inst2.destroy();
  } finally { console.error = orig; }
});

test('apply must report explicitly; onStatus failures do not break the page', () => {
  setupDom(); addTarget();
  const inst = exp({ apply() { /* forgot to return */ } }).def.start();
  assert.equal(inst.status, 'error');
  inst.destroy();
  const seen = [];
  const ok = exp({ onStatus(s) { seen.push(s); throw new Error('tracker down'); } }).def.start();
  assert.equal(ok.status, 'applied');
  assert.deepEqual(seen, ['applied']);
});

test('apply false / {missing} are reported as target-missing, never applied', () => {
  setupDom(); addTarget();
  assert.equal(exp({ apply: () => false }).def.start().status, 'target-missing');
  document.getElementById('main-content').innerHTML = '';
  addTarget();
  const i = exp({ apply: () => ({ missing: ['price'] }) }).def.start();
  assert.deepEqual(i.detail.missing, ['price']);
});

test('defineExperiment validates id, apply and observe', () => {
  assert.throws(() => defineExperiment({ id: 'Bad Id', apply() {} }), /id must match/);
  assert.throws(() => defineExperiment({ id: 'ok' }), /apply/);
  assert.throws(() => defineExperiment({ id: 'ok', apply() {}, observe: 'x' }), /observe/);
});

test('dom helpers: safe create, insert validation, invalid selector, waitFor', async () => {
  setupDom();
  const e = create('div', { text: '<img src=x onerror=alert(1)>' }, ['a', create('b', { text: 'b' })]);
  assert.equal(e.querySelector('img'), null);
  assert.equal(e.textContent, '<img src=x onerror=alert(1)>ab');
  assert.equal(insert(e, el('div'), 'after'), false);       // detached anchor
  assert.equal(insert(e, main(), 'sideways'), false);       // bad position
  assert.equal(insert(e, main(), 'append'), true);
  assert.equal(qs('###'), null);
  setTimeout(() => main().appendChild(el('i', 'late')), 10);
  assert.ok(await waitFor('.late', { timeout: 500 }));
  assert.equal(await waitFor('.never', { timeout: 20 }), null);
});

test('logger is silent by default; sessionStore falls back when storage is blocked', () => {
  setupDom();
  const logs = []; const orig = console.info; console.info = (...a) => logs.push(a);
  try { createLogger('t1').info('x'); assert.equal(logs.length, 0); } finally { console.info = orig; }
  Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('blocked'); } });
  const s = sessionStore('t1');
  s.set('k', { a: 1 });
  assert.deepEqual(s.get('k'), { a: 1 });
  s.remove('k');
  assert.equal(s.get('k', 'dflt'), 'dflt');
});

// ---- Configurable tracking ----
import { isRef, sectionType, buildEvent, renderTemplate, sendEvent } from '../src/track.js';

function trackExp(over = {}) {
  return defineExperiment({ id: 't1', ref: 'EXP-1', targets: { atc: '.atc' }, apply(ctx) { ctx.setup('x', () => {}); return true; }, ...over });
}
const events = () => (window.dataLayer || []).filter((e) => e && e.event === 'cro_experiment');

test('tracking: refs are free-form, sections and templates render, default payload shape', () => {
  assert.equal(isRef('EXP-1'), true);
  assert.equal(isRef('FR #86'), true);
  for (const bad of ['', '   ', null, undefined, 42]) assert.equal(isRef(bad), false, String(bad));
  assert.equal(sectionType('EXP-1', 'compact_table'), 'EXP-1 - compact_table');
  assert.throws(() => sectionType('EXP-1', 'Bad Label'), /snake_case/);
  assert.throws(() => sectionType('', 'ok_label'), /invalid ref/);
  assert.deepEqual(buildEvent({ id: 't1', ref: 'EXP-1', label: 'a_b' }), { event: 'cro_experiment', experiment_ref: 'EXP-1', experiment_label: 'a_b' });
  assert.deepEqual(renderTemplate({ e: 'x', n: { s: '{section}', i: '{id}', arr: ['{label}', 3] } }, { id: 'i', ref: 'R', label: 'l', section: 'R - l' }), { e: 'x', n: { s: 'R - l', i: 'i', arr: ['l', 3] } });
});

test('tracking modes: custom dataLayer name + template, user hook, none', () => {
  setupDom();
  assert.equal(sendEvent({ id: 'a', ref: 'R1', label: 'x_y' }, { mode: 'datalayer', dataLayer: 'myLayer', template: { event: 'ab', s: '{section}' } }), true);
  assert.deepEqual(window.myLayer, [{ event: 'ab', s: 'R1 - x_y' }]);
  const got = [];
  window.analytics = { track: (p) => got.push(p) };
  assert.equal(sendEvent({ id: 'a', ref: 'R1', label: 'x_y' }, { mode: 'hook', hook: 'window.analytics.track' }), true);
  assert.deepEqual(got, [{ id: 'a', ref: 'R1', label: 'x_y', section: 'R1 - x_y' }]);
  assert.equal(sendEvent({ id: 'a', ref: 'R1', label: 'x_y' }, { mode: 'hook', hook: 'window.nope' }), false);
  assert.equal(sendEvent({ id: 'a', ref: 'R1', label: 'x_y' }, { mode: 'none' }), false);
  assert.equal(sendEvent({ id: 'a', ref: 'R1', label: 'BAD' }, { mode: 'datalayer', template: {} }), false); // never throws
});

test('ctx.track pushes once per page and label, creates dataLayer when missing, can repeat on request', () => {
  setupDom(); addTarget();
  assert.equal(window.dataLayer, undefined);
  const inst = trackExp({ apply(ctx) { ctx.track('bundle_contents'); ctx.track('bundle_contents'); return true; } }).start();
  assert.equal(inst.status, 'applied');
  assert.deepEqual(events(), [{ event: 'cro_experiment', experiment_ref: 'EXP-1', experiment_label: 'bundle_contents' }]);
  inst.run(); inst.run();
  assert.equal(events().length, 1, 'repeated apply() does not duplicate the event');
  inst.destroy();
  setupDom(); addTarget();
  const i2 = trackExp({ apply(ctx) { ctx.track('click_x', { once: false }); ctx.track('click_x', { once: false }); return true; } }).start();
  assert.equal(events().length, 2);
  i2.destroy();
});

test('tracking without a valid ref or with a bad label ends in status error and sends nothing', () => {
  setupDom(); addTarget();
  const noRef = trackExp({ ref: undefined, apply(ctx) { ctx.track('a_b'); return true; } }).start();
  assert.equal(noRef.status, 'error'); assert.match(noRef.detail.error, /invalid ref/); assert.equal(events().length, 0);
  noRef.destroy();
  const bad = trackExp({ apply(ctx) { ctx.track('Bad Label'); return true; } }).start();
  assert.equal(bad.status, 'error'); assert.match(bad.detail.error, /snake_case/);
  bad.destroy();
  assert.throws(() => defineExperiment({ id: 't1', ref: '  ', apply() {} }), /ref must be a non-empty string/);
});

test('trackOnClick sends the tracking event on every click of the selector, survives re-render, and stops after destroy', () => {
  setupDom(); const box = addTarget();
  const inst = trackExp({ apply(ctx) { ctx.trackOnClick('.atc', 'atc_click'); return true; } }).start();
  assert.equal(events().length, 0, 'nothing sent before a click');
  box.querySelector('.atc').click(); box.querySelector('.atc').click();
  assert.deepEqual(events(), Array(2).fill({ event: 'cro_experiment', experiment_ref: 'EXP-1', experiment_label: 'atc_click' }));
  inst.run(); box.querySelector('.atc').click();
  assert.equal(events().length, 3, 'a repeated apply() registers no second listener');
  const fresh = el('button', 'atc', 'New'); box.replaceChildren(fresh); fresh.click();
  assert.equal(events().length, 4, 'works on re-rendered nodes');
  inst.destroy(); fresh.click();
  assert.equal(events().length, 4, 'no event after destroy');
  setupDom(); addTarget();
  const bad = trackExp({ apply(ctx) { ctx.trackOnClick('.atc', 'Bad Label'); return true; } }).start();
  assert.equal(bad.status, 'error'); bad.destroy();
});

function mockLayout(el, rect, vh = 800) {
  window.innerHeight = vh;
  el.getBoundingClientRect = () => ({ top: rect.top, bottom: rect.top + rect.height, height: rect.height, left: 0, right: 100, width: 100 });
}

test('trackWhenVisible: fires once at 50% visibility on scroll, not before, and stops listening', async () => {
  setupDom(); const box = addTarget(); const sec = el('section', 'sec'); main().appendChild(sec);
  mockLayout(sec, { top: 900, height: 400 });                    // fully below the fold
  const inst = trackExp({ apply(ctx) { ctx.trackWhenVisible('.sec', 'compact_comparison_table'); return true; } }).start();
  assert.equal(events().length, 0);
  mockLayout(sec, { top: 700, height: 400 });                    // 100/400 = 25% visible
  window.dispatchEvent(new window.Event('scroll'));
  assert.equal(events().length, 0, 'below 50%: nothing');
  mockLayout(sec, { top: 600, height: 400 });                    // 200/400 = 50% visible
  window.dispatchEvent(new window.Event('scroll'));
  window.dispatchEvent(new window.Event('scroll'));
  assert.deepEqual(events().map((e) => e.experiment_label), ['compact_comparison_table']);
  void box; inst.destroy();
});

test('trackWhenVisible: immediate when already visible; tall sections use the viewport share; survives re-render; cleaned on destroy', () => {
  setupDom(); addTarget(); const sec = el('section', 'sec'); main().appendChild(sec);
  mockLayout(sec, { top: 100, height: 300 });
  trackExp({ apply(ctx) { ctx.trackWhenVisible('.sec', 'seen_now'); return true; } }).start();
  assert.equal(events().length, 1, 'visible at load -> sent immediately');
  setupDom(); addTarget(); const tall = el('section', 'sec'); main().appendChild(tall);
  mockLayout(tall, { top: -500, height: 3000 }, 800);            // covers the whole viewport but only 27% of its own height
  trackExp({ apply(ctx) { ctx.trackWhenVisible('.sec', 'tall_section'); return true; } }).start();
  assert.equal(events().length, 1, 'tall fallback: viewport coverage counts');
  setupDom(); addTarget(); const s1 = el('section', 'sec'); main().appendChild(s1);
  mockLayout(s1, { top: 900, height: 400 });
  const inst = trackExp({ apply(ctx) { ctx.trackWhenVisible(() => document.querySelector('.sec'), 'rerendered'); return true; } }).start();
  s1.remove(); const s2 = el('section', 'sec'); main().appendChild(s2); mockLayout(s2, { top: 100, height: 400 });
  window.dispatchEvent(new window.Event('scroll'));
  assert.equal(events().length, 1, 'the element is re-resolved at every check');
  inst.destroy();
  mockLayout(s2, { top: 100, height: 400 });
  window.dispatchEvent(new window.Event('scroll'));
  assert.equal(events().length, 1, 'no listener left after destroy');
});

test('trackWhenVisible re-arms for a new page view after in-app navigation', () => {
  setupDom(); addTarget(); const sec = el('section', 'sec'); main().appendChild(sec);
  mockLayout(sec, { top: 900, height: 400 });
  const inst = trackExp({ apply(ctx) { ctx.trackWhenVisible('.sec', 'later_section'); return true; } }).start();
  window.history.pushState({}, '', '/other/');
  window.dispatchEvent(new window.Event('scroll'));       // disarms (different page)
  inst.run();                                             // new page: apply arms again
  mockLayout(sec, { top: 100, height: 400 });
  window.dispatchEvent(new window.Event('scroll'));
  assert.equal(events().length, 1);
  inst.destroy();
});

test('config: defaults in ctx.config, setConfig overrides + re-applies, survives re-injection, destroy clears it', () => {
  setupDom(); addTarget();
  const seen = [];
  const mk = () => defineExperiment({
    id: 't1', targets: { atc: '.atc' }, config: { theme: 'light' },
    apply(ctx) { seen.push(ctx.config.theme); return true; },
  });
  const inst = mk().start();
  assert.deepEqual(inst.config, { theme: 'light' });
  assert.equal(inst.setConfig({ theme: 'dark' }), 'applied');
  assert.equal(seen[seen.length - 1], 'dark');
  mk().start(); // second injection of the same experiment keeps the live override (no reset to the default)
  assert.equal(seen[seen.length - 1], 'dark');
  inst.setConfig({ theme: null }); // null removes the override -> default again
  assert.equal(seen[seen.length - 1], 'light');
  inst.setConfig({ theme: 'dark' });
  inst.destroy();
  const again = mk().start();
  assert.equal(again.config.theme, 'light');
  again.destroy();
});

test('match: reverts on a SPA navigation to a non-matching URL and re-applies when it matches again', () => {
  setupDom(); addTarget();
  let allowed = true;
  const left = [];
  const mk = () => defineExperiment({
    id: 't1', targets: { atc: '.atc' },
    match: () => allowed,
    leave: () => left.push(1),
    apply(ctx) {
      ctx.style('.cro-t1__badge { color: red; }');
      return !!ctx.ensure('badge', () => create('span', { class: 'cro-t1__badge', text: 'Hi' }), (n) => insert(n, ctx.targets.atc, 'after'));
    },
  });
  const inst = mk().start();
  assert.equal(inst.status, 'applied');
  assert.equal(badges().length, 1);
  assert.ok(document.querySelector('style[data-cro-style="t1"]'));
  allowed = false;
  assert.equal(inst.run('navigation'), 'inactive');
  assert.equal(badges().length, 0);
  assert.equal(document.querySelector('style[data-cro-style="t1"]'), null);
  assert.equal(left.length, 1);
  allowed = true;
  assert.equal(inst.run('navigation'), 'applied');
  assert.equal(badges().length, 1);
  assert.ok(document.querySelector('style[data-cro-style="t1"]'));
  inst.destroy();
});
