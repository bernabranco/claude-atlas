import fs from "fs/promises";
import path from "path";

async function readMdFiles(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith(".md")) {
        const content = await fs.readFile(path.join(dir, e.name), "utf-8");
        files.push({ name: e.name.replace(/\.md$/, ""), content });
      }
    }
    return files;
  } catch {
    return [];
  }
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return { frontmatter: {}, body: content };
  const fm = {};
  for (const line of match[1].split("\n")) {
    const [key, ...rest] = line.split(":");
    if (!key || !rest.length) continue;
    const value = rest.join(":").trim();
    const k = key.trim();
    if (k === "name") fm.name = value.replace(/^["']|["']$/g, "");
    else if (k === "description") fm.description = value.replace(/^["']|["']$/g, "");
    else if (k === "tools") {
      const inner = value.match(/\[(.*?)\]/)?.[1] ?? "";
      fm.tools = inner.split(",").map((t) => t.trim()).filter(Boolean);
    }
  }
  return { frontmatter: fm, body: content.slice(match[0].length) };
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
  const mcpServers = await readMcpServers(repoRoot);
  const permissions = await readSettingsPermissions(absClaude);

  const agents = rawAgents.map((f) => {
    const { frontmatter, body } = parseFrontmatter(f.content);
    return {
      slug: slug(f.name),
      name: frontmatter.name || f.name,
      description: frontmatter.description || "",
      tools: frontmatter.tools || [],
      body: body.trim(),
    };
  });

  const commands = rawCommands.map((f) => {
    const { frontmatter, body } = parseFrontmatter(f.content);
    return {
      slug: slug(f.name),
      name: frontmatter.name || f.name,
      description: frontmatter.description || "",
      body: body.trim(),
    };
  });

  const agentByLowerName = new Map(agents.map((a) => [a.name.toLowerCase(), a]));

  function detectAgentMentions(body, selfSlug = null) {
    const hits = new Set();
    for (const [nameLower, agent] of agentByLowerName) {
      if (agent.slug === selfSlug) continue;
      const re = new RegExp(`\\b${escapeRegex(nameLower)}\\b`, "i");
      if (re.test(body)) hits.add(agent.slug);
    }
    return [...hits];
  }

  const toolGrants = new Map();
  for (const a of agents) {
    for (const tool of a.tools) {
      const key = slug(tool);
      if (!toolGrants.has(key)) toolGrants.set(key, { slug: key, name: tool, agents: [] });
      toolGrants.get(key).agents.push(a.slug);
    }
  }

  for (const a of agents) a.invokes = detectAgentMentions(a.body, a.slug);
  for (const c of commands) c.invokes = detectAgentMentions(c.body);

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

  return {
    claudeDir: absClaude,
    scannedAt: new Date().toISOString(),
    agents,
    commands,
    tools: [...toolGrants.values()],
    mcpServers: mcpServers.map((s) => ({ slug: slug(s), name: s })),
    permissions,
    edges,
  };
}
