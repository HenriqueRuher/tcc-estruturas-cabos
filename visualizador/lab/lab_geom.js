// Primitivas de geometria para os modelos 3D do laboratório (camada WebGL do Experimento).
// Sem dependências. Unidades em mm, Z para cima (como no Qualisys).
//
// Formato de malha: { pos: number[], nor: number[], idx: number[] } (triângulos, CCW visto de fora).
// Formato de modelo: { partes: [{ nome, material, pos: Float32Array, nor: Float32Array, idx: Uint32Array }] }
// material = { cor: [r,g,b] (0..1, sRGB), metal: 0..1, rug: 0..1, emissivo?: [r,g,b] }
(() => {
'use strict';
const G = {};

G.vazia = () => ({ pos: [], nor: [], idx: [] });

// acrescenta a malha b em a (a é alterada e devolvida)
G.juntar = (a, ...bs) => {
  for (const b of bs) {
    const base = a.pos.length / 3;
    for (const v of b.pos) a.pos.push(v);
    for (const v of b.nor) a.nor.push(v);
    for (const i of b.idx) a.idx.push(i + base);
  }
  return a;
};

// ---------------------------------------------------------------- matrizes 4x4 (coluna-maior, como o WebGL)
G.mat = {
  id: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  mul: (a, b) => { // a·b
    const r = new Array(16);
    for (let c = 0; c < 4; c++) for (let l = 0; l < 4; l++) {
      let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + l] * b[c * 4 + k]; r[c * 4 + l] = s;
    }
    return r;
  },
  trans: (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1],
  esc: (x, y = x, z = x) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1],
  rotX: (t) => { const c = Math.cos(t), s = Math.sin(t); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; },
  rotY: (t) => { const c = Math.cos(t), s = Math.sin(t); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; },
  rotZ: (t) => { const c = Math.cos(t), s = Math.sin(t); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; },
  // compõe da esquerda para a direita como aplicação: G.mat.cadeia(A, B, C) = A·B·C (C aplicada primeiro)
  cadeia: (...ms) => ms.reduce((a, b) => G.mat.mul(a, b), G.mat.id()),
  // base que leva o eixo +Z local para a direção d (para cilindros/tubos entre dois pontos)
  alinharZ: (d) => {
    const n = Math.hypot(d[0], d[1], d[2]) || 1, z = [d[0] / n, d[1] / n, d[2] / n];
    const a = Math.abs(z[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    let x = [a[1] * z[2] - a[2] * z[1], a[2] * z[0] - a[0] * z[2], a[0] * z[1] - a[1] * z[0]];
    const nx = Math.hypot(...x); x = x.map((v) => v / nx);
    const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    return [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, 0, 0, 0, 1];
  },
};

// aplica a matriz m na malha (cópia nova); normais pela inversa-transposta
G.transformar = (g, m) => {
  const r = { pos: new Array(g.pos.length), nor: new Array(g.nor.length), idx: g.idx.slice() };
  // inversa-transposta do bloco 3x3
  const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], h = m[2], i = m[6], j = m[10];
  const det = a * (e * j - f * i) - b * (d * j - f * h) + c * (d * i - e * h) || 1;
  const it = [(e * j - f * i) / det, -(b * j - c * i) / det, (b * f - c * e) / det,
    -(d * j - f * h) / det, (a * j - c * h) / det, -(a * f - c * d) / det,
    (d * i - e * h) / det, -(a * i - b * h) / det, (a * e - b * d) / det]; // inversa (linhas)
  for (let k = 0; k < g.pos.length; k += 3) {
    const x = g.pos[k], y = g.pos[k + 1], z = g.pos[k + 2];
    r.pos[k] = m[0] * x + m[4] * y + m[8] * z + m[12];
    r.pos[k + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    r.pos[k + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    const nx = g.nor[k], ny = g.nor[k + 1], nz = g.nor[k + 2];
    // n' = (M^-1)^T n  -> usa colunas da inversa
    let ux = it[0] * nx + it[3] * ny + it[6] * nz, uy = it[1] * nx + it[4] * ny + it[7] * nz, uz = it[2] * nx + it[5] * ny + it[8] * nz;
    const nn = Math.hypot(ux, uy, uz) || 1;
    r.nor[k] = ux / nn; r.nor[k + 1] = uy / nn; r.nor[k + 2] = uz / nn;
  }
  if (det < 0) for (let k = 0; k < r.idx.length; k += 3) { const t = r.idx[k + 1]; r.idx[k + 1] = r.idx[k + 2]; r.idx[k + 2] = t; }
  return r;
};

// ---------------------------------------------------------------- primitivas
// caixa centrada na origem, lados sx, sy, sz (faces com normais planas)
G.caixa = (sx, sy, sz) => {
  const g = G.vazia(), x = sx / 2, y = sy / 2, z = sz / 2;
  const F = [ // normal, 4 vértices CCW
    [[1, 0, 0], [[x, -y, -z], [x, y, -z], [x, y, z], [x, -y, z]]],
    [[-1, 0, 0], [[-x, y, -z], [-x, -y, -z], [-x, -y, z], [-x, y, z]]],
    [[0, 1, 0], [[x, y, -z], [-x, y, -z], [-x, y, z], [x, y, z]]],
    [[0, -1, 0], [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]]],
    [[0, 0, 1], [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]]],
    [[0, 0, -1], [[-x, y, -z], [x, y, -z], [x, -y, -z], [-x, -y, -z]]],
  ];
  for (const [n, vs] of F) {
    const b = g.pos.length / 3;
    for (const v of vs) { g.pos.push(...v); g.nor.push(...n); }
    g.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  return g;
};

// sólido de revolução em torno de Z: perfil = [[r, z], ...] de baixo para cima.
// Normais suaves ao longo do perfil, exceto onde 'quinas' (padrão: ângulo > 35°) — aí duplica os vértices.
G.revolucao = (perfil, seg = 32, { quina = 35, a0 = 0, a1 = 2 * Math.PI } = {}) => {
  const g = G.vazia();
  // separa o perfil em trechos lisos
  const tr = [[perfil[0]]];
  const dir = (p, q) => { const dr = q[0] - p[0], dz = q[1] - p[1], n = Math.hypot(dr, dz) || 1; return [dr / n, dz / n]; };
  for (let i = 1; i < perfil.length; i++) {
    tr[tr.length - 1].push(perfil[i]);
    if (i < perfil.length - 1) {
      const d1 = dir(perfil[i - 1], perfil[i]), d2 = dir(perfil[i], perfil[i + 1]);
      const ang = Math.acos(Math.max(-1, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1]))) * 180 / Math.PI;
      if (ang > quina) tr.push([perfil[i]]);
    }
  }
  const fechado = Math.abs(a1 - a0 - 2 * Math.PI) < 1e-9;
  const nA = fechado ? seg : seg + 1;
  for (const t of tr) {
    if (t.length < 2) continue;
    // normal 2D (no plano r-z) por vértice: média das normais dos segmentos vizinhos
    const n2 = t.map((p, i) => {
      const a = dir(t[Math.max(0, i - 1)], t[Math.min(t.length - 1, i + (i === 0 ? 1 : 0))]);
      const b = dir(t[Math.max(0, i - (i === t.length - 1 ? 1 : 0))], t[Math.min(t.length - 1, i + 1)]);
      let nr = a[1] + b[1], nz = -(a[0] + b[0]); const n = Math.hypot(nr, nz) || 1; return [nr / n, nz / n];
    });
    const base = g.pos.length / 3;
    for (let i = 0; i < t.length; i++) for (let k = 0; k < nA; k++) {
      const th = a0 + (a1 - a0) * k / seg, c = Math.cos(th), s = Math.sin(th);
      g.pos.push(t[i][0] * c, t[i][0] * s, t[i][1]);
      g.nor.push(n2[i][0] * c, n2[i][0] * s, n2[i][1]);
    }
    for (let i = 0; i < t.length - 1; i++) for (let k = 0; k < seg; k++) {
      const k2 = fechado ? (k + 1) % seg : k + 1;
      const a = base + i * nA + k, b = base + i * nA + k2, c = base + (i + 1) * nA + k2, d = base + (i + 1) * nA + k;
      g.idx.push(a, b, c, a, c, d);
    }
  }
  return g;
};

