/* ═══════════════════════════════════════════════════
   visualizer.js
   Renders animated data-structure visualizations
   based on the trace step's visualization object.
   Supports: linked_list, array, tree, stack, queue, matrix, variables
   ═══════════════════════════════════════════════════ */

// ── Pointer color palette ──────────────────────────
const POINTER_COLORS = [
    { bg: '#4f46e5', text: '#ffffff', light: '#eef2ff', line: '#4f46e5' }, // indigo
    { bg: '#7c3aed', text: '#ffffff', light: '#f5f3ff', line: '#7c3aed' }, // violet
    { bg: '#0891b2', text: '#ffffff', light: '#ecfeff', line: '#0891b2' }, // cyan
    { bg: '#059669', text: '#ffffff', light: '#d1fae5', line: '#059669' }, // emerald
    { bg: '#d97706', text: '#ffffff', light: '#fef3c7', line: '#d97706' }, // amber
    { bg: '#dc2626', text: '#ffffff', light: '#fef2f2', line: '#dc2626' }, // red
];

// Keep consistent color assignment across steps
const _ptrColorMap = {};
let _ptrColorIdx = 0;

function getPtrColor(name) {
    if (!_ptrColorMap[name]) {
        _ptrColorMap[name] = POINTER_COLORS[_ptrColorIdx % POINTER_COLORS.length];
        _ptrColorIdx++;
    }
    return _ptrColorMap[name];
}

function resetPtrColors() {
    for (const k in _ptrColorMap) delete _ptrColorMap[k];
    _ptrColorIdx = 0;
}

// ── SVG arrow helper ──────────────────────────────
function svgArrow(x1, y1, x2, y2, color = '#9ca3af') {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const len = Math.sqrt((x2-x1)**2 + (y2-y1)**2);
    const r = 22; // radius offset
    const ox1 = x1 + r * Math.cos(angle);
    const oy1 = y1 + r * Math.sin(angle);
    const ox2 = x2 - r * Math.cos(angle);
    const oy2 = y2 - r * Math.sin(angle);
    return `<line x1="${ox1}" y1="${oy1}" x2="${ox2}" y2="${oy2}"
                  stroke="${color}" stroke-width="1.5" marker-end="url(#arrowhead-${color.replace('#','')})"/>`;
}

// ── Legend builder ────────────────────────────────
function buildLegend(pointers) {
    const container = document.getElementById('vizLegend');
    if (!container) return;
    container.innerHTML = '';
    if (!pointers || typeof pointers !== 'object') return;

    const entries = Object.entries(pointers);
    if (entries.length === 0) return;

    entries.forEach(([name]) => {
        const color = getPtrColor(name);
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `
            <div class="legend-dot" style="background:${color.bg}"></div>
            <span>${name}</span>
        `;
        container.appendChild(item);
    });
}

// ═══════════════════════════════════════════════════
// MAIN RENDER FUNCTION
// ═══════════════════════════════════════════════════
/**
 * Renders the visualization for the given step into #vizCanvas.
 * @param {Object} step - A single step from the trace
 * @param {string} vizType - The global visualization type
 */
function renderVisualization(step, vizType) {
    const canvas = document.getElementById('vizCanvas');
    if (!canvas) return;

    const vis = step.visualization || {};
    const type = vis.type || vizType || 'variables';

    try {
        switch (type) {
            case 'linked_list': renderLinkedList(canvas, vis); break;
            case 'array':       renderArray(canvas, vis);       break;
            case 'tree':        renderTree(canvas, vis);         break;
            case 'stack':       renderStack(canvas, vis);        break;
            case 'queue':       renderQueue(canvas, vis);        break;
            case 'matrix':      renderMatrix(canvas, vis);       break;
            default:            renderVariablesOnly(canvas);     break;
        }
    } catch (e) {
        console.error(e);
        canvas.innerHTML = `<div style="color:#6b7280;font-size:.82rem;text-align:center;padding:20px;">
            Visualization not available for this step</div>`;
    }

    // Build legend from pointers
    buildLegend(vis.pointers);

    // Render text-based linear representation
    renderLinearState(vis);
}

