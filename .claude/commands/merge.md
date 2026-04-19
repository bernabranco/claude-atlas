---
description: Code review + merge an existing PR on claude-atlas
argument-hint: "<pr-number>"
---

Review and merge PR #$ARGUMENTS on `bernabranco/claude-atlas`.

Steps:

1. **Preflight** — Run `git status --short`. If the working tree is dirty, stop and ask the user to stash or commit before continuing. Never stash automatically.

2. **Inspect** — `gh pr view $ARGUMENTS --repo bernabranco/claude-atlas --json state,mergeable,statusCheckRollup,headRefName,title`.
   - `state` must be `OPEN`.
   - `mergeable` must be `MERGEABLE` (not `CONFLICTING` or `UNKNOWN`).
   - Every check in `statusCheckRollup` must be `SUCCESS`.
   - Stop and report on any failure.

3. **Checkout** — `gh pr checkout $ARGUMENTS --repo bernabranco/claude-atlas`. Confirm HEAD matches the PR's `headRefName`.

4. **Changed files** — `gh pr diff $ARGUMENTS --repo bernabranco/claude-atlas --name-only`. Show the list.

5. **Code review** — Invoke the `code-reviewer` agent: "Review PR #$ARGUMENTS on claude-atlas. Files: [list]. Be strict — this is a published npm package. Flag critical/high as blockers, medium as warnings. Apply the surface-specific checklist for each file."

6. **Gate** — If any critical or high findings, stop. Post the findings as a PR comment via `gh pr comment $ARGUMENTS --repo bernabranco/claude-atlas --body "..."` and ask the user how to proceed. Do not merge.

7. **Merge** — Hand off to the `release-manager` agent: "Merge PR #$ARGUMENTS on `bernabranco/claude-atlas` using `gh pr merge $ARGUMENTS --repo bernabranco/claude-atlas --merge --delete-branch`. Respect the hard rules — no squash, no force-push, never `--no-verify`. If branch protection blocks, surface the error and ask before using `--admin`."

8. **Restore** — `git checkout main && git pull --ff-only origin main`.

Report: PR title, merged commit SHA, link, and any review findings that were below the blocker threshold (so the user knows what was not blocking but worth seeing).
