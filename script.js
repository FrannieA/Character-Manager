const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Data ------------------------------------
let characters = [];
let relationships = [];
let shapes = [];
let nextId = 1;
let nextShapeId = 1;

// Selection ---------------------------------------
let selected = null;        // single character open in edit panel
let selectedShape = null;   // single shape open in shape panel

let multiSelected = {       // multi-select sets
    chars:  new Set(),      // character ids
    rels:   new Set(),      // relationship objects
    shapes: new Set()       // shape ids
};

// Drag / Resize ---------------------------
let dragging = null;
let dragOffset = {x:0, y:0};
let draggingShape = null;
let shapeDragOffset = {x:0, y:0};
let resizingShape = null;
let shapeResizeStart = null;

// multi-drag
let multiDragAnchor = null;    
let multiDragSnapshots = [];   

// Marquee (drag-select) ---------------------
let marquee = null;
let marqueeStart = null;

// Modes ----------------------------
let linkMode = false;
let linkSource = null;
let editingLink = null;
let linkParticipants = [];

let addShapeMode = null;   // 'rect' | 'ellipse' | 'text' | 'line' | 'triangle' | null
let shapeDrawStart = null;
let resizingLineEnd = null; // 'a' | 'b'

// Snap ------------------------------
let snapEnabled = false;
const SNAP_GRID = 50;
function snap(v) { return snapEnabled ? Math.round(v / SNAP_GRID) * SNAP_GRID : v; }

// Viewport ---------------------------
let viewX = 0, viewY = 0, viewZoom = 1;
const ZOOM_MIN = 0.2, ZOOM_MAX = 4;
let isPanning = false;
let panStart = {x:0, y:0};
let panStartView = {x:0, y:0};

// Canvas Setup -----------------------------------
function resizeCanvas() {
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    draw();
}
window.addEventListener('load',   () => { resizeCanvas(); loadFromStorage(); renderSidebarList(); });
window.addEventListener('resize', resizeCanvas);

function screenToWorld(sx, sy) {
    return { x: (sx - viewX) / viewZoom, y: (sy - viewY) / viewZoom };
}

// Main Draw -------------------------------------------
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(viewX, viewY);
    ctx.scale(viewZoom, viewZoom);

    if (snapEnabled) drawSnapGrid();

    shapes.forEach(drawShape);
    relationships.forEach(drawRelationship);
    characters.forEach(drawCharacterNode);

    if (linkMode && linkSource)        drawLinkSourceIndicator(linkSource);
    if (linkParticipants.length === 2) linkParticipants.forEach(drawLinkSourceIndicator);

    if (marquee) {
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = '#B08D57';
        ctx.fillRect(marquee.x, marquee.y, marquee.w, marquee.h);
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = '#B08D57';
        ctx.lineWidth = 1 / viewZoom;
        ctx.setLineDash([6 / viewZoom, 3 / viewZoom]);
        ctx.strokeRect(marquee.x, marquee.y, marquee.w, marquee.h);
        ctx.setLineDash([]);
        ctx.restore();
    }

    ctx.restore();
}

function drawSnapGrid() {
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = '#6D2932';
    ctx.lineWidth = 1;
    const x0 = Math.floor(-viewX / viewZoom / SNAP_GRID) * SNAP_GRID - SNAP_GRID;
    const y0 = Math.floor(-viewY / viewZoom / SNAP_GRID) * SNAP_GRID - SNAP_GRID;
    const x1 = x0 + canvas.width  / viewZoom + SNAP_GRID * 3;
    const y1 = y0 + canvas.height / viewZoom + SNAP_GRID * 3;
    for (let x = x0; x < x1; x += SNAP_GRID) {
        ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
    }
    for (let y = y0; y < y1; y += SNAP_GRID) {
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    }
    ctx.restore();
}

// Draw: Relationship -------------------------------------
function drawRelationship(rel) {
    const charA = characters.find(c => c.id === rel.from);
    const charB = characters.find(c => c.id === rel.to);
    if (!charA || !charB) return;

    const colorMap = {
        friend:'#4caf50', ally:'#2196f3', enemy:'#f44336',
        family:'#9c27b0', lovers:'#e91e8c', married:'#ff69b4',
        siblings:'#990078', child:'#6b069a', rival:'#ff5722', acquaintance:'#9e9e9e',
         
    };
    const color  = colorMap[rel.type] || '#888';
    const isMulti = multiSelected.rels.has(rel);

    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur  = isMulti ? 10 : 4;
    ctx.beginPath();
    ctx.moveTo(charA.x, charA.y);
    ctx.lineTo(charB.x, charB.y);
    ctx.strokeStyle = isMulti ? '#B08D57' : color;
    ctx.lineWidth   = isMulti ? 3 : 2;
    ctx.stroke();
    ctx.restore();

    const midX = (charA.x + charB.x) / 2;
    const midY = (charA.y + charB.y) / 2;
    ctx.font = '13px "Crimson Text", serif';
    ctx.textAlign = 'center';
    const tw = ctx.measureText(rel.label).width;
    const pW = tw + 16, pH = 18;

    ctx.fillStyle = 'rgba(243,233,219,0.95)';
    ctx.beginPath();
    ctx.roundRect(midX - pW/2, midY - pH/2, pW, pH, 8);
    ctx.fill();
    ctx.strokeStyle = isMulti ? '#B08D57' : color;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = isMulti ? '#B08D57' : color;
    ctx.textBaseline = 'middle';
    ctx.fillText(rel.label, midX, midY);
    ctx.textBaseline = 'alphabetic';
}

// Draw: Character Node ----------------------------------------------
const avatarCache = new Map(); // id -> HTMLImageElement | { failed: true }

function loadAvatarIfNeeded(c) {
    if (!c.avatar) return false;
    const entry = avatarCache.get(c.id);
    if (entry) {
        if (entry.failed) return false;
        if (entry._src === c.avatar) return entry.complete && entry.naturalWidth > 0;
        avatarCache.delete(c.id);
    }
    const img = new Image();
    img._src = c.avatar;
    img.addEventListener('load', function() { draw(); });
    img.addEventListener('error', function() {
        avatarCache.set(c.id, { failed: true });
        draw();
    });
    avatarCache.set(c.id, img);
    img.src = c.avatar;
    return false;
}

function drawAvatarImage(c) {
    const img = avatarCache.get(c.id);
    if (!img || img.failed || !img.complete) return;
    const radius = 40;
    const size   = radius * 2;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const scale = Math.max(iw / size, ih / size);
    const sw = size * scale, sh = size * scale;
    const sx = (iw - sw) / 2, sy = (ih - sh) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, sx, sy, sw, sh, c.x - radius, c.y - radius, size, size);
    ctx.restore();
}

function drawAvatarFallback(c) {
    const radius = 40;
    ctx.beginPath();
    ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = c.color;
    ctx.fill();

    ctx.fillStyle = 'rgba(248,241,231,0.95)';
    ctx.font = 'bold 25px "Cinzel", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((c.name || '?').charAt(0).toUpperCase(), c.x, c.y);
    ctx.textBaseline = 'alphabetic';
}

function drawCharacterNode(c) {
    const radius = 40;
    const highlight = (selected && selected.id === c.id) || multiSelected.chars.has(c.id);

    ctx.save();
    ctx.shadowColor = 'rgba(61,15,22,0.28)';
    ctx.shadowBlur  = 16;
    ctx.shadowOffsetY = 4;
    ctx.beginPath();
    ctx.arc(c.x, c.y, radius + 7, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(232,216,196,0.92)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c.x, c.y, radius + 7, 0, Math.PI * 2);
    ctx.strokeStyle = highlight ? '#B08D57' : 'rgba(86,28,36,0.20)';
    ctx.lineWidth   = highlight ? 3 : 1.5;
    ctx.stroke();
    ctx.restore();

    if (c.avatar && loadAvatarIfNeeded(c)) {
        drawAvatarImage(c);
    } else {
        drawAvatarFallback(c);
    }

    ctx.fillStyle = '#3A1219';
    ctx.font = '16px "Crimson Text", serif';
    ctx.fillText(c.name, c.x, c.y + radius + 18);

    ctx.fillStyle = '#8A5B57';
    ctx.font = '13px "Crimson Text", serif';
    ctx.fillText(c.role, c.x, c.y + radius + 32);
}

