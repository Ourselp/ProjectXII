// HUD = the client's own widgets (UI Toolkit layouts, public/uitk.js), each draggable by its header: CharacterInformations (life,
// AP, MP), ActionBar (spells), BannerMenu (menu), Chat, XP gauge. Menus = the client's windows, filled by FILL[layout].
// Our own windows (.win: world map, appearance, options, help, zaap/door menus) stay plain HTML.
const V = new URL(import.meta.url).search;
const { drawRig, BUST } = await import('./rig.js' + V);
const { buildLook, breedOf, lookState, cosmetics, equip } = await import('./look.js' + V);
const ui = await import('./uitk.js' + V);

export const NAME = 'Chabou';
const $ = s => document.querySelector(s);
let spells = {}, commands = {};

// ---------- our windows: #win-<name>, draggable by their title bar
export function toggle(name, force) {
  const w = $(`#win-${name}`); if (!w) return;
  const show = force ?? w.hidden; w.hidden = !show;
  document.querySelectorAll(`[data-win="#${name}"]`).forEach(b => b.classList.toggle('on', show));
  if (show) { w.style.zIndex = ++z; dispatchEvent(new CustomEvent('window', { detail: name })); }
}
let z = 40;
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

// ---------- test character sheet: random stats, kept in localStorage (/stats rolls new ones)
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const MAIN = { Vitality: 'Vitalité', Wisdom: 'Sagesse', Earth: 'Force', Fire: 'Intelligence', Water: 'Chance', Wind: 'Agilité' };
function rollStats() {
  const main = Object.fromEntries(Object.keys(MAIN).map(k => [k, { base: rnd(0, 400), bonus: rnd(0, 100), equipment: rnd(0, 600), consumable: rnd(0, 100) }]));
  const total = k => Object.values(main[k]).reduce((a, b) => a + b, 0), level = rnd(1, 200);
  const r = (a, b, s = '') => rnd(a, b) + s;
  return {
    level, ap: rnd(6, 12), mp: rnd(3, 6), range: rnd(0, 6), points: rnd(0, 995), xp: Math.random(), energy: rnd(0, 10000), main,
    life: 50 + (level - 1) * 5 + total('Vitality'),
    detail: [
      ['Caractéristiques primaires', Object.entries(MAIN).map(([k, n]) => [n, total(k)])],
      ['Caractéristiques secondaires', [['Initiative', r(500, 9000)], ['Prospection', r(100, 400)], ['Invocations', r(1, 8)], ['Soins', r(0, 120)], ['Coups critiques', r(0, 60, ' %')],
        ['Retrait PA', r(0, 120)], ['Retrait PM', r(0, 120)], ['Esquive PA', r(0, 120)], ['Esquive PM', r(0, 120)], ['Tacle', r(0, 80)], ['Fuite', r(0, 80)], ['Pods', r(1000, 5000)]]],
      ['Dommages', [['Puissance', r(0, 600)], ['Dommages', r(0, 120)], ['Dommages critiques', r(0, 80)], ['Dommages Neutre', r(0, 60)], ['Dommages Terre', r(0, 60)],
        ['Dommages Feu', r(0, 60)], ['Dommages Eau', r(0, 60)], ['Dommages Air', r(0, 60)], ['Dommages de poussée', r(0, 100)],
        ['Dommages aux sorts', r(0, 30, ' %')], ['Dommages d\'armes', r(0, 30, ' %')], ['Dommages distance', r(0, 30, ' %')], ['Dommages mêlée', r(0, 30, ' %')]]],
      ['Résistances', [['Neutre', r(-10, 50, ' %')], ['Terre', r(-10, 50, ' %')], ['Feu', r(-10, 50, ' %')], ['Eau', r(-10, 50, ' %')], ['Air', r(-10, 50, ' %')],
        ['Coups critiques', r(0, 100)], ['Poussée', r(0, 100)], ['Distance', r(0, 30, ' %')], ['Mêlée', r(0, 30, ' %')]]],
    ],
  };
}
let stats = JSON.parse(localStorage.stats || 'null')?.detail ? JSON.parse(localStorage.stats) : rollStats();
localStorage.stats = JSON.stringify(stats);
const fmt = n => Number(n).toLocaleString('fr-FR');

