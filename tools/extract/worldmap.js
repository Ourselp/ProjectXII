// World map window data -> public/data/world.json
// {worlds: [{id, name, n}], cells: {worldId: [[x, y, mapId, subAreaId], ...]}, subs: {id: [name, areaId]}, areas: {id: name}}
// One map per (world, x, y): the first one MapsCoordinates lists for that position (interiors share coordinates).
const fs = require('fs');
const T = f => JSON.parse(fs.readFileSync(`extract/data/${f}.json`)).objectsById.m_values;
const txt = JSON.parse(fs.readFileSync('extract/data/i18n_fr.json'));
const idx = JSON.parse(fs.readFileSync('public/maps/index.json')); // id -> [x, y, subArea, worldMap]
const rank = {}; T('MapsCoordinatesDataRoot').forEach(c => c.mapIds.forEach((id, i) => rank[id] = i));
const pick = {};
for (const [id, [x, y, sub, w]] of Object.entries(idx)) {
  if (w < 0) continue;
  const k = `${w},${x},${y}`, cur = pick[k];
  if (!cur || (rank[id] ?? 99) < (rank[cur[2]] ?? 99)) pick[k] = [x, y, +id, sub, w];
}
const cells = {}, used = new Set();
for (const [x, y, id, sub, w] of Object.values(pick)) { (cells[w] ??= []).push([x, y, id, sub]); used.add(sub); }
const subs = {}, areas = {};
for (const s of T('SubAreasDataRoot')) if (used.has(s.id)) subs[s.id] = [txt[s.nameId] || '', s.areaId];
for (const a of T('AreasDataRoot')) areas[a.id] = txt[a.nameId] || '';
const worlds = T('WorldMapsDataRoot').filter(w => cells[w.id]).map(w => ({ id: w.id, name: txt[w.nameId] || `Monde ${w.id}`, n: cells[w.id].length }))
  .sort((a, b) => b.n - a.n);
fs.writeFileSync('public/data/world.json', JSON.stringify({ worlds, cells, subs, areas }));
console.log(worlds.length, 'worlds,', Object.values(cells).flat().length, 'positions');
