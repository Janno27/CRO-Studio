# Configuration reference

`cro-studio init` writes `cro-studio.config.json`; editors get completion through the JSON schema (`$schema`). All keys are optional and merged over the defaults, except lists (`markets`, `pageTypes`) which replace them.

```json
{
  "project": { "name": "Demo Shop" },
  "namespace": "demo",
  "experimentsDir": "experiments",
  "outDir": "dist",
  "capturesDir": "captures",
  "ids": { "pattern": "^[a-z0-9][a-z0-9-]*$", "example": "checkout-trust-badges" },
  "markets": [
    { "id": "uk", "hosts": ["www.shop.co.uk"], "locale": "en" },
    { "id": "fr", "hosts": ["www.shop.fr"], "locale": "fr" }
  ],
  "pageTypes": ["home", "category", "product", "cart", "checkout", "other"],
  "platform": { "target": "generic" },
  "tracking": { "mode": "datalayer", "dataLayer": "dataLayer", "template": { "event": "ab_test", "section": "{section}" } },
  "brief": { "source": "conversation", "mcp": null },
  "design": { "figma": { "mcp": "figma" }, "storybook": { "enabled": false, "url": null } },
  "reviews": { "design": false, "engineer": false },
  "browser": { "headless": true }
}
```

| Key | Meaning |
|---|---|
| `capturesDir` | Where `capture` writes (git-ignored by `init`) |
| `namespace` | Prefix of CSS classes (`.<ns>-<id>__x`), data attributes (`data-<ns>-owner`) and the only global (`window.__<ns>`). Baked into the payload at build time |
| `ids.pattern` | Regex each experiment folder/id must match. Use e.g. `^(uk|fr)-\d+-[a-z0-9-]+$` to enforce `<market>-<number>-<slug>` |
| `markets` | Id, bare hostnames and locale. Briefs and selectors may only reference configured markets; `preview` warns on unknown hosts |
| `pageTypes` | Allowed page types in briefs and selectors |
| `tracking` | See [tracking.md](tracking.md) |
| `brief` | `conversation` (typed to your assistant) or `mcp` with the server name that exposes your test ideas |
| `design.figma` | Figma is part of the workflow: the brief records a Figma link and the assistant reads the design through this MCP server. Set `null` to disable |
| `design.storybook` | Optional component source |
| `reviews` | Gates enforced before `status: ready` |
| `platform.target` | `generic` (JS + CSS). Platform-specific wrappers are on the [roadmap](roadmap.md) |