// ---------- menu: [shortcut, client layout or #own window, icon in ui/uitk/img, title]
const MENU = [
  ['c', 'characterSheetUi', 'characteristic', 'Caractéristiques'], ['s', 'playerSpell', 'spells', 'Sorts'], ['i', 'equipmentStorageUi', 'inventory', 'Inventaire'],
  ['', 'cosmeticUi', 'cosmetics', 'Cosmétiques'], ['q', 'quests', 'quest', 'Quêtes'], ['u', 'achievements', 'success', 'Succès'], ['j', 'jobUI', 'job', 'Métiers'],
  ['b', 'encyclopediaBase', 'encyclopedia', 'Encyclopédie'], ['f', 'friends', 'social', 'Amis'], ['g', 'guildBase', 'guild', 'Guilde'], ['', 'allianceBase', 'alliance', 'Alliance'],
  ['', 'alignmentTab', 'alignment', 'Alignement'], ['d', 'rideParentUI', 'mount', 'Montures'], ['', 'companionUi', 'companions', 'Compagnons'], ['', 'calendarUI', 'almanax', 'Almanax'],
  ['', 'groupSearch', 'groupSearch', 'Recherche de groupe'], ['', 'CharacterPresetUi', 'build', 'Préréglages'], ['', 'guidebookBase', 'guide', 'Guide'], ['', 'webBase', 'webShop', 'Boutique'],
];
const MORE = [['m', '#map', 'map', 'Carte du monde'], ['a', '#look', '../../hud/palette', 'Apparence'], ['o', '#options', 'cog', 'Options'], ['h', '#help', 'questionMark', 'Aide']];
const openMenu = w => w[0] === '#' ? toggle(w.slice(1)) : ui.toggle(w, FILL[w]);
const menuButton = ([k, w, icon, t]) => `<button class="hud-slot" data-win="${w}" title="${t}${k ? ` (${k.toUpperCase()})` : ''}"><img src="ui/uitk/img/${icon}.png" alt=""></button>`;

