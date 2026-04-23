import esbuild from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";

await esbuild.build({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "out/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node20",
  sourcemap: true,
  logLevel: "info",
});

// Copy web assets
mkdirSync("web", { recursive: true });
copyFileSync("../web/index.html", "web/index.html");
copyFileSync("../web/app.js", "web/app.js");
