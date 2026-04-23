import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

// lib/scanner.js and lib/rename.js are ESM modules; we import them
// dynamically at runtime so the CommonJS bundle can interop with them.
type ScanClaudeDir = (claudeDir: string) => Promise<unknown>;
type PlanRename = (graph: unknown, oldName: string, newName: string) => Promise<unknown>;
type ApplyPlan = (plan: unknown) => Promise<unknown>;

export class GraphPanel {
  public static current: GraphPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _claudeDir: string;
  private readonly _webRoot: string;
  private _disposables: vscode.Disposable[] = [];

  private static async _loadLibs(): Promise<{
    scanClaudeDir: ScanClaudeDir;
    planRename: PlanRename;
    applyPlan: ApplyPlan;
  }> {
    // Dynamic imports keep the CommonJS bundle from choking on ESM lib files.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scanner = await (Function('return import("../../lib/scanner.js")')() as Promise<any>);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rename = await (Function('return import("../../lib/rename.js")')() as Promise<any>);
    return {
      scanClaudeDir: scanner.scanClaudeDir,
      planRename: rename.planRename,
      applyPlan: rename.applyPlan,
    };
  }

  public static createOrShow(
    context: vscode.ExtensionContext,
    claudeDir: string
  ): GraphPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (GraphPanel.current) {
      GraphPanel.current._panel.reveal(column);
      return GraphPanel.current;
    }

    // webRoot is the `web/` folder at the repo root (one level above `extension/`)
    const webRoot = path.resolve(context.extensionPath, "..", "web");

