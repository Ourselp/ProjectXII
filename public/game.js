// Dofus 3 world walk-around: WebGL map renderer (all maps) + skinned character, click to move, map changes, music.
// modules are imported with the same ?v= as this file (index.html adds a fresh one per load: no caching for now)
const V = new URL(import.meta.url).search;
const { loadRig, loadSkin, drawRig, colorsOf, BUST } = await import('./rig.js' + V);
const { setupLook, buildLook } = await import('./look.js' + V);
const { setupHud, chat, nameAt, onCommand, toggle, makeWindow } = await import('./hud.js' + V);
const { setupWorldMap } = await import('./worldmap.js' + V);

const cv = document.getElementById('c');
const gl = cv.getContext('webgl', { premultipliedAlpha: true, alpha: false });
// cell grid in map units: 14 x 40 Dofus 2 grid of 86 x 43 diamonds centred on the map (1204 x 860)
const W = 86, H = 43, X0 = -602 + 43, Y0 = 430;
const WALK = 3.2, RUN = 7;                            // cells per second
const cellXY = c => { const r = Math.floor(c / 14), col = c % 14; return [X0 + (col + (r % 2) / 2) * W, Y0 - r * H / 2]; };
const info = document.getElementById('place');

// ---------- sprite renderer: textured quad, ARGB tint (0x80 = neutral), optional wind bend
const prog = (() => {
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(o); return o; };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, `attribute vec2 q; uniform mat3 m; uniform vec2 res; uniform vec3 wind; uniform float time; varying vec2 uv;
    void main(){ vec2 a = q;
      // wind: x offset growing above the bend start (quad space, y down: -0.5 = top)
      float h = clamp((wind.x - a.y) / (wind.x + .5), 0., 1.); a.x += sin(time * 1.6 + wind.z) * wind.y * h * h;
      vec3 w = m * vec3(a, 1.); gl_Position = vec4(w.xy / res * vec2(2.,-2.) + vec2(-1.,1.), 0., 1.); uv = q + .5; }`));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, `precision mediump float; uniform sampler2D t; uniform vec4 tint; varying vec2 uv;
    void main(){ vec4 c = texture2D(t, uv); c.rgb *= tint.rgb * c.a; c *= tint.a; gl_FragColor = c; }`));
  gl.linkProgram(p); return p;
})();
const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-.5, -.5, .5, -.5, -.5, .5, .5, .5]), gl.STATIC_DRAW);
const U = {}; for (const n of ['m', 'res', 'tint', 'wind', 'time']) U[n] = gl.getUniformLocation(prog, n);

const tex = new Map();  // gfxId -> Promise<{t, w, h} | null>, then the resolved value
function loadTex(g) {
  if (tex.has(g)) return tex.get(g);
  const p = new Promise(r => { const img = new Image(); img.onerror = () => r(null); img.onload = () => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    r({ t, w: img.width, h: img.height }); }; img.src = `gfx/${g}.png${BUST}`; });
  tex.set(g, p); return p;
}