// disco (tampa) em z, normal +Z (ou -Z se para baixo)
G.disco = (r, z = 0, seg = 32, paraBaixo = false, rIn = 0) => {
  const g = G.vazia(), nz = paraBaixo ? -1 : 1;
  if (rIn > 0) {
    for (let k = 0; k < seg; k++) {
      const th = 2 * Math.PI * k / seg, c = Math.cos(th), s = Math.sin(th);
      g.pos.push(r * c, r * s, z, rIn * c, rIn * s, z); g.nor.push(0, 0, nz, 0, 0, nz);
    }
    for (let k = 0; k < seg; k++) {
      const a = 2 * k, b = 2 * ((k + 1) % seg);
      if (paraBaixo) g.idx.push(a, a + 1, b + 1, a, b + 1, b); else g.idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
    return g;
  }
  g.pos.push(0, 0, z); g.nor.push(0, 0, nz);
  for (let k = 0; k < seg; k++) { const th = 2 * Math.PI * k / seg; g.pos.push(r * Math.cos(th), r * Math.sin(th), z); g.nor.push(0, 0, nz); }
  for (let k = 0; k < seg; k++) { const a = 1 + k, b = 1 + (k + 1) % seg; if (paraBaixo) g.idx.push(0, b, a); else g.idx.push(0, a, b); }
  return g;
};

// cilindro de z0 a z1, com tampas
G.cilindro = (r, z0, z1, seg = 32, tampas = true) => {
  const g = G.revolucao([[r, z0], [r, z1]], seg);
  if (tampas) G.juntar(g, G.disco(r, z0, seg, true), G.disco(r, z1, seg, false));
  return g;
};

// cilindro (tubo maciço) ligando os pontos p e q
G.barra = (p, q, r, seg = 16, tampas = true) => {
  const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], L = Math.hypot(...d);
  return G.transformar(G.cilindro(r, 0, L, seg, tampas), G.mat.mul(G.mat.trans(...p), G.mat.alinharZ(d)));
};

