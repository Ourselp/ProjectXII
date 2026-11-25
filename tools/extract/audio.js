// Map music/ambience: FMOD events used by maps (extract/map_sounds.json) -> public/audio/<bank>_<n>.ogg + public/audio/index.json
// index: eventGuid -> [files] (all play together, looped). Needs extract/fmod_events.json (fmod.js), vgmstream-cli and ffmpeg.
// FMOD events are parameter-driven; we don't evaluate parameters, we pick waveforms by name:
//   music: one stem group (names minus the "Stem N" suffix), the one with the most stems;
//   ambience: every layer except interior / close variants.
const fs = require('fs'), { execFileSync } = require('child_process');
const [bankDir] = process.argv.slice(2), VG = 'tools/bin/vgmstream/vgmstream-cli.exe';
const events = JSON.parse(fs.readFileSync('extract/fmod_events.json')), used = JSON.parse(fs.readFileSync('extract/map_sounds.json'));
const uniq = ws => [...new Map(ws.filter(w => w.name).map(w => [w.bank + '_' + w.index, w])).values()];
function pick(ws) {
  ws = uniq(ws); if (!ws.length) return [];
  if (ws.some(w => /mus/i.test(w.name))) {
    const groups = {}; for (const w of ws) (groups[w.name.replace(/_?st(e)?m_?\d.*$/i, '')] ??= []).push(w);
    return Object.values(groups).sort((a, b) => b.length - a.length)[0];
  }
  const out = ws.filter(w => !/interi|close/i.test(w.name)); return out.length ? out : ws.slice(0, 1);
}
fs.mkdirSync('public/audio', { recursive: true });
const index = {}, todo = new Map();
for (const e of used) { const ws = pick(events[e] || []); if (!ws.length) continue; index[e] = ws.map(w => `${w.bank}_${w.index}.ogg`); ws.forEach(w => todo.set(`${w.bank}_${w.index}`, w)); }
let i = 0;
for (const [key, w] of todo) {
  const out = `public/audio/${key}.ogg`, tmp = `extract/tmp_${key}.wav`; i++;
  if (fs.existsSync(out)) continue;
  try {
    execFileSync(VG, ['-s', String(w.index + 1), '-o', tmp, `${bankDir}/${w.bank}.bank`], { stdio: 'ignore' });
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-c:a', 'libvorbis', '-q:a', '3', out], { stdio: 'ignore' });
  } catch (err) { console.warn('failed', key, w.name); }
  fs.rmSync(tmp, { force: true });
  if (i % 50 === 0) console.log(i, '/', todo.size);
}
fs.writeFileSync('public/audio/index.json', JSON.stringify(index));
console.log(Object.keys(index).length, 'events,', todo.size, 'files');