const cam = { x: 0, y: 0, z: 1 };
let time = 0;
const sx = x => (x - cam.x) * cam.z + cv.width / 2, sy = y => (cam.y - y) * cam.z + cv.height / 2;
function beginSprites() {
  gl.useProgram(prog); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  const l = gl.getAttribLocation(prog, 'q'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
  gl.uniform2f(U.res, cv.width, cv.height); gl.uniform1f(U.time, time); gl.uniform3f(U.wind, 0, 0, 0);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
}
// Unity BlendMode enum -> GL factor
const BF = [gl.ZERO, gl.ONE, gl.DST_COLOR, gl.SRC_COLOR, gl.ONE_MINUS_DST_COLOR, gl.SRC_ALPHA, gl.ONE_MINUS_SRC_COLOR, gl.DST_ALPHA, gl.ONE_MINUS_DST_ALPHA, gl.SRC_ALPHA_SATURATE, gl.ONE_MINUS_SRC_ALPHA];
const TAU = Math.PI * 2;
function group(g) {
  const [, blend, fx, els] = g;
  if (blend) gl.blendFunc(BF[blend[0]], BF[blend[1]]);
  els.forEach((e, i) => sprite(e, fx, i));
  if (blend) gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
}
// fx (see maps_build.js): r rotation [cx, cy, freq, amp°, offset°], s scale [ax, ay, freq, amp], t translation [dx, dy, freq, amp, offset],
// c colour animation [finalColor, freq], d dissolve alpha clip, w wind [bendStartY (cells), flexibility, multiplier]
function sprite([g, x, y, scx, scy, rot, col], fx, i) {
  const T = tex.get(g); if (!T || !T.t) return;
  const ph = (i * 2.399) % TAU; // per-element phase
  let w = T.w * scx, h = T.h * scy;
  if (fx) {
    if (fx.t) { const k = fx.t[4] + fx.t[3] * Math.sin(TAU * fx.t[2] * time + ph); x += fx.t[0] * k; y += fx.t[1] * k; }
    if (fx.s) { const k = fx.s[3] * Math.sin(TAU * fx.s[2] * time + ph); w *= 1 + k * fx.s[0]; h *= 1 + k * fx.s[1]; }
    if (fx.r) { const d = fx.r[4] + fx.r[3] * Math.sin(TAU * fx.r[2] * time + ph), a = d * Math.PI / 180;
      // rotate around the shader's rotation centre (element-local px, y up)
      const cx = fx.r[0] * scx, cy = fx.r[1] * scy; x += cx - (cx * Math.cos(a) - cy * Math.sin(a)); y += cy - (cx * Math.sin(a) + cy * Math.cos(a)); rot += d; }
    if (fx.c) { const k = (1 + Math.sin(TAU * fx.c[1] * time + ph)) / 2, f = fx.c[0] >>> 0;
      col = [24, 16, 8, 0].reduce((acc, s) => acc + Math.round((col >>> s & 255) * (1 - k) + (f >>> s & 255) * k) * 2 ** s, 0); }
    if (fx.d) col = (Math.round((col >>> 24) * Math.max(0, 1 - fx.d) ** 2) * 2 ** 24 + (col & 0xffffff)) >>> 0; // dissolve: ~ share of noise above alphaClip
    if (fx.w) gl.uniform3f(U.wind, -(fx.w[0] * W) / Math.abs(T.h * scy), fx.w[1] * fx.w[2] / 86 * 6 / Math.abs(T.w * scx), ph);
  }
  const a = -rot * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a), z = cam.z;
  w *= z; h *= z;
  gl.uniformMatrix3fv(U.m, false, [cs * w, sn * w, 0, -sn * h, cs * h, 0, sx(x), sy(y), 1]);
  gl.uniform4f(U.tint, (col >> 16 & 255) / 128, (col >> 8 & 255) / 128, (col & 255) / 128, (col >>> 24) / 255);
  gl.bindTexture(gl.TEXTURE_2D, T.t); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  if (fx && fx.w) gl.uniform3f(U.wind, 0, 0, 0);
}

// ---------- audio: map music + ambience (looped stems), starts after the first click (autoplay policy)
const audio = { idx: null, playing: {}, muted: localStorage.muted === '1', started: false };
const vol = kind => (+(localStorage['vol_' + kind] ?? (kind === 'music' ? 45 : 35))) / 100;
for (const kind of ['music', 'amb']) {
  const el = document.getElementById('vol-' + kind); el.value = vol(kind) * 100;
  el.oninput = () => { localStorage['vol_' + kind] = el.value; audio.playing[kind]?.els.forEach(a => a.volume = vol(kind)); };
}
async function playLayer(kind, event) {
  if (!audio.idx) audio.idx = await fetch('audio/index.json' + BUST, { cache: 'no-store' }).then(r => r.json()).catch(() => ({}));
  const cur = audio.playing[kind];
  if (cur && cur.event === event) return;
  if (cur) cur.els.forEach(a => { const v0 = a.volume; let k = 1; const iv = setInterval(() => { k -= .1; a.volume = Math.max(0, v0 * k); if (k <= 0) { a.pause(); clearInterval(iv); } }, 80); });
  const els = (audio.idx[event] || []).map(f => { const a = new Audio(`audio/${f}${BUST}`); a.loop = true; a.volume = vol(kind); a.muted = audio.muted; return a; });
  audio.playing[kind] = { event, els };
  if (audio.started) els.forEach(a => a.play().catch(() => {}));
}
function startAudio() { if (audio.started) return; audio.started = true; Object.values(audio.playing).forEach(p => p.els.forEach(a => a.play().catch(() => {}))); }
const muteBtn = document.getElementById('mute'), muteLabel = () => muteBtn.textContent = audio.muted ? '🔇' : '🔊';
muteBtn.onclick = () => { audio.muted = !audio.muted; localStorage.muted = audio.muted ? '1' : '0'; Object.values(audio.playing).forEach(p => p.els.forEach(a => a.muted = audio.muted)); startAudio(); muteLabel(); };
muteLabel();

