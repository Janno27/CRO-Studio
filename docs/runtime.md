# Runtime API: `@cro-studio/core`

Dependency-free, bundled into the payload at build time.

`defineExperiment({ id, ref?, targets, apply(ctx), scope?, observe?, match?, leave?, config?, onStatus? })` returns `{ start(), destroy() }`.

- `targets`: `{ name: selector }`. If one is missing the status is `target-missing` and `apply` is not called.
- `apply(ctx)` must return `true`, `false` or `{ missing: [...] }`; anything else is a status `error`.
- `observe`: `'when-needed'` (until first success), `'persist'` (re-apply after re-renders), `false`.
- `match(location)`: for SPAs; when it returns false the experiment reverts (`inactive`, then `leave(ctx)`) and re-applies when it matches again.
- Starting twice reuses the live instance: no duplicated UI.

`ctx`: `qs`, `ensure(key, create, place)` (create-once owned element), `setup(key, fn)` (once per instance), `on` / `delegate` (listeners removed on destroy), `own(fn)` (extra cleanup), `style(css)` (refuses unscoped selectors), `store` (session storage with memory fallback), `config` / `instance.setConfig(patch)`, `track*`, `log`.

Helpers: `create`, `insert(node, ref, 'before'|'after'|'prepend'|'append')`, `qs`, `qsa`, `exists`, `waitFor`.

Debug logs: add `?<namespace>_debug=1` to the URL (underscores for hyphens), or set `localStorage['<namespace>-debug'] = '1'`.