function drawLinkSourceIndicator(c) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(c.x, c.y, 54, 0, Math.PI * 2);
    ctx.strokeStyle = '#B08D57';
    ctx.lineWidth   = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
}

// Draw: Shape ----------------------------------------------
function drawShape(sh) {
    const isSingle    = selectedShape && selectedShape.id === sh.id;
    const isMulti     = multiSelected.shapes.has(sh.id);
    const highlighted = isSingle || isMulti;
    ctx.save();

    if (sh.type === 'text') {
        const fs = sh.fontSize || 18;
        ctx.font = `italic ${fs}px "Crimson Text", serif`;
        ctx.textBaseline = 'top';
        ctx.fillStyle = sh.color;
        ctx.globalAlpha = highlighted ? 1 : 0.82;
        if (highlighted) { ctx.shadowColor = sh.color; ctx.shadowBlur = 8; }
        ctx.fillText(sh.label || 'Note', sh.x, sh.y);
        ctx.globalAlpha = 1;
        ctx.textBaseline = 'alphabetic';
        if (isSingle) {
            const tw = ctx.measureText(sh.label || 'Note').width;
            const th = fs * 1.35;
            ctx.strokeStyle = '#B08D57';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 3]);
            ctx.strokeRect(sh.x - 4, sh.y - 4, tw + 8, th + 8);
            ctx.setLineDash([]);
            drawResizeHandle(sh.x + tw + 4, sh.y + th + 4);
        }

    } else if (sh.type === 'line') {
        const lw = sh.lineWidth || 2;
        ctx.strokeStyle = highlighted ? '#B08D57' : sh.color;
        ctx.lineWidth   = highlighted ? lw + 1.5 : lw;
        ctx.globalAlpha = highlighted ? 1 : 0.85;
        if (highlighted) { ctx.shadowColor = sh.color; ctx.shadowBlur = 8; }
        ctx.setLineDash(sh.dashed ? [10, 6] : []);
        ctx.beginPath();
        ctx.moveTo(sh.x,  sh.y);
        ctx.lineTo(sh.x2, sh.y2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Arrowhead at end (x2,y2)
        if (sh.arrow !== false) {
            const angle  = Math.atan2(sh.y2 - sh.y, sh.x2 - sh.x);
            const hLen   = 14;
            const hAngle = Math.PI / 6;
            ctx.fillStyle = highlighted ? '#B08D57' : sh.color;
            ctx.beginPath();
            ctx.moveTo(sh.x2, sh.y2);
            ctx.lineTo(sh.x2 - hLen * Math.cos(angle - hAngle), sh.y2 - hLen * Math.sin(angle - hAngle));
            ctx.lineTo(sh.x2 - hLen * Math.cos(angle + hAngle), sh.y2 - hLen * Math.sin(angle + hAngle));
            ctx.closePath();
            ctx.fill();
        }

        // Endpoint handles when selected
        if (isSingle) {
            ctx.globalAlpha = 1;
            drawResizeHandle(sh.x,  sh.y);
            drawResizeHandle(sh.x2, sh.y2);
        }

    } else if (sh.type === 'triangle') {
        const tx = sh.x + sh.w / 2, ty = sh.y;
        const blx = sh.x, bly = sh.y + sh.h;
        const brx = sh.x + sh.w, bry = sh.y + sh.h;
        ctx.beginPath();
        ctx.moveTo(tx, ty); ctx.lineTo(blx, bly); ctx.lineTo(brx, bry);
        ctx.closePath();
        ctx.globalAlpha = 0.10;
        ctx.fillStyle = sh.color;
        ctx.fill();
        ctx.globalAlpha = highlighted ? 0.9 : 0.45;
        ctx.strokeStyle = highlighted ? '#B08D57' : sh.color;
        ctx.lineWidth   = highlighted ? 2.5 : 1.5;
        ctx.setLineDash([8, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        if (sh.label) {
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = sh.color;
            ctx.font = `600 ${sh.fontSize || 16}px "Cinzel", serif`;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.fillText(sh.label.toUpperCase(), sh.x + sh.w / 2, sh.y + sh.h * 0.65);
            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = 'center';
        }
        if (isSingle) { ctx.globalAlpha = 1; drawResizeHandle(sh.x + sh.w, sh.y + sh.h); }

    } else {
        const r = 12;
        ctx.globalAlpha = 0.10;
        ctx.fillStyle = sh.color;
        if (sh.type === 'ellipse') {
            ctx.beginPath();
            ctx.ellipse(sh.x + sh.w/2, sh.y + sh.h/2, sh.w/2, sh.h/2, 0, 0, Math.PI*2);
            ctx.fill();
            ctx.globalAlpha = highlighted ? 0.9 : 0.45;
            ctx.strokeStyle = highlighted ? '#B08D57' : sh.color;
            ctx.lineWidth = highlighted ? 2.5 : 1.5;
            ctx.setLineDash([8, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
        } else {
            ctx.beginPath(); ctx.roundRect(sh.x, sh.y, sh.w, sh.h, r); ctx.fill();
            ctx.globalAlpha = highlighted ? 0.9 : 0.45;
            ctx.strokeStyle = highlighted ? '#B08D57' : sh.color;
            ctx.lineWidth = highlighted ? 2.5 : 1.5;
            ctx.setLineDash([8, 5]);
            ctx.beginPath(); ctx.roundRect(sh.x, sh.y, sh.w, sh.h, r); ctx.stroke();
            ctx.setLineDash([]);
        }
        if (sh.label) {
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = sh.color;
            ctx.font = `600 ${sh.fontSize || 16}px "Cinzel", serif`;
            ctx.textBaseline = 'top';
            ctx.textAlign = 'left';
            const pad  = sh.type === 'ellipse' ? sh.w * 0.18 : 14;
            const padY = sh.type === 'ellipse' ? sh.h * 0.12 : 10;
            ctx.fillText(sh.label.toUpperCase(), sh.x + pad, sh.y + padY);
            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = 'center';
        }
        if (isSingle) { ctx.globalAlpha = 1; drawResizeHandle(sh.x + sh.w, sh.y + sh.h); }
    }
    ctx.restore();
}

function drawResizeHandle(x, y) {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI*2);
    ctx.fillStyle = '#B08D57';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
}

// Hit Detection --------------------------------------------
function getCharacterAt(sx, sy) {
    const w = screenToWorld(sx, sy);
    return characters.find(c => Math.hypot(c.x - w.x, c.y - w.y) < 47);
}

function getLinkAtPoint(sx, sy) {
    const w = screenToWorld(sx, sy);
    return relationships.find(rel => {
        const a = characters.find(c => c.id === rel.from);
        const b = characters.find(c => c.id === rel.to);
        if (!a || !b) return false;
        return Math.hypot((a.x+b.x)/2 - w.x, (a.y+b.y)/2 - w.y) < 14;
    });
}

function getShapeAt(sx, sy) {
    const w = screenToWorld(sx, sy);
    for (let i = shapes.length - 1; i >= 0; i--) {
        const sh = shapes[i];
        if (sh.type === 'text') {
            if (w.x >= sh.x - 4 && w.x <= sh.x + sh.w + 8 && w.y >= sh.y - 4 && w.y <= sh.y + 60) return sh;
        } else if (sh.type === 'line') {
            const dx = sh.x2 - sh.x, dy = sh.y2 - sh.y;
            const len2 = dx*dx + dy*dy;
            if (len2 === 0) {
                if (Math.hypot(w.x - sh.x, w.y - sh.y) < 12 / viewZoom) return sh;
            } else {
                const t = Math.max(0, Math.min(1, ((w.x - sh.x)*dx + (w.y - sh.y)*dy) / len2));
                if (Math.hypot(w.x - (sh.x + t*dx), w.y - (sh.y + t*dy)) < 10 / viewZoom) return sh;
            }
        } else {
            if (w.x >= sh.x && w.x <= sh.x + sh.w && w.y >= sh.y && w.y <= sh.y + sh.h) return sh;
        }
    }
    return null;
}

function getLineEndpointAt(sx, sy) {
    if (!selectedShape || selectedShape.type !== 'line') return null;
    const sh = selectedShape;
    const w  = screenToWorld(sx, sy);
    const thr = 10 / viewZoom;
    if (Math.hypot(w.x - sh.x,  w.y - sh.y)  < thr) return 'a';
    if (Math.hypot(w.x - sh.x2, w.y - sh.y2) < thr) return 'b';
    return null;
}

function getResizeHandleAt(sx, sy) {
    if (!selectedShape) return false;
    const sh = selectedShape;
    const w  = screenToWorld(sx, sy);
    return Math.hypot((sh.x + sh.w) - w.x, (sh.y + sh.h) - w.y) < 10 / viewZoom;
}

function getItemsInWorldRect(rx, ry, rw, rh) {
    const x0 = Math.min(rx, rx+rw), x1 = Math.max(rx, rx+rw);
    const y0 = Math.min(ry, ry+rh), y1 = Math.max(ry, ry+rh);
    const chars = characters.filter(c => c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1);
    const rels  = relationships.filter(rel => {
        const a = characters.find(c => c.id === rel.from);
        const b = characters.find(c => c.id === rel.to);
        if (!a || !b) return false;
        return (a.x+b.x)/2 >= x0 && (a.x+b.x)/2 <= x1 && (a.y+b.y)/2 >= y0 && (a.y+b.y)/2 <= y1;
    });
    const shs   = shapes.filter(sh => sh.x >= x0 && sh.x <= x1 && sh.y >= y0 && sh.y <= y1);
    return { chars, rels, shs };
}

// Multi-select helpers -------------------------------------------------
function hasMultiSelection() {
    return multiSelected.chars.size > 0 || multiSelected.rels.size > 0 || multiSelected.shapes.size > 0;
}
function clearMultiSelection() {
    multiSelected.chars  = new Set();
    multiSelected.rels   = new Set();
    multiSelected.shapes = new Set();
}
function clearSingleSelections() {
    selected = null;
    selectedShape = null;
}
function startMultiDrag(worldPt) {
    multiDragAnchor   = { x: worldPt.x, y: worldPt.y };
    multiDragSnapshots = [];
    multiSelected.chars.forEach(id => {
        const c = characters.find(ch => ch.id === id);
        if (c) multiDragSnapshots.push({ item: c, ox: c.x, oy: c.y });
    });
    multiSelected.shapes.forEach(id => {
        const s = shapes.find(sh => sh.id === id);
        if (s) multiDragSnapshots.push({ item: s, ox: s.x, oy: s.y });
    });
}

// Delete selection -------------------------------------------------
function deleteSelection() {
    if (hasMultiSelection()) {
        const cIds = multiSelected.chars;
        const rSet = multiSelected.rels;
        const sIds = multiSelected.shapes;
        cIds.forEach(id => avatarCache.delete(id));
        characters    = characters.filter(c => !cIds.has(c.id));
        relationships = relationships.filter(r => !rSet.has(r) && !cIds.has(r.from) && !cIds.has(r.to));
        shapes        = shapes.filter(s => !sIds.has(s.id));
        clearMultiSelection();
        saveToStorage(); draw(); return;
    }
    if (selected) {
        const id = selected.id;
        avatarCache.delete(id);
        characters    = characters.filter(c => c.id !== id);
        relationships = relationships.filter(r => r.from !== id && r.to !== id);
        selected = null;
        closeEditPanel();
        saveToStorage(); draw(); return;
    }
    if (selectedShape) {
        shapes = shapes.filter(s => s.id !== selectedShape.id);
        selectedShape = null;
        closeShapePanel();
        saveToStorage(); draw();
    }
}

// Keyboard ----------------------------------------------
document.addEventListener('keydown', function(e) {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        deleteSelection();
    }
    if (e.key === 'Escape') {
        clearMultiSelection(); clearSingleSelections();
        exitShapeMode();
        if (linkMode) {
            linkMode = false; linkSource = null;
            document.getElementById('btn-link').style.background = '';
            document.getElementById('btn-link').style.color      = '';
            document.getElementById('mode-hint').textContent     = '';
        }
        draw();
    }
});

// Mouse: Down -----------------------------------------------
canvas.addEventListener('mousedown', function(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const w  = screenToWorld(sx, sy);

    // link mode
    if (linkMode) {
        const clicked = getCharacterAt(sx, sy);
        if (!clicked) return;
        if (!linkSource) { linkSource = clicked; draw(); }
        else if (linkSource.id !== clicked.id) openLinkPanel(linkSource, clicked);
        return;
    }

    // shape draw mode
    if (addShapeMode) { shapeDrawStart = w; return; }

    // line endpoint drag
    const lineEnd = getLineEndpointAt(sx, sy);
    if (lineEnd) {
        resizingLineEnd = lineEnd;
        return;
    }

    // resize handle for box/triangle shapes
    if (selectedShape && selectedShape.type !== 'line' && getResizeHandleAt(sx, sy)) {
        resizingShape     = selectedShape;
        shapeResizeStart  = { mx: w.x, my: w.y, ow: selectedShape.w, oh: selectedShape.h };
        return;
    }

    const clickedChar  = getCharacterAt(sx, sy);
    const clickedShape = !clickedChar ? getShapeAt(sx, sy) : null;

    if (clickedChar) {
        if (e.shiftKey) {
            clearSingleSelections();
            if (multiSelected.chars.has(clickedChar.id)) multiSelected.chars.delete(clickedChar.id);
            else multiSelected.chars.add(clickedChar.id);
            draw();
        } else if (multiSelected.chars.has(clickedChar.id) && hasMultiSelection()) {
            startMultiDrag(w);
        } else {
            clearMultiSelection();
            selected = clickedChar;
            dragging = clickedChar;
            dragOffset.x = w.x - clickedChar.x;
            dragOffset.y = w.y - clickedChar.y;
            draw();
        }
        return;
    }

    if (clickedShape) {
        if (e.shiftKey) {
            clearSingleSelections();
            if (multiSelected.shapes.has(clickedShape.id)) multiSelected.shapes.delete(clickedShape.id);
            else multiSelected.shapes.add(clickedShape.id);
            draw();
        } else if (multiSelected.shapes.has(clickedShape.id) && hasMultiSelection()) {
            startMultiDrag(w);
        } else {
            clearMultiSelection();
            selectedShape    = clickedShape;
            draggingShape    = clickedShape;
            shapeDragOffset.x = w.x - clickedShape.x;
            shapeDragOffset.y = w.y - clickedShape.y;
            draw();
        }
        return;
    }

    // empty canvas
    clearSingleSelections();
    if (e.shiftKey || !panMode) {
        // Select mode or Shift held: marquee
        clearMultiSelection();
        marqueeStart = w;
        marquee = { x: w.x, y: w.y, w: 0, h: 0 };
    } else {
        // Pan mode: pan
        clearMultiSelection();
        isPanning = true;
        panStart.x = sx; panStart.y = sy;
        panStartView.x = viewX; panStartView.y = viewY;
        canvas.style.cursor = 'grabbing';
    }
    draw();
});

// Mouse: Move -------------------------------------------
canvas.addEventListener('mousemove', function(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const w  = screenToWorld(sx, sy);

    // shape draw preview
    if (addShapeMode && shapeDrawStart) {
        draw();
        ctx.save();
        ctx.translate(viewX, viewY); ctx.scale(viewZoom, viewZoom);
        ctx.globalAlpha = 0.7; ctx.strokeStyle = '#B08D57'; ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);

        if (addShapeMode === 'line') {
            ctx.beginPath();
            ctx.moveTo(shapeDrawStart.x, shapeDrawStart.y);
            ctx.lineTo(w.x, w.y);
            ctx.stroke();
            // arrowhead preview
            const angle = Math.atan2(w.y - shapeDrawStart.y, w.x - shapeDrawStart.x);
            ctx.setLineDash([]);
            ctx.fillStyle = '#B08D57'; ctx.globalAlpha = 0.7;
            ctx.beginPath();
            ctx.moveTo(w.x, w.y);
            ctx.lineTo(w.x - 14*Math.cos(angle - Math.PI/6), w.y - 14*Math.sin(angle - Math.PI/6));
            ctx.lineTo(w.x - 14*Math.cos(angle + Math.PI/6), w.y - 14*Math.sin(angle + Math.PI/6));
            ctx.closePath(); ctx.fill();
        } else {
            const px = Math.min(shapeDrawStart.x, w.x), py = Math.min(shapeDrawStart.y, w.y);
            const pw = Math.abs(w.x - shapeDrawStart.x), ph = Math.abs(w.y - shapeDrawStart.y);
            ctx.globalAlpha = 0.22; ctx.fillStyle = '#B08D57'; ctx.setLineDash([]);

            if (addShapeMode === 'ellipse') {
                ctx.beginPath();
                ctx.ellipse(px+pw/2, py+ph/2, Math.max(pw/2,1), Math.max(ph/2,1), 0, 0, Math.PI*2);
                ctx.fill();
                ctx.globalAlpha = 0.7; ctx.setLineDash([6,4]);
                ctx.beginPath();
                ctx.ellipse(px+pw/2, py+ph/2, Math.max(pw/2,1), Math.max(ph/2,1), 0, 0, Math.PI*2);
                ctx.stroke();
            } else if (addShapeMode === 'triangle') {
                ctx.beginPath();
                ctx.moveTo(px + pw/2, py); ctx.lineTo(px, py+ph); ctx.lineTo(px+pw, py+ph);
                ctx.closePath(); ctx.fill();
                ctx.globalAlpha = 0.7; ctx.setLineDash([6,4]); ctx.stroke();
            } else {
                ctx.fillRect(px, py, pw, ph);
                ctx.globalAlpha = 0.7; ctx.setLineDash([6,4]);
                ctx.strokeRect(px, py, pw, ph);
            }
        }
        ctx.setLineDash([]); ctx.restore();
        return;
    }

    if (resizingShape) {
        resizingShape.w = Math.max(40, shapeResizeStart.ow + (w.x - shapeResizeStart.mx));
        resizingShape.h = Math.max(20, shapeResizeStart.oh + (w.y - shapeResizeStart.my));
        draw(); return;
    }

    // line endpoint drag
    if (resizingLineEnd && selectedShape) {
        if (resizingLineEnd === 'a') { selectedShape.x = snap(w.x); selectedShape.y = snap(w.y); }
        else                         { selectedShape.x2 = snap(w.x); selectedShape.y2 = snap(w.y); }
        draw(); return;
    }

    if (multiDragAnchor) {
        const dx = w.x - multiDragAnchor.x, dy = w.y - multiDragAnchor.y;
        multiDragSnapshots.forEach(({ item, ox, oy }) => {
            item.x = snap(ox + dx); item.y = snap(oy + dy);
        });
        draw(); return;
    }

    if (draggingShape) {
        if (draggingShape.type === 'line') {
            const nx = snap(w.x - shapeDragOffset.x);
            const ny = snap(w.y - shapeDragOffset.y);
            const ddx = nx - draggingShape.x;
            const ddy = ny - draggingShape.y;
            draggingShape.x  = nx;
            draggingShape.y  = ny;
            draggingShape.x2 = snap(draggingShape.x2 + ddx);
            draggingShape.y2 = snap(draggingShape.y2 + ddy);
            shapeDragOffset.x = w.x - draggingShape.x;
            shapeDragOffset.y = w.y - draggingShape.y;
        } else {
            draggingShape.x = snap(w.x - shapeDragOffset.x);
            draggingShape.y = snap(w.y - shapeDragOffset.y);
        }
        draw(); return;
    }

    if (dragging) {
        dragging.x = snap(w.x - dragOffset.x);
        dragging.y = snap(w.y - dragOffset.y);
        draw(); return;
    }

    if (isPanning) {
        viewX = panStartView.x + (sx - panStart.x);
        viewY = panStartView.y + (sy - panStart.y);
        draw(); return;
    }

    if (marqueeStart) {
        marquee = {
            x: Math.min(marqueeStart.x, w.x), y: Math.min(marqueeStart.y, w.y),
            w: Math.abs(w.x - marqueeStart.x), h: Math.abs(w.y - marqueeStart.y)
        };
        const { chars, rels, shs } = getItemsInWorldRect(marquee.x, marquee.y, marquee.w, marquee.h);
        multiSelected.chars  = new Set(chars.map(c => c.id));
        multiSelected.rels   = new Set(rels);
        multiSelected.shapes = new Set(shs.map(s => s.id));
        draw(); return;
    }

    // cursor feedback
    if (addShapeMode)                             { canvas.style.cursor = 'crosshair'; return; }
    if (getLineEndpointAt(sx, sy))                { canvas.style.cursor = 'crosshair'; return; }
    if (selectedShape && selectedShape.type !== 'line' && getResizeHandleAt(sx,sy)) { canvas.style.cursor = 'nwse-resize'; return; }
    if (getShapeAt(sx, sy))                       { canvas.style.cursor = 'move'; return; }
    canvas.style.cursor = getCharacterAt(sx, sy) ? 'pointer' : (panMode ? 'grab' : 'default');
});

// Mouse: Up --------------------------------------------
canvas.addEventListener('mouseup', function(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const w  = screenToWorld(sx, sy);

    // finalise shape draw
    if (addShapeMode && shapeDrawStart) {
        const rx = Math.min(shapeDrawStart.x, w.x), ry = Math.min(shapeDrawStart.y, w.y);
        const rw = Math.abs(w.x - shapeDrawStart.x), rh = Math.abs(w.y - shapeDrawStart.y);
        if (addShapeMode === 'text') {
            const ns = { id: nextShapeId++, type:'text', x: shapeDrawStart.x, y: shapeDrawStart.y,
                         w:200, h:40, label:'New Note', color:'#6D2932', fontSize:18 };
            shapes.push(ns); selectedShape = ns;
            saveToStorage(); openShapePanel(ns);
        } else if (addShapeMode === 'line') {
            const len = Math.hypot(w.x - shapeDrawStart.x, w.y - shapeDrawStart.y);
            if (len > 20) {
                const ns = { id: nextShapeId++, type:'line',
                             x: snap(shapeDrawStart.x), y: snap(shapeDrawStart.y),
                             x2: snap(w.x), y2: snap(w.y),
                             color:'#6D2932', lineWidth:2, arrow:true, dashed:false, label:'', fontSize:16 };
                shapes.push(ns); selectedShape = ns;
                saveToStorage(); openShapePanel(ns);
            }
        } else if (rw > 20 && rh > 20) {
            const ns = { id: nextShapeId++, type: addShapeMode, x: rx, y: ry,
                         w: rw, h: rh, label:'', color:'#6D2932', fontSize:16 };
            shapes.push(ns); selectedShape = ns;
            saveToStorage(); openShapePanel(ns);
        }
        shapeDrawStart = null;
        exitShapeMode(); draw(); return;
    }

    if (resizingLineEnd)  { resizingLineEnd = null; saveToStorage(); }
    if (resizingShape)    { resizingShape = null; shapeResizeStart = null; saveToStorage(); }
    if (multiDragAnchor) { multiDragAnchor = null; multiDragSnapshots = []; saveToStorage(); }
    if (draggingShape)   { draggingShape = null; saveToStorage(); }
    if (dragging)        { dragging = null; saveToStorage(); }
    if (isPanning)       { isPanning = false; }

    if (marqueeStart) {
        marqueeStart = null;
        if (marquee && marquee.w < 4 && marquee.h < 4) clearMultiSelection();
        marquee = null;
        draw();
    }

    canvas.style.cursor = panMode ? 'grab' : 'default';
});

canvas.addEventListener('mouseleave', function() {
    isPanning = false;
    if (!dragging && !draggingShape && !multiDragAnchor)
        canvas.style.cursor = panMode ? 'grab' : 'default';
});

// Mouse: Click ------------------------------------------
canvas.addEventListener('click', function(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    if (!getCharacterAt(sx, sy) && !getShapeAt(sx, sy) && !hasMultiSelection()) {
        closeEditPanel();
    }
});

// Mouse: Dblclick --------------------------------------
canvas.addEventListener('dblclick', function(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;

    const clickedChar = getCharacterAt(sx, sy);
    if (clickedChar) { openEditPanel(clickedChar); return; }

    const clickedLink = getLinkAtPoint(sx, sy);
    if (clickedLink) {
        const a = characters.find(c => c.id === clickedLink.from);
        const b = characters.find(c => c.id === clickedLink.to);
        openLinkPanel(a, b); return;
    }

    const clickedShape = getShapeAt(sx, sy);
    if (clickedShape) { selectedShape = clickedShape; openShapePanel(clickedShape); }
});

// Zoom ----------------------------------
canvas.addEventListener('wheel', function(e) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const wx = (sx - viewX) / viewZoom, wy = (sy - viewY) / viewZoom;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    viewZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, viewZoom * factor));
    viewX = sx - wx * viewZoom;
    viewY = sy - wy * viewZoom;
    draw();
}, {passive: false});