// ---------- map
let map, mapIndex, hero, loading = false, map0;
const rigs = new Map(); // animated map elements: gfxId -> rig
async function enterMap(id, cell) {
  if (loading) return; loading = true;
  info.textContent = 'Chargement…';
  try {
    const m = await (await fetch(`maps/${id}.json${BUST}`, { cache: 'no-store' })).json();
    const used = [...m.back, ...m.mid, ...m.fore].flatMap(g => g[3]).map(e => e[0]);
    await Promise.all([...used.map(loadTex), ...m.anim.map(async e => { if (!rigs.has(e[0])) rigs.set(e[0], await loadRig(gl, e[0])); })]);
    for (const g of used) tex.set(g, await tex.get(g));
    // free textures the new map doesn't use (ponytail: no prefetch of neighbours, add if map changes feel slow)
    const keep = new Set(used);
    for (const [g, T] of tex) if (!keep.has(g)) { const v = await T; if (v && v.t) gl.deleteTexture(v.t); tex.delete(g); }
    // depth list: middleground groups + animated elements, by cell (the hero is inserted while drawing)
    m.depth = [...m.mid, ...m.anim.map(e => [e[7], 0, 0, [e], true])].sort((a, b) => a[0] - b[0]);
    // art bounds (background layer, ignoring stretched overlays) for the camera
    const A = { x0: GRID.l, x1: GRID.r, y0: GRID.b, y1: GRID.t };
    for (const g of m.back) for (const [gid, x, y, scx, scy] of g[3]) {
      const T = tex.get(gid); if (!T || Math.abs(scx) > 2.5 || Math.abs(scy) > 2.5) continue;
      const w = T.w * Math.abs(scx) / 2, h = T.h * Math.abs(scy) / 2;
      A.x0 = Math.min(A.x0, x - w); A.x1 = Math.max(A.x1, x + w); A.y0 = Math.min(A.y0, y - h); A.y1 = Math.max(A.y1, y + h);
    }
    m.art = A; hovered = null; hero.action = null; camY = null;
    map = m;
    monsters = []; spawnMonsters(m);
    if (cell == null || !(m.cells[cell] & 1)) cell = nearestWalkable(cell ?? 300);
    [hero.x, hero.y] = cellXY(cell); hero.cell = cell; hero.path = [];
    info.innerHTML = `<b>${m.name || '?'}</b><small>[${m.pos}] · carte ${m.id}</small>`;
    if (map0 !== m.id) chat(`${m.name || 'Carte'} [${m.pos}]`, 'map'); map0 = m.id;
    history.replaceState(null, '', `?map=${m.id}&cell=${cell}`);
    playLayer('music', m.music); playLayer('amb', m.amb);
  } catch (e) { info.textContent = `Carte ${id} introuvable`; console.error(e); }
  loading = false;
}
function nearestWalkable(c) {
  const [x, y] = cellXY(c); let best = -1, bd = 1e9;
  map.cells.forEach((v, i) => { if (v & 1) { const [a, b] = cellXY(i), d = (a - x) ** 2 + (b - y) ** 2; if (d < bd) { bd = d; best = i; } } });
  return best < 0 ? c : best;
}

// ---------- pathfinding on the diamond grid (8 directions, Dofus style); coords: X2 = 2*col + row%2, row
const toXR = c => { const r = Math.floor(c / 14); return [2 * (c % 14) + (r % 2), r]; };
const fromXR = (x, r) => (r < 0 || r >= 40 || (x - (r % 2)) % 2 || x < 0 || x > 27) ? -1 : r * 14 + (x - (r % 2)) / 2;
const DIRS = [[2, 0], [1, 1], [0, 2], [-1, 1], [-2, 0], [-1, -1], [0, -2], [1, -1]]; // index = Dofus direction 0..7
function findPath(from, to) {
  if (!(map.cells[to] & 1)) return [];
  const prev = new Map([[from, -1]]), q = [from];
  for (let i = 0; i < q.length && !prev.has(to); i++) {     // ponytail: BFS (uniform cost), A* if paths look odd
    const [x, r] = toXR(q[i]);
    for (const [dx, dr] of DIRS) { const n = fromXR(x + dx, r + dr); if (n >= 0 && !prev.has(n) && map.cells[n] & 1) { prev.set(n, q[i]); q.push(n); } }
  }
  if (!prev.has(to)) return [];
  const path = []; for (let c = to; c !== from; c = prev.get(c)) path.unshift(c); return path;
}

// ---------- input
const toWorld = e => { const r = cv.getBoundingClientRect(), px = (e.clientX - r.left) * devicePixelRatio, py = (e.clientY - r.top) * devicePixelRatio;
  return [(px - cv.width / 2) / cam.z + cam.x, cam.y - (py - cv.height / 2) / cam.z]; };
