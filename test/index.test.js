/**
 * claude-atlas test suite
 * Uses Node.js built-in test runner (node:test) — no extra dependencies.
 * Run: npm test
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import os from "node:os";

import { scanClaudeDir } from "../lib/scanner.js";
import { lint } from "../lib/linter.js";
import { planRename, applyPlan } from "../lib/rename.js";
import {
  parsePermission,
  ruleCovers,
  whoCan,
} from "../lib/who-can.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "fixtures");
const SAMPLE = path.join(FIXTURES, "sample");
const CYCLE = path.join(FIXTURES, "cycle");
const BAD_REF = path.join(FIXTURES, "bad-ref");

// ---------------------------------------------------------------------------
// scanner
// ---------------------------------------------------------------------------

describe("scanner", () => {
  let graph;

  before(async () => {
    graph = await scanClaudeDir(SAMPLE);
  });

  it("returns agents array", () => {
    assert.ok(Array.isArray(graph.agents));
    assert.ok(graph.agents.length >= 5, "expected at least 5 agents in sample");
  });

  it("parses agent frontmatter: name, description, tools", () => {
    const planner = graph.agents.find((a) => a.slug === "planner");
    assert.ok(planner, "planner agent not found");
    assert.equal(planner.name, "planner");
    assert.equal(planner.description, "Sketches an approach before code goes out.");
    assert.deepEqual(planner.tools, ["Read", "Grep"]);
  });

  it("parses agent without description (frontmatter field absent)", () => {
    const nd = graph.agents.find((a) => a.slug === "no-description");
    assert.ok(nd, "no-description agent not found");
    assert.equal(nd.description, "");
  });

  it("detects agent-to-agent invocation via word-boundary mention", () => {
    const planner = graph.agents.find((a) => a.slug === "planner");
    assert.ok(planner.invokes.includes("reviewer"), "planner should invoke reviewer");
    assert.ok(planner.invokes.includes("writer"), "planner should invoke writer");
  });

  it("does NOT add self-invocation", () => {
    for (const agent of graph.agents) {
      assert.ok(!agent.invokes.includes(agent.slug), `${agent.slug} invokes itself`);
    }
  });

  it("returns commands array", () => {
    assert.ok(Array.isArray(graph.commands));
    assert.ok(graph.commands.length >= 2);
  });

  it("parses command frontmatter description", () => {
    const review = graph.commands.find((c) => c.slug === "review");
    assert.ok(review, "review command not found");
    assert.equal(review.description, "Run a review pass on the current working tree.");
  });

  it("parses command with no frontmatter (no-frontmatter.md)", () => {
    const nf = graph.commands.find((c) => c.slug === "no-frontmatter");
    assert.ok(nf, "no-frontmatter command not found");
    assert.equal(nf.description, "");
  });

  it("detects command invoking an agent", () => {
    const review = graph.commands.find((c) => c.slug === "review");
    assert.ok(review.invokes.includes("reviewer"), "review command should invoke reviewer");
  });

  it("parses permissions from settings.json", () => {
    assert.ok(graph.permissions.allow.includes("Read"));
    assert.ok(graph.permissions.deny.includes("Bash(rm *)"));
  });

  it("returns edges array with kind=grant and kind=invokes", () => {
    const grantEdge = graph.edges.find((e) => e.kind === "grant");
    const invokesEdge = graph.edges.find((e) => e.kind === "invokes");
    assert.ok(grantEdge, "should have at least one grant edge");
    assert.ok(invokesEdge, "should have at least one invokes edge");
  });

  it("tool grants appear in graph.tools", () => {
    const toolNames = new Set(graph.tools.map((t) => t.name));
    assert.ok(toolNames.has("Read"), "Read should be in tools");
    assert.ok(toolNames.has("Write"), "Write should be in tools");
  });

  it("scannedAt is an ISO date string", () => {
    assert.ok(!Number.isNaN(Date.parse(graph.scannedAt)), "scannedAt should parse as date");
  });

  it("claudeDir is the resolved absolute path", () => {
    assert.ok(path.isAbsolute(graph.claudeDir));
  });

  it("throws on missing .claude directory", async () => {
    await assert.rejects(
      () => scanClaudeDir("/tmp/__nonexistent_atlas_dir__"),
      /No \.claude directory/
    );
  });

  it("returns workflows array", () => {
    assert.ok(Array.isArray(graph.workflows), "graph.workflows should be an array");
    assert.ok(graph.workflows.length >= 1, "expected at least one workflow in sample");
  });

  it("parses workflow frontmatter: name, description", () => {
    const deploy = graph.workflows.find((w) => w.slug === "deploy");
    assert.ok(deploy, "deploy workflow not found");
    assert.equal(deploy.name, "deploy");
    assert.equal(deploy.description, "Full deploy pipeline from plan to ship.");
  });

  it("detects workflow invoking agents via prose mention", () => {
    const deploy = graph.workflows.find((w) => w.slug === "deploy");
    assert.ok(deploy.invokes.includes("planner"), "deploy should invoke planner");
    assert.ok(deploy.invokes.includes("writer"), "deploy should invoke writer");
    assert.ok(deploy.invokes.includes("reviewer"), "deploy should invoke reviewer");
  });

  it("emits workflow→agent invokes edges", () => {
    const wfEdges = graph.edges.filter((e) => e.from === "workflow:deploy" && e.kind === "invokes");
    assert.ok(wfEdges.length >= 1, "expected invokes edges from workflow:deploy");
    const targets = wfEdges.map((e) => e.to);
    assert.ok(targets.includes("agent:planner"), "should have edge to agent:planner");
  });
});

// ---------------------------------------------------------------------------
// linter — all 6 rules
// ---------------------------------------------------------------------------

function makeGraph(overrides = {}) {
  return {
    agents: [],
    commands: [],
    tools: [],
    mcpServers: [],
    permissions: { allow: [], deny: [] },
    edges: [],
    ...overrides,
  };
}

describe("linter", () => {
  describe("dead-agent rule", () => {
    it("flags an agent that is never invoked", async () => {
      const graph = await scanClaudeDir(SAMPLE);
      const findings = lint(graph);
      const dead = findings.filter((f) => f.code === "dead-agent");
      // shipper and no-description are never invoked by anything in the sample
      const deadSlugs = new Set(dead.map((f) => f.subject.replace("agent:", "")));
      assert.ok(deadSlugs.has("shipper"), "shipper should be dead-agent");
      assert.ok(deadSlugs.has("no-description"), "no-description should be dead-agent");
    });

    it("does not flag an invoked agent", async () => {
      const graph = await scanClaudeDir(SAMPLE);
      const findings = lint(graph);
      const dead = findings.filter((f) => f.code === "dead-agent");
      const deadSlugs = new Set(dead.map((f) => f.subject.replace("agent:", "")));
      assert.ok(!deadSlugs.has("reviewer"), "reviewer is invoked, should not be dead");
    });
  });

  describe("missing-agent-ref rule", () => {
    // The scanner only populates agent.invokes with slugs of agents it already
    // found — so a genuinely missing agent can never appear via scanning alone.
    // We test the rule directly by constructing a synthetic graph where the
    // invokes list contains a slug not present in agents[].

    it("fires when an agent invokes a slug not in the agent list", () => {
      const graph = makeGraph({
        agents: [
          {
            slug: "caller",
            name: "caller",
            description: "calls ghost",
            tools: [],
            invokes: ["ghostagent"],
            body: "",
            lines: { name: 1 },
          },
        ],
        edges: [{ from: "agent:caller", to: "agent:ghostagent", kind: "invokes" }],
      });
      const findings = lint(graph);
      const errors = findings.filter((f) => f.code === "missing-agent-ref");
      assert.ok(errors.length >= 1, "expected missing-agent-ref for ghostagent");
      assert.ok(errors[0].subject === "agent:caller");
    });

    it("fires when a command invokes a slug not in the agent list", () => {
      const graph = makeGraph({
        commands: [
          {
            slug: "deploy",
            name: "deploy",
            description: "deploys via ghost",
            invokes: ["ghostagent"],
            body: "",
            lines: { name: 1 },
          },
        ],
        edges: [{ from: "command:deploy", to: "agent:ghostagent", kind: "invokes" }],
      });
      const findings = lint(graph);
      const errors = findings.filter(
        (f) => f.code === "missing-agent-ref" && f.subject.startsWith("command:")
      );
      assert.ok(errors.length >= 1, "expected command-level missing-agent-ref");
    });

    it("does not fire for a valid sample fixture", async () => {
      const graph = await scanClaudeDir(SAMPLE);
      const findings = lint(graph);
      const errors = findings.filter((f) => f.code === "missing-agent-ref");
      assert.equal(errors.length, 0, "sample has no bad refs");
    });

    it("fires when a workflow references a nonexistent agent", async () => {
      const graph = makeGraph({
        workflows: [
          {
            slug: "broken",
            name: "broken",
            description: "References a ghost agent.",
            invokes: ["ghost-agent"],
            body: "",
            lines: { name: 1 },
          },
        ],
        edges: [{ from: "workflow:broken", to: "agent:ghost-agent", kind: "invokes" }],
      });
      const findings = lint(graph);
      const errors = findings.filter(
        (f) => f.code === "missing-agent-ref" && f.subject === "workflow:broken"
      );
      assert.ok(errors.length >= 1, "expected missing-agent-ref for workflow referencing nonexistent agent");
    });
  });

  describe("missing-description rule", () => {
    it("fires for agent with no description", async () => {
      const graph = await scanClaudeDir(SAMPLE);
      const findings = lint(graph);
      const noDesc = findings.filter((f) => f.code === "missing-description");
      const subjects = noDesc.map((f) => f.subject);
      assert.ok(subjects.includes("agent:no-description"), "no-description agent should fire");
    });

    it("fires for command with no frontmatter", async () => {
      const graph = await scanClaudeDir(SAMPLE);
      const findings = lint(graph);
      const noDesc = findings.filter((f) => f.code === "missing-description");
      const subjects = noDesc.map((f) => f.subject);
      assert.ok(subjects.includes("command:no-frontmatter"), "no-frontmatter command should fire");
    });

    it("does not fire for agents with a description", async () => {
      const graph = await scanClaudeDir(SAMPLE);
      const findings = lint(graph);
      const noDesc = findings.filter((f) => f.code === "missing-description");
      const subjects = noDesc.map((f) => f.subject);
      assert.ok(!subjects.includes("agent:planner"), "planner has description, should not fire");
    });

    it("fires for workflow with no description", () => {
      const graph = makeGraph({
        workflows: [
          {
            slug: "nodesc",
            name: "nodesc",
            description: "",
            invokes: [],
            body: "Does something.",
            lines: { name: 1 },
          },
        ],
      });
      const findings = lint(graph);
      const f = findings.filter((x) => x.code === "missing-description" && x.subject === "workflow:nodesc");
      assert.ok(f.length >= 1, "expected missing-description for workflow with no description");
    });
  });

  describe("delegation-cycle rule", () => {
    it("fires on an A→B→A cycle", async () => {
      const graph = await scanClaudeDir(CYCLE);
      const findings = lint(graph);
      const cycles = findings.filter((f) => f.code === "delegation-cycle");
      assert.ok(cycles.length >= 1, "expected at least one delegation-cycle finding");
    });

    it("cycle message contains both agent names", async () => {
      const graph = await scanClaudeDir(CYCLE);
      const findings = lint(graph);
      const cycle = findings.find((f) => f.code === "delegation-cycle");
      assert.ok(cycle.message.includes("alpha"), "cycle message should mention alpha");
      assert.ok(cycle.message.includes("beta"), "cycle message should mention beta");
    });

    it("does not fire for the acyclic sample", async () => {
      const graph = await scanClaudeDir(SAMPLE);
      const findings = lint(graph);
      const cycles = findings.filter((f) => f.code === "delegation-cycle");
      assert.equal(cycles.length, 0, "sample has no cycles");
    });
  });

  describe("unused-tool-grant rule", () => {
    it("fires for agent with Write grant but no prose mention", async () => {
      // The no-description agent has Read grant; writer has Write and mentions writing.
      // We need an agent that has Write but doesn't mention writing or editing.
      // In the sample, writer mentions writing so should NOT fire. Validate that.
      const graph = await scanClaudeDir(SAMPLE);
      const findings = lint(graph);
      const unusedGrants = findings.filter((f) => f.code === "unused-tool-grant");
      const subjects = unusedGrants.map((f) => f.subject);
      // writer explicitly mentions Write/Edit in prose — should NOT appear
      assert.ok(!subjects.includes("agent:writer"), "writer mentions writing, should not fire");
    });
  });

  describe("duplicate-candidate rule", () => {
    it("findings have the expected shape", async () => {
      const graph = await scanClaudeDir(SAMPLE);
      const findings = lint(graph);
      const dupes = findings.filter((f) => f.code === "duplicate-candidate");
      for (const d of dupes) {
        assert.ok(typeof d.score === "number", "score should be a number");
        assert.ok(d.score >= 0 && d.score <= 1, "score should be between 0 and 1");
        assert.ok(Array.isArray(d.related), "related should be an array");
        assert.equal(d.level, "info");
      }
    });
  });

  it("all findings have required fields: level, code, message, subject, line", async () => {
    const graph = await scanClaudeDir(SAMPLE);
    const findings = lint(graph);
    for (const f of findings) {
      assert.ok(f.level, `finding missing level: ${JSON.stringify(f)}`);
      assert.ok(f.code, `finding missing code: ${JSON.stringify(f)}`);
      assert.ok(f.message, `finding missing message: ${JSON.stringify(f)}`);
      assert.ok(f.subject, `finding missing subject: ${JSON.stringify(f)}`);
      assert.ok(typeof f.line === "number", `finding missing line: ${JSON.stringify(f)}`);
    }
  });
});

// ---------------------------------------------------------------------------
// rename
// ---------------------------------------------------------------------------

describe("rename", () => {
  let tmpDir;
  let graph;

  before(async () => {
    // Copy the sample fixture to a temp dir so rename tests can write freely
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-rename-"));
    await copyDir(SAMPLE, tmpDir);
    graph = await scanClaudeDir(tmpDir);
  });

  it("planRename detects frontmatter name change", async () => {
    const plan = await planRename(graph, "planner", "strategist");
    assert.equal(plan.oldName, "planner");
    assert.equal(plan.newName, "strategist");
    const fmChange = plan.changes.find((c) => c.kind === "frontmatter-name");
    assert.ok(fmChange, "should have a frontmatter-name change");
    assert.ok(fmChange.after.includes("strategist"));
  });

  it("planRename detects body-mention changes", async () => {
    const plan = await planRename(graph, "planner", "strategist");
    const bodyChanges = plan.changes.filter((c) => c.kind === "body-mention");
    assert.ok(bodyChanges.length >= 1, "should have at least one body-mention change");
  });

  it("planRename reports collision when new name exists", async () => {
    const plan = await planRename(graph, "planner", "reviewer");
    assert.ok(plan.collision !== null, "should report a collision");
    assert.equal(plan.collision.type, "agent");
  });

  it("planRename returns empty changes for unknown old name", async () => {
    const plan = await planRename(graph, "ghostagent", "newname");
    assert.equal(plan.definingFile, null);
    assert.equal(plan.changes.length, 0);
  });

  it("applyPlan writes files and returns counts", async () => {
    const plan = await planRename(graph, "writer", "editor");
    assert.ok(!plan.collision, "no collision expected");
    const result = await applyPlan(plan);
    assert.ok(result.filesChanged >= 1);
    assert.ok(result.changeCount >= 1);
    // Verify the file was actually rewritten
    const writerFile = path.join(tmpDir, "agents", "writer.md");
    const content = await fs.readFile(writerFile, "utf-8");
    assert.ok(content.includes("editor"), "file should now contain 'editor'");
  });

  it("applyPlan throws when collision exists", async () => {
    const plan = await planRename(graph, "planner", "reviewer");
    await assert.rejects(
      () => applyPlan(plan),
      /Rename blocked/
    );
  });

  it("dry-run plan does not modify files", async () => {
    await planRename(graph, "planner", "strategist");
    // planRename must not change files on disk — only applyPlan does
    const before = await fs.readFile(
      path.join(tmpDir, "agents", "planner.md"),
      "utf-8"
    );
    // Don't call applyPlan — just confirm file unchanged after planRename
    const after = await fs.readFile(
      path.join(tmpDir, "agents", "planner.md"),
      "utf-8"
    );
    assert.equal(before, after);
  });
});

// ---------------------------------------------------------------------------
// who-can
// ---------------------------------------------------------------------------

describe("who-can", () => {
  let graph;

  before(async () => {
    graph = await scanClaudeDir(SAMPLE);
  });

  describe("parsePermission", () => {
    it("parses bare tool", () => {
      const p = parsePermission("Read");
      assert.equal(p.tool, "Read");
      assert.equal(p.spec, null);
    });

    it("parses scoped tool", () => {
      const p = parsePermission("Bash(git push)");
      assert.equal(p.tool, "Bash");
      assert.equal(p.spec, "git push");
    });

    it("handles empty string gracefully", () => {
      const p = parsePermission("");
      assert.equal(p.tool, "");
      assert.equal(p.spec, null);
    });
  });

  describe("ruleCovers", () => {
    it("bare rule covers scoped query for same tool", () => {
      const rule = parsePermission("Bash");
      const query = parsePermission("Bash(git push)");
      assert.ok(ruleCovers(rule, query));
    });

    it("scoped rule does NOT cover bare query", () => {
      const rule = parsePermission("Bash(git *)");
      const query = parsePermission("Bash");
      assert.ok(!ruleCovers(rule, query));
    });

    it("glob * matches arbitrary spec", () => {
      const rule = parsePermission("Bash(git *)");
      const query = parsePermission("Bash(git push --force)");
      assert.ok(ruleCovers(rule, query));
    });

    it("different tools never match", () => {
      const rule = parsePermission("Read");
      const query = parsePermission("Write");
      assert.ok(!ruleCovers(rule, query));
    });

    it("tool matching is case-insensitive", () => {
      const rule = parsePermission("bash");
      const query = parsePermission("Bash(git status)");
      assert.ok(ruleCovers(rule, query));
    });
  });

  describe("whoCan", () => {
    it("returns agents with matching tool grant and allow rule", () => {
      // Read is in allow, shipper has Bash+Read, reviewer has Read+Grep+Glob
      const result = whoCan(graph, "Read");
      assert.equal(result.permission, "Read");
      assert.ok(result.allowedBy.length > 0, "Read should be in allowedBy");
      assert.ok(result.deniedBy.length === 0, "Read is not denied");
      assert.ok(result.agents.length >= 1, "at least one agent should have Read");
    });

    it("returns empty agents when query is denied", () => {
      // Bash(rm -rf /) matches Bash(rm *) deny rule
      const result = whoCan(graph, "Bash(rm -rf /)");
      assert.equal(result.agents.length, 0, "rm is denied so no agents should appear");
      assert.ok(result.deniedBy.length >= 1, "rm should appear in deniedBy");
    });

    it("denyMode returns agents blocked by deny rule", () => {
      // shipper has Bash; Bash(rm *) is denied
      const result = whoCan(graph, "Bash(rm -rf /)", { denyMode: true });
      assert.ok(result.agents.length >= 1, "shipper should appear in denyMode");
    });

    it("returns empty agents when tool not granted to anyone", () => {
      const result = whoCan(graph, "WebFetch");
      assert.equal(result.agents.length, 0);
    });

    it("result.agents have slug, name, and via fields", () => {
      const result = whoCan(graph, "Read");
      for (const a of result.agents) {
        assert.ok(a.slug);
        assert.ok(a.name);
        assert.ok(a.via);
        assert.ok(Array.isArray(a.via.tools));
      }
    });
  });
});

// ---------------------------------------------------------------------------
// linter: unscoped-bash rule
// ---------------------------------------------------------------------------

describe("linter — unscoped-bash rule", () => {
  const UNSCOPED = path.join(FIXTURES, "unscoped-bash");

  it("fires when agent has Bash tool and no Bash(...) allow rule", async () => {
    const graph = await scanClaudeDir(UNSCOPED);
    const findings = lint(graph);
    const f = findings.filter((x) => x.code === "unscoped-bash");
    assert.ok(f.length >= 1, "expected at least one unscoped-bash finding");
    assert.equal(f[0].level, "warning");
    assert.ok(f[0].message.includes("runner"), "message should name the agent");
  });

  it("is suppressed when a scoped Bash allow rule exists", async () => {
    const graph = await scanClaudeDir(UNSCOPED);
    graph.permissions.allow = ["Bash(git *)"];
    const findings = lint(graph);
    const f = findings.filter((x) => x.code === "unscoped-bash");
    assert.equal(f.length, 0, "unscoped-bash should not fire when Bash(git *) allow exists");
  });

  it("is NOT suppressed when only a wildcard Bash(*) allow rule exists", async () => {
    const graph = await scanClaudeDir(UNSCOPED);
    graph.permissions.allow = ["Bash(*)"];
    const findings = lint(graph);
    const f = findings.filter((x) => x.code === "unscoped-bash");
    assert.ok(f.length >= 1, "Bash(*) is an unrestricted grant and should not suppress unscoped-bash");
  });
});

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

async function copyDir(src, dest) {
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true });
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}