document.querySelector('#toolbar h2').addEventListener('dblclick', function() {
    viewX = 0; viewY = 0; viewZoom = 1;
    resizeCanvas(); draw();
});

// Pan / Select mode ---------------------------------------------------
let panMode = true;

function setPanMode(on) {
    panMode = on;
    document.getElementById('btn-pan').classList.toggle('btn-active', on);
    document.getElementById('btn-select').classList.toggle('btn-active', !on);
    canvas.style.cursor = on ? 'grab' : 'default';
    if (on) { clearMultiSelection(); draw(); }
}

document.getElementById('btn-pan').addEventListener('click',    () => setPanMode(true));
document.getElementById('btn-select').addEventListener('click', () => setPanMode(false));

// Helper: close every sidebar panel
function closeAllPanels() {
    ['add-char-panel','edit-panel','link-panel','shape-panel'].forEach(id => {
        document.getElementById(id).style.display = 'none';
    });
    resizeCanvas();
}

// Toolbar: Snap ---------------------------------------------------------
document.getElementById('btn-snap').addEventListener('click', function() {
    snapEnabled = !snapEnabled;
    this.classList.toggle('btn-active', snapEnabled);
    if (!snapEnabled) document.getElementById('mode-hint').textContent = '';
    draw();
});

// Toolbar: Add Character ----------------------------------------------
document.getElementById('btn-add').addEventListener('click', function() {
    const panel = document.getElementById('add-char-panel');
    const isOpen = panel.style.display === 'flex';
    closeAllPanels();
    if (!isOpen) {
        // Pick a random colour as a starting suggestion
        const palette = ['#6D2932','#3E5C6B','#4A5A48','#6B4E71','#8A6642','#55746B','#33302E'];
        document.getElementById('new-char-color').value = palette[Math.floor(Math.random() * palette.length)];
        document.getElementById('new-char-name').value   = '';
        document.getElementById('new-char-role').value   = '';
        document.getElementById('new-char-region').value = '';
        panel.style.display = 'flex';
        resizeCanvas();
        document.getElementById('new-char-name').focus();
    }
});

