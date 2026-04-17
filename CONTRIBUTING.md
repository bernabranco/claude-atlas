# Contributing

Thanks for taking the time to contribute. This is an early project — small, focused PRs are easier to review and more likely to land.

## Dev setup

```bash
git clone https://github.com/bernabranco/claude-atlas.git
cd claude-atlas
npm install
```

Node 20+ required. No native modules — install is fast.

## Running locally

```bash
# CLI
node bin/cli.js --help
node bin/cli.js scan /path/to/.claude
node bin/cli.js lint /path/to/.claude

# Graph viewer (browser)
node bin/cli.js serve /path/to/.claude
# → http://localhost:4000
```

Point it at any real `.claude/` directory — your own project is the best test.

## Before opening a PR

Sanity checks:

```bash
# Does the CLI still parse?
node bin/cli.js scan ./some/.claude --json | jq .

# Does lint still exit non-zero on errors?
node bin/cli.js lint ./some/.claude

# Does the viewer boot and serve /api/graph?
node bin/cli.js serve ./some/.claude &
curl -s http://localhost:4000/api/graph | jq .agents[0].name
kill %1
```

## Workflow

1. **Branch off `main`**: `git checkout -b feat/your-thing`
2. **Commit style**: conventional-ish prefixes (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`). Short imperative subject, body optional.
3. **Open a PR** against `main`.
4. **Merge** via `gh pr merge --merge` (preserves history — this project doesn't squash).

## Reporting bugs

Open a GitHub issue with:

- What you were trying to do (command + path)
- What happened vs. what you expected
- Node version, OS
- The output of `claude-atlas scan <path> --json` if relevant and small enough to paste

## Scope notes

- **Zero LLM calls.** This is a static analyzer. No network calls to AI providers, ever.
- **Parse what's on disk.** Source of truth is the `.claude/` directory — we don't persist anything back.
- **Lint rules are cheap.** Each linter should run in milliseconds on a 50-agent config. If you need something heavier, it's a separate tool.
- **Viewer stays single-page.** No build step, no framework — pure HTML + Tailwind CDN + cytoscape. Keeps the install surface tiny.

## Questions

Open a GitHub discussion or issue. Early-stage project — I'd rather talk than guess what you need.