function cellAt(wx, wy) {
  let best = -1, bd = 1e9;
  for (let i = 0; i < 560; i++) { const [x, y] = cellXY(i), d = Math.abs(wx - x) / W + Math.abs(wy - y) / H; if (d < bd) { bd = d; best = i; } }
  return bd <= 0.5 ? best : -1;
}
// outside the cell grid: which side (0 top, 1 bottom, 2 left, 3 right) the point is beyond, or -1
const GRID = { l: X0 - W / 2, r: X0 + 13.5 * W + W / 2, t: Y0 + H / 2, b: Y0 - 39 * H / 2 - H / 2 };
function sideAt(wx, wy) {
  const over = [wy - GRID.t, GRID.b - wy, GRID.l - wx, wx - GRID.r];
  const m = Math.max(...over); return m > 0 ? over.indexOf(m) : -1;
}
// exits on a side: edge cells whose map-change bits point that way and whose neighbour exists
const sideExits = side => map.nb[side] > 0 && mapIndex[map.nb[side]] ? map.cells.map((v, i) => i).filter(i => (map.cells[i] & 1) && exitSides(i).includes(side)) : [];
// exit cursors: green arrow (own SVG) pointing to the side (top, bottom, left, right)
const arrow = deg => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><g transform="rotate(${deg} 16 16)"><polygon points="16,3 29,16 21,16 21,29 11,29 11,16 3,16" fill="#46d64f" stroke="#0a3a10" stroke-width="2" stroke-linejoin="round"/></g></svg>`)}") 16 16, pointer`;
const CURSOR = [arrow(0), arrow(180), arrow(270), arrow(90)];
// ---------- interactive elements (zaap, doors, resources…): hover highlight, click = walk next to it then act
// Which element is what is server data: zaaps are recognised by their sprite (data/zaaps.json, tools/extract/zaaps.js);
// any other element leads to the maps sharing these coordinates (interiors / exits), if there are some.
let hovered = null, camY = null, zaaps = { gfx: [], list: [] };
function rigBox(r) { // bounds of the rig's default animation, first frame (rig units, y up)
  if (r.box) return r.box;
  const b = [1e9, 1e9, -1e9, -1e9];
  for (const [n, a, bb, tx, c, d, ty] of (r.anims[r.def] || Object.values(r.anims)[0] || [])[0] || []) { const p = r.parts[r.nodes[n]]; if (!p) continue;
    for (let k = 0; k < p.v.length; k += 5) { const X = a * p.v[k] + bb * p.v[k + 1] + tx, Y = c * p.v[k] + d * p.v[k + 1] + ty; b[0] = Math.min(b[0], X); b[1] = Math.min(b[1], Y); b[2] = Math.max(b[2], X); b[3] = Math.max(b[3], Y); } }
  return r.box = b[0] < 1e9 ? b : [-40, 0, 40, 100];
}
function interAt(wx, wy) {
  let best = null, area = 1e12;
  for (const it of map.inter || []) {
    const [g, x, y, scx, scy, , , anim] = it; let x0, x1, y0, y1;
    if (anim) { const r = rigs.get(g); if (!r) continue; const [a, b, c, d] = rigBox(r), s = Math.abs(scx); [x0, x1] = scx < 0 ? [x - c * s, x - a * s] : [x + a * s, x + c * s]; [y0, y1] = [y + b * s, y + d * s]; }
    else { const T = tex.get(g); if (!T || !T.t) continue; const w = T.w * Math.abs(scx) / 2, h = T.h * Math.abs(scy) / 2; [x0, x1, y0, y1] = [x - w, x + w, y - h, y + h]; }
    const ar = (x1 - x0) * (y1 - y0);
    if (wx >= x0 && wx <= x1 && wy >= y0 && wy <= y1 && ar < area) { best = it; area = ar; }
  }
  return best;
}
async function interact(it) {
  if (zaaps.gfx.includes(it[0])) return openZaap();
  const [x, y] = mapIndex[map.id], others = Object.entries(mapIndex).filter(([id, p]) => +id !== map.id && p[0] === x && p[1] === y).map(([id]) => +id);
  if (!others.length) return chat('Rien à faire ici pour l\'instant.', 'warn');
  const names = await Promise.all(others.map(id => fetch(`maps/${id}.json${BUST}`, { cache: 'no-store' }).then(r => r.json()).then(m => m.name).catch(() => '')));
  const body = makeWindow('enter', 'Entrer');
  body.innerHTML = `<div class="form">${others.map((id, i) => `<button data-id="${id}">${names[i] || 'Carte'} · ${id}</button>`).join('')}</div>`;
  body.onclick = e => { const b = e.target.closest('[data-id]'); if (b) { toggle('enter', false); enterMap(+b.dataset.id); } };
  toggle('enter', true);
}
function openZaap() {
  const body = makeWindow('zaap', 'Zaap');
  body.innerHTML = `<div class="form" style="max-height:60vh;overflow:auto;min-width:300px">${zaaps.list.filter(z => z.mapId !== map.id)
    .map(z => `<button data-id="${z.mapId}" style="text-align:left">${z.name} <small style="opacity:.7">[${z.pos}]</small></button>`).join('')}</div>`;
  body.onclick = e => { const b = e.target.closest('[data-id]'); if (b) { toggle('zaap', false); enterMap(+b.dataset.id); } };
  toggle('zaap', true);
}
// walk to the closest reachable walkable cell around the element's cell, then act
function goTo(it, then) {
  const [tx, ty] = cellXY(it[5] >= 0 ? it[5] : cellAt(it[1], it[2]));
  const cells = map.cells.map((v, i) => i).filter(i => map.cells[i] & 1).sort((a, b) => { const [ax, ay] = cellXY(a), [bx, by] = cellXY(b); return Math.hypot(ax - tx, ay - ty) - Math.hypot(bx - tx, by - ty); });
  for (const c of cells.slice(0, 30)) {
    const p = c === hero.cell ? [] : findPath(hero.cell, c);
    if (p.length || c === hero.cell) { hero.path = p; hero.run = p.length > 3; if (p.length) hero.action = then; else then(); return; }
  }
  chat('Impossible de s\'en approcher.', 'warn');
}