document.getElementById('btn-confirm-add').addEventListener('click', function() {
    const name = document.getElementById('new-char-name').value.trim();
    if (!name) { document.getElementById('new-char-name').focus(); return; }
    const role   = document.getElementById('new-char-role').value.trim();
    const region = document.getElementById('new-char-region').value.trim();
    const color  = document.getElementById('new-char-color').value;
    const wx = snap((canvas.width  / 2 - viewX) / viewZoom);
    const wy = snap((canvas.height / 2 - viewY) / viewZoom);
    characters.push({ id: nextId++, name, role, region, x: wx, y: wy, color });
    saveToStorage();
    document.getElementById('add-char-panel').style.display = 'none';
    resizeCanvas(); draw();
});

// Allow Enter key to confirm from any field in the add panel
['new-char-name','new-char-role','new-char-region'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', function(e) {
        if (e.key === 'Enter') document.getElementById('btn-confirm-add').click();
        if (e.key === 'Escape') document.getElementById('btn-cancel-add').click();
    });
});

document.getElementById('btn-cancel-add').addEventListener('click', function() {
    document.getElementById('add-char-panel').style.display = 'none';
    resizeCanvas();
});

// Toolbar: Link Mode ----------------------------------------------------
document.getElementById('btn-link').addEventListener('click', function() {
    linkMode = !linkMode;
    linkSource = null;
    this.style.background = linkMode ? '#333' : '';
    this.style.color      = linkMode ? '#fff' : '';
    document.getElementById('mode-hint').textContent = linkMode ? 'Click two characters to link them' : '';
});

