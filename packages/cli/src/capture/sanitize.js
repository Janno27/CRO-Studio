const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const TOKEN_PARAM = /([?&;](?:token|access_token|auth|session|sid|key|code|email)=)[^&"'\s#]*/gi;
// Opaque secrets only: long hex (hashes/keys) or long mixed-case alphanumerics with digits. Lower-case slugs such as
// Storybook ids ("2-components-brand-usp-box--with-delivery-timeline"), file names and URLs are NOT secrets.
const LONG_SECRET = /(?<![\w./=%-])(?:[0-9a-f]{40,}|(?=[A-Za-z0-9_-]*[A-Z])(?=[A-Za-z0-9_-]*[a-z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{36,})(?![\w./%-])/g;
const QUERY_IN_URL = /((?:href|src|srcset|action|data-[\w-]*url)=["'][^"'?#]*)\?[^"']*/gi;

/**
 * Strip scripts/noscript, input values, emails and token-like params.
 * mode 'local' (default): keeps content. mode 'share': also drops query strings, data URIs,
 * iframes, hidden inputs and csrf/nonce attributes.
 */
export function sanitizeHtml(html, { mode = 'local' } = {}) {
  let out = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '')
    .replace(/(<input\b[^>]*?)\svalue=("[^"]*"|'[^']*')/gi, '$1 value="[removed]"')
    .replace(EMAIL, '[email]')
    .replace(TOKEN_PARAM, '$1[removed]')
    .replace(LONG_SECRET, '[removed]');
  if (mode === 'share') {
    out = out
      .replace(/<iframe\b[\s\S]*?(<\/iframe>|\/>)/gi, '')
      .replace(/<input\b[^>]*type=["']hidden["'][^>]*>/gi, '')
      .replace(/\s(?:nonce|data-csrf[\w-]*|csrf[\w-]*)=("[^"]*"|'[^']*')/gi, '')
      .replace(/data:[a-z]+\/[\w.+-]+;base64,[A-Za-z0-9+/=]+/gi, 'data:[removed]')
      .replace(QUERY_IN_URL, '$1');
  }
  return out;
}

export function sanitizeUrl(url) {
  return url.replace(TOKEN_PARAM, '$1[removed]');
}

export function sanitizeText(s, opts) {
  return typeof s === 'string' ? sanitizeHtml(s, opts) : s;
}

/** Legacy v1 capture. */
export function sanitizeCapture(cap) {
  const c = structuredClone(cap);
  c.url = sanitizeUrl(c.url);
  if (c.target?.outerHTML) c.target.outerHTML = sanitizeHtml(c.target.outerHTML);
  return c;
}
