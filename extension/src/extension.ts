import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { GraphPanel } from "./graphPanel";
import { updateDiagnostics, Finding } from "./diagnostics";

// Lib modules are ESM — import dynamically at runtime.
type ScanClaudeDir = (claudeDir: string) => Promise<GraphData>;
type Lint = (graph: GraphData) => Finding[];

interface GraphData {
  claudeDir: string;
  agents: Agent[];
  commands: unknown[];
  tools: unknown[];
  mcpServers: unknown[];
  edges: unknown[];
  scannedAt: string;
}

interface Agent {
  slug: string;
  name: string;
  file: string;
  lines: { name: number };
}

async function loadLibs(): Promise<{ scanClaudeDir: ScanClaudeDir; lint: Lint }> {
  // Use Function constructor to avoid esbuild statically resolving these
  // ESM-only paths at bundle time.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scanner = await (Function('return import("../../lib/scanner.js")')() as Promise<any>);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linter = await (Function('return import("../../lib/linter.js")')() as Promise<any>);
  return { scanClaudeDir: scanner.scanClaudeDir, lint: linter.lint };
}

/**
 * Walk upward from startDir until we find a `.claude/` directory or exhaust
 * the filesystem. Returns the absolute path, or null if not found.
 */
function findClaudeDir(startDir: string): string | null {
  let current = startDir;
  // Avoid infinite loops at fs root.
  for (let i = 0; i < 20; i++) {
    const candidate = path.join(current, ".claude");
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function resolveClaudeDir(): string | null {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) return null;

  for (const folder of workspaceFolders) {
    const found = findClaudeDir(folder.uri.fsPath);
    if (found) return found;
  }
  return null;
}

export function activate(context: vscode.ExtensionContext): void {
  const diagnosticCollection = vscode.languages.createDiagnosticCollection("claude-atlas");
  context.subscriptions.push(diagnosticCollection);

  // ---- Command: openGraph ----
  const openGraphCmd = vscode.commands.registerCommand("claude-atlas.openGraph", () => {
    const claudeDir = resolveClaudeDir();
    if (!claudeDir) {
      vscode.window.showInformationMessage(
        "No .claude directory found in workspace."
      );
      return;
    }
    GraphPanel.createOrShow(context, claudeDir);
  });
  context.subscriptions.push(openGraphCmd);

  // ---- Command: lint ----
  const lintCmd = vscode.commands.registerCommand("claude-atlas.lint", async () => {
    const claudeDir = resolveClaudeDir();
    if (!claudeDir) {
      vscode.window.showInformationMessage(
        "No .claude directory found in workspace."
      );
      return;
    }

    try {
      const { scanClaudeDir, lint } = await loadLibs();
      const graph = await scanClaudeDir(claudeDir);
      const findings = lint(graph);

      // Attach each finding's file path from the graph so diagnostics land
      // on the correct file in the Problems panel.
      const enriched = enrichFindingsWithFiles(findings, graph);
      updateDiagnostics(diagnosticCollection, enriched, claudeDir);

      const errorCount = findings.filter((f) => f.level === "error").length;
      const warnCount  = findings.filter((f) => f.level === "warning").length;
      const infoCount  = findings.filter((f) => f.level === "info").length;

      if (findings.length === 0) {
        vscode.window.showInformationMessage("Claude Atlas: no issues found.");
      } else {
        vscode.window.showInformationMessage(
          `Claude Atlas: ${findings.length} finding(s) — ` +
          `${errorCount} error(s), ${warnCount} warning(s), ${infoCount} info`
        );
      }

      // If the graph panel is open, push fresh lint data to it too.
      if (GraphPanel.current) {
        await GraphPanel.current.refresh();
      }
    } catch (err) {
      vscode.window.showErrorMessage(
        `Claude Atlas lint failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });
  context.subscriptions.push(lintCmd);

  // ---- Command: rename ----
  const renameCmd = vscode.commands.registerCommand("claude-atlas.rename", async () => {
    const claudeDir = resolveClaudeDir();
    if (!claudeDir) {
      vscode.window.showInformationMessage(
        "No .claude directory found in workspace."
      );
      return;
    }

    let graph: GraphData;
    try {
      const { scanClaudeDir } = await loadLibs();
      graph = await scanClaudeDir(claudeDir);
    } catch (err) {
      vscode.window.showErrorMessage(
        `Claude Atlas: failed to scan .claude/ — ${err instanceof Error ? err.message : String(err)}`
      );
      return;
    }

    if (graph.agents.length === 0) {
      vscode.window.showInformationMessage("Claude Atlas: no agents found in .claude/agents/.");
      return;
    }

    // Let the user pick an agent from a QuickPick list.
    const agentItems = graph.agents.map((a) => ({
      label: a.name,
      description: a.slug,
    }));

    const picked = await vscode.window.showQuickPick(agentItems, {
      placeHolder: "Select agent to rename",
      title: "Claude Atlas: Rename Agent",
    });
    if (!picked) return;

    const newName = await vscode.window.showInputBox({
      prompt: `New name for agent "${picked.label}"`,
      value: picked.label,
      title: "Claude Atlas: Rename Agent",
      validateInput: (val) => {
        if (!val.trim()) return "Name cannot be empty.";
        if (val.trim() === picked.label) return "New name is the same as the current name.";
        return null;
      },
    });
    if (!newName) return;

    // Dynamic import for rename module.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const renameLib = await (Function('return import("../../lib/rename.js")')() as Promise<any>);
    const { planRename, applyPlan } = renameLib;

    let plan: unknown;
    try {
      plan = await planRename(graph, picked.label, newName.trim());
    } catch (err) {
      vscode.window.showErrorMessage(
        `Claude Atlas: rename plan failed — ${err instanceof Error ? err.message : String(err)}`
      );
      return;
    }

    // Show a diff-like preview and ask for confirmation.
    const typedPlan = plan as {
      collision: null | { type: string; name: string };
      changes: Array<{ file: string; line: number; before: string; after: string }>;
    };

    if (typedPlan.collision) {
      vscode.window.showWarningMessage(
        `Cannot rename: "${newName}" collides with existing ` +
        `${typedPlan.collision.type} "${typedPlan.collision.name}".`
      );
      return;
    }

    const changeCount = typedPlan.changes.length;
    const fileCount = new Set(typedPlan.changes.map((c) => c.file)).size;

    if (changeCount === 0) {
      vscode.window.showInformationMessage(
        `Claude Atlas: no occurrences of "${picked.label}" found. Nothing to rename.`
      );
      return;
    }

    const previewLines = typedPlan.changes.slice(0, 10).map(
      (c) => `  L${c.line}  - ${c.before.trim()}\n        + ${c.after.trim()}`
    );
    const truncated = changeCount > 10 ? `\n  … and ${changeCount - 10} more` : "";

    const confirm = await vscode.window.showInformationMessage(
      `Rename "${picked.label}" → "${newName.trim()}"?\n` +
      `${changeCount} change(s) across ${fileCount} file(s):\n\n` +
      previewLines.join("\n") + truncated,
      { modal: true },
      "Apply"
    );

    if (confirm !== "Apply") return;

    try {
      await applyPlan(plan);
      vscode.window.showInformationMessage(
        `Claude Atlas: renamed "${picked.label}" to "${newName.trim()}" ` +
        `(${changeCount} change(s) in ${fileCount} file(s)).`
      );
      // Refresh graph panel and diagnostics.
      if (GraphPanel.current) {
        await GraphPanel.current.refresh();
      }
    } catch (err) {
      vscode.window.showErrorMessage(
        `Claude Atlas: rename failed — ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });
  context.subscriptions.push(renameCmd);

  // ---- File watcher ----
  const watcher = vscode.workspace.createFileSystemWatcher("**/.claude/**/*.{md,json}");

  const onClaudeChange = async () => {
    const claudeDir = resolveClaudeDir();
    if (!claudeDir) return;

    try {
      const { scanClaudeDir, lint } = await loadLibs();
      const graph = await scanClaudeDir(claudeDir);
      const findings = lint(graph);
      const enriched = enrichFindingsWithFiles(findings, graph);
      updateDiagnostics(diagnosticCollection, enriched, claudeDir);
    } catch {
      // Suppress errors during background re-lint — file may be mid-save.
    }

    if (GraphPanel.current) {
      try {
        await GraphPanel.current.refresh();
      } catch {
        // Panel may have been disposed between the watcher firing and here.
      }
    }
  };

  watcher.onDidChange(onClaudeChange);
  watcher.onDidCreate(onClaudeChange);
  watcher.onDidDelete(onClaudeChange);
  context.subscriptions.push(watcher);
}

export function deactivate(): void {
  // Nothing to clean up — disposables are handled via context.subscriptions.
}

/**
 * Lint findings carry a `subject` like "agent:code-reviewer" but no file path.
 * Look up the agent/command in the graph to get its absolute file path, then
 * copy it onto the finding so diagnostics land on the right file.
 */
function enrichFindingsWithFiles(findings: Finding[], graph: GraphData): Finding[] {
  const agentBySlug = new Map<string, Agent>(
    graph.agents.map((a) => [a.slug, a])
  );

  return findings.map((f) => {
    if (!f.subject) return f;

    let file: string | undefined;

    if (f.subject.startsWith("agent:")) {
      const slug = f.subject.slice(6);
      const agent = agentBySlug.get(slug);
      if (agent?.file) file = agent.file;
    }
    // Commands don't expose a `file` property in the current graph shape;
    // fall back to claudeDir-level attachment handled by updateDiagnostics.

    return file ? { ...f, file } : f;
  });
}