function renderLinearState(vis) {
    const container = document.getElementById('linearOutput');
    if (!container) return;
    
    // For now, linear output is only highly useful for linked lists
    if (vis.type !== 'linked_list') {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'block';
    container.innerHTML = '';
    
    const nodeById = {};
    (vis.nodes || []).forEach(n => nodeById[n.id] = n);
    
    const adj = {};
    (vis.connections || []).forEach(([u, v]) => {
        adj[u] = v;
    });
    
    const pointers = vis.pointers || {};
    const entries = Object.entries(pointers);
    if (entries.length === 0) {
        container.innerHTML = '<div style="color:#9ca3af;font-size:0.85rem;font-style:italic;">No active list pointers</div>';
        return;
    }
    
    for (const [ptrName, ptrId] of entries) {
        if (!nodeById[ptrId]) continue;
        
        let curr = ptrId;
        const path = [];
        const visited = new Set();
        
        while (curr != null && nodeById[curr]) {
            if (visited.has(curr)) {
                path.push("... (cycle)");
                break;
            }
            visited.add(curr);
            path.push(nodeById[curr].val);
            curr = adj[curr];
        }
        
        const line = document.createElement('div');
        line.innerHTML = `<strong>${ptrName}</strong>: ${path.join(' &rarr; ')} &rarr; null`;
        container.appendChild(line);
    }
}

// ═══════════════════════════════════════════════════
// LINKED LIST
// ═══════════════════════════════════════════════════
function renderLinkedList(canvas, vis) {
    const nodes       = vis.nodes       || [];
    const connections = vis.connections || [];
    const highlighted = new Set(vis.highlighted_nodes || []);
    const removed     = new Set(vis.removed_nodes     || []);
    const pointers    = vis.pointers || {};

    if (nodes.length === 0) {
        canvas.innerHTML = '<div style="color:#9ca3af;font-size:.82rem;">Empty list (null)</div>';
        return;
    }

    // Build next-map from connections
    const nextMap = {};
    connections.forEach(([from, to]) => { nextMap[from] = to; });

    // Build pointer map: nodeId → [pointer names]
    const ptrAtNode = {};
    Object.entries(pointers).forEach(([name, nodeId]) => {
        if (nodeId === -1 || nodeId === null || nodeId === undefined) return;
        if (!ptrAtNode[nodeId]) ptrAtNode[nodeId] = [];
        ptrAtNode[nodeId].push(name);
    });

    const nodeById = {};
    nodes.forEach(n => { nodeById[n.id] = n; });

    // 1. Find all in-degrees to identify all start nodes
    const inDegree = {};
    nodes.forEach(n => inDegree[n.id] = 0);
    connections.forEach(([from, to]) => {
        if (inDegree[to] !== undefined) inDegree[to]++;
    });

    // 2. Identify all heads (in-degree 0)
    let startNodes = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);
    
    // Fallback if there's a cycle and no start nodes
    if (startNodes.length === 0 && nodes.length > 0) {
        startNodes.push(nodes[0].id);
    }

    // 3. Traverse to build disconnected components
    let components = [];
    let visited = new Set();

    // Helper to traverse a path
    const traverse = (startId) => {
        let path = [];
        let cur = startId;
        while (cur !== undefined && cur !== null && !visited.has(cur)) {
            visited.add(cur);
            path.push(cur);
            cur = nextMap[cur];
        }
        if (path.length > 0) components.push(path);
    };

    // First traverse from all known start nodes
    // Let's sort start nodes so newly created nodes (higher IDs usually, or just leave as is) 
    // Wait, if it's a dummy node, maybe put it first if it has pointers?
    startNodes.forEach(traverse);

    // Then catch any unvisited nodes (e.g. disconnected cycles)
    nodes.forEach(n => {
        if (!visited.has(n.id)) traverse(n.id);
    });

    // 4. Build HTML
    let html = '<div class="ll-container" style="flex-wrap:wrap; gap:20px;">';

    components.forEach((path, compIdx) => {
        html += '<div class="ll-component" style="display:flex; align-items:flex-end; gap:0;">';
        
        path.forEach((id, idx) => {
            const node = nodeById[id];
            if (!node) return;

            const ptrs = ptrAtNode[id] || [];
            const isHL  = highlighted.has(id);
            const isRem = removed.has(id);

            // Pointer labels above node
            let ptrLabelsHTML = '';
            ptrs.forEach(name => {
                const color = getPtrColor(name);
                ptrLabelsHTML += `
                    <div class="ll-pointer-label" style="background:${color.bg};color:${color.text}">${name}</div>
                    <div class="ll-pointer-line" style="background:${color.line}"></div>`;
            });
            if (!ptrLabelsHTML) {
                ptrLabelsHTML = '<div style="height:34px;"></div>'; // spacer
            }

            const nodeClass = `ll-node${isHL ? ' highlighted' : ''}${isRem ? ' removed' : ''}`;

            html += `<div class="ll-node-wrap">
                ${ptrLabelsHTML}
                <div class="${nodeClass}">${node.val}</div>
            </div>`;

            // Arrow to next node in THIS path
            if (idx < path.length - 1) {
                html += `<div class="ll-arrow">→</div>`;
            } else {
                // End of this path
                // If it connects to something we already visited (cycle), or null
                let nextId = nextMap[id];
                if (nextId !== undefined && nextId !== null) {
                    html += `<div class="ll-arrow" style="color:#ef4444;" title="Cycle to ${nextId}">↻</div>`;
                } else {
                    html += `<div class="ll-arrow">→</div><div class="ll-null">null</div>`;
                }
            }
        });
        
        html += '</div>';
    });

    html += '</div>';
    canvas.innerHTML = html;
}

