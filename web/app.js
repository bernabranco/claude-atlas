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

/* ===== Compute degree + lint-by-subject maps ===== */
const degree = new Map();
for (const e of graph.edges) {
  degree.set(e.from, (degree.get(e.from) || 0) + 1);
  degree.set(e.to, (degree.get(e.to) || 0) + 1);
}
const maxDegree = Math.max(1, ...degree.values());
function sizeFor(id) {
  const d = degree.get(id) || 0;
  return 16 + Math.round(30 * (d / maxDegree));
}

const lintBySubject = new Map();
for (const f of findings) {
  if (!f.subject) continue;
  const bucket = lintBySubject.get(f.subject) || { error: 0, warning: 0, info: 0 };
  bucket[f.level] = (bucket[f.level] || 0) + 1;
  lintBySubject.set(f.subject, bucket);
}
function lintLevel(id) {
  const b = lintBySubject.get(id);
  if (!b) return null;
  if (b.error) return "error";
  if (b.warning) return "warning";
  if (b.info) return "info";
  return null;
}

/* ===== Build elements ===== */
const elements = [];
function addNode(id, label, type, payload) {
  elements.push({
    data: {
      id, label, type, payload,
      size: sizeFor(id),
      lint: lintLevel(id),
    },
  });
}

for (const a of graph.agents)     addNode(`agent:${a.slug}`,   a.name,       "agent",   a);
for (const c of graph.commands)   addNode(`command:${c.slug}`, `/${c.slug}`, "command", c);
for (const t of graph.tools)      addNode(`tool:${t.slug}`,    t.name,       "tool",    t);
for (const m of graph.mcpServers) addNode(`mcp:${m.slug}`,     m.name,       "mcp",     m);

let edgeId = 0;
for (const e of graph.edges) {
  elements.push({
    data: { id: `e${edgeId++}`, source: e.from, target: e.to, kind: e.kind },
  });
}

/* ===== Cytoscape ===== */
const cy = cytoscape({
  container: document.getElementById("cy"),
  elements,
  minZoom: 0.15,
  maxZoom: 3,
  style: [
    {
      selector: "node",
      style: {
        "background-color": (n) => nodeColor[n.data("type")] || "#666",
        "background-opacity": 1,
        label: "data(label)",
        color: "#d6dae4",
        "font-size": 11,
        "font-family": "Inter, sans-serif",
        "font-weight": 500,
        "text-valign": "bottom",
        "text-margin-y": 6,
        "text-outline-color": "#0a0c11",
        "text-outline-width": 3,
        "text-outline-opacity": 1,
        "border-width": 0,
        width: "data(size)",
        height: "data(size)",
        "underlay-color": (n) => nodeColor[n.data("type")] || "#666",
        "underlay-padding": 6,
        "underlay-opacity": 0.25,
        "underlay-shape": "ellipse",
        "transition-property": "opacity, border-width, underlay-opacity, underlay-padding, width, height",
        "transition-duration": "0.18s",
      },
    },
    /* Lint-affected nodes get a colored ring */
    {
      selector: 'node[lint = "error"]',
      style: { "border-width": 2.5, "border-color": "#f87171", "border-opacity": 0.9 },
    },
    {
      selector: 'node[lint = "warning"]',
      style: { "border-width": 2.5, "border-color": "#facc15", "border-opacity": 0.9 },
    },
    {
      selector: 'node[lint = "info"]',
      style: { "border-width": 1.5, "border-color": "#9aa5b7", "border-opacity": 0.6 },
    },
    {
      selector: "node.faded",
      style: { opacity: 0.12, "underlay-opacity": 0 },
    },
    {
      selector: "node.hl",
      style: { "underlay-opacity": 0.55, "underlay-padding": 10 },
    },
    {
      selector: "node:selected",
      style: {
        "border-width": 3,
        "border-color": "#ffffff",
        "border-opacity": 1,
        "underlay-opacity": 0.7,
        "underlay-padding": 14,
      },
    },
    /* Edges */
    {
      selector: "edge",
      style: {
        width: 1,
        "line-color": "#2a3048",
        "target-arrow-color": "#2a3048",
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
      style: { "line-color": "#5d81c4", "target-arrow-color": "#5d81c4" },
    },
    {
      selector: 'edge[kind = "grant"]',
      style: {
        "line-color": "#5ea881",
        "target-arrow-color": "#5ea881",
        "line-style": "dashed",
      },
    },
    { selector: "edge.faded", style: { opacity: 0.06 } },
    {
      selector: "edge.hl",
      style: { opacity: 1, width: 2.2 },
    },
    {
      selector: 'edge.hl[kind = "invokes"]',
      style: { "line-color": "#7aa7ff", "target-arrow-color": "#7aa7ff" },
    },
    {
      selector: 'edge.hl[kind = "grant"]',
      style: { "line-color": "#84d9a8", "target-arrow-color": "#84d9a8" },
    },
  ],
  layout: { name: "grid" },
});

/* Run the real layout after mount — same path as the Relayout button.
   Running it inside the cytoscape init fires before the CSS grid has
   measured #cy, so fcose computes against a 0-size box. */
cy.nodes().style("opacity", 0);
cy.edges().style("opacity", 0);

window.addEventListener("load", () => {
  cy.resize();
  cy.layout(layoutConfig()).run();
  cy.fit(undefined, 50);
  cy.nodes().animate({ style: { opacity: 1 } }, { duration: 400, easing: "ease-out" });
  cy.edges().animate({ style: { opacity: 0.55 } }, { duration: 400, easing: "ease-out", delay: 150 });
});

function layoutConfig() {
  if (window.cytoscapeFcose) {
    return {
      name: "fcose",
      animate: false,
      quality: "default",
      nodeRepulsion: 9000,
      idealEdgeLength: 115,
      edgeElasticity: 0.22,
      gravity: 0.28,
      gravityRangeCompound: 1.5,
      padding: 50,
      randomize: false,
    };
  }
  return { name: "cose", animate: false, padding: 50 };
}

document.getElementById("btn-fit").addEventListener("click", () => {
  cy.animate({ fit: { padding: 50 } }, { duration: 280, easing: "ease-out" });
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

/* ===== Filter chips ===== */
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
      n.style("display", disabled.has(n.data("type")) ? "none" : "element");
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
    showEmpty();
  }
});

