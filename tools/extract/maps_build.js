// All maps: extract/raw_maps (AssetStudio -m extract of Content/Map/Data) -> public/maps/<id>.json, public/maps/index.json,
// public/gfx/<gfxId>.png (from extract/mapgfx), extract/map_sounds.json (FMOD event GUIDs used by maps, for audio.js).
// group = [cellId, blend, fx, elements]; element = [gfxId, x, y, scaleX, scaleY, rotation, color]
// (Unity units = pixels, y up, sprite pivot = centre; colour = ARGB tint, 0x80 neutral)
const fs = require('fs'), { readFile } = require('./unityread'), { unityToFmod } = require('./fmod');
const T = f => JSON.parse(fs.readFileSync(`extract/data/${f}.json`)).objectsById.m_values;
const txt = JSON.parse(fs.readFileSync('extract/data/i18n_fr.json'));
const info = {}; T('MapsInformationDataRoot').forEach(v => info[v.id] = v);
const sub = {}; T('SubAreasDataRoot').forEach(v => sub[v.id] = v);
const area = {}; T('AreasDataRoot').forEach(v => area[v.id] = v);
const scroll = {}; T('MapScrollActionsDataRoot').forEach(v => scroll[v.id] = v);
fs.mkdirSync('public/maps', { recursive: true }); fs.mkdirSync('public/gfx', { recursive: true });

const r = (v, n = 2) => +v.toFixed(n);
const el = e => [e.gfxId, r(e.position.x), r(e.position.y), r(e.scale.x, 3), r(e.scale.y, 3), r(e.rotation), e.color.value];
// shader parameters we can reproduce cheaply (see docs/extraction.md); others (distortion, dissolve, emissive, noise) are ignored
function fx(params) {
  const o = {};
  for (const p of params) switch (p.$type) {
    case 'ShaderRotationParameters': o.r = [r(p.rotationCenter.x), r(p.rotationCenter.y), r(p.frequency, 3), r(p.amplitude, 3), r(p.offset, 3)]; break;
    case 'ShaderScaleParameters': o.s = [r(p.axes.x, 3), r(p.axes.y, 3), r(p.frequency, 3), r(p.amplitude, 3)]; break;
    case 'ShaderTranslationParameters': o.t = [r(p.direction.x, 3), r(p.direction.y, 3), r(p.frequency, 3), r(p.amplitude, 3), r(p.offset, 3)]; break;
    case 'ShaderColorAnimationParameters': o.c = [p.finalColor.value, r(p.frequency, 3)]; break;
    case 'ShaderDissolveParameters': o.d = r(p.alphaClip, 3); break; // approximated: alpha *= 1 - alphaClip (no noise texture)
    case 'ShaderWindParameters': o.w = [r(p.bendStart.y, 3), r(p.flexibility, 3), r(p.bendAxeMultiplier, 1)]; break;
  }
  return Object.keys(o).length ? o : 0;
}
function groups(m, L) {
  const sd = m[L + 'MaterialData'].shaderData;
  return m[L + 'MapElements'].flatMap(g => {
    const p = (sd[g.materialIndex] || {}).shaderParameters || [];
    if (g.isStagingTarget || p.some(x => x.$type === 'ShaderRefractionParameters')) return []; // event-driven / needs screen texture
    const b = p.find(x => x.$type === 'ShaderBlendingParameters');
    return [[g.cellId ?? -1, b ? [b.sourceFactor, b.destinationFactor] : 0, fx(p), g.mapElements.map(el)]];
  });
}

const gfx = new Set(), index = {}, sounds = {};
let n = 0;
for (const d of fs.readdirSync('extract/raw_maps')) for (const f of fs.readdirSync('extract/raw_maps/' + d)) {
  if (f.endsWith('.resS')) continue;
  let objs; try { objs = readFile(`extract/raw_maps/${d}/${f}`); } catch (e) { console.warn(d, e.message); continue; }
  for (const { value: m } of objs) {
    if (!m.cellsData) continue;
    const i = info[m.id] || {}, s = sub[i.subAreaId] || {}, a = area[s.areaId] || {}, sc = scroll[m.id];
    // neighbours: map data, overridden by MapScrollActions (top, bottom, left, right)
    const nb = [m.topNeighbourId, m.bottomNeighbourId, m.leftNeighbourId, m.rightNeighbourId];
    if (sc) [['top', 0], ['bottom', 1], ['left', 2], ['right', 3]].forEach(([k, j]) => { nb[j] = sc[k + 'Exists'] ? sc[k + 'MapId'] : -1; });
    const music = m.playlistSet.musicPlaylist.fmodEventGuid, amb = m.playlistSet.ambiantPlaylist.fmodEventGuid;
    const out = {
      id: m.id, pos: [i.posX ?? 0, i.posY ?? 0], name: [txt[a.nameId] || '', txt[s.nameId] || ''].filter(Boolean).join(' – '),
      bg: m.backgroundColor.value, nb,
      music: music ? unityToFmod(music) : '', amb: amb ? unityToFmod(amb) : '',
      back: groups(m, 'background'), mid: groups(m, 'middleground'), fore: groups(m, 'foreground'),
      anim: m.mapAnimatedElements.map(e => [...el(e), e.cellId ?? -1]),
      // bit0 walkable, bit1 map change, bits 8+: mapChangeData (direction mask)
      cells: m.cellsData.map(c => (c.mov ? 1 : 0) | (c.mapChangeData ? 2 : 0) | (c.mapChangeData << 8)),
    };
    for (const L of ['back', 'mid', 'fore']) for (const g of out[L]) for (const e of g[3]) gfx.add(e[0]);
    out.anim.forEach(e => gfx.add(e[0]));
    if (out.music) sounds[out.music] = 1; if (out.amb) sounds[out.amb] = 1;
    fs.writeFileSync(`public/maps/${m.id}.json`, JSON.stringify(out));
    index[m.id] = [out.pos[0], out.pos[1], i.subAreaId ?? -1, i.worldMap ?? -1];
    if (++n % 1000 === 0) console.log(n, 'maps');
  }
}
fs.writeFileSync('public/maps/index.json', JSON.stringify(index));
fs.writeFileSync('extract/map_sounds.json', JSON.stringify(Object.keys(sounds)));
let miss = 0, copied = 0;
for (const g of gfx) {
  const src = `extract/mapgfx/${g}.png`, dst = `public/gfx/${g}.png`;
  if (!fs.existsSync(src)) miss++; else if (!fs.existsSync(dst)) { fs.copyFileSync(src, dst); copied++; }
}
console.log(n, 'maps,', gfx.size, 'gfx (', copied, 'copied,', miss, 'missing),', Object.keys(sounds).length, 'sound events');