const FILL = {
  characterSheetUi: async w => {
    const b = breedOf(), s = stats;
    for (const [id, t] of [['lbl_name', NAME], ['lbl_levelValue', s.level], ['lbl_class', b.name.toUpperCase()], ['lbl_paValue', s.ap], ['lbl_pmValue', s.mp], ['lbl_poValue', s.range],
      ['lbl_pointsRemaining', s.points], ['lbl_xpValue', fmt(Math.round(s.xp * 1e6))], ['lbl_xpMax', '/ ' + fmt(1e6)], ['lbl_energyValue', fmt(s.energy)], ['lbl_energyMax', '/ 10 000']]) ui.set(w, id, t);
    w.querySelector('#pb_xp .pb-fill').style.width = s.xp * 100 + '%'; w.querySelector('#pb_energy .pb-fill').style.width = s.energy / 100 + '%';
    for (const [k, v] of Object.entries(s.main)) for (const [part, n] of Object.entries(v)) ui.set(w, `lbl_${part}${k === 'Wisdom' && part === 'base' ? 'Wisdow' : k}`, n); // (sic) lbl_baseWisdow
    const social = { btn_achievements: 'Succès', btn_guild: 'Guilde', btn_alliance: 'Alliance', btn_alignment: 'Alignement', btn_spouse: 'Conjoint', btn_house: 'Maison' };
    for (const [id, t] of Object.entries(social)) { const e = w.querySelector('#' + id); if (!e) continue; ui.set(e, 'lbl_title', t); ui.set(e, 'lbl_content', '—'); ui.set(e, 'lbl_subContent', ''); }
    // detailed view: every stat line, in the client's two-column rows
    const host = w.querySelector('#ctr_characterStatsDetailed');
    if (host) {
      host.replaceChildren(); Object.assign(host.style, { overflowY: 'auto', flexGrow: 1 });
      for (const [title, rows] of s.detail) {
        host.insertAdjacentHTML('beforeend', `<div class="unity-text-element section_medium textColor_highlight_secondary80" style="margin:10px 0 4px;flex-shrink:0">${title}</div>`);
        for (const [name, value] of rows) {
          const [row] = await ui.fragment('statTwoColumnsItem');
          ui.set(row, 'lbl_statName', name); ui.set(row, 'lbl_statValue', typeof value === 'number' ? fmt(value) : value); row.style.flexShrink = 0; host.append(row);
        }
      }
    }
    const view = detailed => { // the two toggle buttons switch between the simple and detailed views
      w.querySelector('#ctr_detailedStats')?.style.setProperty('display', detailed ? 'flex' : 'none');
      w.querySelector('#ctr_simpleStats')?.style.setProperty('display', detailed ? 'none' : 'flex');
      w.querySelector('#btn_detailedView')?.classList.toggle('is-checked', detailed); w.querySelector('#btn_simpleView')?.classList.toggle('is-checked', !detailed);
    };
    w.querySelector('#btn_detailedView')?.addEventListener('click', () => view(true)); w.querySelector('#btn_simpleView')?.addEventListener('click', () => view(false));
    view(false);
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
  equipmentStorageUi: w => {
    w.querySelector('#EquipmentComponent')?.append(invPreview); // our character on the pedestal
    ui.set(w, 'lbl_kamas', fmt(rnd(0, 5e6)));
  },
  cosmeticUi: async w => { // the cosmetic skins we can wear (look.js), with a thumbnail of the hero wearing each
    const SLOT = { btnHelmet: 'hat', btnCloak: 'cape', btnShield: 'shield', btnWings: 'wings' };
    for (const b of w.querySelectorAll('#parentHeaderLine2 > [data-t="DofusToggleButtonCustom"], #parentHeaderLine2 > [data-t="Dropdown"]')) if (!SLOT[b.id]) b.style.display = 'none';
    for (const id of ['lbl_empt', 'AddedToTagParent', 'parentItems', 'parentTitles', 'parentOrnaments', 'parentAuras']) w.querySelector('#' + id)?.style.setProperty('display', 'none');
    w.querySelector('#entityDisplayer')?.append(cosPreview);
    const grid = w.querySelector('[data-t="StorageSlotGrid"]'); grid.className = 'cosmetic-grid'; Object.assign(grid.style, { display: 'flex', flexGrow: 1, height: '100%' });
    for (const l of w.querySelectorAll('.unity-label')) if (l.textContent.startsWith('Cette boîte est vide')) l.style.display = 'none';
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); thumb(e.target); } }), { root: grid });
    const show = slot => {
      const ids = cosmetics(slot), cur = String(lookState()[slot]);
      grid.innerHTML = ids.map(id => `<div class="cosmetic${String(id) === cur ? ' on' : ''}" data-slot="${slot}" data-id="${id}" title="${slot} ${id}"><canvas width="152" height="152"></canvas><span>${id}</span></div>`).join('');
      grid.querySelectorAll('.cosmetic').forEach(t => io.observe(t));
      ui.set(w, 'elementsCount', `Éléments : ${ids.length}`); ui.set(w, 'visibleItemsCount', ids.length);
      Object.entries(SLOT).forEach(([b, s]) => w.querySelector('#' + b)?.classList.toggle('is-checked', s === slot));
    };
    for (const [b, s] of Object.entries(SLOT)) w.querySelector('#' + b)?.addEventListener('click', () => show(s));
    grid.addEventListener('click', e => {
      const t = e.target.closest('.cosmetic'); if (!t) return;
      equip(t.dataset.slot, t.dataset.id);
      const cur = String(lookState()[t.dataset.slot]); grid.querySelectorAll('.cosmetic').forEach(x => x.classList.toggle('on', x.dataset.id === cur));
    });
    show('hat');
  },
};

