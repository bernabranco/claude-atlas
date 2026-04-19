import fs from "fs/promises";
import path from "path";

function escapeRegex(s) {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

/**
 * Build a rename plan without touching disk.
 *
 * Matches the scanner's word-boundary semantics so any mention the scanner
 * would count as an invocation also gets rewritten. Case-sensitive — we
 * don't rewrite "CODE-REVIEWER" to "reviewer" behind the user's back.
 *
 * Plan shape:
 *   { oldName, newName, definingFile, collision, changes: [{file, kind, line, before, after}] }
 */
export async function planRename(graph, oldName, newName) {
  const agentsDir = path.join(graph.claudeDir, "agents");
  const commandsDir = path.join(graph.claudeDir, "commands");

  const definingAgent = graph.agents.find(
    (a) => a.name.toLowerCase() === oldName.toLowerCase()
  );

  const newLower = newName.toLowerCase();
  const collidingAgent = graph.agents.find(
    (a) => a.name.toLowerCase() === newLower && a !== definingAgent
  );
  const collidingCommand = graph.commands.find((c) => c.slug === newLower);

  let collision = null;
  if (collidingAgent) collision = { type: "agent", name: collidingAgent.name };
  else if (collidingCommand) collision = { type: "command", name: `/${collidingCommand.slug}` };

  const changes = [];
  const pattern = new RegExp(`\\b${escapeRegex(oldName)}\\b`, "g");

  let definingFile = null;
  if (definingAgent) {
    definingFile = path.join("agents", `${definingAgent.slug}.md`);
    const abs = path.join(agentsDir, `${definingAgent.slug}.md`);
    const content = await fs.readFile(abs, "utf-8");
    const lines = content.split("\n");
    const fmEnd = findFrontmatterEnd(lines);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (fmEnd !== -1 && i > 0 && i < fmEnd) {
        const nameMatch = line.match(/^(\s*name\s*:\s*)(.*)$/);
        if (nameMatch) {
          const current = nameMatch[2].trim().replace(/^["']|["']$/g, "");
          if (current === definingAgent.name) {
            changes.push({
              file: definingFile,
              kind: "frontmatter-name",
              line: i + 1,
              before: line,
              after: `${nameMatch[1]}${newName}`,
            });
            continue;
          }
        }
      }
      pushBodyMatches(changes, definingFile, line, i + 1, pattern, newName);
    }
  }

  for (const a of graph.agents) {
    if (a === definingAgent) continue;
    const rel = path.join("agents", `${a.slug}.md`);
    const abs = path.join(agentsDir, `${a.slug}.md`);
    await collectBodyChanges(changes, rel, abs, pattern, newName);
  }

  for (const c of graph.commands) {
    const rel = path.join("commands", `${c.slug}.md`);
    const abs = path.join(commandsDir, `${c.slug}.md`);
    await collectBodyChanges(changes, rel, abs, pattern, newName);
  }

  return {
    oldName,
    newName,
    claudeDir: graph.claudeDir,
    definingFile,
    collision,
    changes,
  };
}

/**
 * Apply a plan to disk. Groups changes by file and rewrites each one.
 * Returns { filesChanged, changeCount }.
 */
export async function applyPlan(plan) {
  if (plan.collision) {
    throw new Error(
      `Rename blocked: new name "${plan.newName}" collides with existing ${plan.collision.type} "${plan.collision.name}"`
    );
  }

  const byFile = new Map();
  for (const ch of plan.changes) {
    if (!byFile.has(ch.file)) byFile.set(ch.file, []);
    byFile.get(ch.file).push(ch);
  }

  for (const [rel, fileChanges] of byFile) {
    const abs = path.join(plan.claudeDir, rel);
    const content = await fs.readFile(abs, "utf-8");
    const lines = content.split("\n");
    for (const ch of fileChanges) {
      lines[ch.line - 1] = ch.after;
    }
    await fs.writeFile(abs, lines.join("\n"));
  }

  return { filesChanged: byFile.size, changeCount: plan.changes.length };
}

function findFrontmatterEnd(lines) {
  if (lines[0] !== "---") return -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") return i;
  }
  return -1;
}

async function collectBodyChanges(changes, rel, abs, pattern, newName) {
  let content;
  try {
    content = await fs.readFile(abs, "utf-8");
  } catch {
    return;
  }
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    pushBodyMatches(changes, rel, lines[i], i + 1, pattern, newName);
  }
}

function pushBodyMatches(changes, file, line, lineNum, pattern, newName) {
  pattern.lastIndex = 0;
  if (!pattern.test(line)) return;
  const rewritten = line.replace(new RegExp(pattern.source, "g"), newName);
  if (rewritten === line) return;
  changes.push({
    file,
    kind: "body-mention",
    line: lineNum,
    before: line,
    after: rewritten,
  });
}
