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
  const z = Math.max(innerWidth / 1920, innerHeight / 1080) * 0.9 * (+localStorage.uiScale || 1); // × the player's interface size (Options)
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
  layer.append(root); wire(root, name); controls(root);
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
// opts.scale: resizing scales the widget (life heart) instead of giving it more room (chat, menu, gauge)
export async function widget(name, fill, place, opts = {}) {
  const root = await mount(name); if (!root) return null;
  root.style.zIndex = 10; await fill?.(root);
  const w = root.querySelector('.mdw') || root.firstElementChild, z = zoom(), r = w.getBoundingClientRect(), L = layer.getBoundingClientRect();
  const [left, top] = JSON.parse(localStorage['hud:' + name] || 'null') || place(r.width / z, r.height / z, L.width / z, L.height / z);
  Object.assign(w.style, { position: 'absolute', left: left + 'px', top: top + 'px', margin: 0, right: 'auto', bottom: 'auto', alignSelf: 'auto' });
  w.dataset.widget = name; if (opts.scale) w.dataset.scale = 1;
  const size = JSON.parse(localStorage['hudsize:' + name] || 'null'); // [w, h] or [zoom]
  if (size) size.length === 1 ? w.style.zoom = size[0] : Object.assign(w.style, { width: size[0] + 'px', height: size[1] + 'px' });
  clamp(w);
  return root;
}
export const setScale = k => { localStorage.uiScale = k; fit(); };
export const relayout = fit; // widgets whose content changed size: keep them on screen
export const resetWidgets = () => Object.keys(localStorage).filter(k => /^hud(size)?:/.test(k)).forEach(k => localStorage.removeItem(k));
function clamp(w) { // keep a widget on screen
  const W = layer.clientWidth, H = layer.clientHeight;
  w.style.left = Math.max(0, Math.min(W - w.offsetWidth, w.offsetLeft)) + 'px'; w.style.top = Math.max(0, Math.min(H - w.offsetHeight, w.offsetTop)) + 'px';
}

// Dofus controls whose behaviour is code: MultipleSlots (weapons…) shows its first slot, the others sit in a drawer opened by its button
// designer placeholders ("Lorem ipsum", "zfefzezefzef", "UN-NOM-VRAIMENT-LONG…") and raw translation keys ("ui.common.level": the
// named keys are not in I18n/fr.bin) never show: the usual keys get their French text, the rest become empty
const KEYS = { 'ui.common.level': 'Niveau', 'ui.common.name': 'Nom', 'ui.common.cancel': 'Annuler', 'common.reset': 'Réinitialiser', 'ui.common.rewards': 'Récompenses',
  'ui.common.selectcategory': 'Choisir une catégorie', 'ui.achievement.noachievement': 'Aucun succès', 'ui.common.acceptall': 'Tout accepter', 'ui.common.directory': 'Annuaire',
  'ui.social.members': 'Membres', 'ui.chat.to': 'à', 'ui.chat.from': 'de', 'ui.common.guild': 'Guilde', 'ui.common.alliance': 'Alliance', 'ui.guidebook.title': 'Guide',
  'ui.achievement.rewardswaiting': 'Récompenses en attente', 'ui.achievement.rewardsget': 'Récupérer', 'ui.guild.logbook': 'Journal', 'ui.jobs.obtention': 'Obtention' };
