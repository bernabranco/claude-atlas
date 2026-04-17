<div align="center">

# claude-atlas

**Map and lint Claude Code agent configs — wherever they live on disk. Agents, commands, tools, permissions as a navigable graph.**

[![npm version](https://img.shields.io/npm/v/claude-atlas.svg)](https://www.npmjs.com/package/claude-atlas)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)

</div>

---

As your agent config grows past a handful of agents, it stops being legible at a glance. Who invokes whom? Which agent owns the Write tool but never writes? Which agent does nothing at all? There is no linter, no dependency graph, no refactoring tool.

`claude-atlas` is that tool. It works on **any folder laid out like a Claude Code config** — `./.claude` is the common case, but the folder name isn't load-bearing. Point it at `.claude/`, a custom `agents/` root, or a vendored config in a monorepo — if the structure matches (`agents/*.md`, optional `commands/*.md`, `settings.json`), it parses.

It reads `agents/`, `commands/`, `.mcp.json`, and `settings*.json`, builds a graph, and gives you three things:

1. **A static visualization** — see your agent system laid out with typed edges (`invokes`, `grant`).
2. **A linter** — dead agents, missing references, delegation cycles, unused tool grants.
3. **Structured JSON** — pipe the graph into anything else.

No LLM calls. No cloud. No telemetry. Just your config, made visible.

> ⚠️ **Status: early, active development.** Public development, MIT-licensed, source you can read. See the [roadmap](#roadmap).

## How it looks in practice

Walk-through on a real project with 17 agents + 11 commands.

### `claude-atlas scan .claude`

```
Scanned /Users/you/project/.claude
  17 agents, 11 commands, 9 tools, 1 MCP servers
  147 edges
  110 allow rules, 0 deny rules
```

High-level sanity check — how dense is your config, how much graph does it actually form?

### `claude-atlas lint .claude`

```
WARNING (1)
  [dead-agent] Agent "docs-owner" is never invoked by another agent or command.

INFO (10)
  [unused-tool-grant] Agent "auth-owner" has the Write tool but its prose doesn't mention writing or editing files.
  ...
```

**Dead agents** — defined but never called. **Unused grants** — tools you handed out that the agent's own prose doesn't ask for. Both are cheap to accumulate and expensive to notice by hand.

Exit code is `1` if any `ERROR`-level findings show up (e.g. a command referencing an agent that doesn't exist), so you can wire it straight into CI.

### `claude-atlas serve .claude`

Interactive graph at `http://localhost:4000`:

- Nodes colored by type: agent (blue), command (orange), tool (green), MCP server (purple).
- Edges colored by kind: `invokes` (solid blue), `grant` (dashed green).
- Click a node → sidebar with description, tools granted, agents it invokes, agents that invoke it.
- Full lint report pinned to the sidebar.

Renders cold in under a second via cytoscape.js.

### `--json` everywhere

```bash
claude-atlas scan . --json | jq '.agents[] | select(.tools | length > 5)'
claude-atlas lint . --json | jq '[.[] | select(.level == "error")] | length'
```

Both `scan` and `lint` support `--json` for scripting.

## Commands

| Command | What it does |
|---|---|
| `claude-atlas scan [path]` | Parse the config → print counts (add `--json` for full graph) |
| `claude-atlas lint [path]` | Run linters; exit 1 on errors (add `--json` for structured findings) |
| `claude-atlas serve [path]` | Start the graph viewer on port 4000 (override with `--port`) |

Path defaults to `./.claude`, but any folder with the Claude Code layout works — pass an absolute or relative path to your config root.

## Install

```bash
npx claude-atlas serve .claude
```

Or clone and run locally:

```bash
git clone https://github.com/bernabranco/claude-atlas.git
cd claude-atlas
npm install

node bin/cli.js scan /path/to/your/repo/.claude
node bin/cli.js lint /path/to/your/repo/.claude
node bin/cli.js serve /path/to/your/repo/.claude
```

Node 20+.

## What gets scanned

You pass `claude-atlas` a path — usually `./.claude`, but it works on **any folder that follows the Claude Code layout**. The folder doesn't need to be named `.claude`; what matters is the structure inside it:

| Source (relative to the path you pass) | Extracted |
|---|---|
| `agents/*.md` | Name, description, tool grants (frontmatter), prose-mentioned delegations |
| `commands/*.md` | Name, description, agents it invokes |
| `settings.json` + `settings.local.json` | Allow / deny permission rules |
| `../.mcp.json` (parent directory) | MCP servers declared for the project |

Agents must use Claude Code's frontmatter shape (`name`, `description`, `tools: [...]`). Agent directories from other frameworks (OpenAI Assistants, CrewAI, etc.) use a different schema and won't parse meaningfully.

Agent→Agent delegation is detected by word-boundary matching on agent names in each agent's prose — imperfect but cheap, and catches most real orchestration patterns.

## Linters shipped

| Code | Level | What it catches |
|---|---|---|
| `dead-agent` | warning | Agent defined but never invoked by another agent or command |
| `missing-agent-ref` | error | Command or agent mentions a name that doesn't exist |
| `delegation-cycle` | warning | A invokes B invokes A |
| `unused-tool-grant` | info | Agent has `Write` granted but its prose doesn't mention writing/editing |

More on the [roadmap](#roadmap).

## Roadmap

- [x] **Scanner** — `.claude/` → structured graph (agents, commands, tools, MCP, permissions)
- [x] **Linter** — dead agents, missing refs, cycles, unused grants
- [x] **Interactive viewer** — cytoscape.js graph with details sidebar, served by Hono
- [ ] **Rename-impact** — `claude-atlas rename code-reviewer new-name --dry-run`
- [ ] **Permission blast-radius** — `claude-atlas who-can "Bash(git push)"`
- [ ] **Consolidation hints** — flag near-duplicate agents
- [ ] **Runtime overlay** — parse session transcripts, show which edges actually fire
- [ ] **Markdown export** — wiki-linked vault of the whole config
- [ ] **CI mode** — annotate PRs with lint findings

## Contributing

Repo is private during the MVP. Once public, PRs welcome. No obfuscated builds — source in, source out.

## License

[MIT](LICENSE)
