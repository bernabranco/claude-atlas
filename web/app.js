if (window.cytoscapeFcose) cytoscape.use(window.cytoscapeFcose);

const [graph, findings] = await Promise.all([
  fetch("/api/graph").then((r) => r.json()),
  fetch("/api/lint").then((r) => r.json()),
]);

const nodeColor = {
  agent: "#7aa7ff",
  command: "#f4a261",
  tool: "#84d9a8",
  mcp: "#c08cf8",
};

document.getElementById("counts").textContent =
  `${graph.agents.length} agents · ${graph.commands.length} commands · ${graph.tools.length} tools · ${graph.mcpServers.length} mcp`;

const degree = new Map();
function bump(id) { degree.set(id, (degree.get(id) || 0) + 1); }
for (const e of graph.edges) { bump(e.from); bump(e.to); }

const maxDegree = Math.max(1, ...degree.values());
function sizeFor(id) {
  const d = degree.get(id) || 0;
  return 14 + Math.round(26 * (d / maxDegree));
}

const elements = [];

for (const a of graph.agents) {
  const id = `agent:${a.slug}`;
  elements.push({
    data: { id, label: a.name, type: "agent", payload: a, size: sizeFor(id) },
  });
}
for (const c of graph.commands) {
  const id = `command:${c.slug}`;
  elements.push({
    data: { id, label: `/${c.slug}`, type: "command", payload: c, size: sizeFor(id) },
  });
}
for (const t of graph.tools) {
  const id = `tool:${t.slug}`;
  elements.push({
    data: { id, label: t.name, type: "tool", payload: t, size: sizeFor(id) },
  });
}
for (const m of graph.mcpServers) {
  const id = `mcp:${m.slug}`;
  elements.push({
    data: { id, label: m.name, type: "mcp", payload: m, size: sizeFor(id) },
  });
}

let edgeId = 0;
for (const e of graph.edges) {
  elements.push({
    data: { id: `e${edgeId++}`, source: e.from, target: e.to, kind: e.kind },
  });
}

const cy = cytoscape({
  container: document.getElementById("cy"),
  elements,
  wheelSensitivity: 0.2,
  minZoom: 0.2,
  maxZoom: 3,
  style: [
    {
      selector: "node",
      style: {
        "background-color": (n) => nodeColor[n.data("type")] || "#666",
        "background-opacity": 0.95,
        label: "data(label)",
        color: "#d6dae4",
        "font-size": 10.5,
        "font-family": "Inter, sans-serif",
        "font-weight": 500,
        "text-valign": "bottom",
        "text-margin-y": 5,
        "text-outline-color": "#0b0d12",
        "text-outline-width": 3,
        "text-outline-opacity": 1,
        "border-width": 0,
        width: "data(size)",
        height: "data(size)",
        "transition-property": "background-color, border-width, opacity",
        "transition-duration": "0.15s",
      },
    },
    {
      selector: "node.faded",
      style: { opacity: 0.15 },
    },
    {
      selector: "node.hl",
      style: { "border-width": 2, "border-color": "#ffffff", "border-opacity": 0.9 },
    },
    {
      selector: "node:selected",
      style: { "border-width": 3, "border-color": "#ffffff", "border-opacity": 1 },
    },
    {
      selector: "edge",
      style: {
        width: 1,
        "line-color": "#2d3548",
        "target-arrow-color": "#2d3548",
        "target-arrow-shape": "triangle",
        "arrow-scale": 0.9,
        "curve-style": "bezier",
        opacity: 0.55,
        "transition-property": "opacity, line-color, width",
        "transition-duration": "0.15s",
      },
    },
    {
      selector: 'edge[kind = "invokes"]',
      style: { "line-color": "#7aa7ff", "target-arrow-color": "#7aa7ff" },
    },
    {
      selector: 'edge[kind = "grant"]',
      style: {
        "line-color": "#84d9a8",
        "target-arrow-color": "#84d9a8",
        "line-style": "dashed",
      },
    },
    {
      selector: "edge.faded",
      style: { opacity: 0.07 },
    },
    {
      selector: "edge.hl",
      style: { opacity: 0.95, width: 2 },
    },
  ],
  layout: layoutConfig(),
});

function layoutConfig() {
  if (window.cytoscapeFcose) {
    return {
      name: "fcose",
      animate: false,
      quality: "default",
      nodeRepulsion: 8000,
      idealEdgeLength: 110,
      edgeElasticity: 0.25,
      gravity: 0.3,
      gravityRangeCompound: 1.5,
      padding: 40,
      randomize: false,
    };
  }
  return { name: "cose", animate: false, padding: 40 };
}

document.getElementById("btn-fit").addEventListener("click", () => {
  cy.animate({ fit: { padding: 40 } }, { duration: 250 });
});
document.getElementById("btn-relayout").addEventListener("click", () => {
  cy.layout(layoutConfig()).run();
});

/* ===== Hover highlight ===== */
cy.on("mouseover", "node", (e) => highlight(e.target));
cy.on("mouseout", "node", () => clearHighlight());

function highlight(node) {
  const hood = node.closedNeighborhood();
  cy.elements().addClass("faded");
  hood.removeClass("faded").addClass("hl");
  node.removeClass("faded");
}
function clearHighlight() {
  cy.elements().removeClass("faded hl");
}

