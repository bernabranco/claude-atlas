import fs from "fs/promises";
import path from "path";

async function readMdFiles(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith(".md")) {
        const filePath = path.join(dir, e.name);
        const content = await fs.readFile(filePath, "utf-8");
        files.push({ name: e.name.replace(/\.md$/, ""), content, file: filePath });
      }
    }
    return files;
  } catch {
    return [];
  }
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return { frontmatter: {}, body: content, bodyLine: 1, fmLines: {} };
  const fm = {};
  const fmLines = {};
  match[1].split("\n").forEach((line, i) => {
    // Line 1 in the file is the opening "---"; frontmatter content starts at line 2.
    const fileLine = i + 2;
    const [key, ...rest] = line.split(":");
    if (!key || !rest.length) return;
    const value = rest.join(":").trim();
    const k = key.trim();
    if (k === "name") {
      fm.name = value.replace(/^["']|["']$/g, "");
      fmLines.name = fileLine;
    } else if (k === "description") {
      fm.description = value.replace(/^["']|["']$/g, "");
      fmLines.description = fileLine;
    } else if (k === "tools") {
      const inner = value.match(/\[(.*?)\]/)?.[1] ?? "";
      fm.tools = inner.split(",").map((t) => t.trim()).filter(Boolean);
      fmLines.tools = fileLine;
    }
  });
  // Body begins on the line immediately after the closing "---\n".
  const bodyLine = (match[0].match(/\n/g) || []).length + 1;
  return { frontmatter: fm, body: content.slice(match[0].length), bodyLine, fmLines };
}

function slug(s) {
  return s.toLowerCase().replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "");
}

function escapeRegex(s) {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

async function readMcpServers(repoRoot) {
  try {
    const raw = await fs.readFile(path.join(repoRoot, ".mcp.json"), "utf-8");
    const parsed = JSON.parse(raw);
    return Object.keys(parsed.mcpServers || {});
  } catch {
    return [];
  }
}

async function readSettingsPermissions(claudeDir) {
  const permissions = { allow: [], deny: [] };
  for (const file of ["settings.json", "settings.local.json"]) {
    try {
      const raw = await fs.readFile(path.join(claudeDir, file), "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed?.permissions) {
        for (const key of ["allow", "deny"]) {
          if (Array.isArray(parsed.permissions[key])) {
            permissions[key].push(...parsed.permissions[key]);
          }
        }
      }
    } catch {
      // missing or invalid — skip
    }
  }
  return permissions;
}

/**
 * Scan a .claude/ directory and return its graph as pure data.
 * No side effects — does not write files.
 */
export async function scanClaudeDir(claudeDir) {
  const absClaude = path.resolve(claudeDir);
  const repoRoot = path.resolve(absClaude, "..");

  try {
    await fs.stat(absClaude);
  } catch {
    throw new Error(`No .claude directory found at ${absClaude}`);
  }

  const rawAgents = await readMdFiles(path.join(absClaude, "agents"));
  const rawCommands = await readMdFiles(path.join(absClaude, "commands"));
  const rawWorkflows = await readMdFiles(path.join(absClaude, "workflows"));
  const mcpServers = await readMcpServers(repoRoot);
  const permissions = await readSettingsPermissions(absClaude);

  function buildDoc(f, includeTools) {
    const { frontmatter, body, fmLines, bodyLine } = parseFrontmatter(f.content);
    // `body` from parseFrontmatter starts at `bodyLine`. We trim for display,
    // but shift `lines.body` forward by however many blank lines the trim ate
    // so mention-line math downstream is correct.
    const leading = (body.match(/^\n*/) || [""])[0].length;
    const doc = {
      slug: slug(f.name),
      name: frontmatter.name || f.name,
      description: frontmatter.description || "",
      body: body.trim(),
      file: f.file,
      lines: {
        // `name` falls back to line 1 so findings always have a clickable anchor,
        // even for files without frontmatter.
        name: fmLines.name || 1,
        description: fmLines.description || null,
        body: bodyLine + leading,
      },
    };
    if (includeTools) {
      doc.tools = frontmatter.tools || [];
      doc.lines.tools = fmLines.tools || null;
    }
    return doc;
  }

  const agents = rawAgents.map((f) => buildDoc(f, true));
  const commands = rawCommands.map((f) => buildDoc(f, false));
  const workflows = rawWorkflows.map((f) => buildDoc(f, false));

  const agentByLowerName = new Map(agents.map((a) => [a.name.toLowerCase(), a]));

  /**
   * Find first-occurrence line of each mentioned agent in `body`, return
   * [{slug, line}] sorted by line. Scanning line-by-line (instead of a
   * single regex against the whole body) is what gives us the ordering.
   */
  function detectAgentMentions(body, bodyLine, selfSlug = null) {
    const hits = new Map();
    const bodyLines = body.split("\n");
    for (const [nameLower, agent] of agentByLowerName) {
      if (agent.slug === selfSlug) continue;
      const re = new RegExp(`\\b${escapeRegex(nameLower)}\\b`, "i");
      for (let i = 0; i < bodyLines.length; i++) {
        if (re.test(bodyLines[i])) {
          hits.set(agent.slug, bodyLine + i);
          break;
        }
      }
    }
    return [...hits.entries()]
      .map(([slug, line]) => ({ slug, line }))
      .sort((a, b) => a.line - b.line);
  }

  const toolGrants = new Map();
  for (const a of agents) {
    for (const tool of a.tools) {
      const key = slug(tool);
      if (!toolGrants.has(key)) toolGrants.set(key, { slug: key, name: tool, agents: [] });
      toolGrants.get(key).agents.push(a.slug);
    }
  }

  for (const a of agents) {
    const ordered = detectAgentMentions(a.body, a.lines.body, a.slug);
    a.invokesOrdered = ordered;
    a.invokes = ordered.map((h) => h.slug);
  }
  for (const c of commands) {
    const ordered = detectAgentMentions(c.body, c.lines.body);
    c.invokesOrdered = ordered;
    c.invokes = ordered.map((h) => h.slug);
  }
  for (const w of workflows) {
    const ordered = detectAgentMentions(w.body, w.lines.body);
    w.invokesOrdered = ordered;
    w.invokes = ordered.map((h) => h.slug);
  }

  const edges = [];
  for (const a of agents) {
    for (const tool of a.tools) {
      edges.push({ from: `agent:${a.slug}`, to: `tool:${slug(tool)}`, kind: "grant" });
    }
    for (const invoked of a.invokes) {
      edges.push({ from: `agent:${a.slug}`, to: `agent:${invoked}`, kind: "invokes" });
    }
  }
  for (const c of commands) {
    for (const invoked of c.invokes) {
      edges.push({ from: `command:${c.slug}`, to: `agent:${invoked}`, kind: "invokes" });
    }
  }
  for (const w of workflows) {
    for (const invoked of w.invokes) {
      edges.push({ from: `workflow:${w.slug}`, to: `agent:${invoked}`, kind: "invokes" });
    }
  }

  return {
    claudeDir: absClaude,
    scannedAt: new Date().toISOString(),
    agents,
    commands,
    workflows,
    tools: [...toolGrants.values()],
    mcpServers: mcpServers.map((s) => ({ slug: slug(s), name: s })),
    permissions,
    edges,
  };
}
