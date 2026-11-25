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
// illustrated world maps (Picto/Worldmaps): tiles worldmaps/<world>/<zoom>/<n>.jpg, 1024 px, row-major, n from 1.
// Needs extract/wm (AssetStudio -m export -t tex2d -g none -f assetName_pathID) and extract/raw_wm (-m extract) of the bundle.
// We keep zoom 1 as JPG in public/worldmap/<world>/<n>.jpg. Map (x, y) -> image px: origine + (x, y) * mapWidth/Height.
const { readCatalog } = require('./addrcat'), { readFile } = require('./unityread'), { execFileSync } = require('child_process');
const C = process.argv[2] || `${process.env.LOCALAPPDATA}/Ankama/Dofus-dofus3/Dofus_Data/StreamingAssets/Content`;
const cat = readCatalog(`${C}/Picto/Worldmaps/catalog_1.0.bin`);
const d = 'extract/raw_wm/' + fs.readdirSync('extract/raw_wm')[0], bundle = readFile(`${d}/${fs.readdirSync(d).find(f => !f.endsWith('.resS'))}`, null);
const texIds = new Set(bundle.filter(o => o.classId === 28).map(o => String(o.pathId)));
const files = {}; for (const f of fs.readdirSync('extract/wm')) files[f.match(/@(-?\d+)\.png$/)?.[1]] = f;
const art = {};
for (const { first: guid, second } of bundle.find(o => o.classId === 142).value.m_Container) {
  const id = String(second.asset.m_PathID), m = (cat[guid] || '').match(/worldmaps\/(\d+)\/1\/(\d+)\.jpg/);
  if (!m || !texIds.has(id) || !files[id]) continue;
  const out = `public/worldmap/${m[1]}/${m[2]}.jpg`; fs.mkdirSync(`public/worldmap/${m[1]}`, { recursive: true });
  if (!fs.existsSync(out)) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `extract/wm/${files[id]}`, '-q:v', '4', out]);
  art[m[1]] = true;
}
const worlds = T('WorldMapsDataRoot').filter(w => cells[w.id]).map(w => ({ id: w.id, name: txt[w.nameId] || `Monde ${w.id}`, n: cells[w.id].length,
  img: art[w.id] ? { w: w.totalWidth, h: w.totalHeight, ox: w.origineX, oy: w.origineY, mw: w.mapWidth, mh: w.mapHeight } : null }))
  .sort((a, b) => b.n - a.n);
fs.writeFileSync('public/data/world.json', JSON.stringify({ worlds, cells, subs, areas }));
console.log(worlds.length, 'worlds,', Object.values(cells).flat().length, 'positions');