// esfera (UV)
G.esfera = (r, seg = 24, aneis = 16) => {
  const p = [];
  for (let i = 0; i <= aneis; i++) { const f = -Math.PI / 2 + Math.PI * i / aneis; p.push([r * Math.cos(f) + (i === 0 || i === aneis ? 0 : 0), r * Math.sin(f)]); }
  return G.revolucao(p, seg, { quina: 999 });
};

// toro em torno de Z: raio maior R, menor r
G.toro = (R, r, segR = 32, segr = 12) => {
  const g = G.vazia();
  for (let i = 0; i <= segR; i++) for (let j = 0; j <= segr; j++) {
    const u = 2 * Math.PI * i / segR, v = 2 * Math.PI * j / segr;
    const cu = Math.cos(u), su = Math.sin(u), cv = Math.cos(v), sv = Math.sin(v);
    g.pos.push((R + r * cv) * cu, (R + r * cv) * su, r * sv);
    g.nor.push(cv * cu, cv * su, sv);
  }
  for (let i = 0; i < segR; i++) for (let j = 0; j < segr; j++) {
    const a = i * (segr + 1) + j, b = (i + 1) * (segr + 1) + j;
    g.idx.push(a, b, b + 1, a, b + 1, a + 1);
  }
  return g;
};

// extrusão de um polígono 2D (no plano XY, CCW) de z0 a z1, com tampas (triangulação em leque: use polígonos convexos)
G.extrusao = (poli, z0, z1) => {
  const g = G.vazia(), n = poli.length;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = poli[i], [x1, y1] = poli[(i + 1) % n];
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = dy / L, ny = -dx / L;
    const b = g.pos.length / 3;
    g.pos.push(x0, y0, z0, x1, y1, z0, x1, y1, z1, x0, y0, z1);
    for (let k = 0; k < 4; k++) g.nor.push(nx, ny, 0);
    g.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  for (const [z, nz] of [[z0, -1], [z1, 1]]) {
    const b = g.pos.length / 3;
    for (const [x, y] of poli) { g.pos.push(x, y, z); g.nor.push(0, 0, nz); }
    for (let i = 1; i < n - 1; i++) if (nz > 0) g.idx.push(b, b + i, b + i + 1); else g.idx.push(b, b + i + 1, b + i);
  }
  return g;
};

