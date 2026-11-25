// Client menus at runtime: layouts converted by tools/extract/uitk.js (public/ui/uitk/layouts/<name>.html), shown in a layer
// scaled like the client's PanelSettings (reference 1920x1080, "shrink": zoom = max(w / 1920, h / 1080) * 0.9).
// Windows (WindowFigma) open on top, centred; HUD widgets (MagneticDragWindow) stay below them, where the player dragged them.
const V = new URL(import.meta.url).search;
const css = h => document.head.insertAdjacentHTML('beforeend', `<link rel="stylesheet" href="${h}${V}">`);
css('uitk-client.css'); css('uitk-controls.css');

const layer = document.createElement('div');
layer.className = 'uitk-root'; layer.id = 'uitk-layer';
layer.style.cssText = 'position:fixed;left:0;top:0;z-index:30;pointer-events:none;display:block';
document.body.append(layer);
const zoom = () => parseFloat(layer.style.zoom) || 1;
function fit() {
  const z = Math.max(innerWidth / 1920, innerHeight / 1080) * 0.9;
  Object.assign(layer.style, { zoom: z, width: innerWidth / z + 'px', height: innerHeight / z + 'px' });
  for (const w of layer.querySelectorAll('.mdw')) clamp(w);
}
addEventListener('resize', fit); fit();
// the page never scrolls (focusing or dragging near a window edge can scroll <html> even with overflow:hidden)
document.addEventListener('scroll', () => { const e = document.scrollingElement; if (e.scrollTop || e.scrollLeft || document.body.scrollTop) e.scrollTop = e.scrollLeft = document.body.scrollTop = 0; }, true);

async function mount(name) {
  const html = await fetch(`ui/uitk/layouts/${name}.html${V}`, { cache: 'no-store' }).then(r => r.ok ? r.text() : '');
  const t = document.createElement('template'); t.innerHTML = html;
  const root = t.content.firstElementChild; if (!root) return null;
  // the layout root fills the screen like the client's panel; the client's own styles place the window inside it
  root.classList.remove('uitk-root'); root.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  for (const c of root.children) c.style.pointerEvents = 'auto';
  layer.append(root); wire(root, name);
  return root;
}

const open = {}; let top = 30;
export const isOpen = name => !!open[name];
export async function show(name, fill) {
  if (open[name]) { front(open[name]); return open[name]; }
  const root = open[name] = await mount(name); if (!root) return delete open[name], null;
  front(root); await fill?.(root);
  // windows without a set position are centred by the client's code; cascade when several are open
  const z = zoom(), L = layer.getBoundingClientRect(), n = Object.keys(open).length - 1;
  for (const c of root.children) {
    if (!c.classList.contains('wf') && (getComputedStyle(c).position !== 'absolute' || c.style.left || c.style.right)) continue; // a window is always centred
    const r = c.getBoundingClientRect();
    Object.assign(c.style, { left: Math.max(0, (L.width - r.width) / 2 / z + n * 30) + 'px', top: Math.max(0, (L.height - r.height) / 2 / z + n * 30) + 'px', alignSelf: 'auto', margin: 0 });
  }
  dispatchEvent(new CustomEvent('uitk', { detail: { name, open: true } }));
  return root;
}
export function hide(name) {
  open[name]?.remove(); delete open[name];
  dispatchEvent(new CustomEvent('uitk', { detail: { name, open: false } }));
}
export const toggle = (name, fill) => open[name] ? hide(name) : show(name, fill);
export const hideAll = () => Object.keys(open).forEach(hide);

// HUD widget: fill it, then put it where it was left (localStorage) or at place(w, h, W, H) -> [left, top] in layer pixels
export async function widget(name, fill, place) {
  const root = await mount(name); if (!root) return null;
  root.style.zIndex = 10; await fill?.(root);
  const w = root.querySelector('.mdw') || root.firstElementChild, z = zoom(), r = w.getBoundingClientRect(), L = layer.getBoundingClientRect();
  const [left, top] = JSON.parse(localStorage['hud:' + name] || 'null') || place(r.width / z, r.height / z, L.width / z, L.height / z);
  Object.assign(w.style, { position: 'absolute', left: left + 'px', top: top + 'px', margin: 0, right: 'auto', bottom: 'auto', alignSelf: 'auto' });
  w.dataset.widget = name; clamp(w);
  return root;
}
export const relayout = fit; // widgets whose content changed size: keep them on screen
export const resetWidgets = () => Object.keys(localStorage).filter(k => k.startsWith('hud:')).forEach(k => localStorage.removeItem(k));
function clamp(w) { // keep a widget on screen
  const W = layer.clientWidth, H = layer.clientHeight;
  w.style.left = Math.max(0, Math.min(W - w.offsetWidth, w.offsetLeft)) + 'px'; w.style.top = Math.max(0, Math.min(H - w.offsetHeight, w.offsetTop)) + 'px';
}

function front(w) { w.style.zIndex = ++top; }
function wire(root, name) {
  root.addEventListener('pointerdown', () => { if (open[name] === root) front(root); });
  root.querySelectorAll('.wf-close').forEach(b => b.onclick = () => hide(name));
  // drag a window by its title bar, a widget by its header
  let d = null, win = null;
  root.addEventListener('pointerdown', e => {
    const head = e.target.closest('.wf-head, .mdw-head'); if (!head || e.target.closest('.wf-btn')) return;
    win = head.closest('.wf, .mdw'); const z = zoom();
    Object.assign(win.style, { left: win.offsetLeft + 'px', top: win.offsetTop + 'px', right: 'auto', bottom: 'auto', alignSelf: 'auto', margin: 0 });
    d = [e.clientX / z - win.offsetLeft, e.clientY / z - win.offsetTop]; head.setPointerCapture(e.pointerId); e.preventDefault();
  });
  root.addEventListener('pointermove', e => { if (!d) return; const z = zoom(); win.style.left = e.clientX / z - d[0] + 'px'; win.style.top = Math.max(0, e.clientY / z - d[1]) + 'px'; });
  root.addEventListener('pointerup', () => {
    if (!d) return; d = null;
    if (win.dataset.widget) { clamp(win); localStorage['hud:' + win.dataset.widget] = JSON.stringify([win.offsetLeft, win.offsetTop]); }
  });
  // toggles / tabs: one checked per group; checkboxes flip
  root.addEventListener('click', e => {
    const t = e.target.closest('[data-t="DofusToggleButtonCustom"],.dtab'), c = e.target.closest('.dcheck');
    if (t) { [...t.parentElement.children].forEach(s => s.classList.toggle('is-checked', s === t)); }
    if (c) c.classList.toggle('is-checked');
  });
}
// a layout's elements, to put inside an open window (runtime-filled lists: spell rows, sub panels…)
const cache = {};
export async function fragment(name) {
  cache[name] ??= fetch(`ui/uitk/layouts/${name}.html${V}`, { cache: 'no-store' }).then(r => r.text());
  const t = document.createElement('template'); t.innerHTML = await cache[name];
  const root = t.content.firstElementChild, sc = [...root.classList].filter(c => /^ss\d+$/.test(c)); // its stylesheets' scopes come along
  return [...root.children].map(c => (c.classList.add(...sc), c));
}
// set a label's text (by element name) inside an open window
export const set = (w, id, text) => { const el = w.querySelector(`#${id}`); if (el) el.textContent = text; };
