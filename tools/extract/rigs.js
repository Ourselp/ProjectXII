// Animated rigs (Characters/Bones) and skins (Characters/Skins) -> public/rigs/<bundle>.json, public/skins/<id>.json + atlases.
// Usage: node tools/extract/rigs.js <Content dir>
//   rigs: bone_1-movement, bone_1-static (player) + every bone used as an animated map element (extract/anim_gfx.json)
//   skins: all
// Rig json: {nodes, anims: {name: frames}, fps, def, parts, tex}; frame = [[node, a, b, tx, c, d, ty, rgba], ...] in draw order.
// Skin json: {parts: {name: {v: [x,y,u,v,zone]*, i: [indices]}}, tex}
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process'), { readFile } = require('./unityread');
const C = process.argv[2], AS = 'tools/bin/assetstudio/AssetStudioModCLI.exe', V = ['--unity-version', '6000.3.16f1'];

// ---- animation TextAsset (see docs/extraction.md)
function parseAnim(b, E) { // E = number of exposed nodes; the rig's own graphics are numbered after them
  const nf = b.readUInt16LE(0), nLabels = b.readUInt16LE(4); let p = 8;
  for (let i = 0; i < nLabels; i++) { p += 2; p += 2 + b[p]; } p = (p + 3) & ~3; // label: u16 frame, u8 len, chars, NUL
  const offs = []; for (let i = 0; i < nf; i++) { const o = b.readUInt32LE(p + 4 * i); if (o > b.length || o < (offs.at(-1) ?? 0)) break; offs.push(o); } // a few map-element transitions end with a garbage offset
  const nfr = offs.length; offs.push(b.length);
  const slots = [], frames = [];
  for (let f = 0; f < nfr; f++) {
    for (p = offs[f]; p < offs[f + 1];) {
      const slot = b.readUInt16LE(p), fl = b[p + 2]; p += 4;
      const s = slots[slot] || (slots[slot] = { node: -1, m: [1, 0, 0, 0, 1, 0], c: 0x7f7f7f7f });
      if (fl & 0x21) { // content block: i16 own graphic (sprite_N, flag 0x01), i16 exposed node (flag 0x20), u32 ?; -1 = none
        const g = b.readInt16LE(p), n = b.readInt16LE(p + 2);
        s.node = (fl & 0x01) && g >= 0 ? E + g : (fl & 0x20) ? n : -1;
        p += 8;
      }
      if (fl & 0x04) { s.c = b.readUInt32LE(p); p += 4; }
      if (fl & 0x08) p += 4; // additive colour (ignored)
      if (fl & 0x10) { s.m = [0, 1, 2, 3, 4, 5].map(i => +b.readFloatLE(p + 4 * i).toFixed(3)); p += 24; }
    }
    frames.push(slots.filter(s => s && s.node >= 0).map(s => [s.node, ...s.m, s.c >>> 0]));
  }
  return frames;
}

function skinParts(s) {
  const parts = {};
  s.m_values.forEach((p, k) => {
    const name = s.m_keys ? s.m_keys[k] : p.name, v = [], i = [], chunks = [];
    for (const c of p.skinChunks) {
      const base = v.length / 5; chunks.push([i.length, c.indexCount]);
      for (let j = 0; j < c.vertexCount; j++) { const x = s.vertices[c.startVertexIndex + j]; v.push(+x.pos.x.toFixed(2), +x.pos.y.toFixed(2), +x.uv.x.toFixed(5), +x.uv.y.toFixed(5), x.pos.z); }
      for (let j = 0; j < c.indexCount; j++) i.push(base + s.triangles[c.startIndexIndex + j]);
    }
    // display list = tree in prefix order: `entries` = number of following entries it owns; symbolId -1 = one geometry chunk;
    // entries 0 = empty symbol = mount point named referencedSymbols[symbolId] (hat, hair, mask... from another skin), with its transform
    // chunks inside a hair group (symbol name "cheveux…") get a 3rd value 1: hidden when a hat is worn
    const seq = [], groups = []; let k2 = 0, mounts = 0;
    for (const e of p.DisplayListEntry) {
      const hair = groups.some(g => /cheveux/i.test(g.name));
      for (const g of groups) g.left--;
      while (groups.length && groups[groups.length - 1].left <= 0) groups.pop();
      if (e.symbolId < 0) { if (k2 < chunks.length) seq.push(hair ? [...chunks[k2++], 1] : chunks[k2++]); }
      else if (e.entries === 0) { const t = e.transform; seq.push([s.referencedSymbols[e.symbolId], +t.rX.toFixed(4), +t.uX.toFixed(4), +t.tX.toFixed(3), +t.rY.toFixed(4), +t.uY.toFixed(4), +t.tY.toFixed(3)]); mounts++; }
      else groups.push({ name: s.referencedSymbols[e.symbolId] || '', left: e.entries });
    }
    while (k2 < chunks.length) seq.push(chunks[k2++]);
    if (i.length || mounts) parts[name] = { v, i, seq };
  });
  return parts;
}

