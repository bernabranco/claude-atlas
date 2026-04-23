<div align="center">

# claude-atlas

**Visualize, lint, and refactor your Claude Code agent configs.**

[![npm version](https://img.shields.io/npm/v/claude-atlas.svg)](https://www.npmjs.com/package/claude-atlas)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/bernabranco.claude-atlas?label=VS%20Code)](https://marketplace.visualstudio.com/items?itemName=bernabranco.claude-atlas)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

As your `.claude/` folder grows, it gets hard to answer simple questions: who calls whom? Which agent has tools it never uses? Does anything reference an agent that no longer exists?

`claude-atlas` reads your `agents/`, `commands/`, `.mcp.json`, and `settings.json`, builds a dependency graph, and gives you:

- **Interactive graph** — nodes by type, edges by relationship, click anything for details
- **Linter** — dead agents, broken references, delegation cycles, unused tool grants
- **Rename** — safely rename an agent and rewrite every mention across the config

No LLM calls. No cloud. No telemetry.

> ⚠️ **Early, active development.** MIT-licensed, source you can read.

<p align="center">
  <img src="assets/print1.jpg" alt="claude-atlas graph viewer showing agents, commands, tools and lint findings" width="100%" />
  <br />
  <sub><em>17 agents, 11 commands, 9 tools — color-coded lint findings in the sidebar.</em></sub>
</p>

## Install

### VS Code Extension (recommended)

Search **"Claude Atlas"** in the VS Code Extensions panel, or install directly:

```
ext install bernabranco.claude-atlas
```

Opens a graph panel inside VS Code. No terminal needed — the extension auto-detects your `.claude/` folder, shows the graph, runs the linter inline, and lets you rename agents with a quick-pick dialog.

### CLI / npx

```bash
npx claude-atlas serve .claude    # interactive graph at http://localhost:4000
npx claude-atlas lint .claude     # linter, exits 1 on errors
npx claude-atlas scan .claude     # structured JSON summary
```

Node 20+ required.

## What it catches

| Rule | Level | Description |
|---|---|---|
| `missing-agent-ref` | error | A command or agent references a name that doesn't exist |
| `dead-agent` | warning | An agent is defined but never invoked |
| `delegation-cycle` | warning | Agent A invokes B invokes A |
| `missing-description` | warning | Agent or command has no `description` frontmatter |
| `unused-tool-grant` | info | Agent has `Write` granted but its prose never mentions writing |
| `duplicate-candidate` | info | Two agents have overlapping prose and tools — possible merge candidate |

## CLI reference

```bash
# Visualize
npx claude-atlas serve .claude

# Lint (exits 1 on errors)
npx claude-atlas lint .claude
npx claude-atlas lint .claude --format github   # PR annotations in CI
npx claude-atlas init-ci                        # scaffold .github/workflows/atlas.yml

# Inspect
npx claude-atlas scan .claude --json
npx claude-atlas who-can "Bash(git push)"       # which agents can run this

# Rename (rewrites frontmatter + every mention)
npx claude-atlas rename old-name new-name .claude --dry-run
npx claude-atlas rename old-name new-name .claude

# Find near-duplicates
npx claude-atlas duplicates .claude
```

## What gets scanned

| Source | Extracted |
|---|---|
| `agents/*.md` | Name, description, tool grants, prose-detected delegations |
| `commands/*.md` | Name, description, agent invocations |
| `settings.json` / `settings.local.json` | Allow / deny permission rules |
| `.mcp.json` (parent dir) | MCP servers declared for the project |

## Roadmap

- [x] Scanner, linter, interactive viewer
- [x] Rename with impact preview
- [x] Permission blast-radius (`who-can`)
- [x] CI mode with GitHub PR annotations
- [x] VS Code extension
- [ ] [Runtime overlay](https://github.com/bernabranco/claude-atlas/issues/8) — show which edges actually fire from session transcripts
- [ ] [Markdown export](https://github.com/bernabranco/claude-atlas/issues/9) — wiki-linked vault of the whole config

## Contributing

PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup. No obfuscated builds — source in, source out.

## License

[MIT](LICENSE)
