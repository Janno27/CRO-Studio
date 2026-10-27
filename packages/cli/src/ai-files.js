// Optional AI-assistant layer. The CLI works without any of this; these files only help an assistant follow the same rules.
export const agentsMd = (cfg) => `# AGENTS.md (CRO Studio project: ${cfg.project.name})

Develop A/B test variations as self-contained JS/CSS payloads with \`cro-studio\`. Config: \`cro-studio.config.json\`.

## Rules
1. **Verify, don't assume.** Selectors come from the live page (\`npx cro-studio capture --experiment <id> --url <page>\`, then \`capture evidence\`), never from memory. Mark them \`verified-*\` only with evidence.
2. **Payloads are dependency-free.** Only \`@cro-studio/core\` helpers are bundled in; no runtime libraries.
3. Build with \`defineExperiment\`: idempotent (\`ctx.ensure\` / \`ctx.setup\`), CSS scoped to \`.${cfg.namespace}-<id>\`, declared \`targets\`, explicit \`apply\` result, \`destroy()\` removes only owned nodes, only global \`window.__${cfg.namespace.replace(/[^a-z0-9]+/g, '_')}\`, no \`console.log\`, never throw into the host page.
4. Tracking only through \`ctx.track\` / \`ctx.trackWhenVisible\` / \`ctx.trackOnClick\` (mode: ${cfg.tracking.mode}).
5. Never commit captures, cookies, tokens or screenshots of logged-in pages.
6. Report validation levels separately: static/build, browser, human visual, human review. A passing build never proves platform compatibility.

## Workflow
Brief -> questions for anything missing (batches of 4) -> selectors verified on the live page -> \`variant.js\` + \`styles.css\` -> \`npx cro-studio validate <id>\` -> \`npx cro-studio build <id>\` -> human preview in a real browser${cfg.reviews.design ? ' -> Design review' : ''}${cfg.reviews.engineer ? ' -> Engineer review' : ''} -> paste into your testing platform.
${cfg.brief.mcp ? `\nBriefs can be read from the \`${cfg.brief.mcp}\` MCP server.` : ''}${cfg.design.figma ? `\nDesign reference: Figma (MCP \`${cfg.design.figma.mcp}\`).` : ''}${cfg.design.storybook.enabled ? `\nComponent source: Storybook${cfg.design.storybook.url ? ` (${cfg.design.storybook.url})` : ''}.` : ''}
`;

export const claudeCommand = (cfg) => `---
description: Create and build an A/B test variation (CRO Studio)
argument-hint: <experiment-id or tracker reference>
---
Follow AGENTS.md. For "$ARGUMENTS":
1. Collect the brief${cfg.brief.mcp ? ` from the \`${cfg.brief.mcp}\` MCP server if it has the idea, otherwise` : ''} from the user. Ask for every missing item (hypothesis, page, markets, control, variation, KPIs, tracking) in batches of 4 questions; never invent content.
2. Run \`npx cro-studio new <id>\` and fill brief.md, selectors.json (verified on the live page), variant.js, styles.css.${cfg.design.figma ? ` Read the Figma design through the \`${cfg.design.figma.mcp}\` MCP server and record the link in brief.md.` : ''}
3. \`npx cro-studio validate <id>\` then \`npx cro-studio build <id>\`; fix every failure.
4. Ask the user to preview the payload in a real browser and confirm by eye before calling the experiment ready.
`;