/* ===== Filters ===== */
const disabled = new Set();
document.querySelectorAll(".chip[data-type]").forEach((chip) => {
  chip.addEventListener("click", () => {
    const t = chip.dataset.type;
    if (disabled.has(t)) { disabled.delete(t); chip.classList.remove("off"); }
    else { disabled.add(t); chip.classList.add("off"); }
    applyFilters();
  });
});
function applyFilters() {
  cy.batch(() => {
    cy.nodes().forEach((n) => {
      const t = n.data("type");
      n.style("display", disabled.has(t) ? "none" : "element");
    });
  });
}

/* ===== Search ===== */
const searchEl = document.getElementById("search");
searchEl.addEventListener("input", () => {
  const q = searchEl.value.trim().toLowerCase();
  if (!q) { clearHighlight(); return; }
  const matches = cy.nodes().filter((n) => {
    const label = (n.data("label") || "").toLowerCase();
    const desc = (n.data("payload")?.description || "").toLowerCase();
    return label.includes(q) || desc.includes(q);
  });
  cy.elements().addClass("faded");
  matches.removeClass("faded").addClass("hl");
});

document.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== searchEl) {
    e.preventDefault();
    searchEl.focus();
    searchEl.select();
  } else if (e.key === "Escape") {
    searchEl.value = "";
    clearHighlight();
    cy.elements().unselect();
  }
});

/* ===== Sidebar ===== */
const side = {
  empty: document.getElementById("empty-state"),
  details: document.getElementById("details"),
  lintHeading: document.getElementById("lint-heading"),
  lint: document.getElementById("lint"),
};

side.lint.innerHTML = renderLint(findings);
if (findings.length) side.lintHeading.style.display = "";

cy.on("tap", "node", (e) => showNode(e.target));
cy.on("tap", (e) => {
  if (e.target === cy) {
    side.empty.style.display = "";
    side.details.style.display = "none";
  }
});

function showNode(node) {
  side.empty.style.display = "none";
  side.details.style.display = "";
  const type = node.data("type");
  const payload = node.data("payload");
  side.details.innerHTML = renderDetails(type, payload);
  wireClickThroughs(side.details);
}

function renderDetails(type, payload) {
  const parts = [];
  parts.push(`<div class="node-head">
    <span class="swatch" style="background:${nodeColor[type]}"></span>
    <div>
      <div class="type">${type}</div>
      <div class="title">${escape(payload.name || payload.slug)}</div>
    </div>
  </div>`);

  if (payload.description) {
    parts.push(`<div class="desc">${escape(payload.description)}</div>`);
  }

  if (type === "agent") {
    if (payload.tools?.length) {
      parts.push(`<h2>Tools (${payload.tools.length})</h2>`);
      parts.push(`<div>` + payload.tools
        .map((t) => `<span class="tag" data-id="tool:${slug(t)}">${escape(t)}</span>`).join("") + `</div>`);
    }
    if (payload.invokes?.length) {
      parts.push(`<h2>Invokes (${payload.invokes.length})</h2>`);
      parts.push(payload.invokes.map((s) => cardHTML(`agent:${s}`)).join(""));
    }
    const invokedBy = graph.edges
      .filter((e) => e.to === `agent:${payload.slug}` && e.kind === "invokes")
      .map((e) => e.from);
    if (invokedBy.length) {
      parts.push(`<h2>Invoked by (${invokedBy.length})</h2>`);
      parts.push(invokedBy.map(cardHTML).join(""));
    }
  }

  if (type === "tool") {
    parts.push(`<h2>Granted to (${(payload.agents || []).length})</h2>`);
    parts.push((payload.agents || []).map((s) => cardHTML(`agent:${s}`)).join(""));
  }

  if (type === "command") {
    if (payload.invokes?.length) {
      parts.push(`<h2>Invokes (${payload.invokes.length})</h2>`);
      parts.push(payload.invokes.map((s) => cardHTML(`agent:${s}`)).join(""));
    }
  }

  return parts.join("");
}

function cardHTML(id) {
  const node = cy.getElementById(id);
  if (!node.length) return "";
  const type = node.data("type");
  const label = node.data("label");
  return `<div class="card" data-id="${id}">
    <span class="swatch" style="background:${nodeColor[type]}"></span>
    <span class="name">${escape(label)}</span>
    <span class="kind">${type}</span>
  </div>`;
}

function wireClickThroughs(container) {
  container.querySelectorAll("[data-id]").forEach((el) => {
    el.addEventListener("click", () => {
      const target = cy.getElementById(el.dataset.id);
      if (!target.length) return;
      cy.elements().unselect();
      target.select();
      cy.animate({ center: { eles: target }, zoom: 1.4 }, { duration: 300 });
      showNode(target);
    });
  });
}

function renderLint(items) {
  if (!items.length) return `<div class="empty" style="padding:8px 0">✓ no issues</div>`;
  return items
    .map(
      (f) => `<div class="lint-row">
        <span class="level ${f.level}">${f.level}</span>
        <span class="code">[${f.code}]</span>
        <div class="msg">${escape(f.message)}</div>
      </div>`
    )
    .join("");
}

function escape(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "");
}
