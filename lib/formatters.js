/**
 * Output formatters for lint findings.
 *
 * GitHub Actions workflow commands are the simplest way to render findings
 * as PR annotations — GitHub parses `::level file=...::message` lines from
 * step stdout and attaches them to the commit. No API calls, no tokens.
 *
 * Spec: https://docs.github.com/actions/using-workflows/workflow-commands-for-github-actions
 */
import path from "path";

/** All rule codes emitted by lib/linter.js — used to validate --rule input. */
export const VALID_RULE_CODES = [
  "dead-agent",
  "missing-agent-ref",
  "missing-description",
  "delegation-cycle",
  "unused-tool-grant",
  "duplicate-candidate",
];

/**
 * Filter findings to only those whose code is in the given set.
 * Returns a new array; does not mutate the original.
 *
 * @param {Array} findings - raw findings from lint()
 * @param {string[]} codes - rule codes to keep (all others are dropped)
 * @returns {Array}
 */
export function filterFindings(findings, codes) {
  const keep = new Set(codes);
  return findings.filter((f) => keep.has(f.code));
}

const LEVEL_TO_CMD = {
  error: "error",
  warning: "warning",
  info: "notice",
};

/** GitHub requires %/\r/\n escaped in workflow-command message bodies. */
function escapeMessage(msg) {
  return String(msg).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function resolveFile(graph, subject) {
  if (!subject) return null;
  const [kind, slug] = subject.split(":");
  if (kind === "agent") return graph.agents.find((a) => a.slug === slug)?.file || null;
  if (kind === "command") return graph.commands.find((c) => c.slug === slug)?.file || null;
  return null;
}

/**
 * Emit findings as GitHub Actions workflow commands.
 * Returns an array of strings — one command per finding. Caller prints them.
 *
 * Without a resolvable file, the annotation is still emitted but unattached
 * (GitHub shows it at the top of the job log). This keeps every finding
 * visible; losing one silently is worse than an unattached annotation.
 */
export function formatFindingsGitHub(findings, graph, { cwd = process.cwd() } = {}) {
  const lines = [];
  for (const f of findings) {
    const cmd = LEVEL_TO_CMD[f.level] || "notice";
    const abs = resolveFile(graph, f.subject);
    const props = [`title=claude-atlas/${f.code}`];
    if (abs) {
      const parts = [`file=${path.relative(cwd, abs)}`];
      // `line=` is what pins the annotation inline on the PR's Files Changed tab.
      // Without it, GitHub only shows the annotation in the job summary.
      if (Number.isInteger(f.line) && f.line > 0) parts.push(`line=${f.line}`);
      props.unshift(...parts);
    }
    lines.push(`::${cmd} ${props.join(",")}::${escapeMessage(f.message)}`);
  }
  return lines;
}
