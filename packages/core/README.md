# @cro-studio/core

Dependency-free runtime for A/B test payloads: idempotent lifecycle (`defineExperiment`), scoped CSS, a single observer, owned-node cleanup, and configurable tracking (dataLayer template or your own hook).

It is bundled into your payload by the [`cro-studio`](https://www.npmjs.com/package/cro-studio) CLI, which also injects the namespace and tracking config at build time. See the main repository docs for the API.

```js
import { defineExperiment, create, insert } from '@cro-studio/core';
```

MIT
