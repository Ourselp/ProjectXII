// WebGL renderer for a Dofus 3 skinned character (see tools/extract/character.js for the data format).
// drawChar(gl, ch, anim, frame, x, y, scale, flip): x,y = feet position in canvas pixels.
const VS = `attribute vec2 p; attribute vec2 uv; attribute float z; attribute vec4 mc;
uniform vec2 res; varying vec2 vuv; varying float vz; varying vec4 vmc;
void main(){ gl_Position = vec4(p / res * vec2(2.,-2.) + vec2(-1.,1.), 0., 1.); vuv = uv; vz = z; vmc = mc; }`;
const FS = `precision mediump float; uniform sampler2D tex; uniform vec3 cols[7]; varying vec2 vuv; varying float vz; varying vec4 vmc;
void main(){ vec4 c = texture2D(tex, vuv); int zi = int(vz + .5); vec3 tint = vec3(1.);
  for (int i = 1; i < 7; i++) if (i == zi) tint = cols[i] * 2.; // grey (0.5) * 2*colour = colour
  gl_FragColor = vec4(c.rgb * tint * vmc.rgb, c.a * vmc.a); gl_FragColor.rgb *= gl_FragColor.a; }`;

export async function loadChar(gl, url) {
  const ch = await (await fetch(url)).json(), base = url.replace(/[^/]*$/, '');
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(o); return o; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
  ch.prog = pr; ch.buf = gl.createBuffer();
  ch.tex = await Promise.all(ch.textures.map(async f => {
    const img = new Image(); img.src = base + f; await img.decode();
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // Unity UVs are bottom-up
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }));
  ch.cols = new Float32Array(21); ch.colors.forEach((c, i) => { if (i < 6) ch.cols.set([(c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255], (i + 1) * 3); });
  return ch;
}

export function drawChar(gl, ch, anim, frame, x, y, scale, flip) {
  const fr = ch.anims[anim][frame % ch.anims[anim].length], s = flip ? -scale : scale;
  const runs = []; // [texture, vertices] in display order

  for (const [node, a, b, tx, c, d, ty, col] of fr) {
    const p = ch.parts[ch.nodes[node]]; if (!p) continue;
    const mc = [(col & 255) / 127, (col >> 8 & 255) / 127, (col >> 16 & 255) / 127, (col >>> 24) / 127], v = p.v;
    if (!runs.length || runs[runs.length - 1][0] !== p.t) runs.push([p.t, []]);
    const out = runs[runs.length - 1][1];
    for (const i of p.i) {
      const k = i * 5, X = a * v[k] + b * v[k + 1] + tx, Y = c * v[k] + d * v[k + 1] + ty;
      out.push(x + X * s, y - Y * scale, v[k + 2], v[k + 3], v[k + 4], ...mc);
    }
  }
  gl.useProgram(ch.prog); gl.bindBuffer(gl.ARRAY_BUFFER, ch.buf);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.uniform2f(gl.getUniformLocation(ch.prog, 'res'), gl.canvas.width, gl.canvas.height);
  gl.uniform3fv(gl.getUniformLocation(ch.prog, 'cols'), ch.cols);
  const attr = (n, size, off) => { const l = gl.getAttribLocation(ch.prog, n); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 36, off); };
  for (const [t, verts] of runs) {
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
    attr('p', 2, 0); attr('uv', 2, 8); attr('z', 1, 16); attr('mc', 4, 20);
    gl.bindTexture(gl.TEXTURE_2D, ch.tex[t]); gl.drawArrays(gl.TRIANGLES, 0, verts.length / 9);
  }
}