cv.addEventListener('mousemove', e => {
  if (!map) return;
  const [wx, wy] = toWorld(e), side = sideAt(wx, wy);
  hoveredMon = side < 0 ? monsterAt(wx, wy) : null;
  hovered = side < 0 && !hoveredMon ? interAt(wx, wy) : null;
  monTip.hidden = !hoveredMon;
  if (hoveredMon) { monTip.innerHTML = `<b>${hoveredMon.name}</b> · niveau ${hoveredMon.lvl}`; monTip.style.left = e.clientX + 14 + 'px'; monTip.style.top = e.clientY - 10 + 'px'; }
  cv.style.cursor = hovered || hoveredMon ? 'pointer' : side < 0 ? (cellAt(wx, wy) >= 0 ? 'pointer' : 'default') : sideExits(side).length ? CURSOR[side] : 'not-allowed';
});
cv.addEventListener('click', e => {
  startAudio();
  if (!map || loading) return;
  const [wx, wy] = toWorld(e), c = cellAt(wx, wy);
  hero.exitSide = -1; hero.action = null;
  const mo = sideAt(wx, wy) < 0 && monsterAt(wx, wy);
  if (mo) return chat(`${mo.name} (niveau ${mo.lvl}) : les combats arrivent bientôt.`, 'info');
  const it = sideAt(wx, wy) < 0 && interAt(wx, wy);
  if (it) return goTo(it, () => interact(it));
  if (c >= 0) { hero.path = findPath(hero.cell, c); hero.run = hero.path.length > 3; return; }
  // click beyond an edge: walk to the closest reachable exit on that side, then change map
  const side = sideAt(wx, wy); if (side < 0) return;
  const exits = sideExits(side).sort((a, b) => { const [ax, ay] = cellXY(a), [bx, by] = cellXY(b); return Math.hypot(ax - wx, ay - wy) - Math.hypot(bx - wx, by - wy); });
  for (const x of exits) {
    const p = x === hero.cell ? [] : findPath(hero.cell, x);
    if (p.length || x === hero.cell) { hero.exitSide = side; hero.path = p; hero.run = p.length > 3; if (!p.length) leave(x); return; }
  }
  chat(exits.length ? 'Impossible d\'atteindre la sortie de ce côté.' : 'Pas de sortie de ce côté.', 'warn');
});

// leaving the map: an edge cell with map-change data takes the neighbour on that side (top, bottom, left, right)
// mapChangeData = direction bits (1 E, 2 SE, 4 S, 8 SW, 16 W, 32 NW, 64 N, 128 NE)
function exitSides(c) {
  if (!(map.cells[c] & 2)) return [];
  const [x, r] = toXR(c), b = map.cells[c] >> 8, s = [];
  if (b & 64 || (r <= 1 && b & 160)) s.push(0);
  if (b & 4 || (r >= 38 && b & 10)) s.push(1);
  if (b & 16 || (x <= 1 && b & 40)) s.push(2);
  if (b & 1 || (x >= 26 && b & 130)) s.push(3);
  return s;
}
const ARRIVE = [c => c + 532, c => c - 532, c => c + 13, c => c - 13]; // appear on the opposite side
function leave(c) {
  const sides = exitSides(c).filter(s => map.nb[s] > 0 && mapIndex[map.nb[s]]);
  const side = sides.includes(hero.exitSide) ? hero.exitSide : sides[0];
  hero.exitSide = -1;
  if (side != null) enterMap(map.nb[side], ARRIVE[side](c));
}