const DUMMY = /lorem ipsum|zfef|UN-NOM-VRAIMENT|NomDePersonnage|NomDuJoueur/i, KEY = /^(ui|common)\.[\w.]+$/i;
function placeholders(root) {
  for (const el of root.querySelectorAll('.unity-text-element, .dbtn-label, .wf-title, .mdw-title')) {
    const t = el.firstChild?.nodeType === 3 ? el.firstChild.nodeValue.trim() : ''; if (!t) continue;
    if (KEY.test(t)) el.firstChild.nodeValue = KEYS[t.toLowerCase()] ?? '';
    else if (DUMMY.test(t)) el.firstChild.nodeValue = '';
  }
}
function controls(root) {
  placeholders(root);
  for (const ms of root.querySelectorAll('[data-t="MultipleSlots"]')) {
    const slots = [...ms.children].filter(c => c.dataset.t === 'Slot'), cur = ms.querySelector('#ctr_multipleSlots'), drawer = ms.querySelector('#ctr_realContent'), box = drawer?.closest('#DofusVisualElement');
    if (!cur || !drawer || !slots.length) continue;
    cur.append(slots[0]); drawer.append(...slots.slice(1));
    Object.assign(drawer.style, { position: 'relative' }); Object.assign(box.style, { left: '100%', top: 0, zIndex: 5, display: 'none', background: 'var(--background_dark97)', padding: '4px' });
    ms.querySelector('#btn_open')?.addEventListener('click', () => box.style.display = box.style.display === 'none' ? 'flex' : 'none');
  }
}
function front(w) { w.style.zIndex = ++top; }
function wire(root, name) {
  root.addEventListener('pointerdown', () => { if (open[name] === root) front(root); });
  root.querySelectorAll('.wf-close').forEach(b => b.onclick = () => hide(name));
  // drag a window by its title bar, a widget by its header
  let d = null, win = null;
  root.addEventListener('pointerdown', e => {
    // windows: by the title bar; widgets: by their header, or anywhere but a control when they have none (XP gauge)
    if (e.target.closest('.mdw-resize')) return resizeStart(e);
    const bare = e.target.closest('.mdw'), head = e.target.closest('.wf-head, .mdw-head') || (bare && !bare.querySelector(':scope > .mdw-head') && !e.target.closest('.dbtn, button, input, .hud-slot, .slot') ? bare : null);
    if (!head || e.target.closest('.wf-btn')) return;
    win = head.closest('.wf, .mdw'); const z = zoom();
    Object.assign(win.style, { left: win.offsetLeft + 'px', top: win.offsetTop + 'px', right: 'auto', bottom: 'auto', alignSelf: 'auto', margin: 0 });
    d = [e.clientX / z - win.offsetLeft, e.clientY / z - win.offsetTop]; try { head.setPointerCapture(e.pointerId); } catch {} e.preventDefault();
  });
  // resize a widget by its corner handle: more room, or a bigger / smaller widget (opts.scale)
  let rs = null;
  const resizeStart = e => {
    const w = e.target.closest('.mdw'); e.preventDefault(); try { e.target.setPointerCapture(e.pointerId); } catch {}
    rs = { w, x: e.clientX, y: e.clientY, W: w.offsetWidth, H: w.offsetHeight, k: parseFloat(w.style.zoom) || 1 };
  };
  root.addEventListener('pointermove', e => {
    if (!rs) return; const z = zoom(), dx = (e.clientX - rs.x) / z, dy = (e.clientY - rs.y) / z, w = rs.w;
    if (w.dataset.scale) w.style.zoom = Math.max(.6, Math.min(2, rs.k * (1 + Math.max(dx / rs.W, dy / rs.H))));
    else Object.assign(w.style, { width: Math.max(80, rs.W + dx) + 'px', height: Math.max(40, rs.H + dy) + 'px' });
  });
  root.addEventListener('pointerup', () => {
    if (!rs) return; const w = rs.w; rs = null; clamp(w);
    localStorage['hudsize:' + w.dataset.widget] = JSON.stringify(w.dataset.scale ? [parseFloat(w.style.zoom) || 1] : [w.offsetWidth, w.offsetHeight]);
    dispatchEvent(new CustomEvent('widgetresize', { detail: w.dataset.widget }));
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
// context menu in the client's own style (contextMenu / contextMenu__item classes): items = [[label, onclick, icon?, checked?]]
let ctx = null;
export function menu(e, items, title = '') {
  e.stopPropagation(); ctx?.remove();
  const z = zoom(), m = ctx = document.createElement('div');
  m.className = 'contextMenu'; m.style.cssText = `z-index:9999;pointer-events:auto;left:${e.clientX / z}px;top:${e.clientY / z}px`;
  m.innerHTML = (title ? `<div class="contextualMenuHeader"><div id="contextualMenuHeader_container"><div id="contextualMenuHeader_label" class="unity-text-element">${title}</div></div></div>` : '') +
    items.map(([label, , icon, checked], i) => `<div class="contextMenu__item" data-i="${i}"><div class="contextMenu__item-status-${checked ? 'dot' : 'none'}"></div>` +
      `${icon ? `<div class="contextMenu__item-picture" style="background:url(ui/uitk/img/${icon}.png) center/contain no-repeat"></div>` : ''}<div class="unity-text-element contextMenu__item-label" style="padding:4px 12px 4px 0">${label}</div></div>`).join('');
  layer.append(m);
  m.style.left = Math.min(layer.clientWidth - m.offsetWidth, m.offsetLeft) + 'px'; m.style.top = Math.min(layer.clientHeight - m.offsetHeight, m.offsetTop) + 'px';
  const close = () => { m.remove(); if (ctx === m) ctx = null; removeEventListener('pointerdown', out, true); };
  const out = ev => { if (!m.contains(ev.target)) close(); };
  m.onclick = ev => { const it = ev.target.closest('[data-i]'); if (it) { items[it.dataset.i][1](); close(); } };
  setTimeout(() => addEventListener('pointerdown', out, true));
}
// a layout's elements, to put inside an open window (runtime-filled lists: spell rows, sub panels…)
const cache = {};
export async function fragment(name) {
  cache[name] ??= fetch(`ui/uitk/layouts/${name}.html${V}`, { cache: 'no-store' }).then(r => r.text());
  const t = document.createElement('template'); t.innerHTML = await cache[name];
  const root = t.content.firstElementChild, sc = [...root.classList].filter(c => /^ss\d+$/.test(c)); // its stylesheets' scopes come along
  placeholders(root);
  return [...root.children].map(c => (c.classList.add(...sc), c));
}
// set a label's text (by element name) inside an open window
export const set = (w, id, text) => { const el = w.querySelector(`#${id}`); if (el) el.textContent = text; };
