#!/usr/bin/env node
import { scanClaudeDir } from "../lib/scanner.js";
import { lint } from "../lib/linter.js";
import { startServer } from "../lib/server.js";

const args = process.argv.slice(2);
const [command, ...rest] = args;

const BOOLEAN_FLAGS = new Set(["json"]);

function parseFlags(argv) {
  const flags = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      flags.positional.push(a);
      continue;
    }
    const key = a.slice(2);
    if (BOOLEAN_FLAGS.has(key)) {
      flags[key] = true;
    } else {
      flags[camelCase(key)] = argv[++i];
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

function usage() {
  console.log(`claude-atlas — map and lint your .claude/ directory

Usage:
  claude-atlas scan [path]         Scan and print a summary
  claude-atlas scan [path] --json  Emit the full graph as JSON

  claude-atlas lint [path]         Lint the graph for issues
  claude-atlas lint [path] --json  Emit findings as JSON (exit 1 on errors)

  claude-atlas duplicates [path]   Show only duplicate-candidate findings,
                                   ranked by similarity score

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
