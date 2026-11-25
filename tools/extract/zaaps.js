// Zaaps -> public/data/zaaps.json {gfx: [ids of zaap sprites / rigs], list: [{mapId, name, pos}]}
// Which interactive element is a zaap is server data; we infer the sprites: frequent on waypoint maps, rare elsewhere.
const fs = require('fs');
const T = f => JSON.parse(fs.readFileSync(`extract/data/${f}.json`)).objectsById.m_values;
const txt = JSON.parse(fs.readFileSync('extract/data/i18n_fr.json'));
const sub = {}; T('SubAreasDataRoot').forEach(s => sub[s.id] = s);
const area = {}; T('AreasDataRoot').forEach(a => area[a.id] = txt[a.nameId] || '');
const idx = JSON.parse(fs.readFileSync('public/maps/index.json'));
const wp = T('WaypointsDataRoot').filter(w => idx[w.mapId]);
const onWp = {}, everywhere = {}, wpIds = new Set(wp.map(w => String(w.mapId)));
for (const f of fs.readdirSync('public/maps')) if (f !== 'index.json') {
  const id = f.slice(0, -5), seen = new Set(JSON.parse(fs.readFileSync('public/maps/' + f)).inter.map(i => i[0]));
  for (const g of seen) { everywhere[g] = (everywhere[g] || 0) + 1; if (wpIds.has(id)) onWp[g] = (onWp[g] || 0) + 1; }
}
const gfx = Object.keys(onWp).filter(g => onWp[g] >= 3 && everywhere[g] <= onWp[g] * 3).map(Number);
const list = wp.map(w => { const s = sub[w.subAreaId] || {}; return { mapId: w.mapId, name: [area[s.areaId], txt[s.nameId]].filter(Boolean).join(' – '), pos: idx[w.mapId].slice(0, 2) }; })
  .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
fs.mkdirSync('public/data', { recursive: true });
fs.writeFileSync('public/data/zaaps.json', JSON.stringify({ gfx, list }));
console.log('zaap sprites', gfx.map(g => `${g} (${onWp[g]}/${everywhere[g]})`).join(', '), '·', list.length, 'zaaps');
