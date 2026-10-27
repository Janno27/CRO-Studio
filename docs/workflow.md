# Workflow

1. **Brief.** Describe the test to your AI assistant (or write `brief.md` yourself). Missing information is asked in batches of four questions; nothing is invented, unknown fields stay `Unknown`.
   Briefs can also be read from any MCP server you connect (see [ai-and-mcp.md](ai-and-mcp.md)).
2. **Scaffold.** `cro-studio new <id> --ref <your-reference> --page <type> --market <id>`.
3. **Verify selectors on the live page.** `cro-studio capture --experiment <id> --url <page>` measures them, then `capture evidence` records the proof (see [capture.md](capture.md)). Put every target in `selectors.json` with `status` and `evidence`. `not-tested` selectors raise a warning; `verified-*` requires evidence (capture id, URL, note).
4. **Write the variation.** `variant.js` with `defineExperiment`, `styles.css` scoped to `.<namespace>-<id>`.
5. **Validate and build.** `cro-studio validate`, `cro-studio build`. A failing build writes nothing to `dist/`.
6. **Preview by eye.** `cro-studio preview <id> --url ... --headed` and confirm the variation looks right on desktop and mobile (`--mobile`). This step is human.
7. **Reviews (optional).** Enable `reviews.design` and/or `reviews.engineer` in the config: an experiment cannot be `status: ready` until the matching `reviews.*` is `approved`. Disabled by default, because not every organisation has these gates.
8. **Ship.** Paste the payload into your testing platform and verify there (activation, re-activation on navigation, field order). CRO Studio never claims this step is done.

## Validation levels (reported separately, never merged)

| Level | Proves | Does not prove |
|---|---|---|
| Static (`validate`) | structure, scope, forbidden patterns | that it works |
| Built (`build`) | the bundle runs, is idempotent, leaves no trace in jsdom | real-site behaviour |
| Preview (`preview`) | it applies on the real page, no page errors | that it looks right |
| Human visual / review | it looks and behaves right | platform specifics |