// Toolbar: Shape Button -------------------------------------------
document.getElementById('btn-shapes').addEventListener('click', function() {
    // Toggle: if shape panel is already open in picker mode, close it
    const panel = document.getElementById('shape-panel');
    if (panel.style.display === 'flex' &&
        document.getElementById('shape-type-picker').style.display !== 'none') {
        closeShapePanel();
        return;
    }
    exitShapeMode();
    openShapePickerPanel();
    this.classList.add('btn-active');
});

function openShapePickerPanel() {
    const panel = document.getElementById('shape-panel');
    document.getElementById('shape-type-picker').style.display  = 'flex';
    document.getElementById('shape-edit-fields').style.display  = 'none';
    document.getElementById('shape-panel-title').textContent    = 'Add Shape';
    document.getElementById('shape-draw-hint').style.display    = 'none';

    // Clear active state on all type buttons
    document.querySelectorAll('.shape-type-btn').forEach(b => b.classList.remove('btn-active'));

    panel.style.display = 'flex';
    document.getElementById('edit-panel').style.display  = 'none';
    document.getElementById('link-panel').style.display  = 'none';
    resizeCanvas(); draw();
}

// Shape type tile clicks
document.querySelectorAll('.shape-type-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
        const type = this.dataset.type;
        const hints = {
            rect:     'Drag on canvas to draw a rectangle',
            ellipse:  'Drag on canvas to draw an ellipse',
            triangle: 'Drag on canvas to draw a triangle',
            line:     'Drag on canvas to draw a line / arrow',
            text:     'Click on canvas to place a text note'
        };

        // Toggle off if already active
        if (addShapeMode === type) {
            exitShapeMode();
            document.querySelectorAll('.shape-type-btn').forEach(b => b.classList.remove('btn-active'));
            document.getElementById('shape-draw-hint').style.display = 'none';
            return;
        }

        exitShapeMode();
        addShapeMode = type;
        canvas.style.cursor = 'crosshair';
        linkMode = false;

        document.querySelectorAll('.shape-type-btn').forEach(b => b.classList.remove('btn-active'));
        this.classList.add('btn-active');

        const hintEl = document.getElementById('shape-draw-hint');
        hintEl.textContent    = hints[type] || '';
        hintEl.style.display  = 'block';
    });
});

document.getElementById('btn-cancel-shape-picker').addEventListener('click', function() {
    exitShapeMode();
    closeShapePanel();
});

function exitShapeMode() {
    addShapeMode = null; shapeDrawStart = null;
    canvas.style.cursor = 'grab';
    document.getElementById('btn-shapes').classList.remove('btn-active');
    document.querySelectorAll('.shape-type-btn').forEach(b => b.classList.remove('btn-active'));
    const hintEl = document.getElementById('shape-draw-hint');
    if (hintEl) hintEl.style.display = 'none';
    const h = document.getElementById('mode-hint');
    if (h && h.textContent !== 'Saved') h.textContent = '';
}

// Edit Panel ------------------------------------------------
const editPanel  = document.getElementById('edit-panel');
const editName   = document.getElementById('edit-name');
const editRole   = document.getElementById('edit-role');
const editRegion = document.getElementById('edit-region');
const editNote   = document.getElementById('edit-note');

function openEditPanel(character) {
    selected        = character;
    editName.value  = character.name;
    editRole.value  = character.role;
    editRegion.value = character.region || '';
    editNote.value  = character.note   || '';
    document.getElementById('edit-color').value = character.color || '#6D2932';
    editPanel.style.display  = 'flex';
    document.getElementById('shape-panel').style.display = 'none';
    document.getElementById('link-panel').style.display  = 'none';
    resizeCanvas(); draw();
    renderSidebarList();
}

