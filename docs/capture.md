# Page capture: verify selectors on the live page

`cro-studio capture` opens a page in Playwright (headless by default, `--headed` to watch), measures your selectors and records what it saw. Rule of the toolkit: **selectors come from the live page, never from memory.**

```bash
# measure selectors you intend to use
npx cro-studio capture --url https://shop.example.com/p/mattress --page product \
  --target cta='[data-test="add-to-cart"]' --target price='.pricing'

# or measure every selector of an experiment, then stamp the proof into its selectors.json
npx cro-studio capture --url https://shop.example.com/p/mattress --page product --experiment trust-badge
npx cro-studio capture evidence <captureId> --experiment trust-badge

# page-level survey: landmarks, sections, controls, component classes, observed palette, existing tracking
npx cro-studio capture --url https://shop.example.com/ --survey --name home

npx cro-studio capture list | report <id> | validate [id]
```

Useful flags: `--mobile` (390x844), `--wait <ms>`, `--headed --pause` (log in, close banners, open the state you want, press Enter), `--channel chrome` (use your installed Chrome), `--no-dynamic` (skip the server-HTML comparison), `--share` (strict sanitizing), `--scope <css>` (where to list controls).

## What you get

`captures/<date>/<market>-<page>-<name>-<time>/` (git-ignored by `init`):

| File | Content |
|---|---|
| `metadata.json` | url without query string, market (from your config hosts, `null` if unknown), page type, viewport, locale hints, limitations |
| `targets.json` | per target: matches, visibility, ancestors, siblings, **candidate selectors ranked**, assessment, `dynamicallyRendered` |
| `computed-styles.json`, `dom-summary.json`, `dom.html`, `screenshot.png` | styles of target and ancestors, page structure, sanitized outerHTML of targets, viewport screenshot |
| `survey.json` | (survey mode) structure, component classes, palette, tracking surface (event **keys** only, never values) |

## Selector classes

`verified-unique` (1 match, points at the target) · `verified-non-unique` (several matches) · `fragile` (positional `:nth-*`, generated-looking tokens such as hashed or `data-v-*`, deep paths) · `not-found` · `wrong-element` · `invalid`.

The report proposes the best unique alternative when yours is weak, and flags elements rendered client-side (absent from the server HTML): those need `observe: 'persist'`.

## Privacy

Captures may contain commercial or personal content, so they stay local. The sanitizer always removes scripts, `noscript`, input values, emails, token-like query parameters and long opaque secrets; `--share` also drops query strings, hidden inputs, iframes, CSRF attributes and base64 data URIs. Cookies and storage are never read. Still review a capture before sharing it.
