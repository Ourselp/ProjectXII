// Decode the maps of one subarea (default 95 = Cité d'Astrub) into extract/maps/<id>.json
// Needs extract/raw_maps/ (AssetStudio -m extract of Content/Map/Data) and extract/data/ (data tables).
const fs = require('fs'), { readFile } = require('./unityread');
const sub = +(process.argv[2] || 95);
// map id -> unpacked file (bundle names don't tell which maps they hold)
if (!fs.existsSync('extract/map_index.json')) {
  const idx = {};
  for (const d of fs.readdirSync('extract/raw_maps')) for (const f of fs.readdirSync('extract/raw_maps/' + d)) {
    if (f.endsWith('.resS')) continue;
    for (const m of fs.readFileSync(`extract/raw_maps/${d}/${f}`).toString('latin1').matchAll(/map_(\d{5,})/g)) idx[m[1]] = `${d}/${f}`;
  }
  fs.writeFileSync('extract/map_index.json', JSON.stringify(idx));
}
const idx = JSON.parse(fs.readFileSync('extract/map_index.json'));
const sa = JSON.parse(fs.readFileSync('extract/data/SubAreasDataRoot.json')).objectsById.m_values.find(x => x.id === sub);
const want = new Set(sa.mapIds.map(String)), files = new Set(sa.mapIds.map(m => idx[m]));
fs.mkdirSync('extract/maps', { recursive: true });
for (const f of files) for (const o of readFile('extract/raw_maps/' + f))
  if (want.has(String(o.value.id))) fs.writeFileSync(`extract/maps/${o.value.id}.json`, JSON.stringify(o.value));
console.log(fs.readdirSync('extract/maps').length, 'maps');
