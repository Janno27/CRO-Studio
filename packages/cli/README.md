# cro-studio

Build, validate, capture and preview A/B test variations as safe, self-contained JS/CSS payloads for any testing platform.

```bash
npx cro-studio init
npx cro-studio new my-test --ref EXP-1
npx cro-studio capture --url https://example.com --experiment my-test
npx cro-studio validate && npx cro-studio build
```

`capture` and `preview` need `playwright-core` and a Chromium/Chrome. Full documentation is in the main repository.

MIT