/* ===== Sidebar ===== */
const side = {
  empty: document.getElementById("empty-state"),
  details: document.getElementById("details"),
  lintSection: document.getElementById("lint-section"),
  lintCount: document.getElementById("lint-count"),
  lint: document.getElementById("lint"),
};

renderGlobalLint(findings);

cy.on("tap", "node", (e) => showNode(e.target));
cy.on("tap", (e) => { if (e.target === cy) showEmpty(); });

function showEmpty() {
  side.empty.classList.remove("hidden");
  side.details.classList.add("hidden");
}

function showNode(node) {
  side.empty.classList.add("hidden");
  side.details.classList.remove("hidden");
  const type = node.data("type");
  const payload = node.data("payload");
  side.details.innerHTML = renderDetails(type, payload, node.data("id"));
  side.details.classList.remove("fade-in"); void side.details.offsetWidth; side.details.classList.add("fade-in");
  wireClickThroughs(side.details);
}

function renderDetails(type, payload, id) {
  const parts = [];
  const color = nodeColor[type];
  parts.push(`
    <div class="flex items-start gap-3 mb-3">
      <span class="mt-1 w-2.5 h-2.5 rounded-full shrink-0" style="background:${color}; box-shadow: 0 0 10px ${color}80;"></span>
      <div class="min-w-0">
        <div class="text-[10px] uppercase tracking-[0.08em] text-muted font-semibold">${type}</div>
        <div class="text-[18px] font-semibold leading-tight tracking-tight break-words">${escape(payload.name || payload.slug)}</div>
      </div>
    </div>`);

  if (payload.description) {
    parts.push(`<p class="text-[13px] leading-relaxed text-fg">${escape(payload.description)}</p>`);
  }

  const nodeLint = findings.filter((f) => f.subject === id);
  if (nodeLint.length) {
    parts.push(sectionTitle("Issues", nodeLint.length));
    parts.push(`<div class="space-y-1.5">${nodeLint.map(renderLintRow).join("")}</div>`);
  }

  if (type === "agent") {
    if (payload.tools?.length) {
      parts.push(sectionTitle("Tools", payload.tools.length));
      parts.push(`<div class="flex flex-wrap gap-1.5">` +
        payload.tools.map((t) => tagPill(t, `tool:${slug(t)}`)).join("") + `</div>`);
    }
    if (payload.invokes?.length) {
      parts.push(sectionTitle("Invokes", payload.invokes.length));
      parts.push(`<div class="space-y-1.5">` + payload.invokes.map((s) => cardHTML(`agent:${s}`)).join("") + `</div>`);
    }
    const invokedBy = graph.edges
      .filter((e) => e.to === `agent:${payload.slug}` && e.kind === "invokes")
      .map((e) => e.from);
    if (invokedBy.length) {
      parts.push(sectionTitle("Invoked by", invokedBy.length));
      parts.push(`<div class="space-y-1.5">` + invokedBy.map(cardHTML).join("") + `</div>`);
    }
  }

  if (type === "tool") {
    parts.push(sectionTitle("Granted to", (payload.agents || []).length));
    parts.push(`<div class="space-y-1.5">` + (payload.agents || []).map((s) => cardHTML(`agent:${s}`)).join("") + `</div>`);
  }

  if (type === "command") {
    if (payload.invokes?.length) {
      parts.push(sectionTitle("Invokes", payload.invokes.length));
      parts.push(`<div class="space-y-1.5">` + payload.invokes.map((s) => cardHTML(`agent:${s}`)).join("") + `</div>`);
    }
  }

  return parts.join("");
}

