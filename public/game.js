// Astrub walk-around: WebGL map renderer (Dofus 3 map data) + skinned character, click to move.
import { loadChar, drawChar } from './char.js';

const cv = document.getElementById('c');
const gl = cv.getContext('webgl', { premultipliedAlpha: true, alpha: false });
const W = 86, H = 43, X0 = -559, Y0 = 430;          // cell grid in map units (fitted on element positions)
const CHAR_SCALE = 0.55, WALK = 3.2, RUN = 7;         // look scale "{1|80||55}", cells per second
const cellXY = c => { const r = Math.floor(c / 14), col = c % 14; return [X0 + (col + (r % 2) / 2) * W, Y0 - r * H / 2]; };

// ---------- sprite renderer: textured quad with ARGB tint (0x80 = neutral)
const prog = (() => {
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, `attribute vec2 q; uniform mat3 m; uniform vec2 res; varying vec2 uv;
    void main(){ vec3 w = m * vec3(q, 1.); gl_Position = vec4(w.xy / res * vec2(2.,-2.) + vec2(-1.,1.), 0., 1.); uv = q + .5; }`));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, `precision mediump float; uniform sampler2D t; uniform vec4 tint; varying vec2 uv;
    void main(){ vec4 c = texture2D(t, uv); c.rgb *= tint.rgb * c.a; c *= tint.a; gl_FragColor = c; }`));
  gl.linkProgram(p); return p;
})();
const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-.5, -.5, .5, -.5, -.5, .5, .5, .5]), gl.STATIC_DRAW);
const U = n => gl.getUniformLocation(prog, n);

const tex = new Map();  // gfxId -> {t, w, h} | null
function loadTex(g) {
  if (tex.has(g)) return tex.get(g);
  const p = new Promise(r => { const img = new Image(); img.onerror = () => r(null); img.onload = () => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    r({ t, w: img.width, h: img.height }); }; img.src = `gfx/${g}.png`; });
  tex.set(g, p); return p;
}

