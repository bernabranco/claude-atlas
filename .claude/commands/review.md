---
description: Run code-reviewer over the current branch's diff vs main
---

Review the files changed on the current branch of claude-atlas using the code-reviewer agent.

$ARGUMENTS

Steps:
1. Run `git diff main...HEAD --name-only`. If empty, fall back to `git diff HEAD~1 --name-only`.
2. Show the list to the user.
3. For each changed file, identify its **surface** (scanner / linter / CLI / viewer / fixtures / docs) by path and note any upstream `lib/` deps it imports — include those for context.
4. Invoke the `code-reviewer` agent with: "Review these changed files on the current branch of claude-atlas: [list]. Also read these upstream dependencies: [list]. Apply both the shared checklist and the surface-specific section (Scanner / Linter / CLI / Viewer / Fixtures). Pay particular attention to: scanner output shape (the UI depends on it), lint-rule id stability (public contract), generic-over-project-specific enforcement, and any creeping deps that break the 'no embeddings, no build step' pitch. Group findings by severity — critical, high, medium, low — with file, line, problem, and suggested fix."
5. After the review, ask: "Create GitHub issues for any of these findings via `issue-manager`?"
