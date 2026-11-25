// Dofus 3 I18n/<lang>.bin -> {id: text}. Layout: u8 ?, 2-char lang, u32 count, then count x (u32 id, u32 offset);
// strings are .NET BinaryWriter style (7-bit varint length + UTF-8).
const fs = require('fs');
function readI18n(file) {
  const b = fs.readFileSync(file), n = b.readUInt32LE(3), out = {};
  for (let i = 0, p = 7; i < n; i++, p += 8) {
    let o = b.readUInt32LE(p + 4), len = 0, sh = 0, c;
    do { c = b[o++]; len |= (c & 0x7f) << sh; sh += 7; } while (c & 0x80);
    out[b.readUInt32LE(p)] = b.toString('utf8', o, o + len);
  }
  return out;
}
module.exports = { readI18n };
if (require.main === module) fs.writeFileSync(process.argv[3], JSON.stringify(readI18n(process.argv[2])));
