// Minimal Unity SerializedFile (v22, Unity 6) reader driven by the embedded type trees,
// including SerializeReference data (ManagedReferencesRegistry) that AssetStudio can't decode.
// Input: an *unpacked* bundle file (AssetStudioModCLI -m extract). Usage as lib:
//   const {readFile} = require('./unityread'); readFile(path) -> [{pathId, classId, name, value}]
// CLI: node unityread.js <serializedFile> <outDir> [classIdFilter, default 114 = MonoBehaviour]
const fs = require('fs'), path = require('path');
const COMMON = fs.readFileSync(path.join(__dirname, 'commonstrings.txt'), 'latin1');

class R {
  constructor(buf) { this.b = buf; this.p = 0; this.le = true; }
  align(n = 4) { this.p = (this.p + n - 1) & ~(n - 1); }
  u8() { return this.b[this.p++]; }
  i16() { const v = this.le ? this.b.readInt16LE(this.p) : this.b.readInt16BE(this.p); this.p += 2; return v; }
  u16() { const v = this.le ? this.b.readUInt16LE(this.p) : this.b.readUInt16BE(this.p); this.p += 2; return v; }
  i32() { const v = this.le ? this.b.readInt32LE(this.p) : this.b.readInt32BE(this.p); this.p += 4; return v; }
  u32() { const v = this.le ? this.b.readUInt32LE(this.p) : this.b.readUInt32BE(this.p); this.p += 4; return v; }
  i64() { const v = this.le ? this.b.readBigInt64LE(this.p) : this.b.readBigInt64BE(this.p); this.p += 8; return v; }
  u64() { const v = this.le ? this.b.readBigUInt64LE(this.p) : this.b.readBigUInt64BE(this.p); this.p += 8; return v; }
  f32() { const v = this.b.readFloatLE(this.p); this.p += 4; return v; }
  f64() { const v = this.b.readDoubleLE(this.p); this.p += 8; return v; }
  cstr() { const e = this.b.indexOf(0, this.p); const s = this.b.toString('utf8', this.p, e); this.p = e + 1; return s; }
  bytes(n) { const v = this.b.subarray(this.p, this.p + n); this.p += n; return v; }
}

function readTypeTree(r) {
  const n = r.i32(), strSize = r.i32(), raw = [];
  for (let i = 0; i < n; i++) raw.push({ level: (r.u16(), r.u8()), flags: r.u8(), t: r.u32(), nm: r.u32(), size: r.i32(), idx: r.i32(), meta: r.i32(), refHash: r.u64() });
  const sb = r.bytes(strSize);
  const str = o => (o & 0x80000000) ? COMMON.slice(o & 0x7fffffff, COMMON.indexOf('\0', o & 0x7fffffff)) : sb.toString('utf8', o, sb.indexOf(0, o));
  // build tree
  const nodes = raw.map(x => ({ type: str(x.t), name: str(x.nm), size: x.size, flags: x.flags, align: (x.meta & 0x4000) !== 0, level: x.level, kids: [] }));
  const stack = [];
  for (const nd of nodes) { while (stack.length && stack[stack.length - 1].level >= nd.level) stack.pop(); if (stack.length) stack[stack.length - 1].kids.push(nd); stack.push(nd); }
  return nodes[0];
}

function readType(r, isRef, enableTree) {
  const t = { classId: r.i32() }; r.u8(); t.scriptIndex = r.i16();
  if ((isRef && t.scriptIndex >= 0) || t.classId < 0 || t.classId === 114) r.bytes(16);
  r.bytes(16);
  if (enableTree) {
    t.tree = readTypeTree(r);
    if (isRef) { t.cls = r.cstr(); t.ns = r.cstr(); t.asm = r.cstr(); }
    else { const c = r.i32(); r.bytes(c * 4); }
  }
  return t;
}

const PRIM = {
  SInt8: r => r.b.readInt8(r.p++), UInt8: r => r.u8(), char: r => r.u8(), bool: r => r.u8() !== 0,
  SInt16: r => r.i16(), short: r => r.i16(), UInt16: r => r.u16(), 'unsigned short': r => r.u16(),
  SInt32: r => r.i32(), int: r => r.i32(), UInt32: r => r.u32(), 'unsigned int': r => r.u32(), Type$: r => r.i32(),
  float: r => r.f32(), double: r => r.f64(),
  SInt64: r => big(r.i64()), 'long long': r => big(r.i64()), UInt64: r => big(r.u64()), 'unsigned long long': r => big(r.u64()), FileSize: r => big(r.u64()),
};
// keep 64-bit ints exact: numbers when safe, strings otherwise (rids, pathIds)
const big = v => (v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= BigInt(-Number.MAX_SAFE_INTEGER)) ? Number(v) : v.toString();

