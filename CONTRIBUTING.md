# Contributing

```bash
git clone <your fork> && cd CRO-Studio
npm install
npm run lint && npm test && npm run leak-scan
```

- Keep payload code dependency-free; anything in `packages/core` ends up inside users' pages. Mind its size.
- Every behaviour change needs a test (`packages/*/test`, `node --test`, jsdom).
- No company-specific names, selectors, captures or screenshots in the repo (`npm run leak-scan` enforces a list you can extend).
- Never claim platform compatibility in code, docs or reports without having verified it.
- Small, focused PRs; describe the user-visible change and add a CHANGELOG line.
