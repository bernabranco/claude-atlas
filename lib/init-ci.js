/**
 * Scaffold a GitHub Actions workflow that runs `claude-atlas lint --format github`
 * on every PR and push. Users drop it in, commit, done — no token setup,
 * GITHUB_TOKEN is auto-injected by the runner and workflow-command annotations
 * are rendered from stdout without any API call.
 */
import fs from "fs/promises";
import path from "path";

const WORKFLOW_PATH = ".github/workflows/atlas.yml";

const WORKFLOW_TEMPLATE = `name: claude-atlas

on:
  pull_request:
    paths:
      - ".claude/**"
      - ".mcp.json"
  push:
    branches: [main]
    paths:
      - ".claude/**"
      - ".mcp.json"

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Lint .claude/
        run: npx --yes claude-atlas lint .claude --format github
`;

export async function initCi({ cwd = process.cwd(), force = false } = {}) {
  const target = path.join(cwd, WORKFLOW_PATH);
  let existed = false;
  try {
    await fs.access(target);
    existed = true;
  } catch {
    // missing — good
  }
  if (existed && !force) {
    return { written: false, existed: true, path: target };
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, WORKFLOW_TEMPLATE, "utf-8");
  return { written: true, existed, path: target };
}
