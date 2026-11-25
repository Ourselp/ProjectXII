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
// not wandering on maps: bounties ("Avis de recherche"), quest / event monsters, archmonsters, summons, prisms, guardians,
// dopples, bosses (m_flags bit 2) and mini-bosses
const races = {}; T('MonsterRacesDataRoot').forEach(r => races[r.id] = txt[r.nameId] || '');
const miniBoss = new Set(T('MonsterMinibossesDataRoot').map(m => m.id));
const special = m => m.isBounty || m.m_flags & 4 || miniBoss.has(m.id) ||
  /recherche|quête|archimonstre|invocation|prisme|événement|gardien|garde|dopeul|percepteur|boss/i.test(races[m.race] || '');
// bounties come back on their own timer: kept apart (bounty: {subAreaId: [ids]}), the game shows one now and then
const isBounty = m => m.isBounty || /recherche/i.test(races[m.race] || '');
const mon = {}, sub = {}, bounty = {}, dungeon = [];
const all = {}; T('MonstersDataRoot').forEach(m => all[m.id] = m);
const keep = m => {
  const [bone, skins, colors, scale] = parseLook(m.look);
  if (bone !== 1 && !rigs.has(String(bone))) return false;
  const lv = m.grades.map(g => g.level);
  mon[m.id] ??= [txt[m.nameId] || `Monstre ${m.id}`, bone, skins, colors, scale, Math.min(...lv), Math.max(...lv)];
  return true;
};
for (const s of T('SubAreasDataRoot')) {
  const ids = s.monsters.filter(id => all[id] && !special(all[id]) && keep(all[id]));
  const b = s.monsters.filter(id => all[id] && isBounty(all[id]) && keep(all[id]));
  if (ids.length) sub[s.id] = ids;
  if (b.length) bounty[s.id] = b;
  if (s.dungeonId >= 0) dungeon.push(s.id);
}
fs.mkdirSync('public/data', { recursive: true });
fs.writeFileSync('public/data/monsters.json', JSON.stringify({ sub, mon, bounty, dungeon }));
console.log(Object.keys(mon).length, 'monsters in', Object.keys(sub).length, 'subareas,', Object.keys(bounty).length, 'with bounties,', dungeon.length, 'dungeon subareas');
