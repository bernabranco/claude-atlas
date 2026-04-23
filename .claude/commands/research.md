---
description: Survey the competitive landscape, find market gaps, propose strategic opportunities
---

Research the competitive landscape for claude-atlas and surface high-value opportunities.

**Domain:** Tools for visualizing, linting, and managing AI agent configurations — Claude Code agents, LLM orchestration frameworks, multi-agent systems.

1. **Understand where we stand** — Read in parallel:
   - `README.md` — current feature set and roadmap
   - `gh issue list --repo bernabranco/claude-atlas --state open --json number,title` — what's already planned
   - `git log main -10 --oneline` — recent direction

2. **Survey the landscape** — Web-search and read landing pages / READMEs for tools in adjacent spaces. Cast wide — look across all of these angles:
   - Agent config management (Claude Code agents, OpenAI Assistants, CrewAI, AutoGen, LangGraph)
   - LLM workflow visualization (LangSmith, Weights & Biases, Phoenix/Arize)
   - Developer tooling for AI (Cursor rules, Copilot agents, GitHub Copilot extensions)
   - General graph/dependency visualization tools applied to AI (dependency-cruiser, Madge, etc.)
   - MCP ecosystem tooling (any MCP inspectors, debuggers, registries)
   - Prompt/instruction linters (promptfoo, Prompt Security, etc.)

   For each tool found, capture: **what it does**, **what it does well**, **what it misses or does poorly**, **pricing/access model**.

3. **Find gaps** — After surveying, reason about:
   - What problems in the agent-config space does NO tool address well?
   - Where do existing tools force painful workarounds?
   - What would a developer building a multi-agent system in 2026 desperately want?
   - What's technically feasible for a small project that big players can't move fast on?
   - Are there adjacent spaces where claude-atlas primitives (scanner, linter, graph) could expand?

4. **Produce the report** — Structure it as:

   ### Competitive Map
   Table: Tool | Category | Strengths | Weaknesses | Pricing

   ### Underserved Problems
   3-5 specific problems the market isn't solving well, with evidence from the survey.

   ### Strategic Opportunities
   For each opportunity, write:
   - **Opportunity name** (crisp label)
   - **The gap** — what's missing in the market
   - **Why claude-atlas is positioned to win it** — scanner + linter + graph + VS Code = what leverage?
   - **What it would take** — rough scope (S/M/L), key technical risk
   - **Upside** — who would use this, how many, what they'd pay

5. **Propose issues** — Pick the top 3 opportunities and draft a GitHub issue for each. Ask: "Should I create any of these? (e.g. 'all', '1 3', or 'none')"

6. **Create approved issues** — `gh issue create --repo bernabranco/claude-atlas --title "..." --body "..."` with label `enhancement`.
