---
description: Pick up a GitHub issue end-to-end (plan → branch → fix → PR)
argument-hint: "<issue-number>"
---

Pick up a GitHub issue on claude-atlas and implement a complete fix.

Issue number: $ARGUMENTS

Invoke the `issue-manager` agent with this exact instruction:

"Pick up issue #$ARGUMENTS from `bernabranco/claude-atlas`.

Steps:
1. `gh issue view $ARGUMENTS --repo bernabranco/claude-atlas` — read fully.
2. Identify the surface (scanner / linter / CLI / viewer / fixtures / docs) and apply that surface's conventions from `core-owner` + `code-reviewer`.
3. Produce a **short plan**: 3-7 bullets covering files to touch, approach, one risk, one unknown, verification step. End with 'Proceed?' and wait — do not edit unless the issue is trivial.
4. On approval, branch: `git checkout -b fix/issue-$ARGUMENTS-<slug>` (or `feat/` / `docs/` as appropriate).
5. Implement minimal, targeted changes. Honor invariants in `core-owner`: no embeddings / no vector store, generic over project-specific, CLI must work without the viewer, no build step for `web/`, lint-rule ids are public contract.
6. **Evaluate** — Re-read the issue. Root cause or just symptom? Any edge cases missed (missing `.claude/` dir, malformed frontmatter, deeply nested delegation, empty rule output)? If gaps, revise.
7. Verify: `npm install --no-audit --no-fund` cold + `node bin/cli.js` against `test/fixtures` (and, for scanner/linter changes, diff against the golden fixture output).
8. Commit referencing the issue body (`Closes #$ARGUMENTS`). Before committing, verify `git config user.email` matches the email on recent commits in this repo — stop and ask if it looks wrong.
9. Push and open a PR against `main`. Title: `fix: <summary> (closes #$ARGUMENTS)` (or `feat:` / `docs:`).

Return the PR URL."
