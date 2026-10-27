# Validation checks

**Source (`validate`)**: required files; brief front matter (id equals folder, markets/pageTypes exist in the config, tracking events snake_case, review gates); selectors (valid CSS, not generated/positional, evidence for `verified-*`); CSS scope; `variant.js` AST (only `@cro-studio/core` and relative imports; no `eval`, `new Function`, `document.write`, `innerHTML=`, `window.x=`; `defineExperiment` called exactly once).

**Built (`build`)**, on both `variant.js` and `payload.js`, executed in jsdom: runs without throwing; only the namespaced global (and the dataLayer) is created; one instance with the brief id and ref; targets documented in `selectors.json`; safe when targets are missing; `destroy()` leaves nothing; on a synthetic page generated from `selectors.json`: applies, double injection creates no duplicate keyed element or style tag, `destroy()` restores the page byte for byte. Selectors too complex for the synthetic page produce a warning, not a pass.

Output goes to `dist/` only if everything passes. `manifest.json` records source hashes, output hashes, tool versions and the validation result.
