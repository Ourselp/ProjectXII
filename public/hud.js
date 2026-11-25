// HUD (classic MMO layout, client skin from public/ui/hud): bottom banner (chat | life / AP / MP | spell bar | menu), windows, name above the hero.
const V = new URL(import.meta.url).search;
const { drawRig, BUST } = await import('./rig.js' + V);
const { buildLook, breedOf, lookState } = await import('./look.js' + V);
const ui = await import('./uitk.js' + V); // the client's own menus (UI Toolkit layouts)

export const NAME = 'Chabou';
const $ = s => document.querySelector(s);
let spells = {}, commands = {};

// ---------- windows: [data-win] buttons toggle #win-<name>; draggable by their title bar
export function toggle(name, force) {
  const w = $(`#win-${name}`); if (!w) return;
  const show = force ?? w.hidden; w.hidden = !show;
  document.querySelectorAll(`[data-win="#${name}"]`).forEach(b => b.classList.toggle('on', show));
  if (show) { w.style.zIndex = ++z; dispatchEvent(new CustomEvent('window', { detail: name })); }
}
let z = 20;
function wireWindow(w) {
  w.querySelector('.x').onclick = () => toggle(w.id.slice(4), false);
  const h = w.querySelector('h2'); let d = null;
  h.onpointerdown = e => { if (e.target.closest('button')) return; d = [e.clientX - w.offsetLeft, e.clientY - w.offsetTop]; h.setPointerCapture(e.pointerId); w.style.zIndex = ++z; }; // not on ✕, or capture eats its click
  h.onpointermove = e => { if (d) { w.style.left = e.clientX - d[0] + 'px'; w.style.top = Math.max(0, e.clientY - d[1]) + 'px'; } };
  h.onpointerup = () => d = null;
}
// window built from code (zaap, door menu…): returns its body element; show it with toggle(name, true)
export function makeWindow(name, title) {
  let w = $(`#win-${name}`);
  if (!w) {
    w = document.createElement('div'); w.id = `win-${name}`; w.className = 'win panel'; w.hidden = true;
    w.innerHTML = `<h2>${title}<button class="x">✕</button></h2><div class="body"></div>`;
    document.body.append(w); wireWindow(w);
  }
  w.querySelector('h2').firstChild.textContent = title;
  return w.querySelector('.body');
}
// banner menu: [shortcut, client layout or #own window, icon in ui/uitk/img, title]; client windows are filled by FILL[layout]
const MENU = [
  ['c', 'characterSheetUi', 'characteristic', 'Caractéristiques'], ['s', 'playerSpell', 'spells', 'Sorts'], ['i', 'equipmentStorageUi', 'inventory', 'Inventaire'],
  ['q', 'quests', 'quest', 'Quêtes'], ['u', 'achievements', 'success', 'Succès'], ['j', 'jobUI', 'job', 'Métiers'], ['b', 'encyclopediaBase', 'encyclopedia', 'Encyclopédie'],
  ['f', 'friends', 'social', 'Amis'], ['g', 'guildBase', 'guild', 'Guilde'], ['', 'allianceBase', 'alliance', 'Alliance'], ['', 'alignmentTab', 'alignment', 'Alignement'],
  ['d', 'rideParentUI', 'mount', 'Montures'], ['', 'companionUi', 'companions', 'Compagnons'], ['', 'calendarUI', 'almanax', 'Almanax'],
  ['', 'groupSearch', 'groupSearch', 'Recherche de groupe'], ['', 'cosmeticUi', 'cosmetics', 'Cosmétiques'], ['', 'CharacterPresetUi', 'build', 'Préréglages'],
  ['', 'guidebookBase', 'guide', 'Guide'], ['', 'webBase', 'webShop', 'Boutique'],
  ['m', '#map', 'map', 'Carte du monde'], ['a', '#look', '../../hud/palette', 'Apparence'], ['o', '#options', 'cog', 'Options'], ['h', '#help', 'questionMark', 'Aide'],
];
const FILL = {
  characterSheetUi: w => {
    const b = breedOf();
    for (const [id, t] of [['lbl_name', NAME], ['lbl_levelValue', '1'], ['lbl_class', b.name.toUpperCase()], ['lbl_paValue', '6'], ['lbl_pmValue', '3'], ['lbl_poValue', '0'], ['lbl_pointsRemaining', '0'],
      ['lbl_xpValue', '0'], ['lbl_xpMax', '/ 110'], ['lbl_energyValue', '10 000'], ['lbl_energyMax', '/ 10 000']]) ui.set(w, id, t);
    w.querySelector('#pb_xp .pb-fill').style.width = '0%'; w.querySelector('#pb_energy .pb-fill').style.width = '100%';
    w.querySelectorAll('#ctr_entityMainStats .unity-label').forEach(l => { if (/^\d+$/.test(l.textContent.trim())) l.textContent = '0'; }); // designer placeholders
    const social = { btn_achievements: 'Succès', btn_guild: 'Guilde', btn_alliance: 'Alliance', btn_alignment: 'Alignement', btn_spouse: 'Conjoint', btn_house: 'Maison' };
    for (const [id, t] of Object.entries(social)) { const s = w.querySelector('#' + id); if (!s) continue; ui.set(s, 'lbl_title', t); ui.set(s, 'lbl_content', '—'); ui.set(s, 'lbl_subContent', ''); }
  },
  playerSpell: async w => {
    const list = spells[lookState().breed] || [], tab = w.querySelector('.dtab');
    if (tab) { tab.classList.add('is-checked'); tab.querySelector('.unity-text-element').textContent = breedOf().name; }
    const host = w.querySelector('#ctr_spellListContainer'); host.replaceChildren(...await ui.fragment('spellList'));
    const cols = [host.querySelector('#ctr_leftSpellContainer'), host.querySelector('#ctr_rightSpellContainer')];
    for (const [i, s] of list.entries()) {
      const [row] = await ui.fragment('spellButtonsEntry');
      Object.assign(row.style, { position: 'relative', width: '338px', height: '77px', cursor: 'pointer' });
      row.querySelector('#lbl_spellName').textContent = s.name; row.title = `${s.name} · ${s.ap} PA · portée ${s.range[0]}–${s.range[1]}\n${s.desc}`;
      if (s.icon) row.querySelector('#slot_icon').innerHTML = `<img src="ui/${s.icon}${BUST}" alt="" style="position:absolute;inset:0;width:100%;height:100%;border-radius:4px">`;
      for (const id of ['tx_lock', 'tx_greyedOut', 'ctr_newSpell', 'tx_bgSpell_activated']) row.querySelector('#' + id)?.style.setProperty('display', 'none');
      cols[i % 2]?.append(row);
    }
  },
  equipmentStorageUi: w => w.querySelector('#EquipmentComponent')?.append(invPreview), // our character on the pedestal
};
const invPreview = Object.assign(document.createElement('canvas'), { width: 300, height: 380, className: 'preview inv3d', title: 'Cliquer pour tourner' });
function setupWindows() {
  $('#menu').insertAdjacentHTML('afterbegin', MENU.map(([k, w, icon, t]) => `<button data-win="${w}" title="${t}${k ? ` (${k.toUpperCase()})` : ''}"><img src="ui/uitk/img/${icon}.png" alt=""></button>`).join('')); // before the mute button
  const open = w => w[0] === '#' ? toggle(w.slice(1)) : ui.toggle(w, FILL[w]);
  document.querySelectorAll('[data-win]').forEach(b => b.addEventListener('click', () => open(b.dataset.win)));
  addEventListener('uitk', e => document.querySelectorAll(`[data-win="${e.detail.name}"]`).forEach(b => b.classList.toggle('on', e.detail.open)));
  document.querySelectorAll('.win').forEach(wireWindow);
  const keys = Object.fromEntries(MENU.filter(m => m[0]).map(m => [m[0], m[1]]));
  addEventListener('keydown', e => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (keys[e.key.toLowerCase()] && !e.ctrlKey && !e.altKey) open(keys[e.key.toLowerCase()]);
    if (e.key === 'Escape') { document.querySelectorAll('.win:not([hidden])').forEach(w => toggle(w.id.slice(4), false)); ui.hideAll(); }
    if (e.key === 'Enter') { e.preventDefault(); $('#say input').focus(); }
    const k = '1234567890'.indexOf(e.key); if (k >= 0) $(`#spellbar [data-i="${k}"]`)?.click();
  });
}

