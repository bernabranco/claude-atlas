/**
 * esbuild bundler for the VS Code extension.
 * Bundles src/extension.ts (and its imports from ../lib/) into out/extension.js.
 * Run via: node build.mjs
 */
import esbuild from "esbuild";

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
