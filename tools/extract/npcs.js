// NPCs -> public/data/npcs.json and extract/npc_bones.json (rigs to export, read by rigs.js)
// Where NPCs stand is server data; the client links NPCs to maps through quests: givers (startPosition) and objectives
// (go see / bring / show / go back to / souls to). Needs public/data/quests.json (quests.js). No cell: the game picks one.
// {maps: {mapId: [npcId]}, npc: {id: [name, bone, [skins], [colours], scale %]}} + public/data/npc/<id>.json {messages, replies, actions}
const fs = require('fs');
const T = f => JSON.parse(fs.readFileSync(`extract/data/${f}.json`)).objectsById.m_values;
const txt = JSON.parse(fs.readFileSync('extract/data/i18n_fr.json'));
const idx = JSON.parse(fs.readFileSync('public/maps/index.json'));
const N = {}; T('NpcsDataRoot').forEach(n => N[n.id] = n);
const actions = {}; T('NpcActionsDataRoot').forEach(a => actions[a.id] = txt[a.nameId] || '');
function parseLook(l) { // "{bone|skin,skin|1=#rrggbb,2=123|scale|sub-entities…}": main entity only
  const [bone, skins = '', cols = '', scale = '100'] = (l.match(/^\{([^{}]*)/)?.[1] || '').split('|');
  const colors = [];
  for (const c of cols.split(',').filter(Boolean)) { const [i, v] = c.split('='); if (v == null) continue; colors[+i - 1] = v.startsWith('#') ? parseInt(v.slice(1), 16) : +v; }
  return [+bone, skins.split(',').filter(Boolean).map(Number), colors, +scale.split(',')[0] || 100];
}
// every NPC the quests place (givers + objective NPCs, public/data/quests.json from quests.js); maps = all their spots
const Q = JSON.parse(fs.readFileSync('public/data/quests.json'));
const spots = [...Object.values(Q.q).flatMap(q => q[4]), ...Object.values(Q.o).filter(o => o[1] && o[2]).map(o => [o[2], o[1]])];
const maps = {}, npc = {}, dialogs = {}, bones = new Set();
for (const [mapId, npcId] of spots) {
  const n = N[npcId]; if (!n || !n.look) continue;
  if (!npc[n.id]) {
    const [bone, skins, colors, scale] = parseLook(n.look);
    npc[n.id] = [txt[n.nameId] || `PNJ ${n.id}`, bone, skins, colors, scale];
    // #1, #2… are filled in by the server (amounts, names): shown as « … »; duplicate replies dropped
    const clean = list => [...new Set(list.map(x => txt[x.values[1]]).filter(Boolean).map(t => t.replace(/#\d+/g, '…').replace(/\.$/, '').trim()))];
    dialogs[n.id] = { messages: clean(n.dialogMessages), replies: clean(n.dialogReplies),
      actions: n.actions.map(a => actions[a]).filter(Boolean) };
    if (bone !== 1) bones.add(String(bone));
  }
  const list = maps[mapId] ??= []; if (!list.includes(n.id)) list.push(n.id);
}
fs.mkdirSync('public/data', { recursive: true });
fs.writeFileSync('public/data/npcs.json', JSON.stringify({ maps, npc }));
fs.mkdirSync('public/data/npc', { recursive: true });
for (const [id, d] of Object.entries(dialogs)) fs.writeFileSync(`public/data/npc/${id}.json`, JSON.stringify(d));
fs.writeFileSync('extract/npc_bones.json', JSON.stringify([...bones]));
console.log(Object.keys(npc).length, 'NPCs on', Object.keys(maps).length, 'maps,', bones.size, 'rigs');
