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
    level, guildLevel: rnd(1, 200), guildXp: Math.random(), mountLevel: rnd(1, 100), mountXp: Math.random(), grade: rnd(1, 10), honour: Math.random(),
    ap: rnd(6, 12), mp: rnd(3, 6), range: rnd(0, 6), points: rnd(0, 995), xp: Math.random(), energy: rnd(0, 10000), main,
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
let stats = JSON.parse(localStorage.stats || 'null')?.guildLevel ? JSON.parse(localStorage.stats) : rollStats();
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
// client windows carry the designers' placeholder title ("[Inventory]" on two of them): ours, from the menu
const openMenu = w => w[0] === '#' ? toggle(w.slice(1)) : ui.toggle(w, async win => {
  const t = [...MENU, ...MORE].find(m => m[1] === w)?.[3], h = win.querySelector('.wf-title'); if (t && h) h.textContent = t;
  await FILL[w]?.(win);
});
const menuButton = ([k, w, icon, t]) => `<button class="hud-slot" data-win="${w}" title="${t}${k ? ` (${k.toUpperCase()})` : ''}"><img src="ui/uitk/img/${icon}.png" alt=""></button>`;

const FILL = {
  characterSheetUi: async w => {
    const b = breedOf(), s = stats;
    for (const [id, t] of [['lbl_name', NAME], ['lbl_levelValue', s.level], ['lbl_class', b.name.toUpperCase()], ['lbl_paValue', s.ap], ['lbl_pmValue', s.mp], ['lbl_poValue', s.range],
      ['lbl_pointsRemaining', s.points], ['lbl_xpValue', fmt(Math.round(s.xp * 1e6))], ['lbl_xpMax', '/ ' + fmt(1e6)], ['lbl_energyValue', fmt(s.energy)], ['lbl_energyMax', '/ 10 000']]) ui.set(w, id, t);
    w.querySelector('#pb_xp .pb-fill').style.width = s.xp * 100 + '%'; w.querySelector('#pb_energy .pb-fill').style.width = s.energy / 100 + '%';
    // left column: one tile per characteristic (client MainStatItem: coloured back statBack<n>, icon tx_<stat>, total);
    // the chevron opens the breakdown (base / equipment / consumables / bonus), closed by default as in the client
    const total = k => Object.values(s.main[k]).reduce((a, b) => a + b, 0);
    const blocks = w.querySelector('#ctr_statBlocks'); blocks.replaceChildren();
    for (const [i, [k, icon]] of [['Vitality', 'vitality'], ['Wisdom', 'wisdom'], ['Earth', 'strength'], ['Fire', 'intelligence'], ['Water', 'chance'], ['Wind', 'agility']].entries()) {
      const [tile] = await ui.fragment('MainStatItem');
      tile.classList.add('Clickable'); tile.title = MAIN[k];
      tile.querySelector('#tx_backStat').style.backgroundImage = `url(ui/uitk/img/statBack${i + 1}.png)`;
      tile.querySelector('#tx_stat').style.backgroundImage = `url(ui/uitk/img/tx_${icon}.png)`;
      ui.set(tile, 'lbl_statValue', fmt(total(k))); blocks.append(tile);
    }
    const details = w.querySelector('#ctr_mainStatsDetails'), seeDetails = w.querySelector('#btn_seeDetails');
    details.style.display = 'none';
    seeDetails.onclick = () => { const open = details.style.display === 'none'; details.style.display = open ? 'flex' : 'none'; seeDetails.querySelector('.dbtn-icon').style.setProperty('--i', `url(ui/uitk/img/chevron${open ? 'Left' : 'Right'}.png)`); };
    // the graph (client EntityStatsGraph, drawn by code): 5 axes rotated 36°, radius 80, 6 rings, icons 20 px out
    const g = w.querySelector('#statsGraph');
    if (g) {
      const axes = [['Wisdom', 'wisdom'], ['Earth', 'strength'], ['Fire', 'intelligence'], ['Water', 'chance'], ['Wind', 'agility']], R = 80, C = 128;
      const max = Math.max(...axes.map(([k]) => total(k)), 1), pt = (i, r) => { const a = (-90 + 36 + i * 72) * Math.PI / 180; return [C + r * Math.cos(a), C + r * Math.sin(a)]; };
      const ring = r => axes.map((_, i) => pt(i, r).join(',')).join(' ');
      g.innerHTML = `<svg width="256" height="256" viewBox="0 0 256 256" style="position:absolute;left:-128px;top:-128px;overflow:visible">
        ${[1, 2, 3, 4, 5, 6].map(n => `<polygon points="${ring(R * n / 6)}" fill="none" stroke="rgba(182,179,230,${n === 6 ? .5 : .18})" stroke-width="${n === 6 ? 2 : 1}"/>`).join('')}
        ${axes.map((_, i) => `<line x1="${C}" y1="${C}" x2="${pt(i, R)[0]}" y2="${pt(i, R)[1]}" stroke="rgba(182,179,230,.25)"/>`).join('')}
        <polygon points="${axes.map(([k], i) => pt(i, Math.max(6, R * total(k) / max)).join(',')).join(' ')}" fill="rgba(240,255,79,.3)" stroke="rgb(240,255,79)" stroke-width="2" stroke-linejoin="round"/>
        ${axes.map(([k, icon], i) => { const [x, y] = pt(i, R + 20); return `<image href="ui/uitk/img/tx_${icon}.png" x="${x - 14}" y="${y - 14}" width="28" height="28"><title>${MAIN[k]} ${fmt(total(k))}</title></image>`; }).join('')}
      </svg>`;
    }
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
  encyclopediaBase: async w => { // tab "Bestiaire": the client's bestiaryTab, one bestiaryTabItem per monster we have (monsters.json)
    w.querySelector('#tabs').innerHTML = `<div data-t="DofusTab" class="dtab is-checked"><div class="unity-text-element">BESTIAIRE</div></div>`;
    const host = w.querySelector('#uiCtr'); host.replaceChildren(...await ui.fragment('bestiaryTab')); host.style.flexGrow = 1;
    for (const id of ['sv_filters', 'lbl_noResult', 'footer']) host.querySelector('#' + id)?.style.setProperty('display', 'none'); // filters / loot toggles: built from server data
    while (!MONS) await new Promise(r => setTimeout(r, 50));
    const bounties = new Set(Object.values(MONS.bounty).flat()), list = host.querySelector('#gd_list'), details = host.querySelector('#ctr_monsterDetails');
    const all = Object.entries(MONS.mon).map(([id, m]) => ({ id: +id, name: m[0], lo: m[5], hi: m[6], flags: m[7] || 0, grades: m[8] || [], race: m[9] || '' })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    const [proto] = await ui.fragment('bestiaryTabItem');
    Object.assign(list.style, { overflowY: 'auto', flexGrow: 1, display: 'flex', flexDirection: 'column' });
    const render = q => {
      const found = all.filter(m => !q || m.name.toLowerCase().includes(q.toLowerCase()) || m.race.toLowerCase().includes(q.toLowerCase()));
      list.replaceChildren(...found.slice(0, 300).map(m => {
        const row = proto.cloneNode(true); row.dataset.id = m.id; Object.assign(row.style, { flexShrink: 0, cursor: 'pointer' });
        row.querySelector('#tx_monster').innerHTML = `<img loading="lazy" src="ui/monsters/${m.id}.png${BUST}" alt="" style="width:100%;height:100%;object-fit:contain">`;
        ui.set(row, 'lbl_monsterName', m.name); ui.set(row, 'lbl_monsterRace', m.race);
        ui.set(row, 'lbl_monsterLevel', m.lo === m.hi ? `Niv. ${m.lo}` : `Niv. ${m.lo} à ${m.hi}`);
        row.querySelector('#tx_aggro').style.display = 'none';
        row.querySelector('#tx_category').style.display = m.flags & 3 ? 'flex' : 'none';
        row.querySelector('#tx_bounty').style.display = bounties.has(m.id) ? 'flex' : 'none';
        return row;
      }));
      ui.set(host, 'lbl_searchResultCount', `Monstres trouvés : ${found.length}`);
    };
    const input = host.querySelector('#inp_search input'); if (input) { input.placeholder = 'Rechercher un monstre'; input.oninput = () => render(input.value.trim()); }
    details.style.display = 'none';
    list.addEventListener('click', e => { // the detail panel: name, family, levels, XP of the first grade
      const row = e.target.closest('[data-id]'); if (!row) return; const m = all.find(x => x.id === +row.dataset.id);
      details.style.display = 'flex';
      ui.set(details, 'lbl_nameDetail', m.name); ui.set(details, 'lbl_monsterRaceDetail', m.race);
      ui.set(details, 'lbl_levelDetail', m.lo === m.hi ? `Niveau ${m.lo}` : `Niveau ${m.lo} à ${m.hi}`); ui.set(details, 'lbl_xpDetail', `${fmt(m.grades[0]?.[1] || 0)} XP`);
      const pic = details.querySelector('#tx_monsterDetail'); pic.querySelector('img.portrait')?.remove();
      pic.insertAdjacentHTML('afterbegin', `<img class="portrait" src="ui/monsters/${m.id}.png${BUST}" alt="" style="width:96px;height:96px;object-fit:contain;flex-shrink:0">`);
    });
    host.querySelector('#btn_closeDetails')?.addEventListener('click', () => details.style.display = 'none');
    render('');
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
    // the hero's cosmetic slots (left column): what is worn, click = show that category; the eye buttons keep the client look only
    const WORN = { slot_helmet: 'hat', slot_cape: 'cape', slot_wing: 'wings', slot_shield: 'shield' };
    const worn = () => {
      for (const [id, slot] of Object.entries(WORN)) {
        const el = w.querySelector('#' + id); if (!el) continue;
        const sk = lookState()[slot]; el.querySelector('.cosmetic-worn')?.remove(); el.querySelector('.slot-icon').style.display = sk ? 'none' : '';
        if (sk) { el.insertAdjacentHTML('beforeend', `<div class="cosmetic-worn" data-slot="${slot}" data-id="${sk}" style="position:absolute;inset:2px;pointer-events:none"><canvas width="152" height="152" style="width:100%;height:100%"></canvas></div>`); thumb(el.querySelector('.cosmetic-worn')); }
      }
    };
    for (const [id, slot] of Object.entries(WORN)) { const el = w.querySelector('#' + id); if (el) { el.style.cursor = 'pointer'; el.onclick = () => show(slot); } }
    grid.addEventListener('click', e => {
      const t = e.target.closest('.cosmetic'); if (!t) return;
      equip(t.dataset.slot, t.dataset.id); worn();
      const cur = String(lookState()[t.dataset.slot]); grid.querySelectorAll('.cosmetic').forEach(x => x.classList.toggle('on', x.dataset.id === cur));
    });
    show('hat'); worn();
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
  const at = (name, fill, place, opts) => ui.widget(name, fill, (w, h, W, H) => { const p = place(w, h, W, H); R[name] = { x: p[0], y: p[1], w, h }; return p; }, opts);
  await at('chatview', w => {
    // the chat fills its widget: resizing the widget gives the log more room
    const list = w.querySelector('#listChat'); list.append($('#chatlog')); Object.assign(list.style, { flexGrow: 1, minHeight: '60px' });
    Object.assign(w.querySelector('#Chat').style, { width: '440px', height: '240px' });
    w.querySelector('#ti_chatInput').replaceChildren($('#say'));
    w.querySelector('#btn_news')?.style.setProperty('display', 'none');
  }, (w, h, W, H) => [pad, H - h - pad]);
  await at('characterInformations', w => { // resizing makes the heart bigger / smaller (opts.scale)
    for (const id of ['ctr_ip', 'tx_shield', 'parentTopBottom', 'erosion_mask', 'threshold_mask']) // fight-only parts; erosion is sized by code (none here) w.querySelector('#' + id)?.style.setProperty('display', 'none');
    ui.set(w, 'lbl_pdv', stats.life); ui.set(w, 'lbl_pa', stats.ap); ui.set(w, 'lbl_pm', stats.mp);
  }, (w, h, W, H) => [W * .3, H - h - pad], { scale: true });
  await at('actionBar', w => {
    const bar = w.querySelector('#gd_spellitemotes'); bar.id = 'spellbar'; bar.className = 'slotgrid'; bar.style.width = 12 * 50 + 'px';
    setupSpellTips(bar);
  }, (w, h, W, H) => [W * .3 + (R.characterInformations?.w || 200) + pad, H - h - pad]);
  await at('bannerMenu', w => {
    // the client's menu: a 42 px column on the right, filled by code; ours wraps into more columns so every button shows
    const main = w.querySelector('#gd_btnUis'); main.className = 'hud-menu'; main.id = 'menu';
    main.innerHTML = [...MENU, ...MORE].map(menuButton).join(''); $('#mute').className = 'hud-slot'; main.append($('#mute'));
    // a grid filling columns top to bottom: resizing the widget changes how many rows / columns show
    Object.assign(main.style, { display: 'grid', gridAutoFlow: 'column', gridTemplateRows: 'repeat(auto-fill, 38px)', gridAutoColumns: '38px', gap: '4px', width: '100%', height: '100%' });
    Object.assign(w.querySelector('#BannerMenu').style, { width: Math.ceil(main.children.length / 8) * 42 + 12 + 'px', height: 8 * 42 + 8 + 'px', minWidth: '50px', minHeight: '50px' });
    w.querySelector('#ctr_moreBtn')?.style.setProperty('display', 'none');
    w.querySelectorAll('[data-win]').forEach(b => b.addEventListener('click', () => openMenu(b.dataset.win)));
  }, (w, h, W, H) => [W - w - pad, H - h - pad]);
  await at('widgetProgressGauge', w => {
    // the client's progress widget: ⋮ chooses which progression it follows (character, guild, mount XP, honour)
    const GAUGES = [['experience', 'Expérience du personnage', () => [stats.level, stats.xp]], ['guild', 'Expérience de guilde', () => [stats.guildLevel, stats.guildXp]],
      ['mount', 'Expérience de monture', () => [stats.mountLevel, stats.mountXp]], ['alignment', 'Honneur', () => [stats.grade, stats.honour]]];
    const show = i => {
      const [icon, title, get] = GAUGES[i], [lvl, ratio] = get(); localStorage.gauge = i;
      w.querySelector('#icon').style.setProperty('--i', `url(ui/uitk/img/${icon}.png)`); w.querySelector('#gauge').title = title;
      ui.set(w, 'lbl_title', icon === 'alignment' ? 'GRADE' : 'NIV.'); ui.set(w, 'lbl_value', lvl);
      const f = w.querySelector('#gauge .pb-fill'); if (f) f.style.width = ratio * 100 + '%';
    };
    w.querySelector('#omega')?.style.setProperty('display', 'none');
    w.querySelector('#btn_settings').onclick = e => ui.menu(e, GAUGES.map(([icon, t], i) => [t, () => show(i), icon, i === (+localStorage.gauge || 0)]), 'Progression suivie');
    show(+localStorage.gauge || 0);
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
  onCommand('hud', () => { ui.resetWidgets(); location.reload(); }); // widgets back to their default places and sizes
  const sc = $('#opt-ui'); if (sc) { sc.value = Math.round((+localStorage.uiScale || 1) * 100); sc.oninput = () => ui.setScale(sc.value / 100); }
  drawPreviews();
  chat(`Bienvenue, ${NAME} ! Clique sur une case pour te déplacer, au-delà du bord pour changer de carte. /tp x,y pour te téléporter, /stats pour d'autres caractéristiques, /hud pour replacer l'interface.`, 'info');
}

// ---------- monster group tooltip (client WorldRpMonstersGroupTooltip + one MonsterTooltipLine per monster)
// header "Niveau <sum>", XP the hero would win (grade XP × wisdom) and the group's base XP, then each monster with its
// archmonster / boss / bounty marks. groupTip(group | null, mouse event) from game.js.
let MONS = null, tipEl = null, tipFor = null;
fetch('data/monsters.json' + BUST, { cache: 'no-store' }).then(r => r.json()).then(d => MONS = d);
const xpOf = m => { const g = MONS?.mon[m.id]?.[8] || []; return (g.find(([l]) => l >= m.lvl) || g[g.length - 1] || [0, 0])[1]; };
export async function groupTip(g, e) {
  if (!g) { if (tipEl) tipEl.style.display = 'none'; tipFor = null; return; }
  if (!tipEl) {
    const [el] = await ui.fragment('WorldRpMonstersGroupTooltip'); if (tipEl) return; tipEl = el;
    Object.assign(tipEl.style, { position: 'absolute', pointerEvents: 'none', zIndex: 9000, minWidth: '240px' });
    for (const id of ['ctr_malusArena', 'ctr_waves']) tipEl.querySelector('#' + id).style.display = 'none';
    $('#uitk-layer').append(tipEl);
  }
  if (tipFor !== g) {
    tipFor = g;
    const lvl = g.members.reduce((t, x) => t + x.lvl, 0), base = g.members.reduce((t, x) => t + xpOf(x), 0);
    const bounties = new Set(Object.values(MONS?.bounty || {}).flat()), head = tipEl.querySelector('#tooltipHeader');
    head.className = 'tooltipHeader title';
    head.innerHTML = `<div style="flex-direction:row;align-items:center;justify-content:center;gap:6px;padding:6px 10px">` +
      `<div class="dicon" style="--i:url(ui/uitk/img/weapon.png);width:18px;height:18px"></div><div class="unity-text-element title_small textColor_white_white100">Niveau ${lvl}</div></div>`;
    ui.set(tipEl, 'lbl_xp', fmt(Math.floor(base * (1 + stats.detail[0][1][1][1] / 100)))); // × (1 + Sagesse / 100)
    ui.set(tipEl, 'lbl_groupXp', fmt(base)); ui.set(tipEl, 'lbl_groupLabel', 'groupe');
    const members = [...g.members].sort((a, b) => b.lvl - a.lvl), lines = await Promise.all(members.map(() => ui.fragment('MonsterTooltipLine')));
    if (tipFor !== g) return; // the mouse moved to another group meanwhile
    const list = tipEl.querySelector('#ctr_monsterList'); list.replaceChildren(); list.style.padding = '6px 10px 8px';
    for (const [i, m] of members.entries()) {
      const [line] = lines[i], f = MONS?.mon[m.id]?.[7] || 0;
      Object.assign(line.style, { flexDirection: 'row', alignItems: 'center' });
      line.querySelector('#ic_miniboss').style.display = f & 1 ? 'flex' : 'none';
      line.querySelector('#ic_boss').style.display = f & 2 ? 'flex' : 'none';
      line.querySelector('#ic_bounty').style.display = bounties.has(m.id) ? 'flex' : 'none';
      const name = line.querySelector('#lbl_monsterName'); Object.assign(name.style, { flexDirection: 'row', gap: '4px' });
      name.innerHTML = `<span>${m.name}</span><span style="color:var(--highlight_secondary80)">niv. ${m.lvl}</span>`;
      list.append(line);
    }
  }
  const z = parseFloat($('#uitk-layer').style.zoom) || 1, L = $('#uitk-layer');
  tipEl.style.display = 'flex';
  tipEl.style.left = Math.min(L.clientWidth - tipEl.offsetWidth - 4, e.clientX / z + 18) + 'px';
  tipEl.style.top = Math.max(4, Math.min(L.clientHeight - tipEl.offsetHeight - 4, e.clientY / z - tipEl.offsetHeight / 2)) + 'px';
}

// name label above the hero, in CSS pixels
export function nameAt(x, y) { $('#heroname').style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`; }