function closeEditPanel() {
    selected = null;
    editPanel.style.display = 'none';
    resizeCanvas();
    renderSidebarList();
}

document.getElementById('btn-save-edit').addEventListener('click', function() {
    if (!selected) return;
    selected.name   = editName.value.trim()   || selected.name;
    selected.role   = editRole.value.trim()   || selected.role;
    selected.region = editRegion.value.trim() || selected.region;
    selected.note   = editNote.value;
    selected.color  = document.getElementById('edit-color').value;
    saveToStorage(); closeEditPanel();
});

document.getElementById('btn-delete').addEventListener('click', function() {
    if (!selected) return;
    const id = selected.id;
    avatarCache.delete(id);
    characters    = characters.filter(c => c.id !== id);
    relationships = relationships.filter(r => r.from !== id && r.to !== id);
    saveToStorage(); closeEditPanel();
});

document.getElementById('btn-cancel').addEventListener('click', closeEditPanel);

// Colour swatches
document.addEventListener('click', function(e) {
    if (!e.target.classList.contains('color-swatch')) return;
    const color  = e.target.dataset.color;
    const target = e.target.dataset.target;
    if (target === 'shape') {
        document.getElementById('shape-color').value = color;
        if (selectedShape) { selectedShape.color = color; draw(); }
    } else if (target === 'new-char') {
        document.getElementById('new-char-color').value = color;
    } else {
        document.getElementById('edit-color').value = color;
        if (selected) { selected.color = color; draw(); }
    }
});

document.getElementById('edit-color').addEventListener('input', function() {
    if (selected) { selected.color = this.value; draw(); }
});

// Link Panel ------------------------------------------------
const linkPanel      = document.getElementById('link-panel');
const linkTypeInput  = document.getElementById('link-type');
const linkPanelTitle = document.getElementById('link-panel-title');

function openLinkPanel(charA, charB) {
    const existing = relationships.find(r =>
        (r.from === charA.id && r.to === charB.id) ||
        (r.from === charB.id && r.to === charA.id));
    editingLink      = existing || { from: charA.id, to: charB.id, label:'', type:'friend' };
    linkParticipants = [charA, charB];
    linkPanelTitle.textContent  = charA.name + ' ↔ ' + charB.name;
    linkTypeInput.value         = editingLink.type || 'acquaintance';
    linkPanel.style.display     = 'flex';
    editPanel.style.display     = 'none';
    document.getElementById('shape-panel').style.display = 'none';
    resizeCanvas(); draw();
}

function closeLinkPanel() {
    linkPanel.style.display = 'none';
    editingLink = null; linkSource = null; linkMode = false; linkParticipants = [];
    document.getElementById('btn-link').style.background = '';
    document.getElementById('btn-link').style.color      = '';
    document.getElementById('mode-hint').textContent     = '';
    resizeCanvas(); draw();
}

document.getElementById('btn-save-link').addEventListener('click', function() {
    if (!editingLink) return;
    const type  = linkTypeInput.value;
    const label = type.charAt(0).toUpperCase() + type.slice(1);
    const exists = relationships.find(r =>
        (r.from === editingLink.from && r.to === editingLink.to) ||
        (r.from === editingLink.to   && r.to === editingLink.from));
    if (exists) { exists.label = label; exists.type = type; }
    else relationships.push({ from: editingLink.from, to: editingLink.to, label, type });
    saveToStorage(); closeLinkPanel();
});

document.getElementById('btn-delete-link').addEventListener('click', function() {
    if (!editingLink) return;
    relationships = relationships.filter(r =>
        !((r.from === editingLink.from && r.to === editingLink.to) ||
          (r.from === editingLink.to   && r.to === editingLink.from)));
    saveToStorage(); closeLinkPanel();
});

document.getElementById('btn-cancel-link').addEventListener('click', closeLinkPanel);

// Shape Panel -----------------------------------------------
const shapePanel = document.getElementById('shape-panel');

function openShapePanel(sh) {
    document.getElementById('shape-label').value    = sh.label    || '';
    document.getElementById('shape-color').value    = sh.color    || '#6D2932';
    document.getElementById('shape-style').value    = sh.type     || 'rect';
    document.getElementById('shape-fontsize').value = sh.fontSize || 18;

    const titles = { text:'Text Note', line:'Line', triangle:'Triangle',
                     ellipse:'Ellipse', rect:'Rectangle' };
    document.getElementById('shape-panel-title').textContent = titles[sh.type] || 'Shape';

    // Arrow toggle: Only visible for line shapes
    const arrowRow = document.getElementById('arrow-toggle-row');
    if (sh.type === 'line') {
        arrowRow.style.display = 'block';
        document.getElementById('shape-arrow').checked = sh.arrow !== false;
    } else {
        arrowRow.style.display = 'none';
    }

    // Show edit fields, hide picker
    document.getElementById('shape-type-picker').style.display  = 'none';
    document.getElementById('shape-edit-fields').style.display  = 'flex';

    shapePanel.style.display = 'flex';
    document.getElementById('edit-panel').style.display  = 'none';
    document.getElementById('link-panel').style.display  = 'none';
    resizeCanvas(); draw();
}

function closeShapePanel() {
    shapePanel.style.display = 'none';
    selectedShape = null;
    document.getElementById('btn-shapes').classList.remove('btn-active');
    resizeCanvas(); draw();
}

document.getElementById('btn-save-shape').addEventListener('click', function() {
    if (!selectedShape) return;
    selectedShape.label    = document.getElementById('shape-label').value;
    selectedShape.color    = document.getElementById('shape-color').value;
    selectedShape.type     = document.getElementById('shape-style').value;
    selectedShape.fontSize = parseInt(document.getElementById('shape-fontsize').value) || 18;
    if (selectedShape.type === 'line') {
        selectedShape.arrow = document.getElementById('shape-arrow').checked;
    }
    saveToStorage(); closeShapePanel();
});

document.getElementById('btn-delete-shape').addEventListener('click', function() {
    if (!selectedShape) return;
    shapes = shapes.filter(s => s.id !== selectedShape.id);
    saveToStorage(); closeShapePanel();
});

document.getElementById('btn-cancel-shape').addEventListener('click', closeShapePanel);

document.getElementById('shape-color').addEventListener('input', function() {
    if (selectedShape) { selectedShape.color = this.value; draw(); }
});

document.getElementById('shape-arrow').addEventListener('change', function() {
    if (selectedShape && selectedShape.type === 'line') {
        selectedShape.arrow = this.checked;
        draw();
    }
});

// Export ----------------------------
document.getElementById('btn-export').addEventListener('click', function() {
    const data = { characters, relationships, nextId, shapes, nextShapeId };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'character_map.json';
    a.click();
    URL.revokeObjectURL(a.href);
});

// Import ----------------------------
document.getElementById('btn-import').addEventListener('click', () => document.getElementById('file-input').click());

document.getElementById('file-input').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
        try {
            const data = JSON.parse(ev.target.result);
            characters    = data.characters    || [];
            relationships = data.relationships || [];
            nextId        = data.nextId        || 1;
            shapes        = data.shapes        || [];
            nextShapeId   = data.nextShapeId   || 1;
            saveToStorage(); draw();
        } catch { alert('Could not load file.'); }
    };
    reader.readAsText(file);
    this.value = '';
});

// Storage ----------------------------
function saveToStorage() {
    localStorage.setItem('characterMap', JSON.stringify(
        { characters, relationships, nextId, shapes, nextShapeId }
    ));
    const hint = document.getElementById('mode-hint');
    hint.textContent = 'Saved';
    hint.style.color = '#B08D57';
    setTimeout(() => { if (hint.textContent === 'Saved') hint.textContent = ''; }, 1500);
    renderSidebarList();
}

