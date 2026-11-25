// extract/maps/*.json (decoded with astrub_maps.js) -> public/maps/<id>.json (compact) + public/gfx/<gfxId>.png
// group = [cellId, blend, elements]; element = [gfxId, x, y, scaleX, scaleY, rotation, color]  (Unity units = pixels, y up, sprite pivot = centre)
const fs = require('fs');
fs.mkdirSync('public/maps', { recursive: true }); fs.mkdirSync('public/gfx', { recursive: true });
const info = JSON.parse(fs.readFileSync('extract/data/MapsInformationDataRoot.json')).objectsById;
const pos = {}; info.m_values.forEach(v => pos[v.id] = [v.posX, v.posY]);
const gfx = new Set(), index = {};
const el = e => { gfx.add(e.gfxId); return [e.gfxId, +e.position.x.toFixed(2), +e.position.y.toFixed(2), +e.scale.x.toFixed(3), +e.scale.y.toFixed(3), +e.rotation.toFixed(2), e.color.value]; };
for (const f of fs.readdirSync('extract/maps')) {
  const m = JSON.parse(fs.readFileSync('extract/maps/' + f));
  // per group: blend = [srcFactor, dstFactor] (Unity BlendMode enum) or 0; staging targets (event-driven) and refraction are skipped
  const groups = L => { const sd = m[L + 'MaterialData'].shaderData;
    return m[L + 'MapElements'].flatMap(g => { const p = (sd[g.materialIndex] || {}).shaderParameters || [];
      if (g.isStagingTarget || p.some(x => x.$type === 'ShaderRefractionParameters')) return [];
      const b = p.find(x => x.$type === 'ShaderBlendingParameters');
      return [[g.cellId ?? -1, b ? [b.sourceFactor, b.destinationFactor] : 0, g.mapElements.map(el)]]; }); };
  const out = {
    id: m.id, pos: pos[m.id], bg: m.backgroundColor.value,
    nb: [m.topNeighbourId, m.bottomNeighbourId, m.leftNeighbourId, m.rightNeighbourId],
    back: groups('background'),
    // middleground groups carry a cellId: depth-sort key for the isometric layer
    mid: groups('middleground'),
    anim: m.mapAnimatedElements.map(e => [...el(e), e.cellId ?? -1]),
    fore: groups('foreground'),
    cells: m.cellsData.map(c => (c.mov ? 1 : 0) | (c.mapChangeData ? 2 : 0)),
  };
  fs.writeFileSync(`public/maps/${m.id}.json`, JSON.stringify(out));
  index[m.id] = out.pos;
}
fs.writeFileSync('public/maps/index.json', JSON.stringify(index));
let miss = 0;
for (const g of gfx) { const src = `extract/mapgfx/${g}.png`; if (fs.existsSync(src)) fs.copyFileSync(src, `public/gfx/${g}.png`); else miss++; }
console.log(Object.keys(index).length, 'maps,', gfx.size, 'gfx,', miss, 'missing');
