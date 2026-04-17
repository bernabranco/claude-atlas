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

  findings.push(...detectDuplicateAgents(graph.agents));
  findings.push(...detectDuplicateCommands(graph.commands));

  return findings;
}

const STOPWORDS = new Set([
  "the","and","for","with","that","this","have","has","had","are","was","were","been","being","will",
  "would","could","should","from","into","onto","over","under","about","than","then","there","here",
  "your","you","our","their","they","them","these","those","which","when","where","what","who","why",
  "how","not","but","any","all","some","one","two","only","also","such","own","same","use","uses",
  "used","using","like","very","just","each","both","many","more","most","other","another","file",
  "files","code","codebase","agent","agents","command","commands","tool","tools",
]);

function tokenize(text) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 4 && !STOPWORDS.has(t))
  );
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Flag agent pairs whose descriptions + prose + tools overlap enough to
    suggest they could be merged. Info level — it's a hint, not a rule. */
function detectDuplicateAgents(agents) {
  const THRESHOLD = 0.55;
  const enriched = agents.map((a) => ({
    slug: a.slug,
    name: a.name,
    tokens: tokenize(`${a.name} ${a.description} ${a.body || ""}`),
    tools: new Set((a.tools || []).map((t) => t.toLowerCase())),
  }));

  const findings = [];
  for (let i = 0; i < enriched.length; i++) {
    for (let j = i + 1; j < enriched.length; j++) {
      const p = jaccard(enriched[i].tokens, enriched[j].tokens);
      const t = jaccard(enriched[i].tools, enriched[j].tools);
      const score = 0.7 * p + 0.3 * t;
      if (score >= THRESHOLD) {
        findings.push({
          level: "info",
          code: "duplicate-candidate",
          message: `Agents "${enriched[i].name}" and "${enriched[j].name}" look similar (score ${score.toFixed(2)}). Consider merging.`,
          subject: `agent:${enriched[i].slug}`,
          related: [`agent:${enriched[j].slug}`],
          score: Number(score.toFixed(3)),
        });
      }
    }
  }
  return findings;
}

/** Same idea for commands — prose similarity only; commands don't have tool grants. */
function detectDuplicateCommands(commands) {
  const THRESHOLD = 0.55;
  const enriched = commands.map((c) => ({
    slug: c.slug,
    name: c.name,
    tokens: tokenize(`${c.name} ${c.description} ${c.body || ""}`),
  }));

  const findings = [];
  for (let i = 0; i < enriched.length; i++) {
    for (let j = i + 1; j < enriched.length; j++) {
      const score = jaccard(enriched[i].tokens, enriched[j].tokens);
      if (score >= THRESHOLD) {
        findings.push({
          level: "info",
          code: "duplicate-candidate",
          message: `Commands "/${enriched[i].slug}" and "/${enriched[j].slug}" look similar (score ${score.toFixed(2)}). Consider merging.`,
          subject: `command:${enriched[i].slug}`,
          related: [`command:${enriched[j].slug}`],
          score: Number(score.toFixed(3)),
        });
      }
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