function loadFromStorage() {
    const raw = localStorage.getItem('characterMap');
    if (!raw) return;
    try {
        const data = JSON.parse(raw);
        characters    = data.characters    || [];
        relationships = data.relationships || [];
        nextId        = data.nextId        || 1;
        shapes        = data.shapes        || [];
        nextShapeId   = data.nextShapeId   || 1;
        draw();
        renderSidebarList();
    } catch (err) { console.error('Failed to load map:', err); }
}

// Sidebar: character register-------------------------------
function centerOnCharacter(c) {
    viewX = canvas.width  / 2 - c.x * viewZoom;
    viewY = canvas.height / 2 - c.y * viewZoom;
    draw();
}

function selectCharacterFromSidebar(c) {
    clearMultiSelection();
    openEditPanel(c);
    centerOnCharacter(c);
    closeSidebarDrawer();
}

function renderSidebarList() {
    const listEl   = document.getElementById('char-list');
    const countEl  = document.getElementById('char-count');
    const searchEl = document.getElementById('char-search');
    if (!listEl || !countEl) return;

    const q = (searchEl && searchEl.value || '').trim().toLowerCase();
    const items = characters.filter(c => {
        if (!q) return true;
        return (c.name   || '').toLowerCase().includes(q) ||
               (c.role   || '').toLowerCase().includes(q) ||
               (c.region || '').toLowerCase().includes(q);
    });

    countEl.textContent = characters.length + ' in register';
    listEl.innerHTML = '';

    if (items.length === 0) {
        const p = document.createElement('p');
        p.className = 'sidebar-empty';
        p.textContent = characters.length === 0 ? 'No characters yet.' : 'No matches.';
        listEl.appendChild(p);
        return;
    }

    items.forEach(c => {
        const row = document.createElement('div');
        row.className = 'char-row' + (selected && selected.id === c.id ? ' active' : '');
        row.tabIndex  = 0;
        row.setAttribute('role', 'button');
        row.dataset.id = c.id;

        const avatar = document.createElement('div');
        avatar.className = 'char-avatar';
        if (c.avatar) {
            avatar.style.backgroundImage = 'url("' + c.avatar + '")';
            avatar.style.backgroundSize = 'cover';
            avatar.style.backgroundPosition = 'center';
        } else {
            avatar.style.background = c.color || '#6D2932';
            avatar.textContent = (c.name || '?').charAt(0).toUpperCase();
        }

        const info = document.createElement('div');
        info.className = 'char-row-info';
        const nameEl = document.createElement('div');
        nameEl.className = 'char-row-name';
        nameEl.textContent = c.name || 'Unnamed';
        const roleEl = document.createElement('div');
        roleEl.className = 'char-row-role';
        roleEl.textContent = c.role || '';
        info.appendChild(nameEl);
        info.appendChild(roleEl);

        const dot = document.createElement('span');
        dot.className = 'char-row-dot';

        row.appendChild(avatar);
        row.appendChild(info);
        row.appendChild(dot);

        row.addEventListener('click', () => selectCharacterFromSidebar(c));
        row.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCharacterFromSidebar(c); }
        });

        listEl.appendChild(row);
    });
}

document.getElementById('char-search').addEventListener('input', renderSidebarList);

// Mobile sidebar drawer ---------------------------------------------------------
function closeSidebarDrawer() { document.body.classList.remove('sidebar-open'); }

// Hamburger: toggles the character register on every screen size
function updateMenuButtonState() {
    const btn    = document.getElementById('btn-menu');
    const mobile = window.innerWidth <= 900;
    const open   = mobile ? document.body.classList.contains('sidebar-open')
                          : !document.body.classList.contains('sidebar-collapsed');
    btn.setAttribute('aria-expanded', open);
    btn.setAttribute('aria-label', open ? 'Hide character register' : 'Show character register');
}

function toggleCharacterRegister() {
    if (window.innerWidth <= 900) {
        // Mobile: opens the slide-in drawer
        document.body.classList.remove('sidebar-collapsed');
        document.body.classList.toggle('sidebar-open');
    } else {
        // Desktop: collapses / expands the register inline
        document.body.classList.remove('sidebar-open');
        document.body.classList.toggle('sidebar-collapsed');
        setTimeout(function() { resizeCanvas(); }, 240);
    }
    updateMenuButtonState();
}

document.getElementById('btn-menu').addEventListener('click', toggleCharacterRegister);
document.getElementById('sidebar-backdrop').addEventListener('click', closeSidebarDrawer);

window.addEventListener('resize', function() {
    if (window.innerWidth <= 900) {
        document.body.classList.remove('sidebar-collapsed');
    } else {
        document.body.classList.remove('sidebar-open');
        resizeCanvas();
    }
    updateMenuButtonState();
});

updateMenuButtonState();

// Mobile panel backdrop (bottom-sheet dimmer)------------------------------------
const __panelIds = ['add-char-panel', 'edit-panel', 'link-panel', 'shape-panel'];

function updatePanelBodyClass() {
    const anyOpen = __panelIds.some(id => {
        const el = document.getElementById(id);
        return el && el.style.display === 'flex';
    });
    document.body.classList.toggle('panel-open', anyOpen);
}

const __panelObserver = new MutationObserver(updatePanelBodyClass);
__panelIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) __panelObserver.observe(el, { attributes: true, attributeFilter: ['style'] });
});
updatePanelBodyClass();

function closeAnyOpenPanel() {
    if (document.getElementById('edit-panel').style.display === 'flex')       { closeEditPanel(); }
    else if (document.getElementById('link-panel').style.display === 'flex')  { closeLinkPanel(); }
    else if (document.getElementById('shape-panel').style.display === 'flex') { exitShapeMode(); closeShapePanel(); }
    else if (document.getElementById('add-char-panel').style.display === 'flex') { document.getElementById('btn-cancel-add').click(); }
}
document.getElementById('panel-backdrop').addEventListener('click', closeAnyOpenPanel);

// Character Sheet -------------------------------------------------------
const RELATIONSHIP_TYPES = [
    'friend', 'ally', 'enemy', 'family', 'lovers', 'married',
    'siblings', 'child', 'rival', 'acquaintance', 'mentor'
];

let sheetCharacter = null;
let sheetPendingAvatar = null; // data URL, '' (remove) or null (untouched)

