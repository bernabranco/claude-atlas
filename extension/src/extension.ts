import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { GraphPanel } from "./graphPanel";
import { updateDiagnostics, Finding } from "./diagnostics";
import { scanClaudeDir } from "../../lib/scanner.js";
import { lint } from "../../lib/linter.js";
import { planRename, applyPlan } from "../../lib/rename.js";

type GraphData = Awaited<ReturnType<typeof scanClaudeDir>>;

interface Agent {
  slug: string;
  name: string;
  file: string;
  lines: { name: number };
}

function findClaudeDir(startDir: string): string | null {
  let current = startDir;
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

  const openGraphCmd = vscode.commands.registerCommand("claude-atlas.openGraph", () => {
    const claudeDir = resolveClaudeDir();
    if (!claudeDir) {
      vscode.window.showInformationMessage("No .claude directory found in workspace.");
      return;
    }
    GraphPanel.createOrShow(context, claudeDir);
  });
  context.subscriptions.push(openGraphCmd);

  const lintCmd = vscode.commands.registerCommand("claude-atlas.lint", async () => {
    const claudeDir = resolveClaudeDir();
    if (!claudeDir) {
      vscode.window.showInformationMessage("No .claude directory found in workspace.");
      return;
    }
    try {
      const graph = await scanClaudeDir(claudeDir);
      const findings = lint(graph) as Finding[];
      const enriched = enrichFindingsWithFiles(findings, graph);
      updateDiagnostics(diagnosticCollection, enriched, claudeDir);

      const errorCount = findings.filter((f) => f.level === "error").length;
      const warnCount  = findings.filter((f) => f.level === "warning").length;
      const infoCount  = findings.filter((f) => f.level === "info").length;

      vscode.window.showInformationMessage(
        findings.length === 0
          ? "Claude Atlas: no issues found."
          : `Claude Atlas: ${findings.length} finding(s) — ${errorCount} error(s), ${warnCount} warning(s), ${infoCount} info`
      );
      if (GraphPanel.current) await GraphPanel.current.refresh();
    } catch (err) {
      vscode.window.showErrorMessage(
        `Claude Atlas lint failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });
  context.subscriptions.push(lintCmd);

  const renameCmd = vscode.commands.registerCommand("claude-atlas.rename", async () => {
    const claudeDir = resolveClaudeDir();
    if (!claudeDir) {
      vscode.window.showInformationMessage("No .claude directory found in workspace.");
      return;
    }
    await runRenameCommand(claudeDir);
  });
  context.subscriptions.push(renameCmd);

  const watcher = vscode.workspace.createFileSystemWatcher("**/.claude/**/*.{md,json}");
  const onClaudeChange = async () => {
    const claudeDir = resolveClaudeDir();
    if (!claudeDir) return;
    try {
      const graph = await scanClaudeDir(claudeDir);
      const findings = lint(graph) as Finding[];
      updateDiagnostics(diagnosticCollection, enrichFindingsWithFiles(findings, graph), claudeDir);
    } catch { /* suppress mid-save errors */ }
    if (GraphPanel.current) {
      try { await GraphPanel.current.refresh(); } catch { /* panel may be disposed */ }
    }
  };
  watcher.onDidChange(onClaudeChange);
  watcher.onDidCreate(onClaudeChange);
  watcher.onDidDelete(onClaudeChange);
  context.subscriptions.push(watcher);
}

async function runRenameCommand(claudeDir: string): Promise<void> {
  let graph: GraphData;
  try {
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

  const picked = await vscode.window.showQuickPick(
    graph.agents.map((a) => ({ label: a.name, description: a.slug })),
    { placeHolder: "Select agent to rename", title: "Claude Atlas: Rename Agent" }
  );
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

  await applyRenameInteractive(graph, picked.label, newName.trim());
}

async function applyRenameInteractive(graph: GraphData, oldName: string, newName: string): Promise<void> {
  let plan: Awaited<ReturnType<typeof planRename>>;
  try {
    plan = await planRename(graph, oldName, newName);
  } catch (err) {
    vscode.window.showErrorMessage(
      `Claude Atlas: rename plan failed — ${err instanceof Error ? err.message : String(err)}`
    );
    return;
  }

  if (plan.collision) {
    vscode.window.showWarningMessage(
      `Cannot rename: "${newName}" collides with existing ${plan.collision.type} "${plan.collision.name}".`
    );
    return;
  }

  const changeCount = plan.changes.length;
  const fileCount = new Set(plan.changes.map((c) => c.file)).size;

  if (changeCount === 0) {
    vscode.window.showInformationMessage(`Claude Atlas: no occurrences of "${oldName}" found.`);
    return;
  }

  const preview = plan.changes.slice(0, 10)
    .map((c) => `  L${c.line}  - ${c.before.trim()}\n        + ${c.after.trim()}`)
    .join("\n");
  const truncated = changeCount > 10 ? `\n  … and ${changeCount - 10} more` : "";

  const confirm = await vscode.window.showInformationMessage(
    `Rename "${oldName}" → "${newName}"?\n${changeCount} change(s) across ${fileCount} file(s):\n\n` +
    preview + truncated,
    { modal: true },
    "Apply"
  );
  if (confirm !== "Apply") return;

  try {
    await applyPlan(plan);
    vscode.window.showInformationMessage(
      `Claude Atlas: renamed "${oldName}" to "${newName}" (${changeCount} change(s) in ${fileCount} file(s)).`
    );
    if (GraphPanel.current) await GraphPanel.current.refresh();
  } catch (err) {
    vscode.window.showErrorMessage(
      `Claude Atlas: rename failed — ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export function deactivate(): void { /* disposables handled via context.subscriptions */ }

function enrichFindingsWithFiles(findings: Finding[], graph: GraphData): Finding[] {
  const agentBySlug = new Map<string, Agent>(
    graph.agents.map((a) => [a.slug, a as Agent])
  );
  return findings.map((f) => {
    if (!f.subject?.startsWith("agent:")) return f;
    const agent = agentBySlug.get(f.subject.slice(6));
    return agent?.file ? { ...f, file: agent.file } : f;
  });
}
