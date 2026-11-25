// Real-time headless test of a page through the Chrome DevTools Protocol (Edge):
// open URL, wait, evaluate an expression, take screenshots at given times.
// Usage: node cdp_shot.js <url> <out_prefix> <wait_ms,...> [expression]
// Writes <out_prefix>_<ms>.png for each wait and prints the expression result at each wait.
const { spawn } = require('child_process'), fs = require('fs'), path = require('path'), os = require('os');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const [url, out, waits = '5000', expr = 'document.title'] = process.argv.slice(2);
const port = 9300 + Math.floor(Math.random() * 500);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--allow-file-access-from-files', '--window-size=' + (process.env.WIN || '1000,800'), 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch {}
  }
  if (!target) throw new Error('Edge did not start');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = {};
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (pending[m.id]) { pending[m.id](m); delete pending[m.id]; } });
  const send = (method, params = {}) => new Promise(r => { pending[++id] = r; ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable');
  await send('Page.navigate', { url });
  const t0 = Date.now();
  for (const w of waits.split(',').map(Number)) {
    await sleep(Math.max(0, w - (Date.now() - t0)));
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    console.log(`${w} ms:`, JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails?.text));
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${out}_${w}.png`, Buffer.from(shot.result.data, 'base64'));
  }
  ws.close();
})().catch(e => console.error(e.message)).finally(() => { edge.kill(); setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 1000); });