// cosmetic thumbnails: one offscreen WebGL context draws the hero wearing just that skin, copied into the tile's 2D canvas
const thumbGL = Object.assign(document.createElement('canvas'), { width: 152, height: 152 }).getContext('webgl', { premultipliedAlpha: true });
const FRAME = { hat: [3.2, 2.15], cape: [1.25, .95], shield: [1.5, 1.05], wings: [1.1, .95] }; // [scale, feet y / height]: zoom on the item
let thumbs = Promise.resolve();
const thumb = tile => thumbs = thumbs.then(async () => { // ponytail: every skin stays in thumbGL's texture cache; free textures if memory matters
  const { slot, id } = tile.dataset, L = await buildLook(thumbGL, { hat: '', cape: '', shield: '', wings: '', [slot]: id }); if (!L.ready) return;
  const [k, y] = FRAME[slot];
  thumbGL.viewport(0, 0, 152, 152); thumbGL.clearColor(0, 0, 0, 0); thumbGL.clear(thumbGL.COLOR_BUFFER_BIT);
  drawRig(thumbGL, L.idle, L.skins, `AnimStatiqueExplo0_${slot === 'cape' || slot === 'wings' ? 5 : 1}`, 0, 76, 152 * y, L.scale * k, false, L.cols, undefined, L.hideHair);
  tile.querySelector('canvas').getContext('2d').drawImage(thumbGL.canvas, 0, 0);
});

