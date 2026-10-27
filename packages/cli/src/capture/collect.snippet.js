// In-page collector. Injected by `cro-studio capture` as window.__croCollect (also loaded in jsdom by tests).
// Single source of truth for selector candidate generation and assessment.
// No imports, no external requests other than one same-origin GET of the current page (dynamic-render check).
(() => {
  const STYLE_PROPS = [
    'display', 'position', 'visibility', 'overflow', 'z-index', 'box-sizing', 'width', 'height',
    'margin', 'padding', 'font-family', 'font-size', 'font-weight', 'line-height', 'color',
    'background-color', 'border', 'border-radius', 'flex-direction', 'justify-content', 'align-items',
    'gap', 'grid-template-columns',
  ];
  const STABLE_ATTRS = ['data-testid', 'data-test', 'data-qa', 'data-cy', 'data-component', 'data-section', 'data-product-id', 'data-id'];

  const esc = (s) => (window.CSS && window.CSS.escape ? window.CSS.escape(s) : String(s).replace(/([^\w-])/g, '\\$1'));
  const hashy = (t) =>
    /^blt[0-9a-f]{6,}$/i.test(t) || /^data-v-/i.test(t) || /^(css|sc|jsx|svelte|emotion)-/i.test(t) ||
    (/[-_][0-9a-f]{6,}$/i.test(t) && /\d/.test(t)) || (t.startsWith('_') && t.length > 5);
  const clip = (s, n) => (s == null ? s : String(s).length > n ? String(s).slice(0, n) + '…' : String(s));

  function fragileReasons(selector) {
    const reasons = [];
    const tokens = selector.match(/[.#][A-Za-z_][\w-]*/g) || [];
    tokens.forEach((t) => { if (hashy(t.slice(1))) reasons.push(`generated-looking token ${t}`); });
    if (/data-v-/.test(selector)) reasons.push('scoped-style attribute data-v-*');
    if (/:nth-(child|of-type)/.test(selector)) reasons.push('positional (:nth-*)');
    if ((selector.match(/ > | /g) || []).length > 3) reasons.push('deep path (>3 combinators)');
    return reasons;
  }

  function assess(selector, expected) {
    let nodes;
    try { nodes = Array.from(document.querySelectorAll(selector)); } catch (e) {
      return { selector, count: 0, unique: false, pointsToTarget: false, classification: 'invalid', reasons: ['invalid selector'] };
    }
    const count = nodes.length;
    const pointsToTarget = expected ? nodes.includes(expected) : null;
    const reasons = fragileReasons(selector);
    let classification;
    if (count === 0) classification = 'not-found';
    else if (expected && !pointsToTarget) classification = 'wrong-element';
    else if (reasons.length) classification = 'fragile';
    else classification = count === 1 ? 'verified-unique' : 'verified-non-unique';
    return { selector, count, unique: count === 1, pointsToTarget, classification, reasons };
  }

  const RANK = { 'verified-unique': 0, 'verified-non-unique': 1, fragile: 2, 'wrong-element': 3, 'not-found': 3, invalid: 3 };

  function candidates(el) {
    const tag = el.tagName.toLowerCase();
    const out = [];
    STABLE_ATTRS.forEach((a) => { const v = el.getAttribute(a); if (v) { out.push(`[${a}="${v}"]`); out.push(`${tag}[${a}="${v}"]`); } });
    if (el.id && !hashy(el.id)) out.push(`#${esc(el.id)}`);
    const role = el.getAttribute('role');
    if (role) out.push(`${tag}[role="${role}"]`);
    const label = el.getAttribute('aria-label');
    if (label && label.length < 60) out.push(`${tag}[aria-label="${label.replace(/"/g, '\\"')}"]`);
    const cls = Array.from(el.classList).filter((c) => !hashy(c));
    cls.forEach((c) => { out.push(`.${esc(c)}`); out.push(`${tag}.${esc(c)}`); });
    if (cls.length > 1) out.push(`${tag}.${esc(cls[0])}.${esc(cls[1])}`);
    const parent = el.parentElement;
    if (parent) {
      const pCls = Array.from(parent.classList).filter((c) => !hashy(c));
      const pSel = parent.id && !hashy(parent.id) ? `#${esc(parent.id)}` : pCls[0] ? `.${esc(pCls[0])}` : null;
      if (pSel && cls[0]) out.push(`${pSel} > ${tag}.${esc(cls[0])}`);
    }
    const path = [];
    for (let n = el, i = 0; n && n.nodeType === 1 && n !== document.body && i < 4; n = n.parentElement, i++) {
      const sibs = n.parentElement ? Array.from(n.parentElement.children).filter((c) => c.tagName === n.tagName) : [n];
      path.unshift(`${n.tagName.toLowerCase()}${sibs.length > 1 ? `:nth-of-type(${sibs.indexOf(n) + 1})` : ''}`);
    }
    out.push(path.join(' > '));
    const seen = new Set();
    return out.filter((s) => (seen.has(s) ? false : seen.add(s)))
      .map((s, i) => ({ ...assess(s, el), order: i }))
      .sort((a, b) => RANK[a.classification] - RANK[b.classification] || a.order - b.order)
      .map((c) => { delete c.order; return c; })
      .slice(0, 6);
  }

  const bestSel = (el) => { const c = candidates(el)[0]; return c ? c.selector : null; };
  const rectOf = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const stylesOf = (el) => { const cs = getComputedStyle(el); const o = {}; STYLE_PROPS.forEach((p) => { o[p] = cs.getPropertyValue(p); }); return o; };

  function cleanHtml(el, max) {
    const c = el.cloneNode(true);
    c.querySelectorAll('script, style, noscript').forEach((n) => n.remove());
    c.querySelectorAll('svg').forEach((n) => { n.innerHTML = ''; n.setAttribute('data-cro-stripped', 'svg'); });
    c.querySelectorAll('[src^="data:"]').forEach((n) => n.setAttribute('src', 'data:[stripped]'));
    c.querySelectorAll('input[type=password], input[type=hidden]').forEach((n) => n.removeAttribute('value'));
    let html = c.outerHTML;
    let truncated = false;
    if (html.length > max) { html = html.slice(0, max); truncated = true; }
    return { html, truncated };
  }

  const attrsOf = (el) => {
    const o = {};
    Array.from(el.attributes).forEach((a) => {
      if (a.name === 'style' || a.name === 'class' || /^data-v-/.test(a.name)) return;
      o[a.name] = clip(a.value, 120);
    });
    return o;
  };

  const describe = (n) => ({ tag: n.tagName.toLowerCase(), id: n.id || undefined, classes: Array.from(n.classList), text: clip((n.textContent || '').trim().replace(/\s+/g, ' '), 40) });

  async function rawDoc() {
    try {
      if (typeof fetch !== 'function') return null;
      const r = await fetch(location.pathname + location.search, { credentials: 'same-origin' });
      return new DOMParser().parseFromString(await r.text(), 'text/html');
    } catch (e) { return null; }
  }

  async function collectTarget(t, raw, maxHtml) {
    const out = { name: t.name, description: t.description || t.name, selector: t.selector, found: false, matchCount: 0 };
    let nodes;
    try { nodes = document.querySelectorAll(t.selector); } catch (e) { out.error = 'invalid selector'; return out; }
    out.matchCount = nodes.length;
    if (!nodes.length) { out.error = 'target not found'; return out; }
    const el = nodes[0];
    out.found = true;
    out.tag = el.tagName.toLowerCase();
    out.attributes = attrsOf(el);
    out.classes = Array.from(el.classList);
    out.rect = rectOf(el);
    out.visible = out.rect.w > 0 && out.rect.h > 0 && getComputedStyle(el).visibility !== 'hidden';
    const h = cleanHtml(el, maxHtml);
    out.outerHTML = h.html;
    out.htmlTruncated = h.truncated;
    out.candidates = candidates(el);
    out.selectorAssessment = assess(t.selector, el);
    out.ancestors = [];
    for (let n = el.parentElement; n && n !== document.documentElement && out.ancestors.length < 10; n = n.parentElement) {
      out.ancestors.push({ tag: n.tagName.toLowerCase(), id: n.id || undefined, classes: Array.from(n.classList), selector: bestSel(n) });
    }
    out.siblings = { previous: el.previousElementSibling ? describe(el.previousElementSibling) : null, next: el.nextElementSibling ? describe(el.nextElementSibling) : null };
    let dynamic = null;
    if (raw) {
      const probe = out.candidates.find((c) => c.classification !== 'not-found' && !c.reasons.length) || out.candidates[0];
      if (probe) dynamic = raw.querySelector(probe.selector) ? false : true;
    }
    out.dynamicallyRendered = dynamic; // true: absent from server HTML; false: present; null: unknown
    out.styles = { target: stylesOf(el), ancestors: [] };
    let p = el.parentElement;
    for (let i = 0; i < 3 && p && p !== document.documentElement; i++, p = p.parentElement) out.styles.ancestors.push({ selector: bestSel(p), styles: stylesOf(p) });
    out.note = t.note || null;
    return out;
  }

  function landmarks() {
    const defs = [['header', 'header'], ['nav', 'nav'], ['main', 'main'], ['footer', 'footer'], ['h1', 'h1']];
    return defs.map(([role, sel]) => {
      const el = document.querySelector(sel);
      return el ? { role, tag: el.tagName.toLowerCase(), id: el.id || undefined, classes: Array.from(el.classList).slice(0, 4), selector: bestSel(el), rect: rectOf(el), text: role === 'h1' ? clip(el.textContent.trim(), 80) : undefined } : { role, found: false };
    });
  }

  function sections() {
    const roots = [document.querySelector('main'), document.querySelector('header'), document.querySelector('footer')].filter(Boolean);
    const list = [];
    roots.forEach((r) => Array.from(r.children).slice(0, 12).forEach((c) => {
      const hd = c.querySelector('h1, h2, h3');
      list.push({ parent: r.tagName.toLowerCase(), tag: c.tagName.toLowerCase(), id: c.id || undefined, classes: Array.from(c.classList).slice(0, 4), selector: bestSel(c), childCount: c.children.length, rect: rectOf(c), heading: hd ? clip(hd.textContent.trim(), 60) : undefined });
    }));
    return list;
  }

  function controls(scopeSel) {
    const scope = document.querySelector(scopeSel) || document.body;
    const q = 'button, [role=tab], [role=combobox], summary, details, [aria-expanded], a.button, a[class*="button"]';
    const items = Array.from(scope.querySelectorAll(q)).slice(0, 30).map((e) => ({
      tag: e.tagName.toLowerCase(), role: e.getAttribute('role') || undefined,
      text: clip((e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' '), 40),
      expanded: e.getAttribute('aria-expanded') || undefined, selector: bestSel(e),
    }));
    return { scope: scopeSel, total: scope.querySelectorAll(q).length, sample: items };
  }

  function meta(o) {
    const ld = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((s) => { try { const j = JSON.parse(s.textContent); return j['@type'] || (j['@graph'] || []).map((x) => x['@type']); } catch (e) { return 'parse-error'; } });
    const cur = []; // currency evidence from JSON-LD offers
    Array.from(document.querySelectorAll('script[type="application/ld+json"]')).forEach((s) => {
      const m = s.textContent.match(/"priceCurrency"\s*:\s*"([A-Z]{3})"/); if (m && !cur.includes(m[1])) cur.push(m[1]);
    });
    return {
      url: location.origin + location.pathname,
      hadQueryString: !!location.search,
      title: document.title,
      market: o.market,
      pageType: o.pageType,
      pageTypeBasis: o.pageTypeBasis || null,
      locale: {
        htmlLang: document.documentElement.lang || null,
        ogLocale: (document.querySelector('meta[property="og:locale"]') || {}).content || null,
        canonical: (document.querySelector('link[rel=canonical]') || {}).href || null,
        hreflang: Array.from(document.querySelectorAll('link[rel=alternate][hreflang]')).map((l) => `${l.hreflang} ${l.href}`).slice(0, 20),
        currencyEvidence: cur,
        tld: location.hostname.split('.').slice(-2).join('.'),
      },
      pageTypeEvidence: { path: location.pathname, h1: clip(((document.querySelector('h1') || {}).textContent || '').trim(), 80), jsonLdTypes: ld, ogType: (document.querySelector('meta[property="og:type"]') || {}).content || null },
      viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio || 1 },
      userAgent: navigator.userAgent,
      frameworkHints: { nuxt: !!window.__NUXT__ || !!document.querySelector('#__nuxt'), vue: !!document.querySelector('[data-v-app]') || !!window.__VUE__, react: !!document.querySelector('[data-reactroot], #__next') || !!window.__REACT_DEVTOOLS_GLOBAL_HOOK__, shopify: !!window.Shopify, dataLayer: Array.isArray(window.dataLayer) },
    };
  }

  function stateProbe(o) {
    const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(16); };
    return {
      url: location.pathname + location.search,
      title: document.title,
      probes: (o.probes || []).map((p) => {
        const el = document.querySelector(p.selector);
        if (!el) return { name: p.name, selector: p.selector, found: false };
        return {
          name: p.name, selector: p.selector, found: true, text: clip((el.innerText || el.textContent || '').trim().replace(/\s+/g, ' '), 160),
          classes: Array.from(el.classList).slice(0, 8), ariaExpanded: el.getAttribute('aria-expanded'), ariaSelected: el.getAttribute('aria-selected'),
          htmlHash: hash(el.outerHTML), childCount: el.children.length,
        };
      }),
    };
  }


  // ---- survey mode: one page-level snapshot for context.md (structure, component classes, observed palette, existing tracking) ----
  function toHex(c) {
    const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(c || '');
    if (!m) return null;
    if (m[4] !== undefined && Number(m[4]) === 0) return null; // fully transparent
    return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
  }
  const bump = (map, key, extra) => { if (key == null || key === '') return; const e = map.get(key) || { count: 0, extra: {} }; e.count++; if (extra) e.extra[extra] = (e.extra[extra] || 0) + 1; map.set(key, e); };
  const top = (map, n) => Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count).slice(0, n).map(([value, e]) => ({ value, count: e.count, ...(Object.keys(e.extra).length ? { on: e.extra } : {}) }));

  function componentClassInventory(scope) {
    const map = new Map();
    scope.querySelectorAll('*').forEach((n) => Array.from(n.classList).forEach((c) => { if (/^([a-z]+(-[a-z0-9]+)*(__|--)[a-z0-9-]+$|[a-z][a-z0-9]*(-[a-z0-9]+)+$)/.test(c) && !hashy(c) && !/^data-v-/.test(c)) bump(map, c); }));
    return top(map, 80).map(({ value, count }) => ({ class: value, count }));
  }

  function observedPalette(scope) {
    const colors = new Map(), bgs = new Map(), borders = new Map(), fonts = new Map(), sizes = new Map(), weights = new Map(), radii = new Map();
    const nodes = Array.from(scope.querySelectorAll('*')).slice(0, 900);
    nodes.forEach((n) => {
      const r = n.getBoundingClientRect();
      if (r.width <= 0 && r.height <= 0) return;
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      if (n.childNodes.length && Array.from(n.childNodes).some((c) => c.nodeType === 3 && c.textContent.trim())) {
        bump(colors, toHex(cs.color));
        bump(fonts, (cs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim());
        bump(sizes, cs.fontSize);
        bump(weights, cs.fontWeight);
      }
      bump(bgs, toHex(cs.backgroundColor));
      if (parseFloat(cs.borderTopWidth) > 0) bump(borders, toHex(cs.borderTopColor));
      if (parseFloat(cs.borderTopLeftRadius) > 0) bump(radii, cs.borderTopLeftRadius);
    });
    return { textColors: top(colors, 8), backgrounds: top(bgs, 8), borderColors: top(borders, 5), fontFamilies: top(fonts, 4), fontSizes: top(sizes, 8), fontWeights: top(weights, 5), radii: top(radii, 6), sampled: nodes.length };
  }

  function trackingSurvey() {
    const dl = Array.isArray(window.dataLayer) ? window.dataLayer : [];
    const ev = new Map();
    dl.forEach((e) => {
      const name = e && typeof e === 'object' && !Array.isArray(e) ? (e.event || '(no event key)') : (Array.isArray(e) ? `gtag:${String(e[0])}` : '(non-object)');
      const entry = ev.get(name) || { event: name, count: 0, keys: new Set() };
      entry.count++;
      if (e && typeof e === 'object') Object.keys(e).slice(0, 14).forEach((k) => entry.keys.add(k)); // keys only: values may be personal data
      ev.set(name, entry);
    });
    const attrs = new Map();
    Array.from(document.querySelectorAll('*')).slice(0, 6000).forEach((n) => Array.from(n.attributes).forEach((a) => { if (/^data-(track|tracking|gtm|analytics|ga|event)(-|$)/.test(a.name)) bump(attrs, a.name); }));
    const globals = {};
    ['gtag', 'ga', 'fbq', 'ttq', 'snaptr', '_satellite', 'utag', 'dataLayer', 'ABTasty', 'optimizely', '_vwo_code', 'convert', 'clarity', 'hj'].forEach((g) => { if (window[g] !== undefined) globals[g] = typeof window[g]; });
    return {
      dataLayerLength: dl.length,
      events: Array.from(ev.values()).sort((a, b) => b.count - a.count).slice(0, 40).map((e) => ({ event: e.event, count: e.count, keys: Array.from(e.keys) })),
      gtmContainers: Object.keys(window.google_tag_manager || {}).filter((k) => /^GTM-|^G-|^GT-/.test(k)),
      globals,
      trackingAttributes: top(attrs, 10),
    };
  }

  function survey(o) {
    const scope = document.querySelector(o.controlsScope || 'main') || document.body;
    return {
      schemaVersion: 2,
      kind: 'survey',
      capturedAt: new Date().toISOString(),
      meta: meta(o),
      landmarks: landmarks(),
      sections: sections(),
      controls: controls(o.controlsScope || 'main'),
      componentClasses: componentClassInventory(scope),
      palette: observedPalette(scope),
      tracking: trackingSurvey(),
    };
  }

  window.__croCollect = async (o) => {
    if (o.mode === 'state') return stateProbe(o);
    if (o.mode === 'survey') return survey(o);
    const raw = o.checkDynamic === false ? null : await rawDoc();
    const maxHtml = o.maxHtml || 60000;
    const targets = [];
    for (const t of o.targets || []) targets.push(await collectTarget(t, raw, maxHtml));
    return {
      schemaVersion: 2,
      capturedAt: new Date().toISOString(),
      meta: meta(o),
      landmarks: landmarks(),
      sections: sections(),
      controls: controls(o.controlsScope || 'main'),
      tagCounts: (() => { const c = {}; document.querySelectorAll('*').forEach((e) => { const t = e.tagName.toLowerCase(); c[t] = (c[t] || 0) + 1; }); return Object.fromEntries(Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 15)); })(),
      targets,
    };
  };
})();
