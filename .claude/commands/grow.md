---
description: Propose and create new GitHub issues to grow the project
---

Generate a batch of well-scoped GitHub issues for claude-atlas.

1. **Gather context** — Run these in parallel:
   - `gh issue list --repo bernabranco/claude-atlas --state open --limit 50 --json number,title,labels` — open issues (avoid duplicates)
   - `git log main -20 --oneline` — recent momentum (what's being worked on)
   - Read `README.md` for unchecked roadmap items (`- [ ]`)
   - Read `CLAUDE.md` for architecture context

2. **Identify gaps** — Think across these surfaces and find the most valuable missing pieces:
   - **Scanner** — new node/edge types, monorepo support, other config formats
   - **Linter** — new lint rules, false positive reduction, auto-fix suggestions
   - **VS Code extension** — UX improvements, new commands, diagnostics, sidebar panel
   - **Graph viewer** — layout options, filtering, search, export
   - **CLI** — missing commands, output formats, `--json` coverage
   - **CI integration** — GitHub Actions improvements, pre-commit hooks
   - **Rename** — file rename, bulk rename, undo
   - **Permissions** — who-can improvements, deny-rule analysis
   - **Docs** — examples, onboarding, comparison with alternatives
   - **Ops** — test coverage, performance, publish pipeline

3. **Propose 5 issues** — For each, produce:
   - **Title** — `feat:` / `fix:` / `chore:` / `docs:` prefix, concise
   - **Why** — one sentence on the user problem or gap it closes
   - **Scope** — what files/modules change, rough effort (S/M/L)
   - **Acceptance criteria** — 2-4 bullets on what "done" looks like

   Prioritize: things on the unchecked roadmap first, then gaps you spotted in the codebase. Skip anything already in the open issue list.

4. **Confirm** — Present the 5 proposals and ask: "Which should I create? (e.g. 'all', '1 3 5', or 'none')"

5. **Create selected issues** — For each approved issue, run:
   ```
   gh issue create --repo bernabranco/claude-atlas \
     --title "<title>" \
     --body "<full description with Why, Scope, Acceptance criteria as markdown>"
   ```
   Apply labels where they exist (`enhancement`, `bug`, `documentation`, `good first issue`).

6. **Report** — List created issue URLs.
