/* 湯宿 しじま: the room and garden, drawn with raw WebGL2 (no libraries).
   RyokanScene.create(canvas, { mobile, reduce }) returns a controller, or null without WebGL2.

   Realism comes from: smooth displaced rocks, instanced grass blades and leaf cards,
   bump-mapped stone, gravel and plaster, a sun shadow map, and a post pass with
   SSAO, bloom and filmic tone mapping (rendered in HDR with 4x MSAA).

   Contents
   1. Math and noise     5. Building        9. Render targets
   2. Geometry           6. Garden          10. Frame
   3. Shaders            7. Instances       11. Controller
   4. Seasons            8. Programs                                  */

(() => {
  'use strict';

  /* 1. Math and noise */

  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease = (t) => t * t * (3 - 2 * t);

  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  }

  function ortho(l, r, b, t, n, f) {
    const lr = 1 / (l - r);
    const bt = 1 / (b - t);
    const nf = 1 / (n - f);
    return new Float32Array([-2 * lr, 0, 0, 0, 0, -2 * bt, 0, 0, 0, 0, 2 * nf, 0, (l + r) * lr, (t + b) * bt, (f + n) * nf, 1]);
  }

  function lookAt(eye, target, up = [0, 1, 0]) {
    const z = norm(sub(eye, target));
    const x = norm(cross(up, z));
    const y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
  }

  function multiply(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c += 1) {
      for (let r = 0; r < 4; r += 1) {
        let s = 0;
        for (let k = 0; k < 4; k += 1) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
      }
    }
    return o;
  }

  function invert(a) {
    const o = new Float32Array(16);
    const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = a;
    const b00 = a00 * a11 - a01 * a10; const b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10; const b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11; const b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30; const b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30; const b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31; const b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return o;
    det = 1 / det;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return o;
  }

  const translation = (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
  const IDENTITY = translation(0, 0, 0);

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const linear = (h) => hex(h).map((c) => c ** 2.2);

  function hash3(x, y, z) {
    const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
    return h - Math.floor(h);
  }

  function vnoise(x, y, z) {
    const xi = Math.floor(x); const yi = Math.floor(y); const zi = Math.floor(z);
    const xf = x - xi; const yf = y - yi; const zf = z - zi;
    const u = xf * xf * (3 - 2 * xf); const v = yf * yf * (3 - 2 * yf); const w = zf * zf * (3 - 2 * zf);
    const c = (i, j, k) => hash3(xi + i, yi + j, zi + k);
    const x00 = lerp(c(0, 0, 0), c(1, 0, 0), u); const x10 = lerp(c(0, 1, 0), c(1, 1, 0), u);
    const x01 = lerp(c(0, 0, 1), c(1, 0, 1), u); const x11 = lerp(c(0, 1, 1), c(1, 1, 1), u);
    return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
  }

  function fbm3(x, y, z, octaves = 4) {
    let s = 0; let a = 0.5;
    for (let i = 0; i < octaves; i += 1) {
      s += a * vnoise(x, y, z);
      x *= 2.07; y *= 2.07; z *= 2.07; a *= 0.5;
    }
    return s;
  }

  /* 2. Geometry */

  // Material ids, shared with the fragment shader.
  const M = {
    plain: 0, tatami: 1, wood: 2, plaster: 3, shoji: 4, ground: 5, stone: 6, foliage: 7,
    water: 8, glow: 9, roof: 10, bamboo: 11, far: 12, scroll: 13, evergreen: 14, fusuma: 15, bark: 16,
  };

  class Geo {
    constructor() { this.p = []; this.n = []; this.c = []; this.u = []; this.m = []; }

    push(p, n, col, uv, mat) {
      this.p.push(p[0], p[1], p[2]);
      this.n.push(n[0], n[1], n[2]);
      this.c.push(col[0], col[1], col[2]);
      this.u.push(uv[0], uv[1]);
      this.m.push(mat);
    }

    tri(a, b, c, col, mat, ua = [0, 0], ub = [1, 0], uc = [1, 1]) {
      const n = norm(cross(sub(b, a), sub(c, a)));
      this.push(a, n, col, ua, mat);
      this.push(b, n, col, ub, mat);
      this.push(c, n, col, uc, mat);
    }

    triN(a, b, c, na, nb, nc, col, mat, ua = [0, 0], ub = [1, 0], uc = [1, 1]) {
      this.push(a, na, col, ua, mat);
      this.push(b, nb, col, ub, mat);
      this.push(c, nc, col, uc, mat);
    }

    quad(a, b, c, d, col, mat, uv = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      this.tri(a, b, c, col, mat, uv[0], uv[1], uv[2]);
      this.tri(a, c, d, col, mat, uv[0], uv[2], uv[3]);
    }

    // mode 'm': uv in metres, long side first (wood grain runs along it).
    // mode 'n': uv 0..1 across each face. mode 'nl': 0..1 with the long side first.
    box(a, b, col, mat, mode = 'm') {
      const [x0, y0, z0] = a;
      const [x1, y1, z1] = b;
      const faces = [
        [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 2, 1],
        [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], 2, 1],
        [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0, 2],
        [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0, 2],
        [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 1],
        [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 1],
      ];
      const size = sub(b, a);
      faces.forEach(([p0, p1, p2, p3, ui, vi]) => {
        const swap = (mode === 'm' || mode === 'nl') && size[vi] > size[ui];
        const uv = [p0, p1, p2, p3].map((p) => {
          let u = p[ui];
          let v = p[vi];
          if (mode !== 'm') {
            u = (p[ui] - a[ui]) / (size[ui] || 1);
            v = (p[vi] - a[vi]) / (size[vi] || 1);
          }
          return swap ? [v, u] : [u, v];
        });
        this.quad(p0, p1, p2, p3, col, mat, uv);
      });
    }

    // Smooth tapered cylinder between two points. r1 = 0 makes a cone.
    cyl(p0, p1, r0, r1, seg, col, mat, caps = true) {
      const axis = norm(sub(p1, p0));
      const helper = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const u = norm(cross(axis, helper));
      const w = cross(axis, u);
      const height = Math.hypot(...sub(p1, p0));
      const slope = (r0 - r1) / (height || 1);
      const radial = (i) => {
        const t = (i / seg) * Math.PI * 2;
        return add(scale(u, Math.cos(t)), scale(w, Math.sin(t)));
      };
      for (let i = 0; i < seg; i += 1) {
        const d0 = radial(i); const d1 = radial(i + 1);
        const n0 = norm(add(d0, scale(axis, slope))); const n1 = norm(add(d1, scale(axis, slope)));
        const b0 = add(p0, scale(d0, r0)); const b1 = add(p0, scale(d1, r0));
        const t0 = add(p1, scale(d0, r1)); const t1 = add(p1, scale(d1, r1));
        const uA = [i / seg, 0]; const uB = [(i + 1) / seg, 0]; const uC = [(i + 1) / seg, height]; const uD = [i / seg, height];
        if (r1 > 0) {
          this.triN(b0, b1, t1, n0, n1, n1, col, mat, uA, uB, uC);
          this.triN(b0, t1, t0, n0, n1, n0, col, mat, uA, uC, uD);
        } else {
          this.triN(b0, b1, p1, n0, n1, norm(add(n0, n1)), col, mat, uA, uB, uC);
        }
        if (caps) {
          this.tri(p0, b1, b0, col, mat);
          if (r1 > 0) this.tri(p1, t0, t1, col, mat);
        }
      }
    }

    // Smooth, noise-displaced sphere: rocks, cushions of moss, the hidden cores of shrubs.
    // `floor` flattens the underside so rocks sit into the ground.
    blob(center, radii, detail, amp, freq, col, mat, seed = 1, floor = -1) {
      const t = (1 + Math.sqrt(5)) / 2;
      let verts = [
        [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t],
        [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
      ].map(norm);
      let faces = [
        [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
        [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
      ];
      for (let d = 0; d < detail; d += 1) {
        const cache = new Map();
        const mid = (i, j) => {
          const key = i < j ? `${i}_${j}` : `${j}_${i}`;
          if (!cache.has(key)) {
            verts.push(norm(scale(add(verts[i], verts[j]), 0.5)));
            cache.set(key, verts.length - 1);
          }
          return cache.get(key);
        };
        const next = [];
        faces.forEach(([a, b, c]) => {
          const ab = mid(a, b); const bc = mid(b, c); const ca = mid(c, a);
          next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
        });
        faces = next;
      }
      const s = seed * 17.3;
      const pos = verts.map((v) => {
        const k = 1 + (fbm3(v[0] * freq + s, v[1] * freq, v[2] * freq - s) - 0.5) * 2 * amp;
        const y = Math.max(v[1] * k, floor);
        return add(center, [v[0] * radii[0] * k, y * radii[1], v[2] * radii[2] * k]);
      });
      const nrm = pos.map(() => [0, 0, 0]);
      faces.forEach(([a, b, c]) => {
        const n = cross(sub(pos[b], pos[a]), sub(pos[c], pos[a]));
        [a, b, c].forEach((i) => { nrm[i] = add(nrm[i], n); });
      });
      const nn = nrm.map(norm);
      faces.forEach(([a, b, c]) => this.triN(pos[a], pos[b], pos[c], nn[a], nn[b], nn[c], col, mat));
    }
  }

  /* 3. Shaders. HDR is defined when the canvas has a float render target;
        otherwise each pass tone maps for itself and the post pass is skipped. */

  const NOISE = `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float noise3(vec3 p) {
    vec3 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    float a = mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), u.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), u.x), u.y);
    float b = mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), u.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), u.x), u.y);
    return mix(a, b, u.z);
  }
  float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
  float fbm3(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * noise3(p); p *= 2.07; a *= 0.5; } return s; }
  vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
  vec3 tonemap(vec3 c) {
    c *= 0.9;
    c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
    return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
  }
  vec3 finish(vec3 c) {
  #ifdef HDR
    return c;
  #else
    return tonemap(c);
  #endif
  }`;

  // Shared lighting for opaque surfaces, grass and leaves.
  const LIGHT = `
  uniform vec3 uCam, uSunDir, uSunCol, uSkyCol, uGroundCol, uFogCol, uLampPos, uLampCol;
  uniform float uFogDen, uAmb, uOpen, uSnow, uTexel;
  uniform sampler2DShadow uShadow;
  float shadowAt(vec4 lp, vec3 n, float soft) {
    vec3 p = lp.xyz / lp.w * 0.5 + 0.5;
    if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
    p.z -= 0.0007 + 0.0018 * (1.0 - clamp(dot(n, uSunDir), 0.0, 1.0));
    float s = 0.0;
    float r = uTexel * soft;
    vec2 k[8] = vec2[](vec2(-0.94, -0.4), vec2(0.95, -0.77), vec2(-0.09, -0.93), vec2(0.34, 0.29),
                       vec2(-0.82, 0.54), vec2(0.54, 0.82), vec2(-0.27, 0.06), vec2(0.07, 0.62));
    for (int i = 0; i < 8; i++) s += texture(uShadow, vec3(p.xy + k[i] * r, p.z));
    return s / 8.0;
  }
  float insideRoom(vec3 P) {
    return step(-3.05, P.x) * step(P.x, 3.05) * step(-4.05, P.z) * step(P.z, 0.06) * step(P.y, 2.62);
  }
  float coveredAt(vec3 P) {
    return step(-3.4, P.x) * step(P.x, 3.4) * step(P.z, 1.5) * step(-0.1, P.y) * step(P.y, 2.62);
  }
  vec3 lampAt(vec3 P, vec3 n, float inside) {
    vec3 d = uLampPos - P;
    float l = length(d);
    return uLampCol * (0.3 + 0.7 * max(dot(n, d / l), 0.0)) / (1.0 + l * l * 1.1) * mix(0.12, 1.0, inside);
  }
  vec3 fogged(vec3 col, vec3 P) {
    float dist = length(P - uCam);
    float fog = 1.0 - exp(-pow(dist * uFogDen, 1.35));
    return mix(col, uFogCol, clamp(fog, 0.0, 1.0));
  }`;

  const MAIN_VS = `#version 300 es
  layout(location=0) in vec3 aPos;
  layout(location=1) in vec3 aNor;
  layout(location=2) in vec3 aCol;
  layout(location=3) in vec2 aUv;
  layout(location=4) in float aMat;
  uniform mat4 uViewProj, uModel, uLightVP;
  out vec3 vPos; out vec3 vNor; out vec3 vCol; out vec2 vUv; out vec4 vLight;
  flat out float vMat;
  void main() {
    vec4 w = uModel * vec4(aPos, 1.0);
    vPos = w.xyz; vNor = mat3(uModel) * aNor; vCol = aCol; vUv = aUv; vMat = aMat;
    vLight = uLightVP * w;
    gl_Position = uViewProj * w;
  }`;

  const MAIN_FS = (defs) => `#version 300 es
  ${defs}
  precision highp float;
  precision highp sampler2DShadow;
  in vec3 vPos; in vec3 vNor; in vec3 vCol; in vec2 vUv; in vec4 vLight;
  flat in float vMat;
  out vec4 outColor;
  uniform vec3 uFlower;
  uniform float uTime, uPaper, uGlow;
  uniform vec3 uRocks[3];
  ${NOISE}
  ${LIGHT}

  vec3 bump(vec3 n, vec3 P, float freq, float amt) {
    float e = 0.012;
    float h = fbm3(P * freq);
    vec3 g = vec3(fbm3((P + vec3(e, 0, 0)) * freq) - h, fbm3((P + vec3(0, e, 0)) * freq) - h, fbm3((P + vec3(0, 0, e)) * freq) - h) / e;
    g -= n * dot(g, n);
    return normalize(n - g * amt);
  }

  void main() {
    vec3 n = normalize(vNor);
    if (!gl_FrontFacing) n = -n;
    vec3 P = vPos;
    vec3 base = lin(vCol);
    vec3 emit = vec3(0.0);
    float shine = 0.0, gloss = 40.0;
    int m = int(vMat + 0.5);

    if (m == 1) {
      float stripe = 0.5 + 0.5 * sin(vUv.y * 320.0);
      float weft = 0.5 + 0.5 * sin(vUv.x * 900.0 + stripe);
      base = lin(vec3(0.74, 0.71, 0.5)) * (0.82 + 0.1 * stripe + 0.04 * weft + 0.12 * fbm(P.xz * 3.0));
      float edge = step(vUv.y, 0.035) + step(0.965, vUv.y);
      base = mix(base, lin(vec3(0.13, 0.16, 0.14)) * (0.9 + 0.2 * step(0.5, fract(vUv.x * 70.0))), clamp(edge, 0.0, 1.0));
      shine = 0.12; gloss = 18.0;
    } else if (m == 2 || m == 16) {
      float g = fbm(vec2(vUv.x * 1.4, vUv.y * 38.0));
      float ring = 0.5 + 0.5 * sin(vUv.y * 90.0 + g * 10.0);
      base *= 0.72 + 0.3 * g + 0.08 * ring;
      shine = m == 2 ? 0.35 : 0.0; gloss = 60.0;
      if (m == 16) { n = bump(n, P, 9.0, 0.06); base *= 0.8 + 0.3 * noise3(P * 14.0); }
    } else if (m == 3) {
      n = bump(n, P, 22.0, 0.012);
      base *= 0.9 + 0.1 * fbm(P.xy * 7.0 + P.zz * 7.0);
    } else if (m == 4) {
      vec2 uv = vUv;
      float frame = step(uv.x, 0.035) + step(0.965, uv.x) + step(uv.y, 0.025) + step(0.975, uv.y);
      float kumiko = max(step(0.475, abs(fract(uv.x * 3.0) - 0.5)), step(0.46, abs(fract(uv.y * 9.0) - 0.5)));
      float koshi = step(uv.y, 0.12);
      float woodMask = clamp(frame + kumiko + koshi, 0.0, 1.0);
      vec3 paper = lin(vec3(0.95, 0.93, 0.87)) * (0.95 + 0.05 * fbm(uv * vec2(60.0, 160.0)));
      base = mix(paper, lin(vec3(0.7, 0.54, 0.37)), woodMask);
      emit = paper * uPaper * (1.0 - woodMask);
    } else if (m == 5) {
      vec2 q = P.xz;
      float d = length((q - vec2(2.4, 6.5)) / vec2(3.3, 2.5)) + (fbm(q * 0.9) - 0.5) * 0.12;
      float gravel = 1.0 - smoothstep(0.96, 1.02, d);
      float rk = 100.0; vec2 dir = vec2(0.0, 1.0);
      for (int i = 0; i < 3; i++) {
        vec2 dv = q - uRocks[i].xy;
        float dd = length(dv) - uRocks[i].z;
        if (dd < rk) { rk = dd; dir = normalize(dv); }
      }
      float wRing = 1.0 - smoothstep(0.55, 0.9, rk);
      float phase = mix(q.y * 30.0, max(rk, 0.0) * 30.0, wRing);
      vec2 grad = mix(vec2(0.0, 30.0), dir * 30.0, wRing);
      float rake = sin(phase);
      float grain = hash(floor(q * 110.0));
      vec3 sand = lin(vec3(0.8, 0.79, 0.75)) * (0.8 + 0.1 * rake + 0.16 * grain);
      vec3 soil = lin(vec3(0.17, 0.2, 0.1)) * (0.6 + 0.6 * fbm(q * 2.3));
      soil = mix(soil, lin(vec3(0.28, 0.24, 0.17)), smoothstep(0.5, 0.8, fbm(q * 0.4 + 7.0)) * 0.5);
      base = mix(soil, sand, gravel);
      n = normalize(n - vec3(grad.x, 0.0, grad.y) * cos(phase) * 0.0035 * gravel);
      n = normalize(n + vec3(grain - 0.5, 0.0, hash(floor(q * 110.0) + 3.1) - 0.5) * 0.35 * gravel);
    } else if (m == 6) {
      n = bump(n, P, 5.0, 0.09);
      float f = fbm3(P * 3.2);
      base *= 0.62 + 0.55 * f;
      base = mix(base, base * vec3(0.9, 0.95, 1.05), noise3(P * 1.3));
      float lichen = smoothstep(0.45, 0.85, n.y) * smoothstep(0.5, 0.7, fbm3(P * 6.0 + 4.0));
      base = mix(base, lin(vec3(0.33, 0.38, 0.2)), lichen * 0.7);
      shine = 0.06; gloss = 24.0;
    } else if (m == 7) {
      base = lin(uFlower) * (0.8 + 0.4 * vCol.r);
    } else if (m == 9) {
      emit = lin(vCol) * uGlow * 2.2;
      base = lin(vCol) * 0.2;
    } else if (m == 10) {
      float row = fract(P.x * 3.6);
      base *= 0.7 + 0.3 * smoothstep(0.0, 0.5, row) * (1.0 - smoothstep(0.85, 1.0, row));
      base *= 0.9 + 0.15 * noise(P.xz * 4.0);
      n = normalize(n + vec3(cos(row * 6.283) * 0.25, 0.0, 0.0));
      shine = 0.25; gloss = 30.0;
    } else if (m == 11) {
      base *= 0.8 + 0.25 * step(0.94, fract(P.y * 2.4)) + 0.1 * noise(vec2(P.x * 30.0, P.y * 3.0));
      shine = 0.2;
    } else if (m == 12) {
      base *= 0.85 + 0.25 * fbm(P.xy * 0.15);
    } else if (m == 13) {
      vec2 uv = vUv;
      vec3 paper = lin(vec3(0.9, 0.86, 0.75));
      float far = smoothstep(0.006, 0.0, uv.y - (0.56 + 0.1 * sin(uv.x * 6.0 + 1.0) + 0.04 * sin(uv.x * 17.0)));
      float near = smoothstep(0.006, 0.0, uv.y - (0.4 + 0.12 * sin(uv.x * 4.0 + 3.0) + 0.03 * sin(uv.x * 23.0)));
      vec3 art = mix(paper, lin(vec3(0.6, 0.6, 0.58)), far * step(0.22, uv.y) * (0.7 + 0.3 * fbm(uv * 30.0)));
      art = mix(art, lin(vec3(0.22, 0.22, 0.23)), near * step(0.22, uv.y) * (0.8 + 0.2 * fbm(uv * 40.0)));
      float seal = step(abs(uv.x - 0.78), 0.035) * step(abs(uv.y - 0.82), 0.025);
      art = mix(art, lin(vec3(0.62, 0.12, 0.1)), seal);
      float mount = step(uv.x, 0.09) + step(0.91, uv.x) + step(uv.y, 0.07) + step(0.93, uv.y);
      base = mix(art, lin(vec3(0.34, 0.29, 0.22)), clamp(mount, 0.0, 1.0));
    } else if (m == 14) {
      n = bump(n, P, 3.0, 0.25);
      base *= 0.7 + 0.5 * fbm3(P * 2.0);
    } else if (m == 15) {
      vec2 uv = vUv;
      float wave = smoothstep(0.08, 0.0, abs(fract(uv.y * 5.0 + sin(uv.x * 9.0) * 0.12) - 0.5) - 0.38);
      base = lin(vec3(0.84, 0.79, 0.68)) * (0.95 + 0.05 * fbm(uv * 30.0));
      base = mix(base, lin(vec3(0.76, 0.64, 0.4)), wave * 0.35 * step(0.55, uv.y));
      float frame = step(uv.x, 0.015) + step(0.985, uv.x) + step(uv.y, 0.012) + step(0.988, uv.y);
      base = mix(base, lin(vec3(0.14, 0.1, 0.08)), clamp(frame, 0.0, 1.0));
      float pull = step(length((uv - vec2(0.9, 0.47)) * vec2(1.0, 2.0)), 0.025);
      base = mix(base, lin(vec3(0.3, 0.24, 0.16)), pull);
    }

    bool outdoor = m == 5 || m == 6 || m == 10 || m == 11 || m == 12 || m == 14 || m == 16;
    if (outdoor || (m == 2 && P.z > 1.45) || (m == 3 && P.z > 0.2)) {
      float cover = uSnow * smoothstep(0.3, 0.8, n.y) * (0.75 + 0.25 * fbm(P.xz * 2.2));
      base = mix(base, lin(vec3(0.9, 0.92, 0.96)), clamp(cover, 0.0, 1.0));
      shine = mix(shine, 0.3, cover);
    }

    float inside = insideRoom(P);
    float sh = shadowAt(vLight, n, 1.6);
    float ndl = max(dot(n, uSunDir), 0.0);
    vec3 hemi = mix(uGroundCol, uSkyCol, n.y * 0.5 + 0.5) * uAmb;
    float amb = mix(1.0, 0.7, coveredAt(P));
    amb = mix(amb, mix(0.28, 0.58, uOpen), inside);
    // Light that came in through the opening bounces off the tatami.
    vec3 bounce = inside * uOpen * uSunCol * lin(vec3(0.74, 0.7, 0.5)) * 0.06 * (0.6 + 0.4 * n.y);
    vec3 V = normalize(uCam - P);
    vec3 col;

    if (m == 8) {
      vec2 w1 = vec2(noise(P.xz * 2.5 + uTime * 0.5), noise(P.zx * 2.7 - uTime * 0.45)) - 0.5;
      vec2 w2 = vec2(noise(P.xz * 7.0 - uTime * 0.9), noise(P.zx * 6.5 + uTime * 0.8)) - 0.5;
      vec3 wn = normalize(vec3(w1.x * 0.25 + w2.x * 0.12, 1.0, w1.y * 0.25 + w2.y * 0.12));
      float fres = 0.02 + 0.98 * pow(1.0 - max(dot(wn, V), 0.0), 5.0);
      vec3 r = reflect(-V, wn);
      vec3 refl = mix(uFogCol, uSkyCol * 1.1, clamp(r.y * 1.6, 0.0, 1.0));
      vec3 deep = lin(vec3(0.1, 0.22, 0.22));
      float spec = pow(max(dot(wn, normalize(uSunDir + V)), 0.0), 90.0) * mix(0.5, 1.0, sh);
      col = mix(deep * (hemi * 0.6 + uSunCol * ndl * 0.2), refl, fres) + uSunCol * spec * 0.7;
    } else {
      col = base * (uSunCol * ndl * sh + hemi * amb + lampAt(P, n, inside) + bounce) + emit;
      if (shine > 0.0) {
        vec3 H = normalize(uSunDir + V);
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
        col += uSunCol * pow(max(dot(n, H), 0.0), gloss) * shine * sh * (0.5 + fres);
        col += hemi * fres * shine * 0.25;
      }
    }

    col = fogged(col, P);
    if (m == 12) col = mix(col, uFogCol, 0.3);
    outColor = vec4(finish(col), 1.0);
  }`;

  // Grass blades (kind 0) and leaf cards (kind 1), drawn instanced.
  const INST_VS = `#version 300 es
  layout(location=0) in vec2 aLocal;
  layout(location=1) in vec3 iPos;
  layout(location=2) in vec4 iA;
  uniform mat4 uViewProj, uLightVP;
  uniform float uTime, uWind, uScale, uGrow;
  uniform int uKind;
  out vec3 vPos; out vec3 vNor; out vec2 vUv; out float vRand; out vec4 vLight;
  void main() {
    vec3 p; vec3 n;
    float rnd = iA.w;
    if (uKind == 0) {
      float h = iA.x * uGrow;
      float yaw = iA.y;
      vec3 fwd = vec3(cos(yaw), 0.0, sin(yaw));
      vec3 right = vec3(-fwd.z, 0.0, fwd.x);
      float t = aLocal.y;
      float w = 0.011 * (1.0 - t * 0.9) * (0.75 + rnd * 0.6);
      float sway = sin(uTime * 1.5 + iPos.x * 1.1 + iPos.z * 0.8) * 0.6 + sin(uTime * 2.6 + iPos.z * 2.3 + iPos.x) * 0.25;
      float bend = iA.z + sway * 0.22 * uWind;
      p = iPos + right * aLocal.x * w + vec3(0.0, t * h, 0.0) + fwd * bend * t * t * h;
      n = normalize(-fwd * 0.6 + vec3(0.0, 1.0, 0.0));
      vUv = vec2(aLocal.x * 0.5 + 0.5, t);
    } else {
      float s = iA.x * uScale;
      float cy = cos(iA.y), sy = sin(iA.y), cp = cos(iA.z), sp = sin(iA.z);
      mat3 R = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy) * mat3(1.0, 0.0, 0.0, 0.0, cp, sp, 0.0, -sp, cp);
      vec3 local = vec3(aLocal.x - 0.5, aLocal.y - 0.5, 0.0) * s;
      p = iPos + R * local;
      float hgt = max(iPos.y + 0.45, 0.0);
      p += vec3(sin(uTime * 1.3 + iPos.y * 2.0 + iPos.x), 0.0, cos(uTime * 1.1 + iPos.z * 1.7)) * 0.012 * uWind * hgt;
      n = R * vec3(0.0, 0.0, 1.0);
      vUv = aLocal;
    }
    vPos = p; vNor = n; vRand = rnd;
    vLight = uLightVP * vec4(p, 1.0);
    gl_Position = uViewProj * vec4(p, 1.0);
  }`;

  const SHAPES = `
  float leafMask(vec2 uv, int shape) {
    vec2 c = uv * 2.0 - 1.0;
    float r = length(c);
    if (shape == 0) {
      float a = atan(c.x, c.y);
      float lobes = 0.55 + 0.4 * pow(abs(cos(a * 2.5)), 0.7);
      return step(r, lobes) * step(-0.85, c.y);
    }
    if (shape == 1) {
      float a = atan(c.y, c.x);
      return step(r, 0.42 + 0.5 * pow(abs(cos(a * 2.5)), 0.5));
    }
    if (shape == 2) {
      float a = atan(c.y, c.x);
      return step(0.8, abs(cos(a * 11.0))) * step(r, 0.98) * step(0.06, r);
    }
    return step(length(c * vec2(1.7, 1.0)), 0.95);
  }`;

  const INST_FS = (defs) => `#version 300 es
  ${defs}
  precision highp float;
  precision highp int;
  precision highp sampler2DShadow;
  in vec3 vPos; in vec3 vNor; in vec2 vUv; in float vRand; in vec4 vLight;
  out vec4 outColor;
  uniform int uKind, uShape;
  uniform vec3 uColA, uColB;
  uniform float uSnowOn;
  ${NOISE}
  ${LIGHT}
  ${SHAPES}
  void main() {
    if (uKind == 1 && leafMask(vUv, uShape) < 0.5) discard;
    vec3 n = normalize(vNor);
    vec3 V = normalize(uCam - vPos);
    if (dot(n, V) < 0.0) n = -n;
    vec3 base = lin(mix(uColA, uColB, vRand));
    float ao = 1.0;
    if (uKind == 0) {
      base *= mix(0.45, 1.15, vUv.y);
      ao = mix(0.35, 1.0, smoothstep(0.0, 0.8, vUv.y));
    } else {
      base *= 0.85 + 0.3 * noise(vUv * 6.0 + vRand * 10.0);
    }
    float cover = uSnow * uSnowOn * smoothstep(0.1, 0.7, n.y + 0.3) * step(0.25, vRand);
    base = mix(base, lin(vec3(0.9, 0.92, 0.96)), cover);
    float sh = shadowAt(vLight, n, 2.0);
    float front = max(dot(n, uSunDir), 0.0);
    float back = max(dot(-n, uSunDir), 0.0);
    vec3 hemi = mix(uGroundCol, uSkyCol, n.y * 0.5 + 0.5) * uAmb;
    vec3 col = base * (uSunCol * (front * 0.85 + back * 0.45) * sh + hemi * 0.9 * ao + lampAt(vPos, n, 0.0));
    vec3 H = normalize(uSunDir + V);
    col += uSunCol * pow(max(dot(n, H), 0.0), 30.0) * 0.08 * sh;
    col = fogged(col, vPos);
    outColor = vec4(finish(col), 1.0);
  }`;

  const DEPTH_VS = `#version 300 es
  layout(location=0) in vec3 aPos;
  uniform mat4 uLightVP, uModel;
  void main() { gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`;

  const DEPTH_FS = `#version 300 es
  precision mediump float;
  out vec4 o;
  void main() { o = vec4(1.0); }`;

  const INST_DEPTH_FS = `#version 300 es
  precision highp float;
  precision highp int;
  in vec3 vPos; in vec3 vNor; in vec2 vUv; in float vRand; in vec4 vLight;
  uniform int uKind, uShape;
  out vec4 o;
  ${SHAPES}
  void main() {
    if (uKind == 1 && leafMask(vUv, uShape) < 0.5) discard;
    o = vec4(1.0);
  }`;

  const SKY_VS = `#version 300 es
  out vec2 vNdc;
  void main() {
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
    vNdc = p;
    gl_Position = vec4(p, 0.9999, 1.0);
  }`;

  const SKY_FS = (defs) => `#version 300 es
  ${defs}
  precision highp float;
  in vec2 vNdc;
  out vec4 outColor;
  uniform mat4 uInvVP;
  uniform vec3 uCam, uSkyTop, uSkyHor, uSunDir, uSunCol;
  uniform float uTime, uCloud, uStars;
  ${NOISE}
  void main() {
    vec4 p = uInvVP * vec4(vNdc, 1.0, 1.0);
    vec3 dir = normalize(p.xyz / p.w - uCam);
    float h = dir.y;
    vec3 c = mix(uSkyHor, uSkyTop, pow(smoothstep(-0.02, 0.7, h), 0.8));
    float s = max(dot(dir, uSunDir), 0.0);
    c += uSunCol * (pow(s, 1200.0) * 30.0 + pow(s, 12.0) * 0.25 + pow(s, 3.0) * 0.06);
    vec2 cp = dir.xz / max(h + 0.1, 0.04);
    float cl = fbm(cp * 0.7 + vec2(uTime * 0.006, 0.0)) * 0.7 + fbm(cp * 2.1 - uTime * 0.01) * 0.3;
    float cover = smoothstep(0.5, 0.75, cl) * smoothstep(0.0, 0.2, h) * uCloud;
    vec3 cloudCol = mix(uSkyHor * 0.95, mix(uSkyHor, vec3(1.0), 0.5) + uSunCol * 0.15 * pow(s, 4.0), smoothstep(0.5, 0.9, cl));
    c = mix(c, cloudCol, cover);
    float star = step(0.9965, hash(floor(dir.xy * 240.0 + dir.z * 37.0))) * smoothstep(0.15, 0.5, h) * uStars;
    c += vec3(star) * (0.8 + 0.6 * sin(uTime * 3.0 + dir.x * 90.0));
    outColor = vec4(finish(c), 1.0);
  }`;

  const PART_VS = `#version 300 es
  precision highp float;
  precision highp int;
  layout(location=0) in vec4 aSeed;
  uniform mat4 uViewProj;
  uniform float uTime, uPx, uAlpha, uMotion;
  uniform int uType;
  uniform vec3 uBath;
  out float vA; out float vRot;
  void main() {
    vec4 s = aSeed;
    float t = uTime * uMotion;
    vec3 p; float size = 0.06; float a = 1.0;
    if (uType == 1) {
      p = vec3(-6.0 + s.x * 12.0, -0.25 + s.y * 1.7, 2.0 + s.z * 9.5);
      p += vec3(sin(t * 0.35 + s.w * 20.0), sin(t * 0.6 + s.x * 13.0) * 0.4, cos(t * 0.3 + s.y * 17.0)) * 0.6;
      size = 0.035;
      a = 0.15 + 0.85 * pow(0.5 + 0.5 * sin(t * 1.8 + s.w * 40.0), 3.0);
    } else if (uType == 4) {
      float life = fract(t * 0.08 + s.w);
      p = uBath + vec3((s.x - 0.5) * 2.2, life * 2.6 - 0.1, (s.z - 0.5) * 1.6);
      p.x += sin(life * 5.0 + s.y * 6.0) * 0.35;
      size = 0.6 + life * 1.6;
      a = sin(life * 3.14159) * 0.06;
    } else {
      float speed = uType == 3 ? 0.32 + 0.22 * s.w : (uType == 0 ? 0.42 + 0.3 * s.w : 0.6 + 0.35 * s.w);
      float y = 6.5 - mod(t * speed + s.y * 7.0, 7.0);
      p = vec3(-8.0 + s.x * 16.0 + sin(t * (0.5 + s.w) + s.z * 6.28) * 0.6, y, 1.6 + s.z * 12.0 + cos(t * 0.45 + s.x * 6.28) * 0.4);
      size = uType == 3 ? 0.035 : 0.05;
      a = smoothstep(-0.5, 0.0, y);
    }
    vec4 clip = uViewProj * vec4(p, 1.0);
    gl_Position = clip;
    gl_PointSize = clamp(size * uPx / max(clip.w, 0.1), 1.0, uType == 4 ? 200.0 : 22.0);
    vA = a * uAlpha;
    vRot = s.w * 6.28 + t * (0.6 + s.x);
  }`;

  const PART_FS = (defs) => `#version 300 es
  ${defs}
  precision highp float;
  precision highp int;
  in float vA; in float vRot;
  uniform int uType;
  uniform vec3 uTint;
  out vec4 outColor;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float cs = cos(vRot), sn = sin(vRot);
    vec2 r = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs);
    vec3 col; float a;
    if (uType == 0) { a = 1.0 - smoothstep(0.7, 1.0, length(r / vec2(1.0, 0.55))); col = vec3(0.95, 0.74, 0.8); }
    else if (uType == 1) { a = exp(-dot(c, c) * 5.0); col = vec3(1.0, 0.95, 0.5) * 6.0; }
    else if (uType == 2) { a = 1.0 - smoothstep(0.85, 1.0, abs(r.x) + abs(r.y) * 1.7); col = mix(vec3(0.7, 0.2, 0.08), vec3(0.85, 0.45, 0.12), step(0.0, r.x)); }
    else if (uType == 3) { a = 1.0 - smoothstep(0.2, 1.0, length(c)); col = vec3(1.0); }
    else { a = exp(-dot(c, c) * 2.0); col = vec3(1.0); }
    col *= uTint;
    a *= vA;
    if (a < 0.003) discard;
  #ifdef HDR
    outColor = vec4(col, a);
  #else
    outColor = vec4(min(col, vec3(1.0)), a);
  #endif
  }`;

  // Post: SSAO from depth, bloom, then tone mapping, vignette and a light grade.
  const QUAD_VS = `#version 300 es
  out vec2 vUv;
  void main() {
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    vUv = p;
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  }`;

  const AO_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 o;
  uniform sampler2D uDepth;
  uniform mat4 uProj, uInvProj;
  uniform vec3 uKernel[12];
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  vec3 viewPos(vec2 uv) {
    float d = texture(uDepth, uv).r;
    vec4 p = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    return p.xyz / p.w;
  }
  void main() {
    float d = texture(uDepth, vUv).r;
    if (d >= 1.0) { o = vec4(1.0); return; }
    vec3 P = viewPos(vUv);
    vec3 N = normalize(cross(dFdx(P), dFdy(P)));
    if (dot(N, P) > 0.0) N = -N;
    float a = hash(gl_FragCoord.xy) * 6.283;
    vec3 rv = vec3(cos(a), sin(a), 0.0);
    vec3 T = normalize(rv - N * dot(rv, N));
    vec3 B = cross(N, T);
    mat3 tbn = mat3(T, B, N);
    float radius = 0.45;
    float occ = 0.0;
    for (int i = 0; i < 12; i++) {
      vec3 S = P + tbn * uKernel[i] * radius;
      vec4 c = uProj * vec4(S, 1.0);
      vec2 uv = c.xy / c.w * 0.5 + 0.5;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) continue;
      float sd = viewPos(uv).z;
      float range = smoothstep(0.0, 1.0, radius / abs(P.z - sd));
      occ += step(S.z + 0.025, sd) * range;
    }
    o = vec4(vec3(1.0 - occ / 12.0), 1.0);
  }`;

  const BRIGHT_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 o;
  uniform sampler2D uSrc;
  uniform vec2 uTexel;
  void main() {
    vec3 c = vec3(0.0);
    c += texture(uSrc, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
    c += texture(uSrc, vUv + vec2(1.0, -1.0) * uTexel).rgb;
    c += texture(uSrc, vUv + vec2(-1.0, 1.0) * uTexel).rgb;
    c += texture(uSrc, vUv + vec2(1.0, 1.0) * uTexel).rgb;
    c *= 0.25;
    float l = max(c.r, max(c.g, c.b));
    o = vec4(c * smoothstep(1.0, 3.0, l), 1.0);
  }`;

  const BLUR_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 o;
  uniform sampler2D uSrc;
  uniform vec2 uDir;
  void main() {
    float w[5] = float[](0.227, 0.194, 0.121, 0.054, 0.016);
    vec3 c = texture(uSrc, vUv).rgb * w[0];
    for (int i = 1; i < 5; i++) {
      c += texture(uSrc, vUv + uDir * float(i)).rgb * w[i];
      c += texture(uSrc, vUv - uDir * float(i)).rgb * w[i];
    }
    o = vec4(c, 1.0);
  }`;

  const COMPOSITE_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 o;
  uniform sampler2D uColor, uAo, uBloom;
  uniform vec2 uTexel;
  uniform float uAoOn, uTime, uExposure;
  ${NOISE}
  void main() {
    vec3 c = texture(uColor, vUv).rgb;
    float ao = 0.0, wsum = 0.0;
    for (int x = -1; x <= 1; x++)
      for (int y = -1; y <= 1; y++) { ao += texture(uAo, vUv + vec2(x, y) * uTexel * 1.5).r; wsum += 1.0; }
    ao = mix(1.0, ao / wsum, uAoOn);
    c *= mix(0.25, 1.0, ao);
    c += texture(uBloom, vUv).rgb * 0.5;
    c *= uExposure;
    vec3 t = tonemap(c);
    t = mix(vec3(dot(t, vec3(0.299, 0.587, 0.114))), t, 1.06);
    t = pow(t, vec3(1.02, 1.0, 0.98));
    vec2 q = vUv - 0.5;
    t *= 1.0 - dot(q, q) * 0.55;
    t += (hash(vUv * 900.0 + fract(uTime) * 37.0) - 0.5) * 0.018;
    o = vec4(t, 1.0);
  }`;

  /* 4. Seasons */

  const SEASONS = {
    spring: {
      skyTop: '#86A8CF', skyHor: '#EEDFD8', sunDir: [0.45, 0.5, 0.74], sunCol: '#FFF0DC', sunI: 3.0,
      hemiSky: '#BDCDE2', hemiGround: '#7E7A62', amb: 0.85, fog: 0.011, folA: '#F6D8E0', folB: '#E8A6BA', leafShape: 1, leafScale: 1,
      grassA: '#4C7A2E', grassB: '#86AE4C', grow: 1, flower: '#F3B9C8', snow: 0, paper: 0.75, lamp: 0.5, glow: 0.7,
      cloud: 0.55, stars: 0, wind: 1, particle: 0, exposure: 1.0, tint: '#FFFFFF',
    },
    summer: {
      skyTop: '#22345A', skyHor: '#E39870', sunDir: [-0.78, 0.13, 0.62], sunCol: '#FFAA66', sunI: 2.3,
      hemiSky: '#4E6194', hemiGround: '#3E3C30', amb: 0.7, fog: 0.014, folA: '#355F2C', folB: '#6A9442', leafShape: 0, leafScale: 1,
      grassA: '#2F5A22', grassB: '#5E8A34', grow: 1.15, flower: '#7E7BC8', snow: 0, paper: 0.6, lamp: 1.8, glow: 1.8,
      cloud: 0.35, stars: 0.6, wind: 0.6, particle: 1, exposure: 1.15, tint: '#FFFFFF',
    },
    autumn: {
      skyTop: '#7E9DC2', skyHor: '#EFC894', sunDir: [-0.38, 0.4, 0.83], sunCol: '#FFD39A', sunI: 3.0,
      hemiSky: '#AFBBCB', hemiGround: '#7A5E42', amb: 0.8, fog: 0.012, folA: '#B92D17', folB: '#EE9A2A', leafShape: 0, leafScale: 1,
      grassA: '#55682C', grassB: '#8C8A45', grow: 1, flower: '#E06A32', snow: 0, paper: 0.7, lamp: 0.8, glow: 0.9,
      cloud: 0.45, stars: 0, wind: 1.1, particle: 2, exposure: 1.0, tint: '#FFFFFF',
    },
    winter: {
      skyTop: '#6E7E96', skyHor: '#D3DAE2', sunDir: [0.22, 0.62, 0.75], sunCol: '#DCE5F2', sunI: 1.1,
      hemiSky: '#C0CBD8', hemiGround: '#B5BCC4', amb: 1.15, fog: 0.024, folA: '#D9DFE3', folB: '#B4BEC6', leafShape: 0, leafScale: 0,
      grassA: '#8E9A80', grassB: '#C4CBBC', grow: 0.1, flower: '#D8333F', snow: 1, paper: 0.7, lamp: 1.5, glow: 1.5,
      cloud: 0.8, stars: 0, wind: 0.4, particle: 3, exposure: 1.05, tint: '#FFFFFF',
    },
  };

  const DISCRETE = ['particle', 'leafShape'];

  function seasonState(name) {
    const s = SEASONS[name];
    return {
      skyTop: linear(s.skyTop), skyHor: linear(s.skyHor), sunDir: norm(s.sunDir),
      sunCol: scale(linear(s.sunCol), s.sunI), hemiSky: linear(s.hemiSky), hemiGround: linear(s.hemiGround),
      amb: s.amb, fog: s.fog, folA: hex(s.folA), folB: hex(s.folB), leafShape: s.leafShape, leafScale: s.leafScale,
      grassA: hex(s.grassA), grassB: hex(s.grassB), grow: s.grow, flower: hex(s.flower), snow: s.snow,
      paper: s.paper, lamp: s.lamp, glow: s.glow, cloud: s.cloud, stars: s.stars, wind: s.wind, particle: s.particle,
      exposure: s.exposure, tint: hex(s.tint),
    };
  }

  function mixState(a, b, t) {
    const o = {};
    Object.keys(a).forEach((k) => {
      if (DISCRETE.includes(k)) o[k] = t < 0.5 ? a[k] : b[k];
      else if (Array.isArray(a[k])) o[k] = lerp3(a[k], b[k], t);
      else o[k] = lerp(a[k], b[k], t);
    });
    o.sunDir = norm(o.sunDir);
    // Leaves shrink away and come back when the tree changes shape.
    if (a.leafShape !== b.leafShape) o.leafScale *= Math.abs(t - 0.5) * 2;
    return o;
  }

  /* 5. Building. Metres; the room spans x -3..3, z -4..0, and the garden lies toward +z. */

  const C = {
    wood: hex('#A88158'), darkWood: hex('#54402F'), lacquer: hex('#2A1C15'), post: hex('#936F4D'),
    plaster: hex('#D6C8AD'), outerPlaster: hex('#CABEA9'), ceiling: hex('#B59670'), stone: hex('#8A867E'),
    darkStone: hex('#5C5954'), roof: hex('#474C55'), indigo: hex('#2D3A57'), lamp: hex('#FFD9A3'),
    bamboo: hex('#B3A26A'), cedar: hex('#17261A'), bark: hex('#4A3A2E'), white: [1, 1, 1],
  };

  const GROUND = -0.45;

  function buildRoom(g) {
    g.box([-3.15, GROUND, -4.15], [3.15, -0.01, 0.05], C.darkStone, M.stone);
    const mats = [];
    for (let i = 0; i < 3; i += 1) mats.push([-3 + i * 2, -4, -1 + i * 2, -3]);
    for (let i = 0; i < 6; i += 1) mats.push([-3 + i, -3, -2 + i, -1]);
    for (let i = 0; i < 3; i += 1) mats.push([-3 + i * 2, -1, -1 + i * 2, 0]);
    mats.forEach(([x0, z0, x1, z1]) => g.box([x0 + 0.004, 0, z0 + 0.004], [x1 - 0.004, 0.05, z1 - 0.004], C.white, M.tatami, 'nl'));

    g.box([-3.15, 0, -4.15], [-3, 2.7, 0], C.plaster, M.plaster);
    g.box([3, 0, -4.15], [3.15, 2.7, 0], C.plaster, M.plaster);
    g.box([-3.15, 0, -4.15], [3.15, 2.7, -4], C.plaster, M.plaster);
    g.box([-3.15, 2.6, -4.15], [3.15, 2.7, 1.5], C.ceiling, M.wood);
    for (let x = -2.7; x < 3; x += 0.45) g.box([x - 0.015, 2.56, -4], [x + 0.015, 2.6, 0], C.darkWood, M.wood);

    [[-3, -4], [3, -4], [-3, 0], [3, 0]].forEach(([x, z]) => g.box([x - 0.07, 0, z - 0.07], [x + 0.07, 2.6, z + 0.07], C.post, M.wood));
    g.box([-3, 1.9, -4], [3, 1.99, -3.96], C.post, M.wood);
    g.box([-3, 1.9, -4], [-2.96, 1.99, 0], C.post, M.wood);
    g.box([2.96, 1.9, -4], [3, 1.99, 0], C.post, M.wood);
    // Skirting where walls meet tatami.
    g.box([-3, 0.05, -4], [3, 0.09, -3.99], C.darkWood, M.wood);
    g.box([-3, 0.05, -4], [-2.99, 0.09, 0], C.darkWood, M.wood);
    g.box([2.99, 0.05, -4], [3, 0.09, 0], C.darkWood, M.wood);

    g.box([-3, 0, -0.06], [3, 0.055, 0.06], C.wood, M.wood);
    g.box([-3, 2.1, -0.07], [3, 2.18, 0.07], C.post, M.wood);
    g.box([-3, 2.18, -0.03], [3, 2.6, 0.03], C.wood, M.wood);

    g.box([-4.9, 0, -0.1], [-3.0, 2.6, 0.1], C.darkWood, M.wood);
    g.box([3.0, 0, -0.1], [4.9, 2.6, 0.1], C.darkWood, M.wood);
    g.box([-4.9, GROUND, -0.1], [-3.15, 0, 0.1], C.darkStone, M.stone);
    g.box([3.15, GROUND, -0.1], [4.9, 0, 0.1], C.darkStone, M.stone);

    g.box([-3, 0, -4], [-1.1, 0.15, -3.35], C.lacquer, M.wood);
    g.cyl([-1.1, 0, -3.37], [-1.1, 2.1, -3.37], 0.06, 0.055, 12, hex('#8A6646'), M.bark);
    g.box([-3, 1.95, -3.42], [-1.1, 2.05, -3.33], C.post, M.wood);
    g.box([-2.35, 0.75, -3.995], [-1.75, 1.85, -3.975], C.white, M.scroll, 'n');
    g.cyl([-1.55, 0.15, -3.72], [-1.55, 0.42, -3.72], 0.085, 0.06, 16, hex('#3A3D44'), M.stone);
    g.cyl([-1.55, 0.4, -3.72], [-1.68, 0.95, -3.7], 0.012, 0.008, 6, C.darkWood, M.wood, false);
    g.cyl([-1.66, 0.85, -3.7], [-1.35, 1.1, -3.68], 0.01, 0.006, 6, C.darkWood, M.wood, false);
    [[-1.68, 0.97, -3.7], [-1.62, 0.84, -3.68], [-1.38, 1.1, -3.68], [-1.47, 1.02, -3.66], [-1.73, 0.9, -3.72]].forEach((p, i) => {
      g.blob(p, [0.045, 0.04, 0.045], 2, 0.2, 3, [0.5 + i * 0.1, 1, 0], M.foliage, 40 + i);
    });

    g.box([-1, 0, -3.985], [1, 2.1, -3.965], C.white, M.fusuma, 'n');
    g.box([1, 0, -3.985], [3, 2.1, -3.965], C.white, M.fusuma, 'n');

    g.box([-0.75, 0.3, -2.35], [0.75, 0.36, -1.55], C.lacquer, M.wood);
    [[-0.68, -2.28], [0.62, -2.28], [-0.68, -1.68], [0.62, -1.68]].forEach(([x, z]) => g.box([x, 0.05, z], [x + 0.06, 0.3, z + 0.06], C.lacquer, M.wood));
    g.blob([0, 0.09, -2.88], [0.33, 0.045, 0.33], 2, 0.03, 2, C.indigo, M.plain, 2, -0.6);
    g.blob([0, 0.09, -1.02], [0.33, 0.045, 0.33], 2, 0.03, 2, C.indigo, M.plain, 3, -0.6);
    g.cyl([0.18, 0.36, -1.95], [0.18, 0.47, -1.95], 0.07, 0.06, 16, hex('#2E2C2A'), M.stone);
    g.blob([0.18, 0.47, -1.95], [0.06, 0.03, 0.06], 1, 0.0, 1, hex('#2E2C2A'), M.stone, 4);
    g.cyl([-0.2, 0.36, -2.1], [-0.2, 0.42, -2.1], 0.033, 0.04, 14, hex('#CFC8B8'), M.plain);
    g.cyl([-0.05, 0.36, -1.8], [-0.05, 0.42, -1.8], 0.033, 0.04, 14, hex('#CFC8B8'), M.plain);

    const ax = 2.45; const az = -3.45;
    g.box([ax - 0.16, 0.05, az - 0.16], [ax + 0.16, 0.08, az + 0.16], C.lacquer, M.wood);
    g.box([ax - 0.13, 0.08, az - 0.13], [ax + 0.13, 0.8, az + 0.13], C.lamp, M.glow);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      g.box([ax + sx * 0.14 - 0.015, 0.05, az + sz * 0.14 - 0.015], [ax + sx * 0.14 + 0.015, 0.84, az + sz * 0.14 + 0.015], C.lacquer, M.wood);
    });

    for (let i = 0; i < 9; i += 1) {
      const z0 = 0.07 + i * 0.148;
      g.box([-3.3, -0.02, z0], [3.3, 0.05, z0 + 0.144], C.wood, M.wood);
    }
    g.box([-3.3, GROUND, 1.3], [3.3, -0.02, 1.42], C.darkWood, M.wood);
    [-3.2, 3.2].forEach((x) => g.box([x - 0.07, GROUND, 1.3], [x + 0.07, 2.7, 1.44], C.post, M.wood));
    g.box([-3.4, 2.42, 1.3], [3.4, 2.6, 1.44], C.post, M.wood);

    const slab = (a, b, c, d, t) => {
      const n = norm(cross(sub(b, a), sub(d, a)));
      const off = scale(n, -t);
      const [a2, b2, c2, d2] = [a, b, c, d].map((p) => add(p, off));
      g.quad(a, b, c, d, C.roof, M.roof);
      g.quad(a2, d2, c2, b2, C.ceiling, M.wood);
      g.quad(a, a2, b2, b, C.darkWood, M.wood);
      g.quad(d, c, c2, d2, C.darkWood, M.wood);
      g.quad(a, d, d2, a2, C.darkWood, M.wood);
      g.quad(b, b2, c2, c, C.darkWood, M.wood);
    };
    const ridge = -1.3; const top = 4.3; const eave = 2.75; const xw = 5.1;
    slab([-xw, eave, 2.25], [xw, eave, 2.25], [xw, top, ridge], [-xw, top, ridge], 0.14);
    slab([xw, eave, -4.9], [-xw, eave, -4.9], [-xw, top, ridge], [xw, top, ridge], 0.14);
    g.box([-xw - 0.05, top - 0.08, ridge - 0.14], [xw + 0.05, top + 0.12, ridge + 0.14], C.roof, M.roof);
    const roofY = (z) => (z > ridge ? top - (z - ridge) * ((top - eave) / (2.25 - ridge)) : top - (ridge - z) * ((top - eave) / (ridge + 4.9)));
    [-3.15, 3.15].forEach((x) => {
      const pts = [[-4.15, 2.6], [-4.15, roofY(-4.15) - 0.1], [ridge, top - 0.12], [1.45, roofY(1.45) - 0.1], [1.45, 2.6]];
      const centre = [x, 2.6, ridge];
      for (let i = 0; i < pts.length - 1; i += 1) {
        g.tri(centre, [x, pts[i][1], pts[i][0]], [x, pts[i + 1][1], pts[i + 1][0]], C.outerPlaster, M.plaster);
      }
    });
  }

  function shojiPanel() {
    const g = new Geo();
    g.box([-0.76, 0.055, -0.015], [0.76, 2.1, 0.015], C.white, M.shoji, 'n');
    return g;
  }

  /* 6. Garden */

  const ROCKS = [[2.6, 6.8, 0.8], [3.8, 7.5, 0.5], [1.6, 5.8, 0.42]];
  const BATH = [-2.4, -0.3, 9.6];
  const STEPS = [[0, 1.95], [-0.45, 2.9], [-0.9, 3.8], [-1.5, 4.6], [-1.75, 5.6], [-1.95, 6.6], [-1.75, 7.6]];
  const LANTERN = [-2.7, 4.6];
  const SHRUBS = [[-2.6, 2.3, 0.55], [-3.4, 2.7, 0.45], [3.0, 2.4, 0.55], [3.9, 2.2, 0.42], [5.6, 4.6, 0.7], [-5.4, 9.8, 0.8], [0.4, 10.6, 0.6], [6.4, 6.9, 0.6]];
  const PINE = [4.9, 9.7];
  const CONIFERS = [];
  const PADS = [[PINE[0] - 1.0, 1.1, PINE[1] + 0.2, 0.9], [PINE[0] + 0.7, 1.7, PINE[1] - 0.2, 0.75], [PINE[0] + 0.2, 2.35, PINE[1], 0.6], [PINE[0] - 0.6, 1.9, PINE[1] + 0.5, 0.5]];

  // Grows a branching tree; returns points where leaves gather.
  function growTree(g, start, dir, len, radius, depth, random) {
    const tips = [];
    const grow = (p, d, l, r, level) => {
      const bendDir = norm(add(d, [(random() - 0.5) * 0.25, 0, (random() - 0.5) * 0.25]));
      const end = add(p, scale(bendDir, l));
      g.cyl(p, end, r, r * 0.72, level > 3 ? 10 : 6, C.bark, M.bark, false);
      if (level <= 2) tips.push(end, add(p, scale(bendDir, l * 0.5)));
      if (level === 0 || r < 0.01) return;
      const kids = random() < 0.4 ? 3 : 2;
      for (let k = 0; k < kids; k += 1) {
        const a = random() * Math.PI * 2;
        const lift = 0.35 + random() * 0.55;
        const nd = norm(add(scale(bendDir, 0.55), [Math.cos(a) * (1 - lift), lift, Math.sin(a) * (1 - lift)]));
        grow(end, nd, l * (0.66 + random() * 0.14), r * 0.64, level - 1);
      }
    };
    grow(start, dir, len, radius, depth);
    return tips;
  }

  function buildGarden(g) {
    g.quad([-90, GROUND, -40], [90, GROUND, -40], [90, GROUND, 140], [-90, GROUND, 140], C.white, M.ground);

    ROCKS.forEach(([x, z, r], i) => {
      g.blob([x, GROUND + r * 0.28, z], [r, r * 0.78, r * 0.86], 4, 0.32, 1.4, C.stone, M.stone, 10 + i, -0.45);
    });

    g.blob([STEPS[0][0], -0.24, STEPS[0][1]], [0.55, 0.22, 0.38], 3, 0.12, 1.6, C.stone, M.stone, 3, -0.6);
    STEPS.slice(1).forEach(([x, z], i) => {
      g.blob([x, GROUND + 0.02, z], [0.34, 0.09, 0.3], 3, 0.16, 1.5, hex('#99948A'), M.stone, 20 + i, -0.4);
    });

    const [lx, lz] = LANTERN;
    g.cyl([lx, GROUND, lz], [lx, GROUND + 0.12, lz], 0.3, 0.28, 6, C.stone, M.stone);
    g.cyl([lx, GROUND + 0.12, lz], [lx, GROUND + 0.7, lz], 0.09, 0.08, 16, C.stone, M.stone);
    g.box([lx - 0.2, GROUND + 0.7, lz - 0.2], [lx + 0.2, GROUND + 0.76, lz + 0.2], C.stone, M.stone);
    g.box([lx - 0.15, GROUND + 0.76, lz - 0.15], [lx + 0.15, GROUND + 1.02, lz + 0.15], C.stone, M.stone);
    g.box([lx - 0.09, GROUND + 0.8, lz + 0.151], [lx + 0.09, GROUND + 0.98, lz + 0.16], C.lamp, M.glow);
    g.box([lx - 0.09, GROUND + 0.8, lz - 0.16], [lx + 0.09, GROUND + 0.98, lz - 0.151], C.lamp, M.glow);
    g.cyl([lx, GROUND + 1.02, lz], [lx, GROUND + 1.32, lz], 0.36, 0.0, 6, C.stone, M.stone);
    g.blob([lx, GROUND + 1.36, lz], [0.06, 0.07, 0.06], 2, 0.05, 2, C.stone, M.stone, 9);

    // Pine: trunk and limbs; its needle pads are instanced, with a dark core.
    const [px, pz] = PINE;
    g.cyl([px, GROUND, pz], [px - 0.3, 1.2, pz + 0.1], 0.16, 0.12, 12, C.bark, M.bark);
    g.cyl([px - 0.3, 1.2, pz + 0.1], [px + 0.25, 2.2, pz - 0.1], 0.12, 0.07, 12, C.bark, M.bark);
    PADS.forEach(([x, y, z, s], i) => {
      g.cyl([px - 0.1, y - 0.2, pz], [x, y - 0.05, z], 0.05, 0.03, 6, C.bark, M.bark, false);
      g.blob([x, y, z], [s * 0.85, s * 0.22, s * 0.7], 2, 0.15, 2, hex('#1E3019'), M.evergreen, 200 + i);
    });
    SHRUBS.forEach(([x, z, s], i) => {
      g.blob([x, GROUND + s * 0.4, z], [s * 0.9, s * 0.55, s * 0.9], 2, 0.15, 2, hex('#1F3418'), M.evergreen, 300 + i, -0.5);
    });

    // Bath: smooth rocks around warm water.
    const [bx, , bz] = BATH;
    for (let i = 0; i < 18; i += 1) {
      const a = (i / 18) * Math.PI * 2;
      const s = 0.3 + ((i * 37) % 7) * 0.025;
      g.blob([bx + Math.cos(a) * 1.55, GROUND + 0.1, bz + Math.sin(a) * 1.15], [s, s * 0.72, s], 3, 0.25, 1.6, hex('#6B675F'), M.stone, 400 + i, -0.4);
    }
    const wy = GROUND + 0.13;
    for (let i = 0; i < 32; i += 1) {
      const a0 = (i / 32) * Math.PI * 2;
      const a1 = ((i + 1) / 32) * Math.PI * 2;
      g.tri([bx, wy, bz], [bx + Math.cos(a1) * 1.5, wy, bz + Math.sin(a1) * 1.1], [bx + Math.cos(a0) * 1.5, wy, bz + Math.sin(a0) * 1.1], C.white, M.water);
    }
    g.cyl([bx - 1.4, GROUND + 0.4, bz - 0.9], [bx - 0.9, GROUND + 0.55, bz - 0.6], 0.05, 0.05, 10, C.bamboo, M.bamboo);

    for (let x = -9; x <= 9; x += 0.09) g.cyl([x, GROUND, 12.6], [x, 1.15, 12.6], 0.035, 0.035, 8, C.bamboo, M.bamboo, false);
    [0.0, 0.7].forEach((y) => g.box([-9, y, 12.52], [9, y + 0.05, 12.56], C.darkWood, M.wood));

    // Cedar woods: stacked tiers read as conifers at a distance.
    const cedar = rng(5);
    const conifer = (x, z, h) => {
      const r = h * 0.17;
      g.cyl([x, GROUND, z], [x, GROUND + h * 0.3, z], r * 0.12, r * 0.1, 6, C.bark, M.bark, false);
      for (let k = 0; k < 4; k += 1) {
        const y0 = GROUND + h * (0.18 + k * 0.19);
        const tier = [x, y0, z, h * 0.42, r * (1 - k * 0.2)];
        g.cyl([x, y0, z], [x, y0 + tier[3], z], tier[4] * 0.85, 0, 10, C.cedar, M.evergreen, false);
        CONIFERS.push(tier);
      }
    };
    for (let i = 0; i < 46; i += 1) conifer(-30 + cedar() * 60, 16 + cedar() * 22, 5 + cedar() * 4);
    for (let i = 0; i < 40; i += 1) conifer(-30 + cedar() * 60, -9 - cedar() * 20, 5.5 + cedar() * 4);
    for (let i = 0; i < 26; i += 1) {
      const x = -30 + cedar() * 60;
      const z = 17 + cedar() * 16;
      const s = 0.9 + cedar() * 1.0;
      g.blob([x, GROUND + s * 0.7, z], [s * 1.2, s, s * 1.1], 2, 0.25, 1.5, hex('#2A3F28'), M.evergreen, 500 + i);
    }

    const hill = rng(9);
    [[48, '#56696F', 9], [72, '#76878F', 16], [105, '#95A3AE', 26], [-40, '#5D7076', 10], [-70, '#7F909A', 18]].forEach(([z, color, height], layer) => {
      const col = hex(color);
      const peaks = Array.from({ length: 6 }, () => [hill() * 2 - 1, hill()]);
      const heightAt = (x) => {
        let h = 0;
        peaks.forEach(([px2, amp], k) => { h += Math.exp(-(((x / 140) - px2) ** 2) * (18 + k * 6)) * (0.4 + amp); });
        return GROUND + height * (0.35 + h * 0.7) + Math.sin(x * 0.08 + layer) * 1.2 + (fbm3(x * 0.05, layer, 0) - 0.5) * 3;
      };
      for (let x = -160; x < 160; x += 2.5) {
        const a = [x, heightAt(x), z]; const b = [x + 2.5, heightAt(x + 2.5), z];
        const back = z > 0 ? z - 14 : z + 14;
        g.quad([x, GROUND - 1, back], [x + 2.5, GROUND - 1, back], b, a, col, M.far);
      }
    });

    return growTree(g, [-3.8, GROUND, 7.2], norm([0.08, 1, 0.03]), 1.35, 0.17, 6, rng(77));
  }

  /* 7. Instances */

  function insideGravel(x, z, margin = 0) {
    return Math.hypot((x - 2.4) / (3.3 + margin), (z - 6.5) / (2.5 + margin)) < 1;
  }

  function grassInstances(count, random) {
    const data = [];
    let tries = 0;
    while (data.length / 7 < count && tries < count * 6) {
      tries += 1;
      const x = -9 + random() * 18;
      const z = 1.55 + random() * 10.9;
      if (insideGravel(x, z, 0.05)) continue;
      if (Math.hypot((x - BATH[0]) / 1.85, (z - BATH[2]) / 1.45) < 1) continue;
      if (STEPS.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < 0.33)) continue;
      if (ROCKS.some(([rx, rz, r]) => Math.hypot(x - rx, z - rz) < r * 0.9)) continue;
      if (Math.hypot(x - LANTERN[0], z - LANTERN[1]) < 0.3) continue;
      // Clumps: taller where a slow noise is high.
      const clump = vnoise(x * 0.8, 0, z * 0.8);
      const h = 0.03 + random() * 0.045 + clump * 0.055;
      data.push(x, GROUND, z, h, random() * Math.PI * 2, (random() - 0.3) * 0.5, random());
    }
    return new Float32Array(data);
  }

  function leafInstances(points, count, spread, size, random, upward = 0) {
    const data = [];
    for (let i = 0; i < count; i += 1) {
      const c = points[Math.floor(random() * points.length)];
      const u = random() * 2 - 1; const a = random() * Math.PI * 2;
      const r = Math.cbrt(random()) * spread;
      const s = Math.sqrt(1 - u * u);
      data.push(c[0] + s * Math.cos(a) * r, c[1] + Math.abs(u) * r * 0.6 + upward, c[2] + s * Math.sin(a) * r,
        size * (0.7 + random() * 0.6), random() * Math.PI * 2, (random() - 0.5) * 2.4, random());
    }
    return new Float32Array(data);
  }

  // Leaves spread over the surface of squashed spheres (pine pads, round shrubs).
  function shellInstances(shells, count, size, random, pitch) {
    const data = [];
    const total = shells.reduce((s, sh) => s + sh[3] * sh[3], 0);
    shells.forEach(([x, y, z, rad, sy, sxz]) => {
      const n = Math.round((count * rad * rad) / total);
      for (let i = 0; i < n; i += 1) {
        const u = random() * 1.6 - 0.6; const a = random() * Math.PI * 2;
        const s = Math.sqrt(Math.max(0, 1 - u * u));
        const k = 0.92 + random() * 0.16;
        data.push(x + s * Math.cos(a) * rad * sxz * k, y + u * rad * sy * k, z + s * Math.sin(a) * rad * sxz * k,
          size * (0.7 + random() * 0.6), random() * Math.PI * 2, pitch + (random() - 0.5) * 1.2, random());
      }
    });
    return new Float32Array(data);
  }

  // Needle cards over the surface of each conifer tier.
  function coniferInstances(perTier, random) {
    const data = [];
    CONIFERS.forEach(([x, y0, z, h, r]) => {
      for (let i = 0; i < perTier; i += 1) {
        const t = Math.pow(random(), 0.8);
        const a = random() * Math.PI * 2;
        const rad = r * (1 - t) * (0.85 + random() * 0.25);
        data.push(x + Math.cos(a) * rad, y0 + t * h, z + Math.sin(a) * rad,
          0.4 + random() * 0.35, random() * Math.PI * 2, 0.6 + random() * 0.9, random());
      }
    });
    return new Float32Array(data);
  }

  /* Camera beats: the camera rests at each key while its line of text shows. */

  const KEYS = [
    { t: 0.0, pos: [0.55, 1.4, -3.8], at: [0.05, 1.2, 0] },
    { t: 0.2, pos: [0.15, 0.95, -2.6], at: [0, 0.95, 3] },
    { t: 0.4, pos: [0.5, 1.1, 0.55], at: [-0.2, 0.3, 6] },
    { t: 0.6, pos: [4.6, 2.3, 3.2], at: [1.2, -0.2, 7.2] },
    { t: 0.8, pos: [0.9, 2.0, 5.4], at: [-2.4, -0.4, 9.7] },
    { t: 1.0, pos: [0.7, 1.45, 11.2], at: [-0.3, 1.05, -1.5] },
  ];

  const VIEWS = {
    koke: { pos: [2.5, 1.25, -0.5], at: [-1.6, 0.75, -3.7] },
    akari: { pos: [-2.5, 1.05, -1.2], at: [2.2, 0.2, 4.5] },
    kiri: { pos: [0.7, 0.95, 7.0], at: [-2.6, -0.15, 9.9] },
  };

  function cameraAt(p) {
    p = clamp(p);
    let i = 0;
    while (i < KEYS.length - 2 && p > KEYS[i + 1].t) i += 1;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const t = ease(clamp((p - a.t) / (b.t - a.t)));
    return { pos: lerp3(a.pos, b.pos, t), at: lerp3(a.at, b.at, t) };
  }

  /* 8. Programs */

  function compile(gl, vs, fs) {
    const make = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, make(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const cache = {};
    p.u = (name) => {
      if (!(name in cache)) cache[name] = gl.getUniformLocation(p, name);
      return cache[name];
    };
    return p;
  }

  function upload(gl, geo) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    [[geo.p, 3], [geo.n, 3], [geo.c, 3], [geo.u, 2], [geo.m, 1]].forEach(([data, size], i) => {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, size, gl.FLOAT, false, 0, 0);
    });
    gl.bindVertexArray(null);
    return { vao, count: geo.p.length / 3 };
  }

  // One VAO per instanced group: a shared local shape plus per-instance data (7 floats).
  function uploadInstances(gl, local, data) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const lb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, lb);
    gl.bufferData(gl.ARRAY_BUFFER, local, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, ib);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 28, 12);
    gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);
    return { vao, verts: local.length / 2, count: data.length / 7 };
  }

  const BLADE = new Float32Array([
    -1, 0, 1, 0, 1, 0.34, -1, 0, 1, 0.34, -1, 0.34,
    -1, 0.34, 1, 0.34, 1, 0.68, -1, 0.34, 1, 0.68, -1, 0.68,
    -1, 0.68, 1, 0.68, 0, 1,
  ]);
  const CARD = new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]);

  /* 9-11. Render targets, frame and controller */

  function create(canvas, { mobile = false, reduce = false } = {}) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
    if (!gl) return null;

    const hdr = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    const DEFS = hdr ? '#define HDR 1' : '';

    let P;
    try {
      P = {
        main: compile(gl, MAIN_VS, MAIN_FS(DEFS)),
        inst: compile(gl, INST_VS, INST_FS(DEFS)),
        depth: compile(gl, DEPTH_VS, DEPTH_FS),
        instDepth: compile(gl, INST_VS, INST_DEPTH_FS),
        sky: compile(gl, SKY_VS, SKY_FS(DEFS)),
        parts: compile(gl, PART_VS, PART_FS(DEFS)),
      };
      if (hdr) {
        P.ao = compile(gl, QUAD_VS, AO_FS);
        P.bright = compile(gl, QUAD_VS, BRIGHT_FS);
        P.blur = compile(gl, QUAD_VS, BLUR_FS);
        P.composite = compile(gl, QUAD_VS, COMPOSITE_FS);
      }
    } catch (error) {
      console.warn('Scene shaders failed:', error);
      return null;
    }

    const world = new Geo();
    buildRoom(world);
    const treeTips = buildGarden(world);
    const statics = upload(gl, world);
    const panel = upload(gl, shojiPanel());
    const emptyVao = gl.createVertexArray();

    const q = mobile ? 0.35 : 1;
    const ir = rng(123);
    const groups = {
      grass: uploadInstances(gl, BLADE, grassInstances(Math.round(90000 * q), ir)),
      tree: uploadInstances(gl, CARD, leafInstances(treeTips, Math.round(14000 * q), 0.42, 0.1, ir)),
      pine: uploadInstances(gl, CARD, shellInstances(PADS.map(([x, y, z, s]) => [x, y, z, s, 0.26, 0.88]), Math.round(6000 * q), 0.16, ir, 1.3)),
      forest: uploadInstances(gl, CARD, coniferInstances(mobile ? 22 : 55, ir)),
      shrub: uploadInstances(gl, CARD, shellInstances(SHRUBS.map(([x, z, s]) => [x, GROUND + s * 0.42, z, s, 0.62, 0.96]), Math.round(9000 * q), 0.075, ir, 0.4)),
    };

    const SHOJI = [[-2.25, -4.0, -0.035, 0.15], [-0.75, -4.0, 0.035, 0], [0.75, 4.0, 0.035, 0], [2.25, 4.0, -0.035, 0.15]];

    const count = mobile ? 260 : 600;
    const seeds = new Float32Array(count * 4);
    const pr = rng(31);
    for (let i = 0; i < seeds.length; i += 1) seeds[i] = pr();
    const partVao = gl.createVertexArray();
    gl.bindVertexArray(partVao);
    const seedBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
    gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // Shadow map.
    const SM = mobile ? 1536 : 3072;
    const depthTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, depthTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SM, SM);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    const shadowFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // HDR targets: a multisampled scene buffer resolved into textures for the post pass.
    const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) || 0);
    const T = { w: 0, h: 0 };
    function tex(w, h, internal, format, type, filter = gl.LINEAR) {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    function fboFor(color, depth) {
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      if (color) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
      if (depth) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
      return f;
    }
    function buildTargets(w, h) {
      if (!hdr || (T.w === w && T.h === h)) return;
      ['msFbo', 'resolveFbo', 'aoFbo', 'bAFbo', 'bBFbo'].forEach((k) => T[k] && gl.deleteFramebuffer(T[k]));
      ['colorRb', 'depthRb'].forEach((k) => T[k] && gl.deleteRenderbuffer(T[k]));
      ['color', 'depth', 'ao', 'bA', 'bB'].forEach((k) => T[k] && gl.deleteTexture(T[k]));
      T.w = w; T.h = h;
      T.colorRb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, T.colorRb);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA16F, w, h);
      T.depthRb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, T.depthRb);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
      T.msFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.msFbo);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, T.colorRb);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, T.depthRb);
      T.color = tex(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
      T.depth = tex(w, h, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, gl.NEAREST);
      T.resolveFbo = fboFor(T.color, T.depth);
      T.aw = Math.max(1, Math.round(w / (mobile ? 2 : 1)));
      T.ah = Math.max(1, Math.round(h / (mobile ? 2 : 1)));
      T.ao = tex(T.aw, T.ah, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
      T.aoFbo = fboFor(T.ao);
      T.bw = Math.max(1, w >> 2); T.bh = Math.max(1, h >> 2);
      T.bA = tex(T.bw, T.bh, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
      T.bB = tex(T.bw, T.bh, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
      T.bAFbo = fboFor(T.bA);
      T.bBFbo = fboFor(T.bB);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    const kr = rng(55);
    const kernel = [];
    for (let i = 0; i < 12; i += 1) {
      const v = norm([kr() * 2 - 1, kr() * 2 - 1, kr() * 0.9 + 0.1]);
      const s = lerp(0.15, 1, ((i + 1) / 12) ** 2);
      kernel.push(...scale(v, s * (0.5 + kr() * 0.5)));
    }

    const state = {
      progress: 0, shown: 0, active: true, from: null, to: null, mixT: 1, season: null,
      prevParticle: 0, width: 1, height: 1, start: performance.now(), raf: 0,
    };

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (w !== canvas.width || h !== canvas.height) {
        canvas.width = w;
        canvas.height = h;
      }
      state.width = w;
      state.height = h;
    }

    function currentSeason() {
      return state.mixT >= 1 ? state.to : mixState(state.from, state.to, ease(state.mixT));
    }

    function setLight(prog, s, cam, lightVP, open) {
      gl.uniformMatrix4fv(prog.u('uLightVP'), false, lightVP);
      gl.uniform3fv(prog.u('uCam'), cam.pos);
      gl.uniform3fv(prog.u('uSunDir'), s.sunDir);
      gl.uniform3fv(prog.u('uSunCol'), s.sunCol);
      gl.uniform3fv(prog.u('uSkyCol'), s.hemiSky);
      gl.uniform3fv(prog.u('uGroundCol'), s.hemiGround);
      gl.uniform3fv(prog.u('uFogCol'), s.skyHor);
      gl.uniform3fv(prog.u('uLampPos'), [2.45, 0.5, -3.45]);
      gl.uniform3fv(prog.u('uLampCol'), scale(linear('#FFC98A'), s.lamp));
      gl.uniform1f(prog.u('uFogDen'), s.fog);
      gl.uniform1f(prog.u('uAmb'), s.amb);
      gl.uniform1f(prog.u('uOpen'), open);
      gl.uniform1f(prog.u('uSnow'), s.snow);
      gl.uniform1f(prog.u('uTexel'), 1 / SM);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, depthTex);
      gl.uniform1i(prog.u('uShadow'), 0);
    }

    function drawInstances(prog, s, depthOnly) {
      const list = [
        ['grass', 0, 0, s.grassA, s.grassB, 1, s.grow, 1],
        ['tree', 1, s.leafShape, s.folA, s.folB, s.leafScale, 1, 0],
        ['pine', 1, 2, hex('#2C4A26'), hex('#4E6E3A'), 1, 1, 1],
        ['shrub', 1, 3, hex('#2E5226'), hex('#557A36'), 1, 1, 1],
        ['forest', 1, 3, hex('#13221A'), hex('#283F27'), 1, 1, 1],
      ];
      list.forEach(([key, kind, shape, a, b, sc, grow, snowOn]) => {
        if (depthOnly && (key === 'grass' || key === 'forest')) return;
        if (sc <= 0.01) return;
        const grp = groups[key];
        gl.uniform1i(prog.u('uKind'), kind);
        gl.uniform1i(prog.u('uShape'), shape);
        gl.uniform1f(prog.u('uScale'), sc);
        gl.uniform1f(prog.u('uGrow'), grow);
        if (!depthOnly) {
          gl.uniform3fv(prog.u('uColA'), a);
          gl.uniform3fv(prog.u('uColB'), b);
          gl.uniform1f(prog.u('uSnowOn'), snowOn);
        }
        gl.bindVertexArray(grp.vao);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, grp.verts, grp.count);
      });
    }

    function quad() {
      gl.bindVertexArray(emptyVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function draw(cam, open, time) {
      const s = currentSeason();
      const aspect = state.width / state.height;
      const fov = (aspect < 1 ? 64 : 48) * (Math.PI / 180);
      const proj = perspective(fov, aspect, 0.05, 300);
      const view = lookAt(cam.pos, cam.at);
      const viewProj = multiply(proj, view);
      const wind = reduce ? 0.15 : s.wind;

      const centre = [0, 0.5, 4.5];
      const lightView = lookAt(add(centre, scale(s.sunDir, 35)), centre);
      const lightVP = multiply(ortho(-11, 11, -11, 11, 1, 80), lightView);

      const panelModels = SHOJI.map(([x0, x1, z, delay]) => {
        const t = ease(clamp((open - delay) / (1 - delay)));
        return translation(lerp(x0, x1, t), 0, z);
      });

      // Shadow pass.
      gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
      gl.viewport(0, 0, SM, SM);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(2, 4);
      gl.useProgram(P.depth);
      gl.uniformMatrix4fv(P.depth.u('uLightVP'), false, lightVP);
      gl.uniformMatrix4fv(P.depth.u('uModel'), false, IDENTITY);
      gl.bindVertexArray(statics.vao);
      gl.drawArrays(gl.TRIANGLES, 0, statics.count);
      gl.bindVertexArray(panel.vao);
      panelModels.forEach((m) => {
        gl.uniformMatrix4fv(P.depth.u('uModel'), false, m);
        gl.drawArrays(gl.TRIANGLES, 0, panel.count);
      });
      gl.useProgram(P.instDepth);
      gl.uniformMatrix4fv(P.instDepth.u('uViewProj'), false, lightVP);
      gl.uniformMatrix4fv(P.instDepth.u('uLightVP'), false, lightVP);
      gl.uniform1f(P.instDepth.u('uTime'), time);
      gl.uniform1f(P.instDepth.u('uWind'), wind);
      drawInstances(P.instDepth, s, true);
      gl.disable(gl.POLYGON_OFFSET_FILL);

      // Scene pass, into the multisampled HDR buffer when there is one.
      buildTargets(state.width, state.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, hdr ? T.msFbo : null);
      gl.viewport(0, 0, state.width, state.height);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.useProgram(P.sky);
      gl.uniformMatrix4fv(P.sky.u('uInvVP'), false, invert(viewProj));
      gl.uniform3fv(P.sky.u('uCam'), cam.pos);
      gl.uniform3fv(P.sky.u('uSkyTop'), s.skyTop);
      gl.uniform3fv(P.sky.u('uSkyHor'), s.skyHor);
      gl.uniform3fv(P.sky.u('uSunDir'), s.sunDir);
      gl.uniform3fv(P.sky.u('uSunCol'), s.sunCol);
      gl.uniform1f(P.sky.u('uTime'), time);
      gl.uniform1f(P.sky.u('uCloud'), s.cloud);
      gl.uniform1f(P.sky.u('uStars'), s.stars);
      quad();

      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(P.main);
      gl.uniformMatrix4fv(P.main.u('uViewProj'), false, viewProj);
      gl.uniformMatrix4fv(P.main.u('uModel'), false, IDENTITY);
      setLight(P.main, s, cam, lightVP, open);
      gl.uniform3fv(P.main.u('uFlower'), s.flower);
      gl.uniform3fv(P.main.u('uRocks'), ROCKS.flat());
      gl.uniform1f(P.main.u('uTime'), time);
      gl.uniform1f(P.main.u('uPaper'), s.paper);
      gl.uniform1f(P.main.u('uGlow'), s.glow);
      gl.bindVertexArray(statics.vao);
      gl.drawArrays(gl.TRIANGLES, 0, statics.count);
      gl.bindVertexArray(panel.vao);
      panelModels.forEach((m) => {
        gl.uniformMatrix4fv(P.main.u('uModel'), false, m);
        gl.drawArrays(gl.TRIANGLES, 0, panel.count);
      });

      gl.disable(gl.CULL_FACE);
      gl.useProgram(P.inst);
      gl.uniformMatrix4fv(P.inst.u('uViewProj'), false, viewProj);
      setLight(P.inst, s, cam, lightVP, open);
      gl.uniform1f(P.inst.u('uTime'), time);
      gl.uniform1f(P.inst.u('uWind'), wind);
      drawInstances(P.inst, s, false);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.useProgram(P.parts);
      gl.uniformMatrix4fv(P.parts.u('uViewProj'), false, viewProj);
      gl.uniform1f(P.parts.u('uTime'), time);
      gl.uniform1f(P.parts.u('uPx'), proj[5] * state.height * 0.5);
      gl.uniform1f(P.parts.u('uMotion'), reduce ? 0.15 : 1);
      gl.uniform3fv(P.parts.u('uBath'), BATH);
      gl.uniform3fv(P.parts.u('uTint'), scale(add(s.hemiSky, scale(s.sunCol, 0.25)), 1.1));
      gl.bindVertexArray(partVao);
      const layers = [[s.particle, state.mixT >= 1 ? 1 : ease(state.mixT), count]];
      if (state.mixT < 1) layers.push([state.prevParticle, 1 - ease(state.mixT), count]);
      layers.push([4, 1, mobile ? 40 : 70]);
      layers.forEach(([type, alpha, n]) => {
        if (alpha <= 0.01) return;
        gl.uniform1i(P.parts.u('uType'), type);
        gl.uniform1f(P.parts.u('uAlpha'), alpha);
        gl.drawArrays(gl.POINTS, 0, n);
      });
      gl.disable(gl.BLEND);
      gl.depthMask(true);
      if (!hdr) { gl.bindVertexArray(null); return; }

      // Resolve, then SSAO, bloom and composite onto the canvas.
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, T.msFbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, T.resolveFbo);
      gl.blitFramebuffer(0, 0, T.w, T.h, 0, 0, T.w, T.h, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.disable(gl.DEPTH_TEST);

      gl.bindFramebuffer(gl.FRAMEBUFFER, T.aoFbo);
      gl.viewport(0, 0, T.aw, T.ah);
      gl.useProgram(P.ao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, T.depth);
      gl.uniform1i(P.ao.u('uDepth'), 0);
      gl.uniformMatrix4fv(P.ao.u('uProj'), false, proj);
      gl.uniformMatrix4fv(P.ao.u('uInvProj'), false, invert(proj));
      gl.uniform3fv(P.ao.u('uKernel'), kernel);
      quad();

      gl.bindFramebuffer(gl.FRAMEBUFFER, T.bAFbo);
      gl.viewport(0, 0, T.bw, T.bh);
      gl.useProgram(P.bright);
      gl.bindTexture(gl.TEXTURE_2D, T.color);
      gl.uniform1i(P.bright.u('uSrc'), 0);
      gl.uniform2f(P.bright.u('uTexel'), 1 / T.w, 1 / T.h);
      quad();
      gl.useProgram(P.blur);
      gl.uniform1i(P.blur.u('uSrc'), 0);
      for (let i = 0; i < 2; i += 1) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, T.bBFbo);
        gl.bindTexture(gl.TEXTURE_2D, T.bA);
        gl.uniform2f(P.blur.u('uDir'), 1.5 / T.bw, 0);
        quad();
        gl.bindFramebuffer(gl.FRAMEBUFFER, T.bAFbo);
        gl.bindTexture(gl.TEXTURE_2D, T.bB);
        gl.uniform2f(P.blur.u('uDir'), 0, 1.5 / T.bh);
        quad();
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, state.width, state.height);
      gl.useProgram(P.composite);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, T.color);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, T.ao);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, T.bA);
      gl.uniform1i(P.composite.u('uColor'), 0);
      gl.uniform1i(P.composite.u('uAo'), 1);
      gl.uniform1i(P.composite.u('uBloom'), 2);
      gl.uniform2f(P.composite.u('uTexel'), 1 / T.aw, 1 / T.ah);
      gl.uniform1f(P.composite.u('uAoOn'), 1);
      gl.uniform1f(P.composite.u('uTime'), time);
      gl.uniform1f(P.composite.u('uExposure'), s.exposure);
      quad();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindVertexArray(null);
    }

    function openAt(p) {
      return ease(clamp((p - 0.06) / 0.22));
    }

    let last = performance.now();
    function frame(now) {
      state.raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (state.mixT < 1) state.mixT = Math.min(1, state.mixT + dt / 1.6);
      if (!state.active) return;
      state.shown += (state.progress - state.shown) * (1 - Math.exp(-dt * 7));
      resize();
      draw(cameraAt(state.shown), openAt(state.shown), (now - state.start) / 1000);
    }

    const api = {
      setProgress(p) { state.progress = clamp(p); },
      setActive(on) { state.active = on; },
      setSeason(name, instant = false) {
        if (!SEASONS[name] || name === state.season) return;
        const next = seasonState(name);
        if (instant || !state.to) {
          state.from = next; state.to = next; state.mixT = 1; state.prevParticle = next.particle;
        } else {
          state.from = currentSeason();
          state.prevParticle = state.to.particle;
          state.to = next;
          state.mixT = 0;
        }
        state.season = name;
      },
      // Draws a fixed view at the photo's own size, then copies it into the photo's canvas.
      snapshot(viewName, target) {
        const v = VIEWS[viewName];
        if (!v) return;
        const tw = target.width; const th = target.height;
        canvas.width = tw;
        canvas.height = th;
        state.width = tw;
        state.height = th;
        const saved = state.mixT;
        state.mixT = 1;
        draw(v, 1, 8);
        state.mixT = saved;
        target.getContext('2d').drawImage(canvas, 0, 0);
        resize();
        if (state.active) draw(cameraAt(state.shown), openAt(state.shown), (performance.now() - state.start) / 1000);
      },
      start() { if (!state.raf) state.raf = requestAnimationFrame(frame); },
    };

    resize();
    return api;
  }

  window.RyokanScene = { create };
})();