function relTypeLabel(t) {
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

// Resize + compress an uploaded image 
function fileToAvatar(file, maxSize) {
    maxSize = maxSize || 256;
    return new Promise(function(resolve, reject) {
        const reader = new FileReader();
        reader.onload = function(ev) {
            const img = new Image();
            img.onload = function() {
                const scale  = Math.min(1, maxSize / Math.max(img.width, img.height));
                const w = Math.max(1, Math.round(img.width  * scale));
                const h = Math.max(1, Math.round(img.height * scale));
                const cvs = document.createElement('canvas');
                cvs.width = w;
                cvs.height = h;
                cvs.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(cvs.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = function() { reject(new Error('Could not decode image')); };
            img.src = ev.target.result;
        };
        reader.onerror = function() { reject(new Error('Could not read file')); };
        reader.readAsDataURL(file);
    });
}

function updateSheetAvatarPreview() {
    const preview = document.getElementById('sheet-avatar-preview');
    const avatar  = sheetPendingAvatar !== null ? sheetPendingAvatar
                                                 : (sheetCharacter && sheetCharacter.avatar);
    if (avatar) {
        preview.style.backgroundImage = 'url("' + avatar + '")';
        preview.style.backgroundSize = 'cover';
        preview.style.backgroundPosition = 'center';
        preview.textContent = '';
    } else {
        preview.style.backgroundImage = '';
        preview.style.background = (sheetCharacter && sheetCharacter.color) || '#6D2932';
        preview.textContent = (sheetCharacter && sheetCharacter.name ? sheetCharacter.name.charAt(0) : '?').toUpperCase();
    }
}

// simple text-list rows (Likes / Dislikes)
function addSheetListRow(container, value, placeholder) {
    const row = document.createElement('div');
    row.className = 'sheet-list-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder || '...';
    if (value) input.value = value;

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'sheet-list-del';
    del.textContent = '✕';
    del.title = 'Remove';
    del.setAttribute('aria-label', 'Remove');

    row.appendChild(input);
    row.appendChild(del);
    container.appendChild(row);

    del.addEventListener('click', function() {
        row.remove();
        if (container.querySelectorAll('.sheet-list-row').length === 0) {
            addSheetListRow(container, '', placeholder);
        }
    });
}

function buildSheetList(containerId, values, placeholder) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    const list = values && values.length ? values : [''];
    list.forEach(function(v) { addSheetListRow(container, v, placeholder); });
}

function collectSheetList(containerId) {
    const nodes = document.querySelectorAll('#' + containerId + ' .sheet-list-row input');
    return Array.from(nodes).map(function(i) { return i.value.trim(); }).filter(Boolean);
}

// Relationship rows (type + name)
function addSheetRelRow(container, rel) {
    rel = rel || {};
    const row = document.createElement('div');
    row.className = 'sheet-list-row sheet-rel-row';

    const sel = document.createElement('select');
    RELATIONSHIP_TYPES.forEach(function(t) {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = relTypeLabel(t);
        if (t === (rel.type || 'friend')) opt.selected = true;
        sel.appendChild(opt);
    });

    const name = document.createElement('input');
    name.type = 'text';
    name.placeholder = 'Character name';
    if (rel.name) name.value = rel.name;

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'sheet-list-del';
    del.textContent = '✕';
    del.title = 'Remove';
    del.setAttribute('aria-label', 'Remove');

    row.appendChild(sel);
    row.appendChild(name);
    row.appendChild(del);
    container.appendChild(row);

    del.addEventListener('click', function() {
        row.remove();
        if (container.querySelectorAll('.sheet-rel-row').length === 0) {
            addSheetRelRow(container, {});
        }
    });
}

function buildSheetRels(rels) {
    const container = document.getElementById('sheet-relationships');
    container.innerHTML = '';
    const list = rels && rels.length ? rels : [{}];
    list.forEach(function(r) { addSheetRelRow(container, r); });
}

function collectSheetRels() {
    const rows = document.querySelectorAll('#sheet-relationships .sheet-rel-row');
    return Array.from(rows).map(function(r) {
        const sel   = r.querySelector('select');
        const input = r.querySelector('input');
        return { type: sel ? sel.value : 'friend', name: input ? input.value.trim() : '' };
    }).filter(function(r) { return r.name; });
}

function openCharacterSheet(c) {
    sheetCharacter = c;
    const field = {
        'sheet-name':       c.name || '',
        'sheet-age':        c.age || '',
        'sheet-pronouns':   c.pronouns || '',
        'sheet-role':       c.role || '',
        'sheet-region':     c.region || '',
        'sheet-note':       c.note || '',
        'sheet-physical':   c.physicalTraits || '',
        'sheet-features':   c.distinctiveFeatures || '',
        'sheet-trait1':     (c.traits || [])[0] || '',
        'sheet-trait2':     (c.traits || [])[1] || '',
        'sheet-trait3':     (c.traits || [])[2] || '',
        'sheet-strengths':  c.strengths || '',
        'sheet-weaknesses': c.weaknesses || '',
        'sheet-motivation': c.motivation || '',
        'sheet-obstacle':   c.obstacle || '',
        'sheet-fear':       c.fear || '',
        'sheet-backstory':  c.backstory || '',
        'sheet-growth':     c.growth || ''
    };
    Object.keys(field).forEach(function(id) {
        document.getElementById(id).value = field[id];
    });

    buildSheetList('sheet-likes',    c.likes,    "Likes...");
    buildSheetList('sheet-dislikes', c.dislikes, "Dislikes...");
    buildSheetRels(c.relationships);

    sheetPendingAvatar = null;
    updateSheetAvatarPreview();

    document.getElementById('sheet-overlay').style.display = 'flex';
    document.getElementById('sheet-name').focus();
    resizeCanvas();
}

function closeCharacterSheet() {
    sheetCharacter = null;
    sheetPendingAvatar = null;
    document.getElementById('sheet-overlay').style.display = 'none';
    resizeCanvas();
}

function saveCharacterSheet() {
    if (!sheetCharacter) return;
    const c = sheetCharacter;
    c.name                 = document.getElementById('sheet-name').value.trim()     || c.name;
    c.age                  = document.getElementById('sheet-age').value.trim();
    c.pronouns             = document.getElementById('sheet-pronouns').value.trim();
    c.role                 = document.getElementById('sheet-role').value.trim()     || c.role;
    c.region               = document.getElementById('sheet-region').value.trim()   || c.region;
    c.note                 = document.getElementById('sheet-note').value;
    c.physicalTraits       = document.getElementById('sheet-physical').value.trim();
    c.distinctiveFeatures  = document.getElementById('sheet-features').value.trim();
    c.traits = [
        document.getElementById('sheet-trait1').value.trim(),
        document.getElementById('sheet-trait2').value.trim(),
        document.getElementById('sheet-trait3').value.trim()
    ].filter(Boolean);
    c.strengths     = document.getElementById('sheet-strengths').value.trim();
    c.weaknesses    = document.getElementById('sheet-weaknesses').value.trim();
    c.likes         = collectSheetList('sheet-likes');
    c.dislikes      = collectSheetList('sheet-dislikes');
    c.motivation    = document.getElementById('sheet-motivation').value.trim();
    c.obstacle      = document.getElementById('sheet-obstacle').value.trim();
    c.fear          = document.getElementById('sheet-fear').value.trim();
    c.relationships = collectSheetRels();
    c.backstory     = document.getElementById('sheet-backstory').value.trim();
    c.growth        = document.getElementById('sheet-growth').value.trim();

    if (sheetPendingAvatar !== null) {
        if (sheetPendingAvatar) {
            c.avatar = sheetPendingAvatar;
            avatarCache.delete(c.id);
        } else {
            delete c.avatar;
            avatarCache.delete(c.id);
        }
    }

    // keep the existing edit panel in sync
    document.getElementById('edit-name').value   = c.name;
    document.getElementById('edit-role').value   = c.role;
    document.getElementById('edit-region').value = c.region;

    saveToStorage();
    closeCharacterSheet();
    draw();
}

document.getElementById('btn-add-sheet').addEventListener('click', function() {
    if (!selected) {
        document.getElementById('mode-hint').textContent = 'Select a character first';
        return;
    }
    openCharacterSheet(selected);
});

document.getElementById('btn-close-sheet').addEventListener('click',  closeCharacterSheet);
document.getElementById('btn-close-sheet-2').addEventListener('click', closeCharacterSheet);
document.getElementById('btn-save-sheet').addEventListener('click',   saveCharacterSheet);
document.getElementById('btn-print-sheet').addEventListener('click',  function() { window.print(); });

document.getElementById('btn-add-like').addEventListener('click', function() {
    addSheetListRow(document.getElementById('sheet-likes'), '', "What they like...");
});
document.getElementById('btn-add-dislike').addEventListener('click', function() {
    addSheetListRow(document.getElementById('sheet-dislikes'), '', "What they don't like...");
});
document.getElementById('btn-add-rel').addEventListener('click', function() {
    addSheetRelRow(document.getElementById('sheet-relationships'), {});
});

// Portrait upload / removal
document.getElementById('btn-upload-portrait').addEventListener('click', function() {
    document.getElementById('sheet-portrait-input').click();
});

document.getElementById('sheet-portrait-input').addEventListener('change', function() {
    const file = this.files[0];
    this.value = '';
    if (!file) return;
    fileToAvatar(file).then(function(dataUrl) {
        sheetPendingAvatar = dataUrl;
        updateSheetAvatarPreview();
        document.getElementById('mode-hint').textContent = 'Portrait ready – press Save';
        document.getElementById('mode-hint').style.color = '#B08D57';
        setTimeout(function() {
            if (document.getElementById('mode-hint').textContent === 'Portrait ready – press Save') {
                document.getElementById('mode-hint').textContent = '';
            }
        }, 2000);
    }).catch(function() {
        document.getElementById('mode-hint').textContent = 'Could not load image';
    });
});

document.getElementById('btn-clear-portrait').addEventListener('click', function() {
    sheetPendingAvatar = '';
    updateSheetAvatarPreview();
});

// Escape closes the sheet overlay
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeCharacterSheet();
});
