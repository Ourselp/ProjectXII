// World map window (#win-map): every map position of a world, coloured by area; drag to pan, wheel to zoom, click to teleport.
// Data: data/world.json (tools/extract/worldmap.js). Opened by the window system (hud.js fires a 'window' event).
let W, cv, ctx, state = { cells: [], byPos: new Map(), s: 10, ox: 0, oy: 0 }, getCurrent, mapIndex, onTeleport;
const $ = s => document.querySelector(s);
const hue = a => (a * 137.508) % 360;

export function setupWorldMap(current, index, teleport) {
  getCurrent = current; mapIndex = index; onTeleport = teleport;
  cv = $('#wm-canvas'); ctx = cv.getContext('2d');
  addEventListener('window', e => { if (e.detail === 'map') open(); });
  addEventListener('resize', () => { if (!$('#win-map').hidden) { fit(); draw(); } });
  $('#wm-world').onchange = e => show(+e.target.value);
  let drag = null;
  cv.onpointerdown = e => { drag = { x: e.clientX, y: e.clientY, ox: state.ox, oy: state.oy, moved: false }; cv.setPointerCapture(e.pointerId); };
  cv.onpointermove = e => {
    if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true; state.ox = drag.ox + dx; state.oy = drag.oy + dy; }
    state.hover = at(e); draw(); tip(e);
  };
  cv.onpointerup = e => { const d = drag; drag = null; if (d && !d.moved) { const h = at(e); if (h) onTeleport(h[2]); } };
  cv.onpointerleave = () => { state.hover = null; $('#wm-tip').hidden = true; draw(); };
  cv.onwheel = e => {
    e.preventDefault(); const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, k = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    const s = Math.min(80, Math.max(3, state.s * k)); state.ox = mx - (mx - state.ox) * s / state.s; state.oy = my - (my - state.oy) * s / state.s; state.s = s; draw();
  };
}
async function open() {
  if (!W) {
    W = await fetch('data/world.json?v=' + Date.now(), { cache: 'no-store' }).then(r => r.json());
    $('#wm-world').innerHTML = W.worlds.map(w => `<option value="${w.id}">${w.name} (${w.n})</option>`).join('');
  }
  const id = getCurrent(), [x, y, , world] = mapIndex[id] || [0, 0, 0, 1];
  state.current = +id;
  requestAnimationFrame(() => show(W.cells[world] ? world : 1, W.cells[world] ? [x, y] : null)); // after the window is laid out
}
const fit = () => { cv.width = cv.clientWidth; cv.height = cv.clientHeight; };
function at(e) {
  const r = cv.getBoundingClientRect(), x = Math.floor((e.clientX - r.left - state.ox) / state.s), y = Math.floor((e.clientY - r.top - state.oy) / state.s);
  return state.byPos.get(`${x},${y}`) || null;
}
function tip(e) {
  const t = $('#wm-tip'), h = state.hover; if (!h) { t.hidden = true; return; }
  const [sub, area] = W.subs[h[3]] || ['?', -1];
  t.innerHTML = `<b>${W.areas[area] || ''}</b><br>${sub} [${h[0]},${h[1]}]`; t.hidden = false;
  const r = $('#win-map').getBoundingClientRect(); t.style.left = e.clientX - r.left + 14 + 'px'; t.style.top = e.clientY - r.top + 14 + 'px';
}
function show(world, center) {
  const cells = W.cells[world] || [];
  Object.assign(state, { world, cells, byPos: new Map(cells.map(c => [`${c[0]},${c[1]}`, c])) });
  $('#wm-world').value = world; fit();
  const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]), [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  state.s = center ? 22 : Math.max(3, Math.min(40, Math.min(cv.width / (x1 - x0 + 3), cv.height / (y1 - y0 + 3))));
  const [cx, cy] = center || [(x0 + x1) / 2, (y0 + y1) / 2];
  state.ox = cv.width / 2 - (cx + .5) * state.s; state.oy = cv.height / 2 - (cy + .5) * state.s;
  draw();
}
function draw() {
  const { s, ox, oy } = state; ctx.fillStyle = '#0b1016'; ctx.fillRect(0, 0, cv.width, cv.height);
  for (const c of state.cells) {
    const x = ox + c[0] * s, y = oy + c[1] * s; if (x < -s || y < -s || x > cv.width || y > cv.height) continue;
    const area = (W.subs[c[3]] || [])[1] ?? 0, hov = state.hover === c, g = s > 6 ? 1 : 0;
    ctx.fillStyle = `hsl(${hue(area)} ${hov ? 70 : 45}% ${hov ? 62 : 40}%)`; ctx.fillRect(x, y, s - g, s - g);
  }
  if (s >= 10) { // area names at their centroid
    const acc = {}; for (const c of state.cells) { const a = (W.subs[c[3]] || [])[1]; const o = acc[a] ??= [0, 0, 0]; o[0] += c[0]; o[1] += c[1]; o[2]++; }
    ctx.font = `600 ${Math.min(16, s * .6)}px system-ui`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
    for (const [a, [sx, sy, n]] of Object.entries(acc)) if (n >= 6) ctx.fillText(W.areas[a] || '', ox + (sx / n + .5) * s, oy + (sy / n + .5) * s);
    ctx.shadowBlur = 0;
  }
  const me = state.cells.find(c => c[2] === state.current) || (mapIndex[state.current] && state.cells.find(c => c[0] === mapIndex[state.current][0] && c[1] === mapIndex[state.current][1]));
  if (me) { ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 3; ctx.strokeRect(ox + me[0] * s - 1, oy + me[1] * s - 1, s + 1, s + 1); }
}
