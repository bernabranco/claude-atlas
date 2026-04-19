import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { serve } from "@hono/node-server";
import path from "path";
import { fileURLToPath } from "url";
import { scanClaudeDir } from "./scanner.js";
import { lint } from "./linter.js";
import { whoCan, rulesForAgent } from "./who-can.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(__dirname, "..", "web");

export function createApp(claudeDir) {
  const app = new Hono();

  app.get("/api/graph", async (c) => {
    try {
      const graph = await scanClaudeDir(claudeDir);
      for (const a of graph.agents) {
        a.applicableRules = rulesForAgent(graph, a.slug);
      }
      return c.json(graph);
    } catch (err) {
      return c.json({ error: err.message }, 500);
    }
  });

  app.get("/api/lint", async (c) => {
    try {
      const graph = await scanClaudeDir(claudeDir);
      const findings = lint(graph);
      return c.json(findings);
    } catch (err) {
      return c.json({ error: err.message }, 500);
    }
  });

  app.get("/api/who-can", async (c) => {
    try {
      const permission = c.req.query("perm");
      if (!permission) return c.json({ error: "missing ?perm=..." }, 400);
      const denyMode = c.req.query("deny") === "1" || c.req.query("deny") === "true";
      const graph = await scanClaudeDir(claudeDir);
      return c.json(whoCan(graph, permission, { denyMode }));
    } catch (err) {
      return c.json({ error: err.message }, 500);
    }
  });

  app.use(
    "/*",
    serveStatic({
      root: path.relative(process.cwd(), webDir) || ".",
    })
  );

  return app;
}

export function startServer({ claudeDir, port = 4000 }) {
  const app = createApp(claudeDir);
  return serve({ fetch: app.fetch, port }, (info) => {
    console.log(`claude-atlas viewer: http://localhost:${info.port}`);
    console.log(`  scanning: ${path.resolve(claudeDir)}`);
    console.log(`  Ctrl+C to stop`);
  });
}
