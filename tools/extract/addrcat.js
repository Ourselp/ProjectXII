// Unity Addressables binary catalog (catalog_1.0.bin): GUID key -> internal id path, enough for asset paths.
// Strings: u32 length + bytes, referenced by the offset of their first byte. A path can be a "dynamic string":
// pointer | 0x40000000 -> node [u32 string, u32 next node | -1], parts joined with '/' from the last node to the first.
// Entries hold [u32 internalId pointer, u32 key string pointer]; we find them by looking up every 32-hex key string.
const fs = require('fs');
function readCatalog(file) {
  const b = fs.readFileSync(file), str = p => b.toString('utf8', p, p + b.readUInt32LE(p - 4));
  const dyn = p => { const parts = []; for (let n = p, k = 0; n !== 0xffffffff && k < 32; n = b.readUInt32LE(n + 4), k++) parts.push(str(b.readUInt32LE(n))); return parts.reverse().join('/'); };
  const out = {};
  for (const m of b.toString('latin1').matchAll(/[0-9a-f]{32}/g)) {
    const at = m.index; if (b.readUInt32LE(at - 4) !== 32) continue;
    const key = Buffer.alloc(4); key.writeUInt32LE(at);
    for (let i = b.indexOf(key); i >= 4; i = b.indexOf(key, i + 1)) {
      const id = b.readUInt32LE(i - 4);
      try { const path = id & 0x40000000 ? dyn(id & 0x3fffffff) : str(id); if (/\.\w+$/.test(path)) { out[m[0]] = path; break; } } catch {}
    }
  }
  return out;
}
module.exports = { readCatalog };
if (require.main === module) { const c = readCatalog(process.argv[2]); console.log(Object.keys(c).length, Object.entries(c).slice(0, 5)); }
