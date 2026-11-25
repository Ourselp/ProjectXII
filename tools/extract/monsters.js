// Monsters per subarea -> public/data/monsters.json
// {sub: {subAreaId: [monsterId]}, mon: {id: [name, bone, [skins], [colours], scale %, minLevel, maxLevel, flags, [[level, xp]], family]}}
// + portraits public/ui/monsters/<id>.png (needs extract/mon_picto: AssetStudio export of Picto/Monsters/monster_assets_1x)
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
fs.mkdirSync('public/ui/monsters', { recursive: true });
const all = {}; T('MonstersDataRoot').forEach(m => all[m.id] = m);
// every monster goes in mon (bestiary, tooltips); keep() = it can also be drawn (its rig exists): only those spawn
const add = m => {
  const [bone, skins, colors, scale] = parseLook(m.look), drawable = bone === 1 || rigs.has(String(bone)), lv = m.grades.map(g => g.level);
  if (!lv.length) return false;
  mon[m.id] ??= [txt[m.nameId] || `Monstre ${m.id}`, bone, skins, colors, scale, Math.min(...lv), Math.max(...lv),
    (miniBoss.has(m.id) ? 1 : 0) | (m.m_flags & 4 ? 2 : 0) | (drawable ? 4 : 0), m.grades.map(g => [g.level, g.xp]), races[m.race] || '']; // flags: 1 archmonster, 2 boss, 4 drawable; [level, xp] per grade; family
  const pic = `extract/mon_picto/Sprite/${m.gfxId}.png`; // portrait (Picto/Monsters, by gfxId) -> public/ui/monsters/<id>.png
  if (fs.existsSync(pic)) fs.copyFileSync(pic, `public/ui/monsters/${m.id}.png`);
  return drawable;
};
const keep = add;
for (const s of T('SubAreasDataRoot')) {
  const ids = s.monsters.filter(id => all[id] && !special(all[id]) && keep(all[id]));
  const b = s.monsters.filter(id => all[id] && isBounty(all[id]) && keep(all[id]));
  if (ids.length) sub[s.id] = ids;
  if (b.length) bounty[s.id] = b;
  if (s.dungeonId >= 0) dungeon.push(s.id);
}
// dungeons: the last room (mapIds order) holds the boss(es), escorted by the dungeon's monsters (game.js)
const bossRoom = {};
for (const d of T('DungeonsDataRoot')) { const b = (d.bosses || []).filter(id => all[id] && keep(all[id])); if (b.length && d.mapIds?.length) bossRoom[d.mapIds[d.mapIds.length - 1]] = b; }
// archmonsters: a normal monster's rare variant (correspondingMiniBossId); the game sometimes swaps one in
const archi = {};
for (const m of Object.values(all)) if (mon[m.id] && m.correspondingMiniBossId > 0 && all[m.correspondingMiniBossId] && keep(all[m.correspondingMiniBossId])) archi[m.id] = m.correspondingMiniBossId;
for (const m of Object.values(all)) add(m); // the rest, for the bestiary
fs.mkdirSync('public/data', { recursive: true });
fs.writeFileSync('public/data/monsters.json', JSON.stringify({ sub, mon, bounty, dungeon, bossRoom, archi }));
console.log(Object.keys(bossRoom).length, 'boss rooms,', Object.keys(archi).length, 'archmonsters,', Object.keys(mon).length, 'monsters in', Object.keys(sub).length, 'subareas,', Object.keys(bounty).length, 'with bounties,', dungeon.length, 'dungeon subareas');