// teleport: "x,y" (world coordinates, main world preferred) or a map id — /tp in the chat, box in the world map window
function teleport(v) {
  startAudio(); v = v.trim(); const m = v.match(/^\[?\s*(-?\d+)\s*[,; ]\s*(-?\d+)\s*\]?$/);
  let id = null;
  if (m) {
    const hits = Object.entries(mapIndex).filter(([, p]) => p[0] === +m[1] && p[1] === +m[2]);
    hits.sort((a, b) => (b[1][3] === 1) - (a[1][3] === 1));
    id = hits[0]?.[0];
  } else if (mapIndex[v]) id = v;
  if (id) { toggle('map', false); enterMap(id); } else chat(`Aucune carte pour « ${v} »`, 'warn');
}
onCommand('tp', teleport);
document.getElementById('go').addEventListener('submit', e => { e.preventDefault(); teleport(e.target.q.value); });

// ---------- loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
  const cw = Math.round(cv.clientWidth * devicePixelRatio), ch = Math.round(cv.clientHeight * devicePixelRatio);
  if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
  gl.viewport(0, 0, cv.width, cv.height);
  if (map) { update(dt); render(); }
  requestAnimationFrame(frame);
}
function update(dt) {
  hero.t += dt;
  if (loading) return;
  updateMonsters(dt);
  if (!hero.path.length) { if (hero.moving) { hero.moving = false; hero.t = 0; } return; }
  if (!hero.moving) { hero.moving = true; hero.t = 0; }
  const next = hero.path[0], [tx, ty] = cellXY(next), dx = tx - hero.x, dy = ty - hero.y, dist = Math.hypot(dx, dy);
  const [x0, r0] = toXR(hero.cell), [x1, r1] = toXR(next);
  hero.dir = DIRS.findIndex(([a, b]) => a === x1 - x0 && b === r1 - r0);
  const step = (hero.run ? RUN : WALK) * W * 0.6 * dt;
  if (dist <= step) {
    hero.x = tx; hero.y = ty; hero.cell = next; hero.path.shift();
    if (!hero.path.length) { const act = hero.action; hero.action = null; if (act) act(); else leave(next); }
  } else { hero.x += dx / dist * step; hero.y += dy / dist * step; }
}
function drawHero() {
  const L = look; if (!L?.ready) return;
  // stored directions 0,1,2,5,6; 3,4,7 are mirrors of 1,0,5
  const mirror = { 3: 1, 4: 0, 7: 5 }, d = mirror[hero.dir] ?? hero.dir, flip = hero.dir in mirror;
  const [rig, anim] = hero.moving ? [L.move, (hero.run ? 'AnimCourse_' : 'AnimMarche_') + d] : [L.idle, 'AnimStatiqueExplo0_' + d];
  drawRig(gl, rig, L.skins, anim, Math.floor(hero.t * rig.fps), sx(hero.x), sy(hero.y), L.scale * cam.z, flip, L.cols, undefined, L.hideHair);
  nameAt(sx(hero.x) / devicePixelRatio, (sy(hero.y) - 190 * L.scale * cam.z) / devicePixelRatio); // ~ head top
}
function highlight(it) { // hovered interactive: redraw it additively (glow)
  const [g, x, y, scx, scy, , , anim] = it;
  if (anim) { const r = rigs.get(g); if (r) drawRig(gl, r, [], r.def, Math.floor(time * r.fps), sx(x), sy(y), Math.abs(scx) * cam.z, scx < 0, undefined, [.5, .5, .5, .35]); beginSprites(); }
  else { beginSprites(); gl.blendFunc(gl.ONE, gl.ONE); sprite([g, x, y, scx, scy, 0, 0x50ffffff], 0, 0); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); }
}
function drawAnimated(e) { // animated map element = rig playing its default animation in a loop
  const r = rigs.get(e[0]); if (!r) return;
  const col = e[6] >>> 0, tint = [(col >> 16 & 255) / 128, (col >> 8 & 255) / 128, (col & 255) / 128, (col >>> 24) / 255];
  drawRig(gl, r, [], r.def, Math.floor(time * r.fps), sx(e[1]), sy(e[2]), Math.abs(e[3]) * cam.z, e[3] < 0, undefined, tint);
}
// ---------- monsters: groups of the subarea's monsters (data/monsters.json) on walkable cells, idling and wandering.
// Spawn positions are server data in the game; here they are seeded by the map id (same layout on every visit).
let MON = null, monsters = [], hoveredMon = null;
const monLooks = new Map();
async function monLook(id) {
  if (monLooks.has(id)) return monLooks.get(id);
  const [, bone, skinIds, colors, scale] = MON.mon[id];
  const p = (async () => {
    const skins = (await Promise.all(skinIds.map(s => loadSkin(gl, s)))).filter(Boolean);
    const base = { skins, cols: colorsOf(colors), scale: scale / 100 };
    if (bone === 1) { const [move, idle] = await Promise.all([loadRig(gl, '1-movement'), loadRig(gl, '1-static')]); return move && idle && { ...base, move, idle, walk: 'AnimMarche', still: 'AnimStatiqueExplo0', scale: base.scale * .55 }; }
    const r = await loadRig(gl, bone); return r && { ...base, move: r, idle: r, walk: 'AnimMarche', still: 'AnimStatique' };
  })();
  monLooks.set(id, p); return p;
}
// animation name for a direction: stored directions vary per rig; 3, 4, 7 can be mirrors of 1, 0, 5
function animFor(rig, base, dir) {
  if (rig.anims[`${base}_${dir}`]) return [`${base}_${dir}`, false];
  const m = { 3: 1, 4: 0, 7: 5, 1: 3, 0: 4, 5: 7 }[dir];
  if (m != null && rig.anims[`${base}_${m}`]) return [`${base}_${m}`, true];
  const any = Object.keys(rig.anims).find(a => a.startsWith(base + '_')) || Object.keys(rig.anims)[0];
  return [any, false];
}
async function spawnMonsters(m) {
  monsters = []; hoveredMon = null;
  MON ??= await fetch('data/monsters.json' + BUST, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ sub: {}, mon: {} }));
  const ids = MON.sub[mapIndex[m.id]?.[2]] || []; if (!ids.length) return;
  let seed = (m.id % 2147483646) + 1; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  const free = m.cells.map((v, i) => i).filter(i => (m.cells[i] & 3) === 1 && i !== hero.cell);
  const list = [];
  for (let g = 0, n = 1 + Math.floor(rnd() * 3); g < n && free.length; g++) {
    const c0 = free[Math.floor(rnd() * free.length)], [cx, cy] = cellXY(c0);
    const near = free.filter(c => !list.some(x => x.cell === c)).sort((a, b) => { const [ax, ay] = cellXY(a), [bx, by] = cellXY(b); return Math.hypot(ax - cx, ay - cy) - Math.hypot(bx - cx, by - cy); });
    for (let k = 0, size = 1 + Math.floor(rnd() * 4); k < size && near[k * 2]; k++) {
      const id = ids[Math.floor(rnd() * ids.length)], [name, , , , , lo, hi] = MON.mon[id], cell = near[k * 2], [x, y] = cellXY(cell);
      list.push({ id, name, lvl: lo + Math.floor(rnd() * (hi - lo + 1)), cell, x, y, dir: [1, 3, 5, 7][Math.floor(rnd() * 4)], path: [], t: rnd() * 5, wait: 2 + rnd() * 8, rnd });
    }
  }
  await Promise.all(list.map(async mo => { mo.look = await monLook(mo.id); }));
  if (map === m) monsters = list.filter(mo => mo.look);
}
function updateMonsters(dt) {
  for (const mo of monsters) {
    mo.t += dt;
    if (!mo.path.length) {
      if ((mo.wait -= dt) > 0) continue;
      mo.wait = 4 + mo.rnd() * 8;
      const [cx, cy] = cellXY(mo.cell), opts = map.cells.map((v, i) => i).filter(i => (map.cells[i] & 3) === 1 && Math.hypot(cellXY(i)[0] - cx, cellXY(i)[1] - cy) < W * 2.5 && !monsters.some(o => o !== mo && o.cell === i));
      const to = opts[Math.floor(mo.rnd() * opts.length)]; if (to == null) continue;
      mo.path = findPath(mo.cell, to).slice(0, 5); mo.t = 0; continue;
    }
    const next = mo.path[0], [tx, ty] = cellXY(next), dx = tx - mo.x, dy = ty - mo.y, dist = Math.hypot(dx, dy);
    const [x0, r0] = toXR(mo.cell), [x1, r1] = toXR(next), d = DIRS.findIndex(([a, b]) => a === x1 - x0 && b === r1 - r0); if (d >= 0) mo.dir = d;
    const step = WALK * .8 * W * .6 * dt;
    if (dist <= step) { mo.x = tx; mo.y = ty; mo.cell = next; mo.path.shift(); if (!mo.path.length) mo.t = 0; }
    else { mo.x += dx / dist * step; mo.y += dy / dist * step; }
  }
}
function drawMonster(mo) {
  const L = mo.look, moving = mo.path.length > 0, rig = moving ? L.move : L.idle;
  const [anim, flip] = animFor(rig, moving ? L.walk : L.still, mo.dir);
  drawRig(gl, rig, L.skins, anim, Math.floor(mo.t * rig.fps), sx(mo.x), sy(mo.y), L.scale * cam.z, flip, L.cols);
}
function monsterAt(wx, wy) {
  return monsters.find(mo => { const [a, b, c, d] = rigBox(mo.look.idle), s = mo.look.scale; return wx >= mo.x + a * s && wx <= mo.x + c * s && wy >= mo.y + b * s && wy <= mo.y + d * s; }) || null;
}
const monTip = Object.assign(document.createElement('div'), { className: 'panel', hidden: true });
monTip.style.cssText = 'position:fixed;padding:4px 8px;pointer-events:none;z-index:40;font-size:12px'; document.body.append(monTip);

