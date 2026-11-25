// Monsters per subarea -> public/data/monsters.json
// {sub: {subAreaId: [monsterId]}, mon: {id: [name, bone, [skins], [colours], scale %, minLevel, maxLevel]}}
// Spawn positions are server data: the game places groups of the subarea's monsters on walkable cells.
const fs = require('fs');
const T = f => JSON.parse(fs.readFileSync(`extract/data/${f}.json`)).objectsById.m_values;
const txt = JSON.parse(fs.readFileSync('extract/data/i18n_fr.json'));
const rigs = new Set(fs.readdirSync('public/rigs').map(f => f.replace('.json', '')));
// look "{bone|skin,skin|1=#rrggbb,2=123|scale}" (colour values hex "#..." or decimal)
function parseLook(l) {
  const [bone, skins = '', cols = '', scale = '100'] = l.replace(/^\{|\}$/g, '').split('|');
  const colors = [];
  for (const c of cols.split(',').filter(Boolean)) { const [i, v] = c.split('='); colors[+i - 1] = v.startsWith('#') ? parseInt(v.slice(1), 16) : +v; }
  return [+bone, skins.split(',').filter(Boolean).map(Number), colors, +scale.split(',')[0] || 100];
}
const mon = {}, sub = {};
const all = {}; T('MonstersDataRoot').forEach(m => all[m.id] = m);
for (const s of T('SubAreasDataRoot')) {
  const ids = s.monsters.filter(id => {
    const m = all[id]; if (!m) return false;
    const [bone, skins, colors, scale] = parseLook(m.look);
    if (bone !== 1 && !rigs.has(String(bone))) return false;
    const lv = m.grades.map(g => g.level);
    mon[id] ??= [txt[m.nameId] || `Monstre ${id}`, bone, skins, colors, scale, Math.min(...lv), Math.max(...lv)];
    return true;
  });
  if (ids.length) sub[s.id] = ids;
}
fs.mkdirSync('public/data', { recursive: true });
fs.writeFileSync('public/data/monsters.json', JSON.stringify({ sub, mon }));
console.log(Object.keys(mon).length, 'monsters in', Object.keys(sub).length, 'subareas');
