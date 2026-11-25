// WebGL renderer for Dofus 3 rigs (tools/extract/rigs.js): skinned characters and animated map elements.
// drawRig(gl, rig, skins, anim, frame, x, y, scale, flip, cols, tint): x,y = origin in canvas px (y down).
// Parts are looked up in `skins` (in order: head, equipment, body...) and then in the rig's own parts.
const VS = `attribute vec2 p; attribute vec2 uv; attribute float z; attribute vec4 mc;
uniform vec2 res; varying vec2 vuv; varying float vz; varying vec4 vmc;
void main(){ gl_Position = vec4(p / res * vec2(2.,-2.) + vec2(-1.,1.), 0., 1.); vuv = uv; vz = z; vmc = mc; }`;
const FS = `precision mediump float; uniform sampler2D tex; uniform vec3 cols[7]; uniform vec4 tint; varying vec2 vuv; varying float vz; varying vec4 vmc;
void main(){ vec4 c = texture2D(tex, vuv); int zi = int(vz + .5); vec3 t = vec3(1.);
  for (int i = 1; i < 7; i++) if (i == zi) t = cols[i] * 2.; // grey (0.5) * 2*colour = colour
  vec4 o = vec4(c.rgb * t * vmc.rgb * tint.rgb, c.a * vmc.a * tint.a); gl_FragColor = vec4(o.rgb * o.a, o.a); }`;

// per WebGL context: program, buffer, textures (the game canvas and the character preview each have one)
const ctxs = new WeakMap();
const C = gl => ctxs.get(gl) || (ctxs.set(gl, { tex: new Map() }), ctxs.get(gl));
export const BUST = `?v=${Date.now()}`; // fresh copy of every asset on each page load (no caching for now)
function texture(gl, url) {
  const cache = C(gl).tex; url += BUST;
  if (cache.has(url)) return cache.get(url);
  const p = new Promise(res => { const img = new Image(); img.onerror = () => res(null); img.onload = () => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // Unity UVs are bottom-up
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    res(t); }; img.src = url; });
  cache.set(url, p); return p;
}
const json = new Map();
const getJson = url => json.get(url) || (json.set(url, fetch(url, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null)), json.get(url));

// rig: public/rigs/<name>.json ; skin: public/skins/<id>.json — both resolve to {...data, gltex} for that context (null if missing)
export async function loadRig(gl, name) {
  const r = await getJson(`rigs/${name}.json`); if (!r) return null;
  return { ...r, gltex: r.tex ? await texture(gl, `rigs/${r.tex}`) : null };
}
export async function loadSkin(gl, id) {
  const s = await getJson(`skins/${id}.json`); if (!s) return null;
  return { ...s, gltex: s.tex ? await texture(gl, `skins/${s.tex}`) : null };
}
export const colorsOf = list => { const c = new Float32Array(21); list.forEach((v, i) => { if (i < 6) c.set([(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255], (i + 1) * 3); }); return c; };
const NO_COLS = colorsOf([]);

export function drawRig(gl, rig, skins, anim, frame, x, y, scale, flip, cols = NO_COLS, tint = [1, 1, 1, 1], hideHair = false) {
  const frames = rig.anims[anim]; if (!frames || !frames.length) return;
  const fr = frames[frame % frames.length], sx = flip ? -scale : scale, runs = [];
  const find = name => { for (const s of skins) if (s && s.parts[name]) return [s.parts[name], s.gltex]; return [rig.parts[name], rig.gltex]; };
  // a part = geometry chunks and mount points (other skins' parts, e.g. the hat on the head) in display order
  const emit = (p, t, [a, b, tx, c, d, ty], mc, depth) => {
    const v = p.v;
    for (const item of p.seq || [[0, p.i.length]]) {
      if (typeof item[0] === 'string') {
        if (depth > 3) continue;
        const [q, qt] = find(item[0]); if (!q || q === p) continue;
        const [, ma, mb, mtx, mc2, md, mty] = item;
        emit(q, qt, [a * ma + b * mc2, a * mb + b * md, a * mtx + b * mty + tx, c * ma + d * mc2, c * mb + d * md, c * mtx + d * mty + ty], mc, depth + 1);
        continue;
      }
      if (!t || (item[2] && hideHair)) continue; // item[2] = hair chunk, hidden under a hat
      if (!runs.length || runs[runs.length - 1][0] !== t) runs.push([t, []]);
      const out = runs[runs.length - 1][1];
      for (let j = item[0]; j < item[0] + item[1]; j++) {
        const k = p.i[j] * 5, X = a * v[k] + b * v[k + 1] + tx, Y = c * v[k] + d * v[k + 1] + ty;
        out.push(x + X * sx, y - Y * scale, v[k + 2], v[k + 3], v[k + 4], mc[0], mc[1], mc[2], mc[3]);
      }
    }
  };
  for (const [node, a, b, tx, c, d, ty, col] of fr) {
    const [p, t] = find(rig.nodes[node]); if (!p) continue;
    emit(p, t, [a, b, tx, c, d, ty], [(col & 255) / 127, (col >> 8 & 255) / 127, (col >> 16 & 255) / 127, (col >>> 24) / 127], 0);
  }
  const cx = C(gl); let { prog, buf } = cx;
  if (!prog) {
    const sh = (ty, s) => { const o = gl.createShader(ty); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(o); return o; };
    prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog); buf = gl.createBuffer(); Object.assign(cx, { prog, buf });
  }
  gl.useProgram(prog); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.uniform2f(gl.getUniformLocation(prog, 'res'), gl.canvas.width, gl.canvas.height);
  gl.uniform3fv(gl.getUniformLocation(prog, 'cols'), cols);
  gl.uniform4fv(gl.getUniformLocation(prog, 'tint'), tint);
  const attr = (n, size, off) => { const l = gl.getAttribLocation(prog, n); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 36, off); };
  for (const [t, verts] of runs) {
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
    attr('p', 2, 0); attr('uv', 2, 8); attr('z', 1, 16); attr('mc', 4, 20);
    gl.bindTexture(gl.TEXTURE_2D, t); gl.drawArrays(gl.TRIANGLES, 0, verts.length / 9);
  }
  for (const n of ['p', 'uv', 'z', 'mc']) gl.disableVertexAttribArray(gl.getAttribLocation(prog, n));
}