// ---- unpack + export textures (incremental: only bundles not unpacked yet)
const run = (...a) => execFileSync(AS, a, { stdio: 'ignore', maxBuffer: 1 << 30 });
// monsters living in subareas: look "{bone|skins|colours|scale}"; bone 1 = player-like look (player rigs + skins)
const T = f => JSON.parse(fs.readFileSync(`extract/data/${f}.json`)).objectsById.m_values;
const monsterIds = new Set(T('SubAreasDataRoot').flatMap(s => s.monsters));
const monsterBones = new Set(T('MonstersDataRoot').filter(m => monsterIds.has(m.id)).map(m => m.look.match(/^\{(\d+)/)?.[1]).filter(b => b && b !== '1'));
const bones = ['1-movement', '1-static', ...JSON.parse(fs.readFileSync('extract/anim_gfx.json')).map(String), ...monsterBones];
fs.mkdirSync('extract/raw_rigs', { recursive: true });
const fresh = bones.map(b => `bones_assets_bone_${b}.bundle`).filter(f => fs.existsSync(`${C}/Characters/Bones/${f}`) && !fs.existsSync(`extract/raw_rigs/${f}_unpacked`));
if (fresh.length) {
  fs.rmSync('extract/rig_new', { recursive: true, force: true }); fs.mkdirSync('extract/rig_new');
  for (const f of fresh) fs.copyFileSync(`${C}/Characters/Bones/${f}`, `extract/rig_new/${f}`);
  run('extract/rig_new', '-m', 'extract', '-o', 'extract/raw_rigs');
  run('extract/rig_new', '-m', 'export', '-t', 'tex2d', ...V, '-g', 'none', '-o', 'extract/rig_tex');
  fs.rmSync('extract/rig_new', { recursive: true, force: true });
  console.log(fresh.length, 'new rig bundles unpacked');
}
if (!fs.existsSync('extract/raw_skins')) run(`${C}/Characters/Skins`, '-m', 'extract', '-o', 'extract/raw_skins');
if (!fs.existsSync('extract/skin_tex')) run(`${C}/Characters/Skins`, '-m', 'export', '-t', 'tex2d', ...V, '-g', 'none', '-o', 'extract/skin_tex');

const load = d => { const f = fs.readdirSync(d).find(x => !x.endsWith('.resS')); return readFile(`${d}/${f}`, null); };
// copy the atlas a skin object points to; returns public file name
function atlas(objs, s, texDir, outDir, prefix) {
  const t = s.textures?.[0] && objs.find(o => o.pathId === s.textures[0].m_PathID);
  if (!t || !fs.existsSync(`${texDir}/${t.name}.png`)) return null;
  const name = `${prefix}.png`; fs.copyFileSync(`${texDir}/${t.name}.png`, `${outDir}/${name}`); return name;
}

fs.mkdirSync('public/rigs', { recursive: true }); fs.mkdirSync('public/skins', { recursive: true });
let nr = 0, ns = 0;
for (const d of fs.readdirSync('extract/raw_rigs')) {
  const name = d.replace('bones_assets_bone_', '').replace('.bundle_unpacked', ''), objs = load(`extract/raw_rigs/${d}`);
  const def = objs.find(o => o.classId === 114 && o.value.animations)?.value; if (!def) continue;
  const skin = objs.find(o => o.classId === 114 && o.value.vertices)?.value;
  const byPath = Object.fromEntries(objs.filter(o => o.classId === 49).map(o => [o.pathId, Buffer.from(o.value.m_Script, 'base64')]));
  const anims = {};
  for (const a of def.animations) if (byPath[a.data.m_PathID]) {
    if (name.startsWith('1-') && !/^Anim(Marche|Course|NageMarche|NageCourse|StatiqueExplo0)_\d$/.test(a.name)) continue; // player: only what the game uses
    if (monsterBones.has(name) && !/^Anim(Statique|Marche|Course)_\d$/.test(a.name)) continue;                // monsters: idle / walk / run
    try { anims[a.name] = parseAnim(byPath[a.data.m_PathID], def.exposedNodeNames.length); } catch (e) { console.warn('anim', name, a.name, e.message.slice(0, 60)); fs.writeFileSync('extract/bad_anim.bin', byPath[a.data.m_PathID]); }
  }
  const out = { nodes: [...def.exposedNodeNames, ...def.graphics.map(g => g.part.name)], anims, fps: def.defaultFrameRate || 30, def: def.defaultAnimationName || Object.keys(anims)[0] || '',
    parts: skin ? skinParts(skin) : {}, tex: skin ? atlas(objs, skin, 'extract/rig_tex', 'public/rigs', name) : null };
  fs.writeFileSync(`public/rigs/${name}.json`, JSON.stringify(out)); nr++;
}
const slots = {}; // skin id -> part name prefixes, to group skins by equipment slot
if (process.env.SKINS === '0' && fs.existsSync('public/skins/index.json')) { console.log(nr, 'rigs (skins skipped)'); process.exit(0); }
for (const d of fs.readdirSync('extract/raw_skins')) {
  const id = d.replace('skins_assets_skin_', '').replace('.bundle_unpacked', '');
  let objs; try { objs = load(`extract/raw_skins/${d}`); } catch (e) { console.warn(id, e.message); continue; }
  const s = objs.find(o => o.classId === 114 && o.value.vertices)?.value; if (!s) continue;
  const parts = skinParts(s), tex = atlas(objs, s, 'extract/skin_tex', 'public/skins', id);
  fs.writeFileSync(`public/skins/${id}.json`, JSON.stringify({ parts, tex }));
  slots[id] = [...new Set(Object.keys(parts).map(k => k.replace(/_\w*\d$/, '').replace(/_\d+$/, '')))];
  ns++;
}
fs.writeFileSync('public/skins/index.json', JSON.stringify(slots));
console.log(nr, 'rigs,', ns, 'skins');
