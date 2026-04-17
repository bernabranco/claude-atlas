/**
 * Lint a scanned graph for common issues.
 * Returns an array of findings; empty array = clean.
 *
 * Finding shape: { level, code, message, subject? }
 *   level: "error" | "warning" | "info"
 *   code:  stable identifier for filtering (e.g. "dead-agent")
 */
export function lint(graph) {
  const findings = [];
  const agentSlugs = new Set(graph.agents.map((a) => a.slug));
  const commandSlugs = new Set(graph.commands.map((c) => c.slug));

  const referencedAgents = new Set();
  for (const e of graph.edges) {
    if (e.to.startsWith("agent:")) referencedAgents.add(e.to.slice(6));
  }

  for (const a of graph.agents) {
    if (!referencedAgents.has(a.slug)) {
      findings.push({
        level: "warning",
        code: "dead-agent",
        message: `Agent "${a.name}" is never invoked by another agent or command.`,
        subject: `agent:${a.slug}`,
      });
    }
  }

  for (const a of graph.agents) {
    for (const invoked of a.invokes) {
      if (!agentSlugs.has(invoked)) {
        findings.push({
          level: "error",
          code: "missing-agent-ref",
          message: `Agent "${a.name}" references unknown agent "${invoked}".`,
          subject: `agent:${a.slug}`,
        });
      }
    }
  }
  for (const c of graph.commands) {
    for (const invoked of c.invokes) {
      if (!agentSlugs.has(invoked)) {
        findings.push({
          level: "error",
          code: "missing-agent-ref",
          message: `Command "/${c.slug}" references unknown agent "${invoked}".`,
          subject: `command:${c.slug}`,
        });
      }
    }
  }

  const cycles = detectCycles(graph);
  for (const cycle of cycles) {
    findings.push({
      level: "warning",
      code: "delegation-cycle",
      message: `Delegation cycle: ${cycle.join(" → ")} → ${cycle[0]}`,
      subject: `agent:${cycle[0]}`,
    });
  }

  for (const a of graph.agents) {
    const writeGranted = a.tools.some((t) => t.toLowerCase() === "write");
    if (!writeGranted) continue;
    const mentionsWrite = /\bwrite\b|\bedit\b|\bcreate\s+(a\s+)?file/i.test(a.body);
    if (!mentionsWrite) {
      findings.push({
        level: "info",
        code: "unused-tool-grant",
        message: `Agent "${a.name}" has the Write tool but its prose doesn't mention writing or editing files.`,
        subject: `agent:${a.slug}`,
      });
    }
  }

  return findings;
}

function detectCycles(graph) {
  const adj = new Map();
  for (const a of graph.agents) adj.set(a.slug, new Set(a.invokes));

  const cycles = [];
  const seen = new Set();

  function dfs(start, node, path) {
    for (const next of adj.get(node) || []) {
      if (next === start && path.length > 0) {
        const key = [...path, start].sort().join("|");
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push([...path]);
        }
        continue;
      }
      if (path.includes(next)) continue;
      dfs(start, next, [...path, next]);
    }
  }

  for (const a of graph.agents) dfs(a.slug, a.slug, [a.slug]);
  return cycles;
}