// ---------- chat: messages + commands (/tp x,y)
export function chat(text, kind = '') {
  const log = $('#chatlog'), line = document.createElement('div');
  line.className = kind; line.textContent = `[${new Date().toTimeString().slice(0, 5)}] ${text}`;
  log.append(line); while (log.children.length > 80) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}
export const onCommand = (name, fn) => commands[name] = fn;

// ---------- spells: banner bar + window
function spellButton(s, i) {
  return `<button data-i="${i}" title="">${s.icon ? `<img src="ui/${s.icon}${BUST}" alt="">` : s.name.slice(0, 2)}${i < 10 ? `<kbd>${(i + 1) % 10}</kbd>` : ''}</button>`;
}
function setSpells(breedId) {
  const list = spells[breedId] || [];
  $('#spellbar').innerHTML = list.map(spellButton).join('');
}
function setupSpellTips() {
  const tip = $('#tip');
  const cur = () => spells[lookState().breed] || [];
  for (const el of [$('#spellbar')]) {
    el.addEventListener('mousemove', e => {
      const b = e.target.closest('[data-i]'); if (!b) { tip.hidden = true; return; }
      const s = cur()[b.dataset.i]; tip.innerHTML = `<b>${s.name}</b><span>${s.ap} PA · portée ${s.range[0]}–${s.range[1]}</span><p>${s.desc}</p>`;
      tip.hidden = false; tip.style.left = Math.min(innerWidth - 280, e.clientX - 130) + 'px'; tip.style.bottom = innerHeight - e.clientY + 14 + 'px';
    });
    el.addEventListener('mouseleave', () => tip.hidden = true);
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-i]'); if (!b) return;
      const s = cur()[b.dataset.i]; chat(`${NAME} prépare ${s.name} (${s.ap} PA). Pas de combat ici… pour l'instant.`, 'info');
      b.classList.remove('cast'); void b.offsetWidth; b.classList.add('cast');
    });
  }
}