// tubo ao longo de uma polilinha 3D (seção circular de raio r), normais suaves
G.tubo = (pts, r, seg = 12, tampas = true) => {
  const g = G.vazia(), n = pts.length;
  let ref = null;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const tl = Math.hypot(...t) || 1; t = t.map((v) => v / tl);
    if (!ref) ref = Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    // quadro de transporte paralelo simples
    let u = [ref[1] * t[2] - ref[2] * t[1], ref[2] * t[0] - ref[0] * t[2], ref[0] * t[1] - ref[1] * t[0]];
    const ul = Math.hypot(...u) || 1; u = u.map((v) => v / ul);
    const w = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
    ref = w;
    for (let k = 0; k <= seg; k++) {
      const th = 2 * Math.PI * k / seg, c = Math.cos(th), s = Math.sin(th);
      const nx = u[0] * c + w[0] * s, ny = u[1] * c + w[1] * s, nz = u[2] * c + w[2] * s;
      g.pos.push(pts[i][0] + r * nx, pts[i][1] + r * ny, pts[i][2] + r * nz); g.nor.push(nx, ny, nz);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < seg; k++) {
    const a = i * (seg + 1) + k, b = (i + 1) * (seg + 1) + k;
    g.idx.push(a, b, b + 1, a, b + 1, a + 1);
  }
  if (tampas) {
    const cap = (p, q, inv) => {
      const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
      let disc = G.transformar(G.disco(r, 0, seg, inv), G.mat.mul(G.mat.trans(...p), G.mat.alinharZ(d)));
      G.juntar(g, disc);
    };
    cap(pts[0], pts[1], true); cap(pts[n - 1], [2 * pts[n - 1][0] - pts[n - 2][0], 2 * pts[n - 1][1] - pts[n - 2][1], 2 * pts[n - 1][2] - pts[n - 2][2]], false);
  }
  return g;
};

// caixa com cantos arredondados (raio rc nas arestas verticais), centrada na origem
G.caixaArred = (sx, sy, sz, rc, segC = 6) => {
  const p = [], x = sx / 2 - rc, y = sy / 2 - rc;
  for (const [cx, cy, a0] of [[x, y, 0], [-x, y, Math.PI / 2], [-x, -y, Math.PI], [x, -y, 1.5 * Math.PI]])
    for (let k = 0; k <= segC; k++) { const a = a0 + Math.PI / 2 * k / segC; p.push([cx + rc * Math.cos(a), cy + rc * Math.sin(a)]); }
  return G.extrusao(p, -sz / 2, sz / 2);
};

// converte a malha (arrays comuns) para a parte de um modelo
G.parte = (nome, material, g) => ({ nome, material, pos: new Float32Array(g.pos), nor: new Float32Array(g.nor), idx: new Uint32Array(g.idx) });

window.LAB_GEOM = G;
window.LAB_MODELOS = window.LAB_MODELOS || {};
})();
