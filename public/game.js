// Dofus 3 world walk-around: WebGL map renderer (all maps) + skinned character, click to move, map changes, music.
import { loadRig, drawRig } from './rig.js';
import { setupLook, look } from './look.js';

const cv = document.getElementById('c');
const gl = cv.getContext('webgl', { premultipliedAlpha: true, alpha: false });
// cell grid in map units: 14 x 40 Dofus 2 grid of 86 x 43 diamonds centred on the map (1204 x 860)
const W = 86, H = 43, X0 = -602 + 43, Y0 = 430;
const WALK = 3.2, RUN = 7;                            // cells per second
const cellXY = c => { const r = Math.floor(c / 14), col = c % 14; return [X0 + (col + (r % 2) / 2) * W, Y0 - r * H / 2]; };
const info = document.getElementById('info');

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
    r({ t, w: img.width, h: img.height }); }; img.src = `gfx/${g}.png`; });
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
    if (fx.d) col = ((col >>> 24) * (1 - fx.d) << 24 | col & 0xffffff) >>> 0;
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
async function playLayer(kind, event) {
  if (!audio.idx) audio.idx = await fetch('audio/index.json').then(r => r.json()).catch(() => ({}));
  const cur = audio.playing[kind];
  if (cur && cur.event === event) return;
  if (cur) cur.els.forEach(a => { const v0 = a.volume; let k = 1; const iv = setInterval(() => { k -= .1; a.volume = Math.max(0, v0 * k); if (k <= 0) { a.pause(); clearInterval(iv); } }, 80); });
  const els = (audio.idx[event] || []).map(f => { const a = new Audio(`audio/${f}`); a.loop = true; a.volume = kind === 'music' ? .45 : .35; a.muted = audio.muted; return a; });
  audio.playing[kind] = { event, els };
  if (audio.started) els.forEach(a => a.play().catch(() => {}));
}
function startAudio() { if (audio.started) return; audio.started = true; Object.values(audio.playing).forEach(p => p.els.forEach(a => a.play().catch(() => {}))); }
const muteBtn = document.getElementById('mute'), muteLabel = () => muteBtn.textContent = audio.muted ? '🔇' : '🔊';
muteBtn.onclick = () => { audio.muted = !audio.muted; localStorage.muted = audio.muted ? '1' : '0'; Object.values(audio.playing).forEach(p => p.els.forEach(a => a.muted = audio.muted)); startAudio(); muteLabel(); };
muteLabel();

