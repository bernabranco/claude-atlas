---
name: fix-and-ship
description: End-to-end flow for picking up a GitHub issue, implementing the fix, reviewing the code, and opening a PR.
---

Run this workflow when you want to take a GitHub issue all the way to a pull request in one shot.

## Steps

1. **Pick up the issue** — Use the issue-manager to read the issue, plan the fix on a new branch, and implement it.

2. **Review the changes** — Once the fix is committed, invoke code-reviewer to check the diff for quality issues, rule violations, and regressions against the scanner, linter, and web viewer.

3. **Open the PR** — If the review passes (no blockers), use issue-manager to open the pull request against `main`, linking it to the original issue.

## Notes

- Always run `node bin/cli.js lint .claude` and `node bin/cli.js scan .claude` before opening the PR to confirm the atlas graph is still clean.
- If code-reviewer flags any blockers, fix them before proceeding to step 3.
