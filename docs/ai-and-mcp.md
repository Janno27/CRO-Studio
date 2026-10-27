# AI assistant, MCP and Figma (optional layer)

The CLI never needs an AI. `init` can generate `AGENTS.md` (read by Claude Code, Cursor, Codex and others) and `.claude/commands/experiment.md`, a command that:

1. takes the brief from you or from an MCP server you connected (`brief.mcp` in the config: Jira, Notion, Linear, your experimentation tool...),
2. asks batches of four questions for whatever is missing,
3. reads the design from Figma through the MCP server named in `design.figma.mcp`,
4. scaffolds, validates and builds,
5. asks you to confirm by eye before calling the experiment ready.

Connecting an MCP server is done in your assistant (for Claude Code: `claude mcp add ...` or a project `.mcp.json`); CRO Studio only records its name so the assistant knows where to look. `cro-studio doctor` shows what is configured.

For logged-in pages, an assistant can drive your own browser through a browser MCP server; `cro-studio preview` uses a clean Playwright browser instead.