// ---------- map
let map, mapIndex, hero, loading = false;
const rigs = new Map(); // animated map elements: gfxId -> rig
async function enterMap(id, cell) {
  if (loading) return; loading = true;
  info.textContent = 'Chargement…';
  try {
    const m = await (await fetch(`maps/${id}.json`)).json();
    const used = [...m.back, ...m.mid, ...m.fore].flatMap(g => g[3]).map(e => e[0]);
    await Promise.all([...used.map(loadTex), ...m.anim.map(async e => { if (!rigs.has(e[0])) rigs.set(e[0], await loadRig(gl, e[0])); })]);
    for (const g of used) tex.set(g, await tex.get(g));
    // free textures the new map doesn't use (ponytail: no prefetch of neighbours, add if map changes feel slow)
    const keep = new Set(used);
    for (const [g, T] of tex) if (!keep.has(g)) { const v = await T; if (v && v.t) gl.deleteTexture(v.t); tex.delete(g); }
    // depth list: middleground groups + animated elements, by cell (the hero is inserted while drawing)
    m.depth = [...m.mid, ...m.anim.map(e => [e[7], 0, 0, [e], true])].sort((a, b) => a[0] - b[0]);
    map = m;
    if (cell == null || !(m.cells[cell] & 1)) cell = nearestWalkable(cell ?? 300);
    [hero.x, hero.y] = cellXY(cell); hero.cell = cell; hero.path = [];
    info.textContent = `${m.name || '?'} [${m.pos}] · ${m.id}`;
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
function cellAt(px, py) {
  const wx = (px - cv.width / 2) / cam.z + cam.x, wy = cam.y - (py - cv.height / 2) / cam.z;
  let best = -1, bd = 1e9;
  for (let i = 0; i < 560; i++) { const [x, y] = cellXY(i), d = Math.abs(wx - x) / W + Math.abs(wy - y) / H; if (d < bd) { bd = d; best = i; } }
  return bd <= 0.5 ? best : -1;
}
cv.addEventListener('click', e => {
  startAudio();
  const r = cv.getBoundingClientRect(), c = cellAt((e.clientX - r.left) * devicePixelRatio, (e.clientY - r.top) * devicePixelRatio);
  if (c < 0 || !map || loading) return;
  hero.path = findPath(hero.cell, c); hero.run = hero.path.length > 3;
});

// leaving the map: an edge cell with map-change data takes the neighbour on that side (top, bottom, left, right)
function edgeExit(c) {
  if (!(map.cells[c] & 2)) return null;
  // mapChangeData = direction bits (1 E, 2 SE, 4 S, 8 SW, 16 W, 32 NW, 64 N, 128 NE)
  const [x, r] = toXR(c), b = map.cells[c] >> 8, opts = [];
  if (b & 64 || (r <= 1 && b & 160)) opts.push([0, c + 532]);    // top    -> appear at the bottom
  if (b & 4 || (r >= 38 && b & 10)) opts.push([1, c - 532]);     // bottom -> top
  if (b & 16 || (x <= 1 && b & 40)) opts.push([2, c + 13]);      // left   -> right
  if (b & 1 || (x >= 26 && b & 130)) opts.push([3, c - 13]);     // right  -> left
  return opts.find(([side]) => map.nb[side] > 0 && mapIndex[map.nb[side]]) || null;
}

// teleport box: "x,y" (world coordinates, main world preferred) or a map id
document.getElementById('go').addEventListener('submit', e => {
  e.preventDefault(); startAudio();
  const v = e.target.q.value.trim(), m = v.match(/^\[?\s*(-?\d+)\s*[,; ]\s*(-?\d+)\s*\]?$/);
  let id = null;
  if (m) {
    const hits = Object.entries(mapIndex).filter(([, p]) => p[0] === +m[1] && p[1] === +m[2]);
    hits.sort((a, b) => (b[1][3] === 1) - (a[1][3] === 1));
    id = hits[0]?.[0];
  } else if (mapIndex[v]) id = v;
  if (id) enterMap(id); else info.textContent = `Aucune carte pour « ${v} »`;
});

// ---------- loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
  if (cv.width !== innerWidth * devicePixelRatio || cv.height !== innerHeight * devicePixelRatio) { cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; }
  gl.viewport(0, 0, cv.width, cv.height);
  if (map) { update(dt); render(); }
  requestAnimationFrame(frame);
}
function update(dt) {
  hero.t += dt;
  if (loading) return;
  if (!hero.path.length) { if (hero.moving) { hero.moving = false; hero.t = 0; } return; }
  if (!hero.moving) { hero.moving = true; hero.t = 0; }
  const next = hero.path[0], [tx, ty] = cellXY(next), dx = tx - hero.x, dy = ty - hero.y, dist = Math.hypot(dx, dy);
  const [x0, r0] = toXR(hero.cell), [x1, r1] = toXR(next);
  hero.dir = DIRS.findIndex(([a, b]) => a === x1 - x0 && b === r1 - r0);
  const step = (hero.run ? RUN : WALK) * W * 0.6 * dt;
  if (dist <= step) {
    hero.x = tx; hero.y = ty; hero.cell = next; hero.path.shift();
    if (!hero.path.length) { const ex = edgeExit(next); if (ex) enterMap(map.nb[ex[0]], ex[1]); }
  } else { hero.x += dx / dist * step; hero.y += dy / dist * step; }
}
function drawHero() {
  const L = look(); if (!L.ready) return;
  // stored directions 0,1,2,5,6; 3,4,7 are mirrors of 1,0,5
  const mirror = { 3: 1, 4: 0, 7: 5 }, d = mirror[hero.dir] ?? hero.dir, flip = hero.dir in mirror;
  const [rig, anim] = hero.moving ? [L.move, (hero.run ? 'AnimCourse_' : 'AnimMarche_') + d] : [L.idle, 'AnimStatiqueExplo0_' + d];
  drawRig(gl, rig, L.skins, anim, Math.floor(hero.t * rig.fps), sx(hero.x), sy(hero.y), L.scale * cam.z, flip, L.cols);
}
function drawAnimated(e) { // animated map element = rig playing its default animation in a loop
  const r = rigs.get(e[0]); if (!r) return;
  const col = e[6] >>> 0, tint = [(col >> 16 & 255) / 128, (col >> 8 & 255) / 128, (col & 255) / 128, (col >>> 24) / 255];
  drawRig(gl, r, [], r.def, Math.floor(time * r.fps), sx(e[1]), sy(e[2]), Math.abs(e[3]) * cam.z, e[3] < 0, undefined, tint);
}
function render() {
  // camera: fit the 14x40 cell area (plus a margin) and centre it
  cam.x = X0 + 6.75 * W; cam.y = Y0 - 19.75 * H / 2; cam.z = Math.min(cv.width / 1500, cv.height / 1000);
  const bg = map.bg >>> 0; gl.clearColor((bg >> 16 & 255) / 255, (bg >> 8 & 255) / 255, (bg & 255) / 255, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  beginSprites(); map.back.forEach(group);
  let drawn = false;
  for (const g of map.depth) {
    if (!drawn && g[0] > hero.cell) { drawHero(); beginSprites(); drawn = true; }
    if (g[4]) { drawAnimated(g[3][0]); beginSprites(); } else group(g);
  }
  if (!drawn) { drawHero(); beginSprites(); }
  map.fore.forEach(group);
}

hero = { x: 0, y: 0, cell: 0, dir: 1, t: 0, path: [], moving: false, run: false };
const q = new URLSearchParams(location.search);
[mapIndex] = await Promise.all([fetch('maps/index.json').then(r => r.json()), setupLook(gl)]);
await enterMap(q.get('map') || 191105026, q.get('cell') != null ? +q.get('cell') : 300);
requestAnimationFrame(frame);
window.game = { hero, get map() { return map; }, findPath, enterMap, cellXY, audio, startAudio };
