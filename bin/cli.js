#!/usr/bin/env node
import { scanClaudeDir } from "../lib/scanner.js";
import { lint } from "../lib/linter.js";
import { startServer } from "../lib/server.js";
import { planRename, applyPlan } from "../lib/rename.js";

const args = process.argv.slice(2);
const [command, ...rest] = args;

const BOOLEAN_FLAGS = new Set(["json", "dryRun"]);

function parseFlags(argv) {
  const flags = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      flags.positional.push(a);
      continue;
    }
    const key = camelCase(a.slice(2));
    if (BOOLEAN_FLAGS.has(key)) {
      flags[key] = true;
    } else {
      flags[key] = argv[++i];
    }
  }
  return flags;
}

function camelCase(s) {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

async function cmdScan(argv) {
  const flags = parseFlags(argv);
  const target = flags.claudeDir || flags.positional[0] || ".claude";
  const graph = await scanClaudeDir(target);
  if (flags.json) {
    console.log(JSON.stringify(graph, null, 2));
    return;
  }
  console.log(`Scanned ${graph.claudeDir}`);
  console.log(
    `  ${graph.agents.length} agents, ${graph.commands.length} commands, ${graph.tools.length} tools, ${graph.mcpServers.length} MCP servers`
  );
  console.log(`  ${graph.edges.length} edges`);
  console.log(
    `  ${graph.permissions.allow.length} allow rules, ${graph.permissions.deny.length} deny rules`
  );
}

async function cmdServe(argv) {
  const flags = parseFlags(argv);
  const target = flags.claudeDir || flags.positional[0] || ".claude";
  const port = flags.port ? Number(flags.port) : 4000;
  startServer({ claudeDir: target, port });
}

async function cmdLint(argv) {
  const flags = parseFlags(argv);
  const target = flags.claudeDir || flags.positional[0] || ".claude";
  const graph = await scanClaudeDir(target);
  const findings = lint(graph);

  if (flags.json) {
    console.log(JSON.stringify(findings, null, 2));
    process.exit(findings.some((f) => f.level === "error") ? 1 : 0);
  }

  if (!findings.length) {
    console.log("✓ No issues found.");
    return;
  }

  const byLevel = { error: [], warning: [], info: [] };
  for (const f of findings) byLevel[f.level].push(f);

  for (const level of ["error", "warning", "info"]) {
    if (!byLevel[level].length) continue;
    console.log(`\n${level.toUpperCase()} (${byLevel[level].length})`);
    for (const f of byLevel[level]) {
      console.log(`  [${f.code}] ${f.message}`);
    }
  }
  console.log(
    `\n${byLevel.error.length} error(s), ${byLevel.warning.length} warning(s), ${byLevel.info.length} info`
  );
  process.exit(byLevel.error.length > 0 ? 1 : 0);
}

async function cmdDuplicates(argv) {
  const flags = parseFlags(argv);
  const target = flags.claudeDir || flags.positional[0] || ".claude";
  const graph = await scanClaudeDir(target);
  const findings = lint(graph)
    .filter((f) => f.code === "duplicate-candidate")
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  if (flags.json) {
    console.log(JSON.stringify(findings, null, 2));
    return;
  }

  if (!findings.length) {
    console.log("✓ No duplicate candidates found.");
    return;
  }

  console.log(`${findings.length} duplicate candidate(s):\n`);
  for (const f of findings) {
    console.log(`  ${f.message}`);
  }
}

async function cmdRename(argv) {
  const flags = parseFlags(argv);
  const [oldName, newName, pathArg] = flags.positional;

  if (!oldName || !newName) {
    console.error("Usage: claude-atlas rename <old-name> <new-name> [path] [--dry-run] [--json]");
    process.exit(1);
  }

  const target = pathArg || flags.claudeDir || ".claude";
  const graph = await scanClaudeDir(target);
  const plan = await planRename(graph, oldName, newName);

  if (flags.json) {
    console.log(JSON.stringify(plan, null, 2));
    process.exit(plan.collision ? 1 : 0);
  }

  if (plan.collision) {
    console.error(
      `✗ Cannot rename to "${newName}" — collides with existing ${plan.collision.type} "${plan.collision.name}".`
    );
    process.exit(1);
  }

  if (!plan.definingFile && !plan.changes.length) {
    console.log(`No agent named "${oldName}" and no references found — nothing to rename.`);
    return;
  }

  if (!plan.definingFile) {
    console.log(
      `Note: no agent definition found for "${oldName}". Renaming references only.`
    );
  }

  const byFile = new Map();
  for (const ch of plan.changes) {
    if (!byFile.has(ch.file)) byFile.set(ch.file, []);
    byFile.get(ch.file).push(ch);
  }

  const action = flags.dryRun ? "Would rewrite" : "Rewriting";
  console.log(`${action} ${byFile.size} file(s), ${plan.changes.length} change(s):\n`);
  for (const [file, changes] of byFile) {
    console.log(`  ${file}`);
    for (const ch of changes) {
      const tag = ch.kind === "frontmatter-name" ? "name" : "mention";
      console.log(`    L${ch.line} [${tag}] ${truncate(ch.before.trim())}`);
      console.log(`         → ${truncate(ch.after.trim())}`);
    }
  }

  if (flags.dryRun) {
    console.log(`\nDry run — no files changed. Re-run without --dry-run to apply.`);
    return;
  }

  const result = await applyPlan(plan);
  console.log(
    `\n✓ Renamed "${oldName}" → "${newName}" in ${result.filesChanged} file(s), ${result.changeCount} change(s).`
  );
}

function truncate(s, n = 80) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function usage() {
  console.log(`claude-atlas — map and lint your .claude/ directory

Usage:
  claude-atlas scan [path]         Scan and print a summary
  claude-atlas scan [path] --json  Emit the full graph as JSON

  claude-atlas lint [path]         Lint the graph for issues
  claude-atlas lint [path] --json  Emit findings as JSON (exit 1 on errors)

  claude-atlas duplicates [path]   Show only duplicate-candidate findings,
                                   ranked by similarity score

  claude-atlas rename <old> <new> [path] [--dry-run] [--json]
                                   Rename an agent and every reference to it.
                                   --dry-run prints the plan without writing.

  claude-atlas serve [path]        Start the interactive graph viewer
  claude-atlas serve [path] --port 4000
                                   Choose the HTTP port (default 4000)

Defaults to ./.claude if no path is given.
`);
}

const handler = {
  scan: cmdScan,
  lint: cmdLint,
  duplicates: cmdDuplicates,
  rename: cmdRename,
  serve: cmdServe,
}[command];

if (!handler) {
  if (command && command !== "--help" && command !== "-h") {
    console.error(`Unknown command: ${command}\n`);
  }
  usage();
  process.exit(command ? 1 : 0);
}

try {
  await handler(rest);
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
