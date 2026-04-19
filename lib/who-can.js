/**
 * Permission blast-radius: resolve Claude Code permission rules against the agent graph.
 *
 * Rule syntax reference: permissions are strings like "Tool" (bare — grants the
 * whole tool) or "Tool(spec)" where spec is an fnmatch-style glob against the
 * tool's argument string (e.g. "Bash(git *)"). deny overrides allow.
 */

/**
 * Parse "Bash(git push)" → { tool: "Bash", spec: "git push" }.
 * Bare "Read" → { tool: "Read", spec: null }.
 */
export function parsePermission(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/^([^(]+)\((.*)\)\s*$/);
  if (m) return { raw: s, tool: m[1].trim(), spec: m[2] };
  return { raw: s, tool: s, spec: null };
}

/** fnmatch → regex: * → .*, ? → ., other regex metachars escaped. */
function globToRegex(pattern) {
  let out = "";
  for (const ch of pattern) {
    if (ch === "*") out += ".*";
    else if (ch === "?") out += ".";
    else if (/[.+^${}()|[\]\\]/.test(ch)) out += `\\${ch}`;
    else out += ch;
  }
  return new RegExp(`^${out}$`);
}

/**
 * Does `rule` cover `query`?
 *
 * Matching model:
 * - Tools must match (case-insensitive).
 * - Bare rule covers any scoped query for that tool ("Bash" covers "Bash(git push)").
 * - Bare query against a scoped rule does NOT match — asking "who has full Bash?"
 *   can't be answered yes by a rule that only grants a slice.
 * - Both scoped: glob-match rule.spec against query.spec.
 */
export function ruleCovers(rule, query) {
  if (rule.tool.toLowerCase() !== query.tool.toLowerCase()) return false;
  if (rule.spec == null) return true;
  if (query.spec == null) return false;
  return globToRegex(rule.spec).test(query.spec);
}

/** Does an agent's frontmatter `tools` list cover this query's tool? */
export function agentHasToolFor(agent, query) {
  for (const raw of agent.tools || []) {
    const grant = parsePermission(raw);
    if (ruleCovers(grant, query)) return true;
  }
  return false;
}

/**
 * Who can run `permission`?
 *
 * Returns { permission, query, allowedBy, deniedBy, agents }.
 * An agent appears in `agents` iff: tool-grant covers query + some allow rule
 * covers query + no deny rule covers query. With { denyMode: true }, returns
 * agents who would otherwise match but are blocked by a deny rule.
 */
export function whoCan(graph, permission, { denyMode = false } = {}) {
  const query = parsePermission(permission);
  const allow = (graph.permissions?.allow || []).map(parsePermission);
  const deny = (graph.permissions?.deny || []).map(parsePermission);

  const allowedBy = allow.filter((r) => ruleCovers(r, query));
  const deniedBy = deny.filter((r) => ruleCovers(r, query));

  const agents = [];
  for (const a of graph.agents) {
    if (!agentHasToolFor(a, query)) continue;
    const grants = (a.tools || []).filter((t) => ruleCovers(parsePermission(t), query));
    if (denyMode) {
      if (deniedBy.length) {
        agents.push({
          slug: a.slug,
          name: a.name,
          via: { tools: grants, deniedBy: deniedBy.map((r) => r.raw) },
        });
      }
    } else {
      if (allowedBy.length && !deniedBy.length) {
        agents.push({
          slug: a.slug,
          name: a.name,
          via: { tools: grants, allowedBy: allowedBy.map((r) => r.raw) },
        });
      }
    }
  }

  return {
    permission,
    query,
    allowedBy: allowedBy.map((r) => r.raw),
    deniedBy: deniedBy.map((r) => r.raw),
    agents,
  };
}

/**
 * Viewer helper: which allow/deny rules apply to this agent's tool grants?
 *
 * A rule "applies" if the agent has the tool it scopes. Doesn't try to
 * answer "can this agent do X" — that's whoCan's job. Just filters the
 * rule list down to the slice an operator needs to look at when thinking
 * about this specific agent's blast radius.
 */
export function rulesForAgent(graph, agentSlug) {
  const agent = graph.agents.find((a) => a.slug === agentSlug);
  if (!agent) return { allowedBy: [], deniedBy: [] };

  const agentTools = new Set(
    (agent.tools || []).map((t) => parsePermission(t).tool.toLowerCase())
  );
  const scope = (rules) =>
    rules.filter((r) => agentTools.has(parsePermission(r).tool.toLowerCase()));

  return {
    allowedBy: scope(graph.permissions?.allow || []),
    deniedBy: scope(graph.permissions?.deny || []),
  };
}