// ═══════════════════════════════════════════════════
// ARRAY (Smooth Persistent Rendering)
// ═══════════════════════════════════════════════════
function renderArray(canvas, vis) {
    const elements   = vis.elements  || [];
    const highlighted = new Set(vis.highlighted  || []);
    const secondary   = new Set(vis.secondary    || []);
    const pointers    = vis.pointers || {};

    if (elements.length === 0) {
        canvas.innerHTML = '<div style="color:#9ca3af;font-size:.82rem;">Empty array</div>';
        return;
    }

    // 1. Ensure container exists
    let container = canvas.querySelector('.arr-container');
    if (!container || container.dataset.len != elements.length) {
        canvas.innerHTML = '';
        container = document.createElement('div');
        container.className = 'arr-container';
        container.dataset.len = elements.length;
        
        // Create cells once
        elements.forEach((val, i) => {
            const wrap = document.createElement('div');
            wrap.className = 'arr-cell-wrap';
            wrap.id = `cell-wrap-${i}`;
            
            const cell = document.createElement('div');
            cell.className = 'arr-cell';
            cell.id = `cell-${i}`;
            
            const idx = document.createElement('div');
            idx.className = 'arr-idx';
            idx.textContent = i;
            
            wrap.appendChild(cell);
            wrap.appendChild(idx);
            container.appendChild(wrap);
        });
        canvas.appendChild(container);
    }

    // 2. Update Cells (Values & Highlights)
    elements.forEach((val, i) => {
        const cell = document.getElementById(`cell-${i}`);
        if (!cell) return;
        
        // Update value (if changed, we can flash it, but for now just set it)
        if (cell.textContent !== String(val)) {
            cell.textContent = val;
            // tiny pop animation triggers via CSS if we reset it, or just rely on the highlight pop
        }

        const isHL  = highlighted.has(i);
        const isSec = secondary.has(i);
        
        cell.className = `arr-cell${isHL ? ' highlighted' : ''}${isSec ? ' secondary-highlight' : ''}`;
    });

    // 3. Update / Create Pointers (Gliding absolute positions)
    Object.entries(pointers).forEach(([name, targetIdx]) => {
        if (targetIdx === null || targetIdx === undefined || targetIdx < 0) {
            // Hide pointer if it goes out of bounds or is null
            const existing = document.getElementById(`ptr-${name}`);
            if (existing) existing.style.opacity = '0';
            return;
        }

        const color = getPtrColor(name);
        let ptrEl = document.getElementById(`ptr-${name}`);
        
        if (!ptrEl) {
            ptrEl = document.createElement('div');
            ptrEl.className = 'arr-pointer-bubble';
            ptrEl.id = `ptr-${name}`;
            ptrEl.innerHTML = `
                <div class="arr-ptr-label" style="background:${color.bg};color:${color.text}">${name}</div>
                <div class="arr-ptr-line" style="background:${color.line}"></div>
            `;
            container.appendChild(ptrEl);
        }

        // Calculate target X position based on cell offset
        const targetWrap = document.getElementById(`cell-wrap-${targetIdx}`);
        if (targetWrap) {
            ptrEl.style.opacity = '1';
            // Find center of the target cell wrap relative to the container
            const wrapRect = targetWrap.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            const leftOffset = wrapRect.left - containerRect.left + (wrapRect.width / 2);
            
            // Stack overlapping pointers vertically by offset
            // Check how many pointers are at this index already
            let stackingOffset = 0;
            const allPtrs = Array.from(container.querySelectorAll('.arr-pointer-bubble'));
            const atSameIdx = allPtrs.filter(p => p.dataset.target === String(targetIdx) && p.id !== ptrEl.id);
            stackingOffset = atSameIdx.length * 28; // move up by 28px for each overlapping pointer

            ptrEl.dataset.target = targetIdx;
            
            // Center the bubble horizontally over the cell
            ptrEl.style.left = `calc(${leftOffset}px - 50%)`;
            ptrEl.style.top = `-${40 + stackingOffset}px`; 
        }
    });
}

