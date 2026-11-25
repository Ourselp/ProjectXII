// Animated map elements are rigs (Characters/Bones/bones_assets_bone_<gfxId>.bundle): list the ids maps use -> extract/anim_gfx.json
const fs = require('fs'), ids = new Set();
for (const f of fs.readdirSync('public/maps')) if (f !== 'index.json')
  for (const e of JSON.parse(fs.readFileSync('public/maps/' + f)).anim) ids.add(e[0]);
fs.writeFileSync('extract/anim_gfx.json', JSON.stringify([...ids]));
console.log(ids.size, 'animated element rigs');
