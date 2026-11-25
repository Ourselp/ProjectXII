// Build one playable character (bone 1 + body skin + head skin) into public/char/<name>.json + atlases.
// Usage: node tools/extract/character.js <name> <bodySkin> <headSkin> <colors comma-separated decimal>
// Needs extract/raw_char/ (AssetStudio -m extract of the bone/skin bundles) and extract/char_tex/ (-m export -t tex2d).
const fs = require('fs'), path = require('path'), { readFile } = require('./unityread');
const [name = 'iop', body = '80', head = '2124', cols = '15704172,15301153,14736065,12200764,484225,12429686'] = process.argv.slice(2);
const RAW = 'extract/raw_char', OUT = 'public/char';
const load = b => { const d = `${RAW}/${b}.bundle_unpacked`; const f = fs.readdirSync(d).find(x => !x.endsWith('.resS')); return readFile(`${d}/${f}`, null); };

// --- animation binary (TextAsset): header, labels, frame offsets, delta-encoded entries per slot
function parseAnim(b) {
  const nf = b.readUInt16LE(0), nLabels = b.readUInt16LE(4); let p = 8;
  for (let i = 0; i < nLabels; i++) { p += 2; p += 1 + b[p]; } p = (p + 3) & ~3;
  const offs = []; for (let i = 0; i < nf; i++) offs.push(b.readUInt32LE(p + 4 * i)); offs.push(b.length);
  const slots = [], frames = [];
  for (let f = 0; f < nf; f++) {
    for (p = offs[f]; p < offs[f + 1];) {
      const slot = b.readUInt16LE(p), fl = b[p + 2]; p += 4;
      const s = slots[slot] || (slots[slot] = { node: -1, m: [1, 0, 0, 0, 1, 0], c: 0x7f7f7f7f });
      if (fl & 0x20) { s.node = b.readInt16LE(p + 2); p += 8; }
      if (fl & 0x04) { s.c = b.readUInt32LE(p); p += 4; }
      if (fl & 0x08) p += 4; // additive colour (ignored)
      if (fl & 0x10) { s.m = [0, 1, 2, 3, 4, 5].map(i => +b.readFloatLE(p + 4 * i).toFixed(3)); p += 24; }
    }
    frames.push(slots.filter(s => s && s.node >= 0).map(s => [s.node, ...s.m, s.c >>> 0]));
  }
  return frames;
}

// --- skins: part name -> {t: texture index, v: [x,y,u,v,zone...], i: [indices]}
const parts = {}, textures = [];
function addSkin(objs, tex) {
  const s = objs.find(o => o.classId === 114 && o.value.vertices).value, t = textures.push(tex) - 1;
  s.m_values.forEach((p, k) => {
    const name = s.m_keys ? s.m_keys[k] : p.name;
    if (parts[name]) return; // first skin wins (head before body)
    const v = [], i = [];
    for (const c of p.skinChunks) {
      const base = v.length / 5;
      for (let j = 0; j < c.vertexCount; j++) { const x = s.vertices[c.startVertexIndex + j]; v.push(+x.pos.x.toFixed(2), +x.pos.y.toFixed(2), +x.uv.x.toFixed(5), +x.uv.y.toFixed(5), x.pos.z); }
      for (let j = 0; j < c.indexCount; j++) i.push(base + s.triangles[c.startIndexIndex + j]);
    }
    if (i.length) parts[name] = { t, v, i };
  });
}
fs.mkdirSync(OUT, { recursive: true });
for (const [bundle, tex] of [[`skins_assets_skin_${head}`, `${head}_atlas.png`], [`skins_assets_skin_${body}`, `${body}_atlas.png`], ['bones_assets_bone_1-movement', '1-movement_atlas.png'], ['bones_assets_bone_1-static', '1-static_atlas.png']]) {
  addSkin(load(bundle), tex); fs.copyFileSync(`extract/char_tex/${tex}`, `${OUT}/${tex}`);
}

const nodes = [], nodeIdx = {}, anims = {}, missing = new Set();
const nid = n => nodeIdx[n] ?? (nodeIdx[n] = nodes.push(n) - 1);
for (const [b, re] of [['bones_assets_bone_1-movement', /^Anim(Marche|Course)_\d$/], ['bones_assets_bone_1-static', /^AnimStatiqueExplo0_\d$/]]) {
  const bone = load(b), def = bone.find(o => o.classId === 114 && o.value.animations).value;
  const byPath = Object.fromEntries(bone.filter(o => o.classId === 49).map(o => [o.pathId, Buffer.from(o.value.m_Script, 'base64')]));
  for (const a of def.animations) if (re.test(a.name)) {
    anims[a.name] = parseAnim(byPath[a.data.m_PathID]).map(fr => fr.map(([n, ...rest]) => {
      const name = def.exposedNodeNames[n] ?? '#' + n; if (!parts[name]) missing.add(name); return [nid(name), ...rest]; }));
  }
}
fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify({ textures, colors: cols.split(',').map(Number), nodes, parts, anims, fps: 30 }));
console.log(name, Object.keys(parts).length, 'parts', Object.keys(anims).join(' '), '\nmissing:', [...missing].join(' '));