// ═══════════════════════════════════════════════════
// STACK
// ═══════════════════════════════════════════════════
function renderStack(canvas, vis) {
    const elements = vis.elements || [];
    const topIdx   = vis.top !== undefined ? vis.top : elements.length - 1;
    const highlighted = new Set(vis.highlighted || []);

    if (elements.length === 0) {
        canvas.innerHTML = '<div style="color:#9ca3af;font-size:.82rem;text-align:center">Empty stack</div>';
        return;
    }

    let html = `<div style="display:flex;flex-direction:column;align-items:center;gap:0;padding:16px;">
        <div style="font-size:.7rem;color:#9ca3af;font-weight:700;letter-spacing:.06em;margin-bottom:6px;">TOP</div>`;

    for (let i = elements.length - 1; i >= 0; i--) {
        const isTop = (i === topIdx);
        const isHL  = highlighted.has(i);
        html += `<div class="stack-cell${(isTop || isHL) ? ' top' : ''}">${elements[i]}</div>`;
    }

    html += `<div style="height:4px;width:104px;background:#374151;border-radius:0 0 4px 4px;margin-top:0;"></div>
        <div style="font-size:.7rem;color:#9ca3af;font-weight:700;letter-spacing:.06em;margin-top:6px;">BOTTOM</div>
    </div>`;

    canvas.innerHTML = html;
}

