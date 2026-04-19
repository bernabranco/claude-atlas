---
description: 5-minute triage — recent activity, open PRs/issues, top 3 next actions
---

Run the daily 5-minute triage for claude-atlas.

1. **Recent activity** — Run `git log main --since="24 hours ago" --oneline`. If empty, fall back to `git log main -5 --oneline`.

2. **Open PRs** — Run `gh pr list --repo bernabranco/claude-atlas --state open --json number,title,headRefName,statusCheckRollup,mergeable --limit 20`. Flag failing CI, `CONFLICTING`, and anything > 7 days old.

3. **Open issues** — Run `gh issue list --repo bernabranco/claude-atlas --limit 15 --state open`. Group by label (`priority:*` first, then by surface). Surface any `wedge-feature`-labelled issues separately — those are the four planned differentiators (dead-code, rename-impact, permission blast-radius, delegation cycles). Flag anything > 60 days with no activity.

4. **Quick scan** — If anything landed in `main` in the last 24h, invoke the `code-reviewer` agent on up to 3 most recently changed files: "Quick security + correctness scan. Critical/high only — skip style nits."

5. **Competitor check** (cheap, once a day) — Run `npm view claude-graph version time.modified` and note whether the competitor shipped a release in the last 24h. Not a blocker — just context.

6. **Summary** — Produce:
   - Top 3 things worth doing today
   - Any stale PRs
   - Any open critical/high issue that's blocked
   - Next wedge-feature to tackle, if none are in progress

7. **Action prompt** — "Want me to: (a) pick up an issue via `/fix <n>`, (b) clear merge-ready PRs via `release-manager`, or (c) create new issues from the scan via `issue-manager`?"
