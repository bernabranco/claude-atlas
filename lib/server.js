import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { serve } from "@hono/node-server";
import path from "path";
import { fileURLToPath } from "url";
import { scanClaudeDir } from "./scanner.js";
import { lint } from "./linter.js";
import { whoCan, rulesForAgent } from "./who-can.js";
import { planRename, applyPlan } from "./rename.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(__dirname, "..", "web");

function isLocalhost(host) {
  if (!host) return false;
  const h = host.split(":")[0];
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

export function createApp(claudeDir, { readOnly = false } = {}) {
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

  app.post("/api/rename", async (c) => {
    if (readOnly) return c.json({ error: "Server is running in read-only mode." }, 403);

    const host = c.req.header("host");
    if (!isLocalhost(host)) {
      return c.json({ error: "Rename is only allowed from localhost." }, 403);
    }

    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body." }, 400);
    }

    const { old: oldName, new: newName, apply } = body;
    if (!oldName || typeof oldName !== "string") return c.json({ error: "Missing field: old" }, 400);
    if (!newName || typeof newName !== "string") return c.json({ error: "Missing field: new" }, 400);

    try {
      const graph = await scanClaudeDir(claudeDir);
      const plan = await planRename(graph, oldName, newName);

      if (apply === true) {
        if (plan.collision) {
          return c.json({ error: `Name "${newName}" collides with existing ${plan.collision.type} "${plan.collision.name}".`, plan }, 409);
        }
        const result = await applyPlan(plan);
        return c.json({ applied: true, result, plan });
      }

      return c.json({ applied: false, plan });
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

export function startServer({ claudeDir, port = 4000, readOnly = false }) {
  const app = createApp(claudeDir, { readOnly });
  return serve({ fetch: app.fetch, port }, (info) => {
    console.log(`claude-atlas viewer: http://localhost:${info.port}`);
    console.log(`  scanning: ${path.resolve(claudeDir)}`);
    if (readOnly) console.log(`  read-only mode — mutations disabled`);
    console.log(`  Ctrl+C to stop`);
  });
}
