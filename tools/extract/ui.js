// HUD data: per class spells (name, icon, AP cost, range, description) -> public/data/spells.json; icons/portraits -> public/ui/
// Needs extract/picto (AssetStudio -m export -t sprite -g type of Picto/Spells/spell_assets_1x + Picto/UI/class_assets_).
const fs = require('fs');
const T = f => JSON.parse(fs.readFileSync(`extract/data/${f}.json`)).objectsById.m_values;
const txt = JSON.parse(fs.readFileSync('extract/data/i18n_fr.json'));
const SRC = 'extract/picto/Sprite', OUT = 'public/ui';
fs.mkdirSync(OUT, { recursive: true });
const copy = (f, to = f) => fs.existsSync(`${SRC}/${f}`) && (fs.copyFileSync(`${SRC}/${f}`, `${OUT}/${to}`), true);
const spells = {}; T('SpellsDataRoot').forEach(s => spells[s.id] = s);
const levels = {}; T('SpellLevelsDataRoot').forEach(l => levels[l.id] = l);
const out = {};
for (const b of T('BreedsDataRoot')) {
  out[b.id] = b.breedSpellsId.map(id => spells[id]).filter(Boolean).map(s => {
    const l = levels[s.spellLevels[0]] || {};
    const icon = copy(`sort_${s.iconId}.png`) ? `sort_${s.iconId}.png` : null;
    return { id: s.id, name: txt[s.nameId] || '', desc: txt[s.descriptionId] || '', icon, ap: l.apCost ?? 0, range: [l.minRange ?? 0, l.range ?? 0] };
  });
  copy(`logo_transparent_${b.id}.png`, `class_${b.id}.png`);
  for (const look of [b.maleLook, b.femaleLook]) { const skin = look.match(/\|(\d+)/)?.[1]; if (skin) copy(`Head_${skin}.png`); }
}
fs.mkdirSync('public/data', { recursive: true });
fs.writeFileSync('public/data/spells.json', JSON.stringify(out));
console.log(Object.keys(out).length, 'classes,', fs.readdirSync(OUT).length, 'ui images');