// ═══════════════════════════════════════════════════
// QUEUE
// ═══════════════════════════════════════════════════
function renderQueue(canvas, vis) {
    const elements = vis.elements || [];
    const highlighted = new Set(vis.highlighted || []);

    if (elements.length === 0) {
        canvas.innerHTML = '<div style="color:#9ca3af;font-size:.82rem;">Empty queue</div>';
        return;
    }

    let html = '<div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px;">' +
               '<div style="display:flex;align-items:center;gap:0;">';

    // Dequeue side label
    html += '<div style="font-size:.7rem;color:#059669;font-weight:700;margin-right:8px;">FRONT ←</div>';

    elements.forEach((val, i) => {
        const isHL = highlighted.has(i);
        html += `<div class="arr-cell${isHL ? ' highlighted' : ''}" 
                     style="border-right-width:${i === elements.length-1 ? '2px':'0'};
                            border-radius:${i===0?'6px 0 0 6px':''} ${i===elements.length-1?'0 6px 6px 0':''};">
                    ${val}
                 </div>`;
    });

    html += '<div style="font-size:.7rem;color:#4f46e5;font-weight:700;margin-left:8px;">← REAR</div>';
    html += '</div></div>';

    canvas.innerHTML = html;
}

// ═══════════════════════════════════════════════════
// TREE
// ═══════════════════════════════════════════════════
function renderTree(canvas, vis) {
    const nodes    = vis.nodes || [];
    const rootId   = vis.root !== undefined ? vis.root : (nodes[0]?.id ?? 0);
    const highlighted = new Set(vis.highlighted_nodes || []);

    if (nodes.length === 0) {
        canvas.innerHTML = '<div style="color:#9ca3af;font-size:.82rem;">Empty tree</div>';
        return;
    }

    const nodeMap = {};
    nodes.forEach(n => { nodeMap[n.id] = n; });

    // Compute layout using BFS level positions
    const positions = {};
    const levels    = {};
    const levelNodes = {};

    function computeLayout(id, depth, order) {
        if (id === null || id === undefined || !nodeMap[id]) return 0;
        levels[id] = depth;
        if (!levelNodes[depth]) levelNodes[depth] = [];
        levelNodes[depth].push(id);
        const n = nodeMap[id];
        const leftWidth  = computeLayout(n.left  !== undefined ? n.left  : null, depth+1, order*2);
        const rightWidth = computeLayout(n.right !== undefined ? n.right : null, depth+1, order*2+1);
        return leftWidth + rightWidth + 1;
    }

    computeLayout(rootId, 0, 0);

    // Assign X positions within each level
    const NODE_W = 54, NODE_H = 70;
    const maxDepth = Math.max(...Object.values(levels));
    const canvasW = Math.max(400, (nodes.length + 1) * NODE_W);
    const canvasH = (maxDepth + 1) * NODE_H + 40;

    // Simple recursive x positioning
    let xCounters = {};
    function assignX(id, depth) {
        if (id === null || id === undefined || !nodeMap[id]) return null;
        if (!xCounters[depth]) xCounters[depth] = 0;
        const n = nodeMap[id];
        const lx = assignX(n.left !== undefined ? n.left : null, depth+1);
        const rx = assignX(n.right !== undefined ? n.right : null, depth+1);

        let x;
        const totalWidth = canvasW;
        const levelCount = (levelNodes[depth] || []).length;
        const myOrder    = (levelNodes[depth] || []).indexOf(id);
        x = ((myOrder + 1) / (levelCount + 1)) * totalWidth;
        positions[id] = { x, y: depth * NODE_H + 40 };
        return x;
    }
    assignX(rootId, 0);

    // Build SVG
    const r = 22;
    let edgesHTML = '';
    let nodesHTML = '';

    const arrowId = 'arrow-tree';
    const svgDefs = `<defs>
        <marker id="${arrowId}" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#9ca3af"/>
        </marker>
    </defs>`;

    // Draw edges first
    nodes.forEach(n => {
        const p = positions[n.id];
        if (!p) return;
        ['left','right'].forEach(side => {
            const childId = n[side];
            if (childId === null || childId === undefined) return;
            const cp = positions[childId];
            if (!cp) return;
            edgesHTML += `<line x1="${p.x}" y1="${p.y}" x2="${cp.x}" y2="${cp.y}"
                               stroke="#d1d5db" stroke-width="1.5" marker-end="url(#${arrowId})"/>`;
        });
    });

    // Draw nodes
    nodes.forEach(n => {
        const p = positions[n.id];
        if (!p) return;
        const isHL = highlighted.has(n.id);
        const fill   = isHL ? '#eef2ff' : '#ffffff';
        const stroke = isHL ? '#4f46e5' : '#d1d5db';
        const sw     = isHL ? 2.5 : 1.5;
        const textClr = isHL ? '#4f46e5' : '#0f172a';

        nodesHTML += `
            <circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"
                    style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.08))"/>
            <text x="${p.x}" y="${p.y}" fill="${textClr}" 
                  font-family="JetBrains Mono,monospace" font-size="13" font-weight="600"
                  dominant-baseline="middle" text-anchor="middle">${n.val}</text>`;
    });

    canvas.innerHTML = `
        <div style="width:100%;overflow-x:auto;">
            <svg width="${canvasW}" height="${canvasH}" style="display:block;margin:0 auto;">
                ${svgDefs}
                ${edgesHTML}
                ${nodesHTML}
            </svg>
        </div>`;
}

