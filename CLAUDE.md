# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install
npm install

# CLI (point at any real .claude/ directory)
node bin/cli.js --help
node bin/cli.js scan /path/to/.claude
node bin/cli.js scan /path/to/.claude --json | jq .
node bin/cli.js lint /path/to/.claude
node bin/cli.js lint /path/to/.claude --format github
node bin/cli.js serve /path/to/.claude       # → http://localhost:4000
node bin/cli.js duplicates /path/to/.claude
node bin/cli.js rename <old> <new> /path/to/.claude --dry-run
node bin/cli.js who-can "Bash(git push)" /path/to/.claude
node bin/cli.js init-ci

# Pre-PR sanity checks
node bin/cli.js scan ./some/.claude --json | jq .
node bin/cli.js lint ./some/.claude          # exits 1 on error-level findings
node bin/cli.js serve ./some/.claude &
curl -s http://localhost:4000/api/graph | jq .agents[0].name
kill %1
```

## Architecture

Single-phase pipeline: **scan → graph → lint/serve/output**. No build step, no database, no LLM calls.

### Entry points

- **`bin/cli.js`** — CLI using `commander`. Thin dispatch layer; delegates everything to `lib/`.
- **`lib/server.js`** — Hono HTTP server; single route `GET /api/graph` returns the scanned graph as JSON; serves `web/index.html` for `/`.
- **`web/index.html`** — Single self-contained HTML file (Tailwind CDN + cytoscape.js CDN + inline JS). No build step required — viewer stays zero-dependency.

### Core modules

| File | Role |
|---|---|
| `lib/scanner.js` | Reads `agents/*.md`, `commands/*.md`, `settings.json`, `settings.local.json`, `../.mcp.json`; parses frontmatter; detects agent→agent invocations via word-boundary regex on prose; returns a typed `graph` object |
| `lib/linter.js` | Stateless `lint(graph)` → array of `{ level, code, message, subject, line }` findings. Exits 1 on any `error`-level finding |
| `lib/formatters.js` | Formats lint findings as text (default), `--json`, or `--format github` (GitHub Actions workflow commands for PR annotations) |
| `lib/rename.js` | Rewrites frontmatter `name:` and all word-boundary mentions across agents + commands; supports `--dry-run` and `--json` diff output |
| `lib/who-can.js` | Resolves `Tool(spec)` permission queries against `settings.json` allow/deny rules intersected with each agent's tool grants; glob-matches specs (`*` → `.*`) |
| `lib/init-ci.js` | Scaffolds `.github/workflows/atlas.yml`; refuses if file exists unless `--force` |

### Graph schema

`scanner.js` returns:
```js
{
  agents: [{ slug, name, description, tools, invokes, lines, file }],
  commands: [{ slug, name, description, invokes, lines, file }],
  tools: [String],          // union of all tool grants
  mcpServers: [{ name }],
  permissions: { allow: [], deny: [] },  // from settings.json
  edges: [{ from, to, kind }]  // kind: "invokes" | "grant"
}
```

Agent→agent delegation is detected by word-boundary regex on agent names in prose — intentionally imperfect and cheap; catches most real orchestration patterns.

### Lint rules

| Code | Level | What it catches |
|---|---|---|
| `dead-agent` | warning | Defined but never invoked |
| `missing-agent-ref` | error | Reference to a nonexistent agent slug |
| `missing-description` | warning | No `description` frontmatter field |
| `delegation-cycle` | warning | A invokes B invokes A |
| `unused-tool-grant` | info | Tool granted but agent prose doesn't mention it |
| `duplicate-candidate` | info | Two agents with overlapping prose + tools (Jaccard 70/30 blend with tool-grant overlap) |

## Scope rules

- **Zero LLM calls.** Static analysis only — no network calls to AI providers.
- **No persistence.** Source of truth is `.claude/`; nothing is written back.
- **Viewer stays single-page.** `web/index.html` is a single file — no framework, no build step. Keep it that way.
- **Lint rules run in milliseconds.** No heavy computation inside linters.
- **Merge via `gh pr merge --merge`**, never `--squash`.