function readValue(r, nd, ctx) {
  let v;
  const k = nd.kids;
  if (PRIM[nd.type] && !k.length) v = PRIM[nd.type](r);
  else if (nd.type === 'string') { const n = r.i32(); v = nd.name === 'm_Script' ? r.b.toString('base64', r.p, r.p + n) : r.b.toString('utf8', r.p, r.p + n); r.p += n; r.align(); } // TextAsset bytes stay binary (base64)
  else if (nd.type === 'TypelessData') { const n = r.i32(); v = r.bytes(n).toString('base64'); }
  else if (k.length === 1 && k[0].type === 'Array' || (nd.flags & 1)) { // vector-like or Array node itself
    const arr = (nd.flags & 1) ? nd : k[0];
    const n = r.i32(), el = arr.kids[1];
    if (el.type === 'UInt8' || el.type === 'char') { v = r.bytes(n).toString('base64'); }
    else { v = new Array(n); for (let i = 0; i < n; i++) v[i] = readValue(r, el, ctx); }
    if (arr.align) r.align();
  }
  else if (nd.type === 'ManagedReferencesRegistry') {
    v = {}; const ver = r.i32();
    if (ver !== 2) throw new Error('registry version ' + ver);
    const n = r.i32();
    for (let i = 0; i < n; i++) {
      const rid = big(r.i64()), cls = rstr(r), ns = rstr(r), asm = rstr(r);
      if (!cls) continue;
      const rt = ctx.refTypes.find(t => t.cls === cls && t.ns === ns && t.asm === asm);
      if (!rt) throw new Error('no ref type ' + ns + '.' + cls);
      const o = { $type: cls }; for (const c of rt.tree.kids) if (c.type !== 'ManagedReferencesRegistry') o[c.name] = readValue(r, c, ctx); // nested registries live in the root one
      v[rid] = o;
    }
  }
  else { v = {}; for (const c of k) { try { v[c.name] = readValue(r, c, ctx); } catch(e){ e.message=c.name+"("+c.type+"@"+r.p+") > "+e.message; throw e; } } }
  if (nd.align) r.align();
  return v;
}
const rstr = r => { const n = r.i32(); const s = r.b.toString('utf8', r.p, r.p + n); r.p += n; r.align(); return s; };

// replace {rid: N} placeholders with the referenced objects, drop the registry
function resolve(v, reg, seen = new Set()) {
  if (Array.isArray(v)) return v.map(x => resolve(x, reg, seen));
  if (v && typeof v === 'object') {
    const ks = Object.keys(v);
    if (ks.length === 1 && ks[0] === 'rid') {
      if (!(v.rid in reg)) return null;
      if (seen.has(v.rid)) return { $rid: v.rid }; // back-reference (parent links): keep the id, don't recurse
      seen.add(v.rid); const o = resolve(reg[v.rid], reg, seen); seen.delete(v.rid); return o;
    }
    const o = {}; for (const key of ks) o[key] = resolve(v[key], reg, seen); return o;
  }
  return v;
}

function readFile(file, classFilter = 114) {
  const r = new R(fs.readFileSync(file));
  r.le = false; r.p = 8; const version = r.u32(); if (version < 22) throw new Error('unsupported version ' + version);
  r.p = 16; const bigEndian = r.u8(); r.p = 20; r.u32(); r.u64(); const dataOffset = Number(r.u64()); r.u64();
  r.le = !bigEndian;
  r.cstr(); r.i32(); const tree = r.u8() !== 0;
  const types = []; for (let i = r.i32(); i > 0; i--) types.push(readType(r, false, tree));
  const objs = []; for (let i = r.i32(); i > 0; i--) { r.align(); objs.push({ pathId: big(r.i64()), start: Number(r.i64()), size: r.u32(), type: r.i32() }); }
  for (let i = r.i32(); i > 0; i--) { r.i32(); r.align(); r.i64(); }
  const externals = []; for (let i = r.i32(); i > 0; i--) { r.cstr(); r.bytes(16); r.i32(); externals.push(r.cstr()); }
  const refTypes = []; for (let i = r.i32(); i > 0; i--) refTypes.push(readType(r, true, tree));
  const ctx = { refTypes }, out = [];
  for (const o of objs) {
    const t = types[o.type];
    if (classFilter != null && t.classId !== classFilter) continue;
    r.p = dataOffset + o.start;
    let value = readValue(r, t.tree, ctx);
    if (r.p !== dataOffset + o.start + o.size) value.$warning = `read ${r.p - dataOffset - o.start} of ${o.size} bytes`;
    const regKey = Object.keys(value).find(key => t.tree.kids.find(c => c.name === key && c.type === 'ManagedReferencesRegistry'));
    if (regKey) { const reg = value[regKey]; delete value[regKey]; value = resolve(value, reg); }
    out.push({ pathId: o.pathId, classId: t.classId, name: value.m_Name, value });
  }
  out.externals = externals; // m_FileID n>0 -> externals[n-1] ("archive:/CAB-…/CAB-…")
  return out;
}

module.exports = { readFile };

if (require.main === module) {
  const [file, outDir, cls] = process.argv.slice(2);
  fs.mkdirSync(outDir, { recursive: true });
  for (const o of readFile(file, cls === undefined ? 114 : (cls === 'all' ? null : +cls))) {
    fs.writeFileSync(path.join(outDir, (o.name || o.pathId) + '.json'), JSON.stringify(o.value));
    if (o.value.$warning) console.warn(o.name, o.value.$warning);
  }
}