// ═══════════════════════════════════════════════════
// MATRIX
// ═══════════════════════════════════════════════════
function renderMatrix(canvas, vis) {
    const grid = vis.grid || [];
    const hlCells = new Set((vis.highlighted_cells || []).map(([r,c]) => `${r},${c}`));

    if (grid.length === 0) {
        canvas.innerHTML = '<div style="color:#9ca3af;font-size:.82rem;">Empty matrix</div>';
        return;
    }

    let html = '<div class="matrix-container">';

    grid.forEach((row, r) => {
        html += '<div class="matrix-row">';
        row.forEach((val, c) => {
            const isHL = hlCells.has(`${r},${c}`);
            html += `<div class="matrix-cell${isHL ? ' highlighted' : ''}">${val}</div>`;
        });
        html += '</div>';
    });

    html += '</div>';
    canvas.innerHTML = html;
}

// ═══════════════════════════════════════════════════
// VARIABLES ONLY
// ═══════════════════════════════════════════════════
function renderVariablesOnly(canvas) {
    canvas.innerHTML = `
        <div style="text-align:center;color:#9ca3af;font-size:.82rem;padding:20px;">
            <div style="font-size:2rem;margin-bottom:8px;">📊</div>
            <div>Variable states shown below</div>
        </div>`;
}

// ═══════════════════════════════════════════════════
// VARIABLES PANEL RENDERER
// ═══════════════════════════════════════════════════
let _prevVars = {};

/**
 * Renders the variables panel below the visualization.
 * Highlights changed variables in indigo.
 * @param {Object} variables - Map of variable name → value string
 */
function renderVariables(variables) {
    const grid = document.getElementById('varsGrid');
    if (!grid) return;

    if (!variables || Object.keys(variables).length === 0) {
        grid.innerHTML = '<span style="color:#9ca3af;font-size:.78rem;font-style:italic;">No variables tracked</span>';
        _prevVars = {};
        return;
    }

    grid.innerHTML = '';

    Object.entries(variables).forEach(([name, val]) => {
        const valStr   = String(val);
        const changed  = _prevVars[name] !== valStr;
        const chip     = document.createElement('div');
        chip.className = `var-chip${changed ? ' changed' : ''}`;
        chip.innerHTML = `<span class="var-name">${name}</span><span class="var-val">${valStr}</span>`;
        grid.appendChild(chip);
    });

    _prevVars = {};
    Object.entries(variables).forEach(([k,v]) => { _prevVars[k] = String(v); });
}

/**
 * Resets internal visualizer state (call when starting a new trace)
 */
function resetVisualizer() {
    resetPtrColors();
    _prevVars = {};
}
