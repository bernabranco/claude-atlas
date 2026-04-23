import * as vscode from "vscode";
import * as path from "path";

/** Shape returned by lib/linter.js `lint()` */
export interface Finding {
  level: "error" | "warning" | "info";
  code: string;
  message: string;
  subject?: string;
  /** The absolute path of the file this finding belongs to.
   *  Populated by extension.ts after calling lint(). */
  file?: string;
  /** 1-based line number inside that file */
  line?: number;
}

/**
 * Translate lint findings into VS Code diagnostics and push them into the
 * provided DiagnosticCollection.
 *
 * Findings that have no `file` property (graph-level findings) are attached
 * to a synthetic virtual URI so they still appear in the Problems panel.
 */
export function updateDiagnostics(
  collection: vscode.DiagnosticCollection,
  findings: Finding[],
  claudeDir: string
): void {
  collection.clear();

  const byUri = new Map<string, vscode.Diagnostic[]>();

  for (const f of findings) {
    const filePath = f.file ?? path.join(claudeDir, "settings.json");
    const uriStr = vscode.Uri.file(filePath).toString();

    // VS Code lines are 0-based; findings carry 1-based lines.
    const lineZero = Math.max(0, (f.line ?? 1) - 1);
    const range = new vscode.Range(lineZero, 0, lineZero, Number.MAX_SAFE_INTEGER);

    const severity = severityFor(f.level);
    const diag = new vscode.Diagnostic(range, f.message, severity);
    diag.code = f.code;
    diag.source = "claude-atlas";

    if (!byUri.has(uriStr)) byUri.set(uriStr, []);
    byUri.get(uriStr)!.push(diag);
  }

  for (const [uriStr, diags] of byUri) {
    collection.set(vscode.Uri.parse(uriStr), diags);
  }
}

function severityFor(level: Finding["level"]): vscode.DiagnosticSeverity {
  switch (level) {
    case "error":
      return vscode.DiagnosticSeverity.Error;
    case "warning":
      return vscode.DiagnosticSeverity.Warning;
    case "info":
    default:
      return vscode.DiagnosticSeverity.Information;
  }
}
