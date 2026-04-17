# claude-atlas

> Map and lint your `.claude/` directory — agents, commands, tools, permissions as a navigable graph.

**Status:** name reserved, active development. Real release coming soon.

## What it will do

- **Scan** `.claude/agents/`, `.claude/commands/`, `.mcp.json`, and `settings*.json` into a graph.
- **Lint** — detect dead agents, missing references, delegation cycles, over-granted tools.
- **Rename-impact** — "if I rename `code-reviewer`, what breaks?"
- **Permission blast-radius** — who can trigger `Bash(git push)`?
- **Interactive graph UI** — nodes for agents, commands, tools, MCP servers.

## License

MIT