function render() {
  // camera: show the grid's full height, zoom further only if the screen is wider than the map art (whose edges are
  // jagged / black), then follow the hero vertically. Art bounds are trimmed 4 %: trees overhang the ground edge.
  const A = map.art, tw = (A.x1 - A.x0) * .04;
  const M = { x0: Math.max(A.x0 + tw, GRID.l - 4 * W), x1: Math.min(A.x1 - tw, GRID.r + 4 * W), y0: GRID.b - H, y1: GRID.t + H };
  M.x0 = Math.min(M.x0, GRID.l); M.x1 = Math.max(M.x1, GRID.r);
  cam.z = Math.max(cv.width / (M.x1 - M.x0), cv.height / (M.y1 - M.y0));
  const vw = cv.width / cam.z, vh = cv.height / cam.z, clamp = (v, a, b) => a > b ? (a + b) / 2 : Math.min(Math.max(v, a), b);
  cam.x = clamp(X0 + 6.75 * W, M.x0 + vw / 2, M.x1 - vw / 2);
  const ty = clamp(hero.y, M.y0 + vh / 2, M.y1 - vh / 2);
  camY = camY == null ? ty : camY + (ty - camY) * .08; cam.y = camY;
  const bg = map.bg >>> 0; gl.clearColor((bg >> 16 & 255) / 255, (bg >> 8 & 255) / 255, (bg & 255) / 255, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  beginSprites(); map.back.forEach(group);
  // actors (hero + monsters) are drawn before the first middleground group of a later cell
  const actors = [hero, ...monsters].sort((a, b) => a.cell - b.cell);
  const drawActor = a => { if (a === hero) drawHero(); else drawMonster(a); beginSprites(); };
  let k = 0;
  for (const g of map.depth) {
    while (k < actors.length && actors[k].cell < g[0]) drawActor(actors[k++]);
    if (g[4]) { drawAnimated(g[3][0]); beginSprites(); } else group(g);
  }
  while (k < actors.length) drawActor(actors[k++]);
  map.fore.forEach(group);
  if (hovered) highlight(hovered);
  if (showGrid) drawGrid();
}
// option: cell grid (walkable = teal, exits = green), drawn with the sprite program as thin quads would be overkill: 2D overlay canvas
const ov = document.createElement('canvas'); ov.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none'; document.body.append(ov);
let showGrid = localStorage.grid === '1';
const gridBox = document.getElementById('opt-grid'); gridBox.checked = showGrid;
gridBox.onchange = () => { showGrid = gridBox.checked; localStorage.grid = showGrid ? '1' : '0'; if (!showGrid) ov.getContext('2d').clearRect(0, 0, ov.width, ov.height); };
function drawGrid() {
  if (ov.width !== cv.width || ov.height !== cv.height) { ov.width = cv.width; ov.height = cv.height; ov.style.width = cv.clientWidth + 'px'; ov.style.height = cv.clientHeight + 'px'; }
  const c = ov.getContext('2d'); c.clearRect(0, 0, ov.width, ov.height); c.lineWidth = 1;
  map.cells.forEach((v, i) => { if (!(v & 1)) return; const [x, y] = cellXY(i), X = sx(x), Y = sy(y), w = W / 2 * cam.z, h = H / 2 * cam.z;
    c.beginPath(); c.moveTo(X, Y - h); c.lineTo(X + w, Y); c.lineTo(X, Y + h); c.lineTo(X - w, Y); c.closePath(); c.strokeStyle = v & 2 ? '#46d64fcc' : '#38c9b466'; c.stroke(); });
}

hero = { x: 0, y: 0, cell: 0, dir: 1, t: 0, path: [], moving: false, run: false };
const q = new URLSearchParams(location.search);
let look = null;
await setupHud();
addEventListener('look', async () => { look = await buildLook(gl); });
mapIndex = await fetch('maps/index.json' + BUST, { cache: 'no-store' }).then(r => r.json());
await setupLook();
setupWorldMap(() => map.id, mapIndex, id => { toggle('map', false); startAudio(); enterMap(id); });
zaaps = await fetch('data/zaaps.json' + BUST, { cache: 'no-store' }).then(r => r.json()).catch(() => zaaps);
await enterMap(q.get('map') || 191105026, q.get('cell') != null ? +q.get('cell') : 300);
requestAnimationFrame(frame);
window.game = { hero, get map() { return map; }, findPath, enterMap, cellXY, audio, startAudio, sx, sy };
