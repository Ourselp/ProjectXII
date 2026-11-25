// Character creator data -> public/data/looks.json
// breeds: look "{bone|skin||scale}" + default colours; heads per breed/gender; equipment = skins grouped by the slot their parts fill.
const fs = require('fs');
const T = f => JSON.parse(fs.readFileSync(`extract/data/${f}.json`)).objectsById.m_values;
const txt = JSON.parse(fs.readFileSync('extract/data/i18n_fr.json'));
const skins = JSON.parse(fs.readFileSync('public/skins/index.json')); // id -> part name prefixes
const parse = l => { const m = l.match(/^\{(\d+)\|([\d,]+)\|[^|]*\|(\d+)/); return m ? { skin: +m[2].split(',')[0], scale: +m[3] } : null; };
const breeds = T('BreedsDataRoot').sort((a, b) => a.sortIndex - b.sortIndex).map(b => ({
  id: b.id, name: txt[b.shortNameId] || String(b.id),
  looks: [{ ...parse(b.maleLook), colors: b.maleColors }, { ...parse(b.femaleLook), colors: b.femaleColors }],
}));
const heads = {};
for (const h of T('HeadsDataRoot').sort((a, b) => a.order - b.order)) {
  const skin = +String(h.skins).split(',')[0];
  if (skins[skin]) (heads[`${h.breed}_${h.gender}`] ??= []).push({ skin, label: txt[h.nameId] || h.label });
}
// a cosmetic skin fills exactly one kind of slot and is neither a body (Torse) nor a head (Tete)
const SLOT = { hat: /^Chapeau/, cape: /^Cape/, shield: /^Bouclier/, wings: /^Aile/, pet: /^Familier/ };
const equip = Object.fromEntries(Object.keys(SLOT).map(k => [k, []]));
for (const [id, pre] of Object.entries(skins)) {
  if (pre.some(p => /^(Torse|Tete|Bras|Cuisse)/.test(p))) continue;
  const kinds = Object.entries(SLOT).filter(([, re]) => pre.some(p => re.test(p))).map(([k]) => k);
  if (kinds.length === 1) equip[kinds[0]].push(+id);
}
for (const k in equip) equip[k].sort((a, b) => a - b);
fs.mkdirSync('public/data', { recursive: true });
fs.writeFileSync('public/data/looks.json', JSON.stringify({ breeds, heads, equip }));
console.log(breeds.length, 'breeds,', Object.values(heads).flat().length, 'heads,', Object.entries(equip).map(([k, v]) => `${k} ${v.length}`).join(', '));
