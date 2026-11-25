// World map window (#win-map): the game's illustrated world map (tiles, public/worldmap/<world>/<n>.jpg) with the map positions
// on top; drag to pan, wheel to zoom, hover = area / subarea / coordinates, click = teleport. Data: data/world.json.
// Image px of map (x, y) = origine + (x, y) * (mapWidth, mapHeight) — from WorldMapsDataRoot.
let W, cv, ctx, getCurrent, mapIndex, onTeleport;
const st = { k: .2, ox: 0, oy: 0, cells: [], byPos: new Map(), tiles: [], img: null };
const $ = s => document.querySelector(s);
const TILE = 1024;

export function setupWorldMap(current, index, teleport) {
  getCurrent = current; mapIndex = index; onTeleport = teleport;
  cv = $('#wm-canvas'); ctx = cv.getContext('2d');
  addEventListener('window', e => { if (e.detail === 'map') open(); });
  addEventListener('resize', () => { if (!$('#win-map').hidden) { fit(); draw(); } });
  $('#wm-world').onchange = e => show(+e.target.value);
  let drag = null;
  cv.onpointerdown = e => { drag = { x: e.clientX, y: e.clientY, ox: st.ox, oy: st.oy, moved: false }; cv.setPointerCapture(e.pointerId); };
  cv.onpointermove = e => {
    if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true; st.ox = drag.ox + dx; st.oy = drag.oy + dy; }
    st.hover = at(e); draw(); tip(e);
  };
  cv.onpointerup = e => { const d = drag; drag = null; if (d && !d.moved) { const h = at(e); if (h) onTeleport(h[2]); } };
  cv.onpointerleave = () => { st.hover = null; $('#wm-tip').hidden = true; draw(); };
  cv.onwheel = e => {
    e.preventDefault(); const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const k = Math.min(2, Math.max(.03, st.k * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
    st.ox = mx - (mx - st.ox) * k / st.k; st.oy = my - (my - st.oy) * k / st.k; st.k = k; draw();
  };
}
async function open() {
  if (!W) {
    W = await fetch('data/world.json?v=' + Date.now(), { cache: 'no-store' }).then(r => r.json());
    $('#wm-world').innerHTML = W.worlds.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
  }
  const id = getCurrent(), [x, y, , world] = mapIndex[id] || [0, 0, 0, 1];
  st.current = +id;
  requestAnimationFrame(() => show(W.cells[world] ? world : 1, W.cells[world] ? [x, y] : null)); // after layout
}
const fit = () => { cv.width = cv.clientWidth; cv.height = cv.clientHeight; };
// world geometry: image px of a map position (top-left corner)
const geo = () => st.img || { w: 0, h: 0, ox: 0, oy: 0, mw: 40, mh: 30 };
const posPx = (x, y) => { const g = geo(); return [g.ox + x * g.mw, g.oy + y * g.mh]; };
function at(e) {
  const r = cv.getBoundingClientRect(), g = geo();
  const ix = (e.clientX - r.left - st.ox) / st.k, iy = (e.clientY - r.top - st.oy) / st.k;
  return st.byPos.get(`${Math.floor((ix - g.ox) / g.mw)},${Math.floor((iy - g.oy) / g.mh)}`) || null;
}
function tip(e) {
  const t = $('#wm-tip'), h = st.hover; if (!h) { t.hidden = true; return; }
  const [sub, area] = W.subs[h[3]] || ['?', -1];
  t.innerHTML = `<b>${W.areas[area] || ''}</b><br>${sub} [${h[0]},${h[1]}]`; t.hidden = false;
  const r = $('#win-map').getBoundingClientRect(); t.style.left = e.clientX - r.left + 14 + 'px'; t.style.top = e.clientY - r.top + 14 + 'px';
}
function show(world, center) {
  const w = W.worlds.find(x => x.id === world), cells = W.cells[world] || [];
  Object.assign(st, { world, cells, byPos: new Map(cells.map(c => [`${c[0]},${c[1]}`, c])), img: w?.img || null });
  $('#wm-world').value = world; fit();
  const g = geo();
  st.tiles = [];
  if (st.img) { // lazy tiles: drawn as they arrive
    const cols = Math.ceil(g.w / TILE), rows = Math.ceil(g.h / TILE);
    for (let n = 1; n <= cols * rows; n++) { const im = new Image(); im.onload = draw; im.src = `worldmap/${world}/${n}.jpg?v=${Date.now()}`; st.tiles.push([im, ((n - 1) % cols) * TILE, Math.floor((n - 1) / cols) * TILE]); }
  }
  // view: centred on the current position at a readable zoom, or the whole image
  const xs = cells.map(c => posPx(c[0], c[1])[0]), ys = cells.map(c => posPx(c[0], c[1])[1]);
  const [x0, x1, y0, y1] = st.img ? [0, g.w, 0, g.h] : [Math.min(...xs), Math.max(...xs) + g.mw, Math.min(...ys), Math.max(...ys) + g.mh];
  st.k = center ? Math.min(1, 8 * 40 / g.mw / 8) : Math.min(cv.width / (x1 - x0), cv.height / (y1 - y0));
  const [cx, cy] = center ? posPx(center[0] + .5, center[1] + .5) : [(x0 + x1) / 2, (y0 + y1) / 2];
  st.ox = cv.width / 2 - cx * st.k; st.oy = cv.height / 2 - cy * st.k;
  draw();
}
function draw() {
  const { k, ox, oy } = st, g = geo();
  ctx.fillStyle = '#0b1016'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.imageSmoothingQuality = 'high';
  for (const [im, x, y] of st.tiles) if (im.complete && im.naturalWidth) ctx.drawImage(im, ox + x * k, oy + y * k, im.naturalWidth * k, im.naturalHeight * k);
  const rect = c => { const [x, y] = posPx(c[0], c[1]); return [ox + x * k, oy + y * k, g.mw * k, g.mh * k]; };
  if (!st.img) for (const c of st.cells) { ctx.fillStyle = '#38c9b455'; ctx.fillRect(...rect(c)); }
  if (st.hover) { ctx.fillStyle = '#ffffff33'; ctx.fillRect(...rect(st.hover)); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(...rect(st.hover)); }
  const p = mapIndex[st.current];
  if (p && st.byPos.has(`${p[0]},${p[1]}`)) { // current position: gold marker
    const [x, y, w, h] = rect(st.byPos.get(`${p[0]},${p[1]}`));
    ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, Math.max(4, Math.min(w, h) / 4), 0, 7); ctx.fill();
  }
}