// ---------- HUD widgets
async function setupWidgets() {
  const R = {}, pad = 12; // rects of the widgets already placed (layer pixels), to lay the others out around them
  const at = (name, fill, place) => ui.widget(name, fill, (w, h, W, H) => { const p = place(w, h, W, H); R[name] = { x: p[0], y: p[1], w, h }; return p; });
  await at('chatview', w => {
    const list = w.querySelector('#listChat'); list.append($('#chatlog')); Object.assign(list.style, { width: '440px', height: '170px' });
    w.querySelector('#ti_chatInput').replaceChildren($('#say'));
    w.querySelector('#btn_news')?.style.setProperty('display', 'none');
  }, (w, h, W, H) => [pad, H - h - pad]);
  await at('characterInformations', w => {
    for (const id of ['ctr_ip', 'tx_shield', 'parentTopBottom', 'erosion_mask', 'threshold_mask']) // fight-only parts; erosion is sized by code (none here) w.querySelector('#' + id)?.style.setProperty('display', 'none');
    ui.set(w, 'lbl_pdv', stats.life); ui.set(w, 'lbl_pa', stats.ap); ui.set(w, 'lbl_pm', stats.mp);
  }, (w, h, W, H) => [W * .3, H - h - pad]);
  await at('actionBar', w => {
    const bar = w.querySelector('#gd_spellitemotes'); bar.id = 'spellbar'; bar.className = 'slotgrid'; bar.style.width = 12 * 50 + 'px';
    setupSpellTips(bar);
  }, (w, h, W, H) => [W * .3 + (R.characterInformations?.w || 200) + pad, H - h - pad]);
  await at('bannerMenu', w => {
    // the client's menu: a 42 px column on the right, filled by code; ours wraps into more columns so every button shows
    const main = w.querySelector('#gd_btnUis'); main.className = 'hud-menu'; main.id = 'menu';
    main.innerHTML = [...MENU, ...MORE].map(menuButton).join(''); $('#mute').className = 'hud-slot'; main.append($('#mute'));
    const rows = 8, cols = Math.ceil(main.children.length / rows);
    Object.assign(main.style, { flexDirection: 'column', flexWrap: 'wrap', width: cols * 42 + 'px', height: rows * 42 + 'px' });
    Object.assign(w.querySelector('#BannerMenu').style, { width: 'auto', height: 'auto' });
    w.querySelector('#ctr_moreBtn')?.style.setProperty('display', 'none');
    w.querySelectorAll('[data-win]').forEach(b => b.addEventListener('click', () => openMenu(b.dataset.win)));
  }, (w, h, W, H) => [W - w - pad, H - h - pad]);
  await at('widgetProgressGauge', w => {
    ui.set(w, 'lbl_value', stats.level); w.querySelector('#omega')?.style.setProperty('display', 'none');
    const f = w.querySelector('#gauge .pb-fill'); if (f) f.style.width = stats.xp * 100 + '%';
  }, (w, h, W, H) => [(W - w) / 2, pad]);
}
function setupKeys() {
  addEventListener('uitk', e => document.querySelectorAll(`[data-win="${e.detail.name}"]`).forEach(b => b.classList.toggle('on', e.detail.open)));
  document.querySelectorAll('.win').forEach(wireWindow);
  const keys = Object.fromEntries([...MENU, ...MORE].filter(m => m[0]).map(m => [m[0], m[1]]));
  addEventListener('keydown', e => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (keys[e.key.toLowerCase()] && !e.ctrlKey && !e.altKey) openMenu(keys[e.key.toLowerCase()]);
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

// ---------- spells: action bar (client widget)
const spellButton = (s, i) => `<button class="hud-slot" data-i="${i}">${s.icon ? `<img src="ui/${s.icon}${BUST}" alt="">` : s.name.slice(0, 2)}${i < 10 ? `<kbd>${(i + 1) % 10}</kbd>` : ''}</button>`;
function setSpells(breedId) { $('#spellbar').innerHTML = (spells[breedId] || []).map(spellButton).join(''); ui.relayout(); }
function setupSpellTips(el) {
  const tip = $('#tip'), cur = () => spells[lookState().breed] || [];
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

// ---------- character previews (inventory, cosmetics, appearance): own WebGL context each
const previews = [];
function preview(canvas) {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true }), p = { gl, look: null, dir: 1 };
  canvas.onclick = () => p.dir = [0, 1, 2, 5, 6][([0, 1, 2, 5, 6].indexOf(p.dir) + 1) % 5]; // click = turn
  previews.push(p);
}
const invPreview = Object.assign(document.createElement('canvas'), { width: 300, height: 380, className: 'preview inv3d', title: 'Cliquer pour tourner' });
const cosPreview = Object.assign(document.createElement('canvas'), { width: 300, height: 380, className: 'preview inv3d', title: 'Cliquer pour tourner' });
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

export async function setupHud() {
  spells = await fetch('data/spells.json' + BUST, { cache: 'no-store' }).then(r => r.json());
  for (const el of document.querySelectorAll('.hero-name')) el.textContent = NAME;
  await setupWidgets(); setupKeys();
  document.querySelectorAll('.preview').forEach(preview); preview(invPreview); preview(cosPreview);
  addEventListener('look', () => { setSpells(breedOf().id); refreshPreviews(); });
  $('#say').addEventListener('submit', e => {
    e.preventDefault(); const t = e.target.t.value.trim(); e.target.t.value = ''; e.target.t.blur(); if (!t) return;
    const m = t.match(/^\/(\w+)\s*(.*)$/);
    if (m) { if (commands[m[1]]) commands[m[1]](m[2]); else chat(`Commande inconnue : /${m[1]} (essaie /tp 5,-18)`, 'warn'); }
    else chat(`${NAME} : ${t}`);
  });
  onCommand('stats', () => { stats = rollStats(); localStorage.stats = JSON.stringify(stats); chat('Nouvelles caractéristiques tirées au hasard (rouvre la fenêtre).', 'info'); });
  onCommand('hud', () => { ui.resetWidgets(); location.reload(); }); // widgets back to their default places
  drawPreviews();
  chat(`Bienvenue, ${NAME} ! Clique sur une case pour te déplacer, au-delà du bord pour changer de carte. /tp x,y pour te téléporter, /stats pour d'autres caractéristiques, /hud pour replacer l'interface.`, 'info');
}

// name label above the hero, in CSS pixels
export function nameAt(x, y) { $('#heroname').style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`; }