    const panel = vscode.window.createWebviewPanel(
      "claudeAtlasGraph",
      "Claude Atlas",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.file(webRoot),
          vscode.Uri.file(path.resolve(context.extensionPath, "..", "node_modules")),
        ],
        retainContextWhenHidden: true,
      }
    );

    GraphPanel.current = new GraphPanel(panel, claudeDir, webRoot);
    return GraphPanel.current;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    claudeDir: string,
    webRoot: string
  ) {
    this._panel = panel;
    this._claudeDir = claudeDir;
    this._webRoot = webRoot;

    this._panel.webview.html = this._getHtmlContent();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message: { type: string; old?: string; new?: string; apply?: boolean }) => {
        switch (message.type) {
          case "ready":
            await this._sendGraph();
            break;
          case "rename":
            await this._handleRename(
              message.old ?? "",
              message.new ?? "",
              message.apply ?? false
            );
            break;
        }
      },
      null,
      this._disposables
    );
  }

  /** Called by the file watcher when .claude/ changes. */
  public async refresh(): Promise<void> {
    await this._sendGraph();
  }

  private async _sendGraph(): Promise<void> {
    try {
      const { scanClaudeDir } = await GraphPanel._loadLibs();
      const graph = await scanClaudeDir(this._claudeDir);
      this._panel.webview.postMessage({ type: "graph", data: graph });
    } catch (err) {
      this._panel.webview.postMessage({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async _handleRename(
    oldName: string,
    newName: string,
    apply: boolean
  ): Promise<void> {
    try {
      const { scanClaudeDir, planRename, applyPlan } = await GraphPanel._loadLibs();
      const graph = await scanClaudeDir(this._claudeDir);
      const plan = await planRename(graph, oldName, newName);

      if (!apply) {
        this._panel.webview.postMessage({ type: "renamePlan", plan });
        return;
      }

      const result = await applyPlan(plan);
      this._panel.webview.postMessage({ type: "renameResult", result });
      // Refresh after a successful apply
      await this._sendGraph();
    } catch (err) {
      this._panel.webview.postMessage({
        type: "renameError",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private _getHtmlContent(): string {
    const webview = this._panel.webview;
    const webRoot = this._webRoot;

    // Read the original index.html and patch it for WebView use:
    // 1. Rewrite local script/link src to vscode-resource: URIs.
    // 2. Inject the postMessage shim so the app gets graph data from
    //    the extension instead of hitting /api/* HTTP endpoints.
    let html: string;
    try {
      html = fs.readFileSync(path.join(webRoot, "index.html"), "utf-8");
    } catch {
      return `<html><body><p>Could not load web/index.html</p></body></html>`;
    }

    // Replace the local /app.js module src with a vscode-resource URI.
    const appJsUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(webRoot, "app.js"))
    );
    html = html.replace(
      /(<script[^>]+type="module"[^>]+src=")\/app\.js(")/,
      `$1${appJsUri}$2`
    );

    // Inject the VS Code postMessage shim right before </head>.
    // The shim:
    //  - Detects acquireVsCodeApi and sets a global flag.
    //  - Overrides the top-level `fetch` used by app.js for /api/graph and /api/lint
    //    so those calls instead wait for the extension to post { type:'graph', data }.
    //  - Bridges the rename POST to postMessage({ type:'rename', ... }).
    const shim = `
<script>
  /* ---- Claude Atlas VS Code WebView shim ---- */
  (function () {
    if (typeof acquireVsCodeApi === 'undefined') return;

    const vscode = acquireVsCodeApi();
    window.__vscodeApi = vscode;

    // Promises resolved when the extension posts the data.
    let _resolveGraph, _resolveLint;
    const _graphPromise = new Promise((res) => { _resolveGraph = res; });
    const _lintPromise  = new Promise((res) => { _resolveLint  = res; });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg || !msg.type) return;
      if (msg.type === 'graph') {
        const graph = msg.data;
        // Lint is computed by linter.js on the extension side; if a combined
        // payload includes findings, resolve lint too. Otherwise the extension
        // posts a separate 'lint' message.
        _resolveGraph(graph);
      }
      if (msg.type === 'lint') {
        _resolveLint(msg.data);
      }
      if (msg.type === 'graphWithLint') {
        _resolveGraph(msg.graph);
        _resolveLint(msg.findings);
      }
    });

    // Override fetch so the top-level await in app.js works transparently.
    const _origFetch = window.fetch.bind(window);
    window.fetch = function (url, opts) {
      const u = String(url);
      if (u === '/api/graph' || u.endsWith('/api/graph')) {
        return _graphPromise.then((data) => new Response(JSON.stringify(data), {
          status: 200, headers: { 'Content-Type': 'application/json' }
        }));
      }
      if (u === '/api/lint' || u.endsWith('/api/lint')) {
        return _lintPromise.then((data) => new Response(JSON.stringify(data), {
          status: 200, headers: { 'Content-Type': 'application/json' }
        }));
      }
      if ((u === '/api/rename' || u.endsWith('/api/rename')) && opts?.method === 'POST') {
        return new Promise((resolve) => {
          const body = JSON.parse(opts.body);
          vscode.postMessage({ type: 'rename', old: body.old, new: body.new, apply: body.apply });
          const handler = (event) => {
            const msg = event.data;
            if (msg?.type === 'renamePlan' || msg?.type === 'renameResult' || msg?.type === 'renameError') {
              window.removeEventListener('message', handler);
              if (msg.type === 'renameError') {
                resolve(new Response(JSON.stringify({ error: msg.message }), { status: 500 }));
              } else {
                const payload = msg.type === 'renamePlan'
                  ? { plan: msg.plan }
                  : { result: msg.result };
                resolve(new Response(JSON.stringify(payload), { status: 200 }));
              }
            }
          };
          window.addEventListener('message', handler);
        });
      }
      return _origFetch(url, opts);
    };

    // Signal the extension that the WebView is ready to receive data.
    vscode.postMessage({ type: 'ready' });
  })();
  /* ---- end shim ---- */
</script>`;

    html = html.replace("</head>", shim + "\n</head>");

    return html;
  }

  public dispose(): void {
    GraphPanel.current = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) d.dispose();
    }
  }
}