function sectionTitle(label, count) {
  return `<h2 class="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.08em] text-muted font-semibold mt-5 mb-2">
    <span>${escape(label)}</span>
    <span class="px-1.5 py-0.5 rounded-full bg-bg-2 border border-border text-fg-2 text-[10px] font-mono normal-case tracking-normal">${count}</span>
  </h2>`;
}

function tagPill(label, dataId) {
  return `<span data-id="${dataId}" class="inline-flex items-center px-2 py-0.5 rounded border border-border bg-bg-2 text-[11.5px] text-fg cursor-pointer hover:border-border-2 hover:bg-panel-2 transition-colors">${escape(label)}</span>`;
}

function cardHTML(id) {
  const node = cy.getElementById(id);
  if (!node.length) return "";
  const type = node.data("type");
  const label = node.data("label");
  const color = nodeColor[type];
  const lint = node.data("lint");
  const ring = lint === "error" ? "ring-1 ring-red-400/50" :
               lint === "warning" ? "ring-1 ring-yellow-400/50" : "";
  return `<div data-id="${id}" class="group flex items-center gap-2.5 px-3 py-2 rounded-md border border-border bg-bg-2 hover:bg-panel-2 hover:border-border-2 cursor-pointer transition-colors ${ring}">
    <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:${color}; box-shadow: 0 0 6px ${color}A0;"></span>
    <span class="text-[12.5px] text-fg group-hover:text-fg">${escape(label)}</span>
    <span class="ml-auto text-[10.5px] uppercase tracking-[0.05em] text-muted">${type}</span>
  </div>`;
}

function wireClickThroughs(container) {
  container.querySelectorAll("[data-id]").forEach((el) => {
    el.addEventListener("click", () => {
      const target = cy.getElementById(el.dataset.id);
      if (!target.length) return;
      cy.elements().unselect();
      target.select();
      cy.animate({ center: { eles: target }, zoom: 1.4 }, { duration: 300, easing: "ease-out" });
      showNode(target);
    });
  });
}

function renderGlobalLint(items) {
  if (!items.length) {
    side.lintSection.classList.remove("hidden");
    side.lintCount.textContent = "0";
    side.lint.innerHTML = `<div class="text-[12px] text-muted py-1">✓ no issues</div>`;
    return;
  }
  side.lintSection.classList.remove("hidden");
  side.lintCount.textContent = String(items.length);
  side.lint.innerHTML = items.map(renderLintRow).join("");
}

function renderLintRow(f) {
  const levelBg = {
    error:   "bg-red-400/15 text-red-300",
    warning: "bg-yellow-400/15 text-yellow-300",
    info:    "bg-slate-400/15 text-slate-300",
  }[f.level];
  return `<div class="px-3 py-2 rounded-md border border-border bg-bg-2 text-[12px]">
    <div class="flex items-center gap-2 mb-1">
      <span class="px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-[0.08em] ${levelBg}">${f.level}</span>
      <span class="font-mono text-[10.5px] text-muted">[${f.code}]</span>
    </div>
    <div class="text-fg leading-snug">${escape(f.message)}</div>
  </div>`;
}

function escape(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "");
}
