// Quests -> public/data/quests.json
// {q: {id: [name, category, levelMin, startCriterion, [[mapId, npcId]] givers, [stepIds]]},
//  s: {id: [questId, name, description, [objectiveIds]]},
//  o: {id: [type, npcId, mapId, text, subAreaId]}}
// Objective types: 1 go to NPC, 2 show item to NPC, 3 bring item to NPC, 4 discover map, 5 discover subarea, 6/7/14 fight,
// 8 use, 9 go back to NPC, 10 free text, 12 bring souls to NPC, 13 eliminate, 16 fight on a map, 17 craft.
// mapId: the objective's map, or the outdoor map at its coordinates.
const fs = require('fs');
const T = f => JSON.parse(fs.readFileSync(`extract/data/${f}.json`)).objectsById.m_values;
const txt = JSON.parse(fs.readFileSync('extract/data/i18n_fr.json'));
const idx = JSON.parse(fs.readFileSync('public/maps/index.json'));
const name = (table, key = 'nameId') => { const o = {}; T(table).forEach(x => o[x.id] = txt[x[key]] || ''); return o; };
const npcs = name('NpcsDataRoot'), items = name('ItemsDataRoot'), monsters = name('MonstersDataRoot'), subs = name('SubAreasDataRoot');
const cats = name('QuestCategoriesDataRoot'), types = name('QuestObjectiveTypesDataRoot');
// outdoor map at (x, y): world map 1 first, then the first map MapsCoordinates lists
const rank = {}; T('MapsCoordinatesDataRoot').forEach(c => c.mapIds.forEach((id, i) => rank[id] = i));
const at = {};
for (const [id, [x, y, , w]] of Object.entries(idx)) {
  const k = `${x},${y}`, cur = at[k]; const score = (w === 1 ? 0 : 100) + (rank[id] ?? 50);
  if (!cur || score < cur[1]) at[k] = [+id, score];
}
const q = {}, s = {}, o = {};
for (const x of T('QuestObjectivesDataRoot')) {
  const p = x.parameters, P = [p.parameter0, p.parameter1, p.parameter2, p.parameter3];
  const hasNpc = [1, 2, 3, 9, 12].includes(x.typeId), map = idx[x.mapId] ? x.mapId : (x.coords.x > -1e9 && at[`${x.coords.x},${x.coords.y}`]?.[0]) || 0;
  const arg = {
    1: [npcs[P[0]]], 9: [npcs[P[0]]], 2: [npcs[P[0]], items[P[1]], P[2]], 3: [npcs[P[0]], items[P[1]], P[2]], 12: [npcs[P[0]], monsters[P[1]], P[2]],
    4: [txt[P[0]] || (idx[map] ? `[${idx[map][0]},${idx[map][1]}]` : '')], 5: [subs[P[0]]], 6: [monsters[P[0]], P[1]], 7: [monsters[P[0]], P[1]],
    14: [monsters[P[0]], P[1]], 16: [monsters[P[0]], P[1]], 13: [monsters[P[0]]], 8: [items[P[0]]], 17: [items[P[0]], P[1]], 10: [txt[P[0]]], 0: [txt[P[0]]],
  }[x.typeId] || [];
  const text = (types[x.typeId] || '#1').replace(/#(\d)/g, (_, n) => arg[n - 1] ?? '').replace(/\s+/g, ' ').trim();
  o[x.id] = [x.typeId, hasNpc ? P[0] : 0, map, text, x.typeId === 5 ? P[0] : 0];
}
for (const x of T('QuestStepsDataRoot')) s[x.id] = [x.questId, txt[x.nameId] || '', txt[x.descriptionId] || '', x.objectiveIds.filter(i => o[i])];
for (const x of T('QuestsDataRoot')) {
  if (x.isEvent) continue;
  q[x.id] = [txt[x.nameId] || `Quête ${x.id}`, cats[x.categoryId] || '', x.levelMin, x.startCriterion || '',
    x.startPosition.filter(sp => idx[sp.mapId] && npcs[sp.npcId] !== undefined).map(sp => [sp.mapId, sp.npcId]), x.stepIds.filter(i => s[i])];
}
fs.mkdirSync('public/data', { recursive: true });
fs.writeFileSync('public/data/quests.json', JSON.stringify({ q, s, o }));
// subarea -> area (map transitions through doors / pipes stay inside an area)
fs.writeFileSync('public/data/subareas.json', JSON.stringify(Object.fromEntries(T('SubAreasDataRoot').map(x => [x.id, x.areaId]))));
const placed = Object.values(o).filter(x => x[1] && x[2]).length;
console.log(Object.keys(q).length, 'quests,', Object.keys(s).length, 'steps,', Object.keys(o).length, 'objectives (', placed, 'with an NPC on a map)');
