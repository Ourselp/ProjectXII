// Client menus at runtime: layouts converted by tools/extract/uitk.js (public/ui/uitk/layouts/<name>.html), shown in a layer
// scaled like the client's PanelSettings (reference 1920x1080, "shrink": zoom = max(w / 1920, h / 1080) * 0.9).
const V = new URL(import.meta.url).search;
const css = h => document.head.insertAdjacentHTML('beforeend', `<link rel="stylesheet" href="${h}${V}">`);
css('uitk-client.css'); css('uitk-controls.css');

const layer = document.createElement('div');
layer.className = 'uitk-root'; layer.id = 'uitk-layer';
layer.style.cssText = 'position:fixed;left:0;top:0;z-index:30;pointer-events:none;display:block';
document.body.append(layer);
function fit() {
  const z = Math.max(innerWidth / 1920, innerHeight / 1080) * 0.9;
  Object.assign(layer.style, { zoom: z, width: innerWidth / z + 'px', height: innerHeight / z + 'px' });
}
addEventListener('resize', fit); fit();

const open = {}; let top = 30;
export const isOpen = name => !!open[name];
export async function show(name, fill) {
  if (open[name]) { front(open[name]); return open[name]; }
  const html = await fetch(`ui/uitk/layouts/${name}.html${V}`, { cache: 'no-store' }).then(r => r.ok ? r.text() : '');
  const t = document.createElement('template'); t.innerHTML = html;
  const root = t.content.firstElementChild; if (!root) return null;
  // the layout root fills the screen like the client's panel; the client's own styles place the window inside it
  root.classList.remove('uitk-root'); root.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  for (const c of root.children) c.style.pointerEvents = 'auto';
  layer.append(root); open[name] = root;
  wire(root, name); front(root); await fill?.(root);
  // windows without a set position are centred by the client's code; cascade when several are open
  const z = parseFloat(layer.style.zoom), L = layer.getBoundingClientRect(), n = Object.keys(open).length - 1;
  for (const c of root.children) {
    if (getComputedStyle(c).position !== 'absolute' || c.style.left || c.style.right) continue;
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

function front(w) { w.style.zIndex = ++top; }
function wire(w, name) {
  w.addEventListener('pointerdown', () => front(w));
  w.querySelectorAll('.wf-close').forEach(b => b.onclick = () => hide(name));
  const head = w.querySelector('.wf-head'), win = head?.closest('.wf'); let d = null;
  if (head) {
    head.onpointerdown = e => { if (e.target.closest('.wf-btn')) return; const z = parseFloat(layer.style.zoom); Object.assign(win.style, { left: win.offsetLeft + 'px', top: win.offsetTop + 'px', alignSelf: 'auto', margin: 0 }); d = [e.clientX / z - win.offsetLeft, e.clientY / z - win.offsetTop]; head.setPointerCapture(e.pointerId); };
    head.onpointermove = e => { if (!d) return; const z = parseFloat(layer.style.zoom); win.style.left = e.clientX / z - d[0] + 'px'; win.style.top = Math.max(0, e.clientY / z - d[1]) + 'px'; };
    head.onpointerup = () => d = null;
  }
  // toggles / tabs: one checked per group; checkboxes flip
  w.addEventListener('click', e => {
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
  return [...t.content.firstElementChild.children];
}
// set a label's text (by element name) inside an open window
export const set = (w, id, text) => { const el = w.querySelector(`#${id}`); if (el) el.textContent = text; };