// ---------- character preview (inventory / appearance windows): own WebGL context
const previews = [];
function preview(canvas) {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true }), p = { gl, look: null, dir: 1 };
  canvas.onclick = () => p.dir = [0, 1, 2, 5, 6][([0, 1, 2, 5, 6].indexOf(p.dir) + 1) % 5]; // click = turn
  previews.push(p);
}
async function refreshPreviews() { for (const p of previews) p.look = await buildLook(p.gl); }
let frame = 0;
function drawPreviews() {
  frame++;
  for (const p of previews) {
    const { gl, look: L } = p; if (!L?.ready || !gl.canvas.isConnected || gl.canvas.closest('[hidden]')) continue;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    drawRig(gl, L.idle, L.skins, `AnimStatiqueExplo0_${p.dir}`, Math.floor(frame / 2), gl.canvas.width / 2, gl.canvas.height * .86, L.scale * 1.7, false, L.cols, undefined, L.hideHair);
  }
  requestAnimationFrame(drawPreviews);
}

// ---------- class change: portrait, plate, spells, stats
function setClass() {
  const b = breedOf(), st = lookState(), skin = b.looks[st.gender].skin;
  for (const img of document.querySelectorAll('.portrait')) { img.src = `ui/Head_${skin}.png${BUST}`; img.onerror = () => { img.src = `ui/class_${b.id}.png${BUST}`; }; }
  for (const el of document.querySelectorAll('.cls')) el.textContent = `${b.name} · niveau 1`;
  setSpells(b.id);
}

export async function setupHud() {
  spells = await fetch('data/spells.json' + BUST, { cache: 'no-store' }).then(r => r.json());
  for (const el of document.querySelectorAll('.hero-name')) el.textContent = NAME;
  setupWindows(); setupSpellTips();
  document.querySelectorAll('.preview').forEach(preview); preview(invPreview);
  addEventListener('look', () => { setClass(); refreshPreviews(); });
  $('#say').addEventListener('submit', e => {
    e.preventDefault(); const t = e.target.t.value.trim(); e.target.t.value = ''; e.target.t.blur(); if (!t) return;
    const m = t.match(/^\/(\w+)\s*(.*)$/);
    if (m) { if (commands[m[1]]) commands[m[1]](m[2]); else chat(`Commande inconnue : /${m[1]} (essaie /tp 5,-18)`, 'warn'); }
    else chat(`${NAME} : ${t}`);
  });
  drawPreviews();
  chat(`Bienvenue, ${NAME} ! Clique sur une case pour te déplacer, au-delà du bord pour changer de carte. /tp x,y pour te téléporter.`, 'info');
}

// name label above the hero, in CSS pixels
export function nameAt(x, y) { $('#heroname').style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`; }
