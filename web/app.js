const [graphRes, lintRes] = await Promise.all([
  fetch("/api/graph").then((r) => r.json()),
  fetch("/api/lint").then((r) => r.json()),
]);

const graph = graphRes;
const findings = lintRes;

document.getElementById("counts").textContent =
  `${graph.agents.length} agents · ${graph.commands.length} commands · ${graph.tools.length} tools · ${graph.mcpServers.length} mcp`;

const nodeColor = {
  agent: "#6ea8fe",
  command: "#f7b267",
  tool: "#9eddba",
  mcp: "#c084fc",
};

const elements = [];

for (const a of graph.agents) {
  elements.push({
    data: {
      id: `agent:${a.slug}`,
      label: a.name,
      type: "agent",
      payload: a,
    },
  });
}
for (const c of graph.commands) {
  elements.push({
    data: {
      id: `command:${c.slug}`,
      label: `/${c.slug}`,
      type: "command",
      payload: c,
    },
  });
}
for (const t of graph.tools) {
  elements.push({
    data: {
      id: `tool:${t.slug}`,
      label: t.name,
      type: "tool",
      payload: t,
    },
  });
}
for (const m of graph.mcpServers) {
  elements.push({
    data: {
      id: `mcp:${m.slug}`,
      label: m.name,
      type: "mcp",
      payload: m,
    },
  });
}

let edgeId = 0;
for (const e of graph.edges) {
  elements.push({
    data: {
      id: `e${edgeId++}`,
      source: e.from,
      target: e.to,
      kind: e.kind,
    },
  });
}

const cy = cytoscape({
  container: document.getElementById("cy"),
  elements,
  style: [
    {
      selector: "node",
      style: {
        "background-color": (n) => nodeColor[n.data("type")] || "#666",
        label: "data(label)",
        color: "#e5e7eb",
        "font-size": 10,
        "text-valign": "bottom",
        "text-margin-y": 4,
        "text-outline-color": "#0b0e13",
        "text-outline-width": 2,
        "border-width": 0,
        width: 18,
        height: 18,
      },
    },
    {
      selector: "node:selected",
      style: {
        "border-width": 3,
        "border-color": "#ffffff",
      },
    },
    {
      selector: "edge",
      style: {
        width: 1,
        "line-color": "#2a3040",
        "target-arrow-color": "#2a3040",
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
        opacity: 0.5,
      },
    },
    {
      selector: 'edge[kind = "invokes"]',
      style: { "line-color": "#6ea8fe", "target-arrow-color": "#6ea8fe" },
    },
    {
      selector: 'edge[kind = "grant"]',
      style: { "line-color": "#9eddba", "target-arrow-color": "#9eddba", "line-style": "dashed" },
    },
  ],
  layout: {
    name: "cose",
    idealEdgeLength: 100,
    nodeOverlap: 20,
    padding: 20,
    animate: false,
  },
});

const side = document.getElementById("side");

function renderDetails(type, payload) {
  const parts = [];
  parts.push(`<div class="title">${escape(payload.name || payload.slug)}</div>`);
  parts.push(`<div class="sub">${type}</div>`);
  if (payload.description) parts.push(`<div class="desc">${escape(payload.description)}</div>`);

  if (type === "agent") {
    if (payload.tools?.length) {
      parts.push(`<h2>Tools</h2>`);
      parts.push(payload.tools.map((t) => `<span class="tag">${escape(t)}</span>`).join(""));
    }
    if (payload.invokes?.length) {
      parts.push(`<h2>Invokes</h2><ul class="list">${payload.invokes
        .map((s) => `<li data-id="agent:${s}">${escape(s)}</li>`)
        .join("")}</ul>`);
    }
    const invokedBy = graph.edges
      .filter((e) => e.to === `agent:${payload.slug}` && e.kind === "invokes")
      .map((e) => e.from);
    if (invokedBy.length) {
      parts.push(`<h2>Invoked by</h2><ul class="list">${invokedBy
        .map((id) => `<li data-id="${id}">${escape(id)}</li>`)
        .join("")}</ul>`);
    }
  }

  if (type === "tool") {
    parts.push(`<h2>Granted to</h2><ul class="list">${(payload.agents || [])
      .map((s) => `<li data-id="agent:${s}">${escape(s)}</li>`)
      .join("")}</ul>`);
  }

  if (type === "command") {
    if (payload.invokes?.length) {
      parts.push(`<h2>Invokes</h2><ul class="list">${payload.invokes
        .map((s) => `<li data-id="agent:${s}">${escape(s)}</li>`)
        .join("")}</ul>`);
    }
  }

  parts.push(`<h2>Lint</h2>`);
  parts.push(renderLint(findings));

  side.innerHTML = parts.join("");

  side.querySelectorAll(".list li[data-id]").forEach((li) => {
    li.addEventListener("click", () => {
      const target = cy.getElementById(li.dataset.id);
      if (target.length) {
        cy.elements().unselect();
        target.select();
        cy.animate({ center: { eles: target }, zoom: 1.5 }, { duration: 300 });
        showNode(target);
      }
    });
  });
}

function renderLint(items) {
  if (!items.length) return `<div class="empty">✓ no issues</div>`;
  return items
    .map(
      (f) =>
        `<div class="lint-row"><span class="lint-${f.level}">${f.level.toUpperCase()}</span> <span class="code">[${f.code}]</span><br>${escape(f.message)}</div>`
    )
    .join("");
}

function escape(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function showNode(node) {
  const type = node.data("type");
  const payload = node.data("payload");
  renderDetails(type, payload);
}

cy.on("tap", "node", (e) => showNode(e.target));

document.getElementById("lint").innerHTML = renderLint(findings);
