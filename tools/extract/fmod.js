// FMOD Studio banks -> event GUID => waveforms [{bank, index, name}].
// No full format decoding: every object (LIST under PROJ) starts with its own GUID; references to other objects are
// found by scanning its bytes for known GUIDs. WAV entries: GUID(16), u32, u16, u32 subsound index (offset 22), u32.
// Usage as lib: buildIndex(bankDir) ; CLI: node fmod.js <bankDir> <out.json>
const fs = require('fs'), path = require('path');

function readBank(file) {
  const fd = fs.openSync(file, 'r'), rd = (p, n) => { const b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, p); return b; };
  const size = fs.fstatSync(fd).size; let p = 12, proj = null, snd = -1;
  while (p + 8 <= size) {
    const h = rd(p, 12), id = h.toString('latin1', 0, 4), sz = h.readUInt32LE(4);
    if (id === 'LIST' && h.toString('latin1', 8, 12) === 'PROJ') proj = rd(p + 12, sz - 4);
    if (id === 'SND ') snd = p + 8;
    p += 8 + sz + (sz & 1);
  }
  let names = [];
  if (snd >= 0) { // FSB5 stream names
    let q = snd; const probe = rd(snd, 64); q += probe.indexOf('FSB5'); if (probe.indexOf('FSB5') < 0) q = -1;
    if (q >= 0) {
      const h = rd(q, 64), n = h.readUInt32LE(8), shs = h.readUInt32LE(12), nts = h.readUInt32LE(16), hdr = h.readUInt32LE(4) === 0 ? 64 : 60;
      if (nts) { const nt = rd(q + hdr + shs, nts); for (let i = 0; i < n; i++) { const o = nt.readUInt32LE(4 * i); names.push(nt.toString('utf8', o, nt.indexOf(0, o))); } }
      else names = Array.from({ length: n }, (_, i) => String(i));
    }
  }
  fs.closeSync(fd);
  const objects = [], wavs = [];
  // walk PROJ: collection LISTs contain object LISTs (or bare WAV chunks)
  (function walk(b, depth) {
    for (let q = 0; q + 8 <= b.length;) {
      const id = b.toString('latin1', q, q + 4), sz = b.readUInt32LE(q + 4), body = b.subarray(q + 8, q + 8 + sz);
      if (id === 'WAV ' && sz >= 28) wavs.push({ guid: body.subarray(0, 16).toString('hex'), index: body.readUInt32LE(22) });
      else if (id === 'LIST') {
        if (depth === 1) objects.push({ type: body.toString('latin1', 0, 4), guid: body.subarray(12, 28).toString('hex'), raw: body });
        else walk(body.subarray(4), depth + 1);
      }
      q += 8 + sz + (sz & 1);
    }
  })(proj || Buffer.alloc(0), 0);
  return { objects, wavs, names };
}

function buildIndex(dir) {
  const obj = new Map(), wav = new Map(), events = [];
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.bank'))) {
    const bank = f.replace('.bank', ''), { objects, wavs, names } = readBank(path.join(dir, f));
    for (const w of wavs) wav.set(w.guid, { bank, index: w.index, name: names[w.index] });
    for (const o of objects) { obj.set(o.guid, o); if (o.type === 'EVNT') events.push(o.guid); }
  }
  const known = new Set([...obj.keys(), ...wav.keys()]);
  const refs = o => { const out = new Set(); for (let i = 0; i + 16 <= o.raw.length; i++) { const g = o.raw.toString('hex', i, i + 16); if (g !== o.guid && known.has(g)) out.add(g); } return out; };
  const result = {};
  for (const e of events) { // BFS event -> objects -> waveforms (ponytail: no cap on depth; graphs are small)
    const seen = new Set([e]), q = [e], found = [];
    while (q.length) {
      const g = q.shift();
      if (wav.has(g)) { found.push(wav.get(g)); continue; }
      const o = obj.get(g); if (!o) continue;
      for (const r of refs(o)) if (!seen.has(r) && (wav.has(r) || obj.get(r)?.type !== 'EVNT')) { seen.add(r); q.push(r); }
    }
    result[e] = found;
  }
  return result;
}
// Unity Guid "N" string <-> FMOD binary GUID (Data1..3 little-endian)
const unityToFmod = s => s.slice(6, 8) + s.slice(4, 6) + s.slice(2, 4) + s.slice(0, 2) + s.slice(10, 12) + s.slice(8, 10) + s.slice(14, 16) + s.slice(12, 14) + s.slice(16);

module.exports = { buildIndex, unityToFmod };
if (require.main === module) {
  const idx = buildIndex(process.argv[2]);
  fs.writeFileSync(process.argv[3], JSON.stringify(idx));
  console.log(Object.keys(idx).length, 'events,', Object.values(idx).filter(v => v.length).length, 'with audio');
}
