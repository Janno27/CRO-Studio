import { JSDOM } from 'jsdom';

/** Fresh jsdom window exposed as globals (the runtime reads window/document at call time). */
export function setupDom(html = '<!doctype html><body><main id="main-content"></main><p id="outside"></p></body>', url = 'https://example.test/p/') {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.MutationObserver = dom.window.MutationObserver;
  return dom;
}

export const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}
