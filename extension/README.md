# Claude Atlas — VS Code Extension

Phase 1: graph panel, diagnostics, and agent rename from within VS Code.

## Development setup

```bash
cd extension && npm install && npm run compile
```

Then in VS Code: open the **repo root**, press **F5** and choose "Run Extension".
A new Extension Development Host window opens; the extension activates automatically on
any workspace that contains a `.claude/` directory.

## Commands

| Command | Description |
|---|---|
| `Claude Atlas: Open Graph` | Opens the interactive graph panel |
| `Claude Atlas: Lint .claude/` | Runs the linter and populates the Problems panel |
| `Claude Atlas: Rename Agent` | QuickPick agent list → input new name → preview → apply |

## File watcher

Any save inside `**/.claude/**/*.{md,json}` triggers an automatic re-lint and, if the
graph panel is open, a graph refresh — no manual reload needed.

## Architecture notes

- `src/extension.ts` — activation entry point; registers commands and file watcher.
- `src/graphPanel.ts` — singleton `WebviewPanel` that loads `web/index.html`. A postMessage
  shim injected into the HTML intercepts the `fetch("/api/graph")` and `fetch("/api/lint")`
  calls so the browser-side app works unchanged inside the WebView sandbox.
- `src/diagnostics.ts` — maps `lint()` findings to `vscode.DiagnosticCollection`.
- `lib/scanner.js`, `lib/linter.js`, `lib/rename.js` (in the repo root) are imported
  dynamically at runtime; the extension never modifies them.

## Publishing

Set the real publisher ID in `package.json` → `"publisher"` before running `vsce publish`.