const cam = { x: 0, y: 0, z: 1 };
function beginSprites() {
  gl.useProgram(prog); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  const l = gl.getAttribLocation(prog, 'q'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
  gl.uniform2f(U('res'), cv.width, cv.height); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
}
// Unity BlendMode enum -> GL factor
const BF = [gl.ZERO, gl.ONE, gl.DST_COLOR, gl.SRC_COLOR, gl.ONE_MINUS_DST_COLOR, gl.SRC_ALPHA, gl.ONE_MINUS_SRC_COLOR, gl.DST_ALPHA, gl.ONE_MINUS_DST_ALPHA, gl.SRC_ALPHA_SATURATE, gl.ONE_MINUS_SRC_ALPHA];
function group([, blend, els]) {
  if (blend) gl.blendFunc(BF[blend[0]], BF[blend[1]]);
  els.forEach(sprite);
  if (blend) gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
}
function sprite([g, x, y, sx, sy, rot, col]) {
  const T = tex.get(g); if (!T || !T.t) return;
  const a = -rot * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a), z = cam.z;
  const w = T.w * sx * z, h = T.h * sy * z, px = (x - cam.x) * z + cv.width / 2, py = (cam.y - y) * z + cv.height / 2;
  gl.uniformMatrix3fv(U('m'), false, [cs * w, sn * w, 0, -sn * h, cs * h, 0, px, py, 1]);
  gl.uniform4f(U('tint'), (col >> 16 & 255) / 128, (col >> 8 & 255) / 128, (col & 255) / 128, (col >>> 24) / 255);
  gl.bindTexture(gl.TEXTURE_2D, T.t); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// ---------- map
let map, mapIndex, hero, ch;
async function enterMap(id, cell) {
  const m = await (await fetch(`maps/${id}.json`)).json();
  const used = [...[...m.back, ...m.mid, ...m.fore].flatMap(g => g[2]), ...m.anim].map(e => e[0]);
  await Promise.all(used.map(async g => tex.set(g, await loadTex(g))));
  // free textures the new map doesn't use (ponytail: no prefetch of neighbours, add if map changes feel slow)
  const keep = new Set(used);
  for (const [g, T] of tex) if (!keep.has(g)) { if (T && T.t) gl.deleteTexture(T.t); tex.delete(g); }
  // depth list: middleground groups + animated elements + hero, by cell
  m.depth = [...m.mid, ...m.anim.map(e => [e[7], 0, [e]])].sort((a, b) => a[0] - b[0]);
  map = m;
  if (!(m.cells[cell] & 1)) cell = nearestWalkable(cell);
  [hero.x, hero.y] = cellXY(cell); hero.cell = cell; hero.path = [];
  document.getElementById('info').textContent = `Astrub [${m.pos}] · map ${m.id}`;
}
function nearestWalkable(c) {
  const [x, y] = cellXY(c); let best = -1, bd = 1e9;
  map.cells.forEach((v, i) => { if (v & 1) { const [a, b] = cellXY(i), d = (a - x) ** 2 + (b - y) ** 2; if (d < bd) { bd = d; best = i; } } });
  return best;
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

// ---------- input: click a cell
function cellAt(sx, sy) {
  const wx = (sx - cv.width / 2) / cam.z + cam.x, wy = cam.y - (sy - cv.height / 2) / cam.z;
  let best = -1, bd = 1e9;
  for (let i = 0; i < 560; i++) { const [x, y] = cellXY(i), d = Math.abs(wx - x) / W + Math.abs(wy - y) / H; if (d < bd) { bd = d; best = i; } }
  return bd <= 0.5 ? best : -1;
}
cv.addEventListener('click', e => {
  const r = cv.getBoundingClientRect(), c = cellAt((e.clientX - r.left) * devicePixelRatio, (e.clientY - r.top) * devicePixelRatio);
  if (c < 0 || !map) return;
  hero.path = findPath(hero.cell, c); hero.run = hero.path.length > 3;
});

// leaving the map: walking onto an edge cell that has map-change data takes the matching neighbour
function edgeExit(c) {
  if (!(map.cells[c] & 2)) return null;
  const [x, r] = toXR(c);
  if (r <= 1) return [0, c + 532];            // top    -> appear at the bottom
  if (r >= 38) return [1, c - 532];           // bottom -> top
  if (x <= 1) return [2, c + 13];             // left   -> right
  if (x >= 26) return [3, c - 13];            // right  -> left
  return null;
}

// ---------- loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (cv.width !== innerWidth * devicePixelRatio || cv.height !== innerHeight * devicePixelRatio) { cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; }
  gl.viewport(0, 0, cv.width, cv.height);
  if (map) { update(dt); render(); }
  requestAnimationFrame(frame);
}
function update(dt) {
  hero.t += dt;
  if (!hero.path.length) { if (hero.moving) { hero.moving = false; hero.t = 0; } return; }
  if (!hero.moving) { hero.moving = true; hero.t = 0; }
  const next = hero.path[0], [tx, ty] = cellXY(next), dx = tx - hero.x, dy = ty - hero.y, dist = Math.hypot(dx, dy);
  const [x0, r0] = toXR(hero.cell), [x1, r1] = toXR(next);
  hero.dir = DIRS.findIndex(([a, b]) => a === x1 - x0 && b === r1 - r0);
  const step = (hero.run ? RUN : WALK) * W * 0.6 * dt;
  if (dist <= step) {
    hero.x = tx; hero.y = ty; hero.cell = next; hero.path.shift();
    if (!hero.path.length) { const ex = edgeExit(next); if (ex && mapIndex[map.nb[ex[0]]]) enterMap(map.nb[ex[0]], ex[1]); }
  } else { hero.x += dx / dist * step; hero.y += dy / dist * step; }
}
function render() {
  // camera: fit the 14x40 cell area (plus a margin) and centre it
  cam.x = X0 + 6.75 * W; cam.y = Y0 - 19.75 * H / 2; cam.z = Math.min(cv.width / 1500, cv.height / 1000);
  const bg = map.bg >>> 0; gl.clearColor((bg >> 16 & 255) / 255, (bg >> 8 & 255) / 255, (bg & 255) / 255, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  beginSprites(); map.back.forEach(group);
  let drawn = false;
  const drawHero = () => {
    // stored directions 0,1,2,5,6; 3,4,7 are mirrors of 1,0,5
    const mirror = { 3: 1, 4: 0, 7: 5 }, d = mirror[hero.dir] ?? hero.dir, flip = hero.dir in mirror;
    const anim = hero.moving ? (hero.run ? 'AnimCourse_' : 'AnimMarche_') + d : 'AnimStatiqueExplo0_' + d;
    drawChar(gl, ch, anim, Math.floor(hero.t * ch.fps), (hero.x - cam.x) * cam.z + cv.width / 2, (cam.y - hero.y) * cam.z + cv.height / 2, CHAR_SCALE * cam.z, flip);
    beginSprites(); drawn = true;
  };
  for (const g of map.depth) { if (!drawn && g[0] > hero.cell) drawHero(); group(g); }
  if (!drawn) drawHero();
  map.fore.forEach(group);
}

hero = { x: 0, y: 0, cell: 0, dir: 1, t: 0, path: [], moving: false, run: false };
[ch, mapIndex] = await Promise.all([loadChar(gl, 'char/iop.json'), fetch('maps/index.json').then(r => r.json())]);
await enterMap(new URLSearchParams(location.search).get('map') || 191105026, 300);
requestAnimationFrame(frame);
window.game = { hero, get map() { return map; }, findPath, enterMap };
