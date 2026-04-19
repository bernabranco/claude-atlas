---
description: Cut a new npm release (version bump, publish, tag, GitHub release)
argument-hint: "[patch|minor|major]"
---

Cut a new npm release of claude-atlas.

$ARGUMENTS

Invoke the `release-manager` agent with: "Run Phase B (publish a new version) for claude-atlas. Steps: pre-flight (main clean, CI green, working tree clean), generate release notes from `$LAST_TAG..HEAD`, determine semver bump (feat → minor, fix/chore → patch, BREAKING CHANGE → major; package is 0.x so breaking changes still bump minor by convention unless the user says otherwise), run `npm version <bump>`, push with `--follow-tags`, `npm publish --access public`, verify with `npm view claude-atlas version`, then `gh release create` with the release notes.

Hard rules to enforce:
- Never `--no-verify`, never `--force` push.
- Verify `git config user.email` matches the email on recent commits in this repo before tagging — stop and ask if it looks wrong.
- Never publish to npm without a tag pushed to origin.
- Don't change the package name — `claude-atlas` is reserved under maintainer `bernabranco`.

If `$ARGUMENTS` specifies a bump level, use it. Otherwise infer from commits since the last tag and confirm before running `npm version`.

Report: tag pushed, npm version confirmed, GitHub release URL."
