// Modelos 3D da montagem do experimento (corrente, suportes, célula de carga, L-frame, wand, marcador).
// Feitos a partir das fotos de ../experimento/fotos/. Unidades em mm, Z para cima, origem no chão.
// Cada função devolve { partes: [...], pontos: { nome: [x,y,z] } } — 'pontos' são os pontos de fixação.
(() => {
'use strict';
const G = window.LAB_GEOM, M = G.mat;
const P = (nome, mat, ...gs) => G.parte(nome, mat, G.juntar(G.vazia(), ...gs));
const T = (g, ...ms) => G.transformar(g, M.cadeia(...ms));
const caixaEm = (x0, y0, z0, x1, y1, z1) => T(G.caixa(x1 - x0, y1 - y0, z1 - z0), M.trans((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));

// ---------------------------------------------------------------- materiais
const MAT = {
  acoEnferrujado: { cor: [0.37, 0.35, 0.33], metal: 0.3, rug: 0.75 },    // chapa de aço com carepa (cinza-acastanhado)
  ferrugem: { cor: [0.36, 0.27, 0.20], metal: 0.15, rug: 0.9 },
  acoEscuro: { cor: [0.16, 0.155, 0.15], metal: 0.7, rug: 0.55 },
  acoBarra: { cor: [0.43, 0.41, 0.39], metal: 0.4, rug: 0.6 },
  galvanizado: { cor: [0.78, 0.80, 0.82], metal: 0.55, rug: 0.5 },       // corrente zincada nova (prata clara, pouco espelhada)
  zincado: { cor: [0.70, 0.71, 0.72], metal: 1.0, rug: 0.4 },
  amareloGasto: { cor: [0.70, 0.50, 0.13], metal: 0.1, rug: 0.75 },      // tinta amarela velha do poste
  amareloSujo: { cor: [0.42, 0.27, 0.12], metal: 0.15, rug: 0.9 },       // ferrugem aparecendo sob a tinta
  fitaPreta: { cor: [0.05, 0.05, 0.05], metal: 0.0, rug: 0.45 },
  concreto: { cor: [0.47, 0.46, 0.43], metal: 0.0, rug: 0.95 },
  aroBorracha: { cor: [0.20, 0.15, 0.12], metal: 0.3, rug: 0.85 },
  aluminio: { cor: [0.76, 0.77, 0.78], metal: 0.35, rug: 0.65 },         // perfil anodizado natural (fosco)
  aluminioFosco: { cor: [0.80, 0.81, 0.82], metal: 0.7, rug: 0.55 },
  fitaPapel: { cor: [0.80, 0.78, 0.72], metal: 0.0, rug: 0.9 },
  barbante: { cor: [0.90, 0.88, 0.82], metal: 0.0, rug: 0.95 },
  pretoAnod: { cor: [0.07, 0.07, 0.08], metal: 0.4, rug: 0.45 },
  vermelho: { cor: [0.80, 0.08, 0.07], metal: 0.0, rug: 0.4 },
  marcador: { cor: [0.58, 0.59, 0.60], metal: 0.35, rug: 0.7 },
  bolha: { cor: [0.55, 0.85, 0.30], metal: 0.0, rug: 0.15 },
  etiqueta: { cor: [0.93, 0.93, 0.90], metal: 0.0, rug: 0.7 },
  madeira: { cor: [0.55, 0.40, 0.26], metal: 0.0, rug: 0.8 },
};
const mat = (nome, extra) => Object.assign({}, MAT[nome], extra || {});

// ---------------------------------------------------------------- helpers privados
// tubo fechado (anel) ao longo de uma curva fechada (pts sem repetir o 1º), seção de raio r
function anelTubo(pts, r, seg = 6) {
  const g = G.vazia(), n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n], p = pts[i];
    let t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const tl = Math.hypot(...t) || 1; t = t.map((v) => v / tl);
    // normal "para fora" no plano da curva: do centróide para o ponto, ortogonalizada
    const c = pts.reduce((s, q) => [s[0] + q[0] / n, s[1] + q[1] / n, s[2] + q[2] / n], [0, 0, 0]);
    let u = [p[0] - c[0], p[1] - c[1], p[2] - c[2]]; const d = u[0] * t[0] + u[1] * t[1] + u[2] * t[2];
    u = [u[0] - d * t[0], u[1] - d * t[1], u[2] - d * t[2]]; const ul = Math.hypot(...u) || 1; u = u.map((v) => v / ul);
    const w = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
    for (let k = 0; k < seg; k++) {
      const th = 2 * Math.PI * k / seg, cc = Math.cos(th), s = Math.sin(th);
      const nx = u[0] * cc + w[0] * s, ny = u[1] * cc + w[1] * s, nz = u[2] * cc + w[2] * s;
      g.pos.push(p[0] + r * nx, p[1] + r * ny, p[2] + r * nz); g.nor.push(nx, ny, nz);
    }
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < seg; k++) {
    const i2 = (i + 1) % n, k2 = (k + 1) % seg;
    const a = i * seg + k, b = i2 * seg + k, c = i2 * seg + k2, d = i * seg + k2;
    g.idx.push(a, b, c, a, c, d);
  }
  return g;
}
// linha central de um elo (estádio) no plano XZ, eixo longo em Z, centrado na origem
function estadio(comp, larg, fio, nArco = 6) {
  const R = (larg - fio) / 2, s = (comp - larg) / 2, pts = [];
  for (let k = 0; k <= nArco; k++) { const a = Math.PI * k / nArco; pts.push([R * Math.cos(a), 0, s + R * Math.sin(a)]); }
  for (let k = 0; k <= nArco; k++) { const a = Math.PI + Math.PI * k / nArco; pts.push([R * Math.cos(a), 0, -s + R * Math.sin(a)]); }
  return pts;
}
const hexa = (r) => Array.from({ length: 6 }, (_, k) => [r * Math.cos(Math.PI / 3 * k + Math.PI / 6), r * Math.sin(Math.PI / 3 * k + Math.PI / 6)]);
const poligono = (n, r, a0 = 0) => Array.from({ length: n }, (_, k) => [r * Math.cos(a0 + 2 * Math.PI * k / n), r * Math.sin(a0 + 2 * Math.PI * k / n)]);

// gerador pseudoaleatório com semente (manchas de ferrugem sempre iguais)
function rng(s) { return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// manchas finas (decalques) sobre uma face horizontal z, dentro do retângulo
function manchas(n, x0, y0, x1, y1, z, rMin, rMax, sem, livre) { // livre(x, y, r): só põe a mancha onde devolver true
  const r = rng(sem), g = G.vazia();
  for (let i = 0; i < n; i++) {
    const rr = rMin + (rMax - rMin) * r(), x = x0 + rr + (x1 - x0 - 2 * rr) * r(), y = y0 + rr + (y1 - y0 - 2 * rr) * r();
    const sx = 0.6 + 0.8 * r(), giro = r() * 6.28;
    if (livre && !livre(x, y, rr * 1.3)) continue;
    G.juntar(g, T(G.disco(rr, 0, 9), M.trans(x, y, z), M.rotZ(giro), M.esc(sx, 1 / sx, 1)));
  }
  return g;
}
// manchas em face vertical (normal ±X ou ±Y): gera no plano XY e gira
function manchasVert(n, eixo, sinal, c, u0, u1, z0, z1, rMin, rMax, sem) {
  const r = rng(sem), g = G.vazia();
  for (let i = 0; i < n; i++) {
    const rr = rMin + (rMax - rMin) * r(), u = u0 + rr + (u1 - u0 - 2 * rr) * r(), z = z0 + rr + (z1 - z0 - 2 * rr) * r();
    let d = T(G.disco(rr, 0, 8), M.rotZ(r() * 6.28), M.esc(0.6 + 0.8 * r(), 1, 1));
    // disco normal +Z -> normal do eixo
    if (eixo === 'x') d = T(d, M.trans(c, u, z), M.rotY(sinal > 0 ? Math.PI / 2 : -Math.PI / 2));
    else d = T(d, M.trans(u, c, z), M.rotX(sinal > 0 ? -Math.PI / 2 : Math.PI / 2));
    G.juntar(g, d);
  }
  return g;
}

// ---------------------------------------------------------------- suporte de aço (mesinha)
// Origem no centro da base, no chão. Duas chapas grossas de aço (tampo e base) ligadas por 4 barras redondas,
// presas por cima com parafusos Allen pretos; o tampo tem um furo grande passante no meio e furos menores
// (fotos 5_montagem_final/fixacao_suporte_grampo_celula_2 e montagem_final_frente, 2_montagem/corrente_fixacao_no_suporte).
// Medidas ESTIMADAS pelas fotos (proporção com o lado de 400 mm, que também é estimado): chapas de ~32 mm,
// barras de Ø ~36 mm a ~32 mm das bordas, furo central de Ø ~80 mm.
//
// Grampo em C (sargento forjado, bicromatizado): a ponta do mordente fixo entra por cima num furo do tampo, o
// arco passa por cima da borda e o fuso sai inclinado para fora e para baixo, com a sapata apoiada na face da
// borda e o manípulo (pino corrediço) na ponta. O olhal de cima da célula de carga 2 fica enfiado no próprio
// fuso, e um bolo de barbante enrolado no fuso não o deixa escorregar. Construído com a borda em y = −L/2 e
// o fuso para −Y; x0 = posição ao longo da borda, saida = distância (mm) do olhal à borda, para fora.
// pontos.gancho = centro do olhal de cima da célula: fica a `saida` da borda e 99 mm abaixo do topo do tampo
// (contrato com cena_lab.js, que calcula a altura do suporte por essa cota). Fuso Ø16 e arco: estimados pela foto.
const ALT_GANCHO = 99;
// curva suave (Catmull-Rom) por pontos de qualquer dimensão
function curvaCR(pts, n = 6) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < n; k++) { const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push(p1.map((_, a) => 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3))); }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}
// casca varrida: seções poligonais (CCW em (u, v), todas com o mesmo nº de vértices) nos quadros { p, u, v },
// com u × v apontando no sentido do avanço; faces planas, sem tampas
function varrer(quadros, secoes) {
  const g = G.vazia(), n = secoes[0].length;
  const pt = (q, s) => [q.p[0] + q.u[0] * s[0] + q.v[0] * s[1], q.p[1] + q.u[1] * s[0] + q.v[1] * s[1], q.p[2] + q.u[2] * s[0] + q.v[2] * s[1]];
  for (let i = 0; i < quadros.length - 1; i++) for (let k = 0; k < n; k++) {
    const a = pt(quadros[i], secoes[i][k]), b = pt(quadros[i], secoes[i][(k + 1) % n]), c = pt(quadros[i + 1], secoes[i + 1][(k + 1) % n]), d = pt(quadros[i + 1], secoes[i + 1][k]);
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    const nl = Math.hypot(nx, ny, nz); if (nl < 1e-9) continue; nx /= nl; ny /= nl; nz /= nl;
    const base = g.pos.length / 3;
    g.pos.push(...a, ...b, ...c, ...d); for (let j = 0; j < 4; j++) g.nor.push(nx, ny, nz);
    g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return g;
}
// chapa quadrada de lado L (z0 a z1) com um furo redondo passante de raio r em (cx, cy)
function chapaFurada(L, z0, z1, r, cx = 0, cy = 0, seg = 24) {
  const g = G.vazia(), h = L / 2;
  const borda = (th) => { const c = Math.cos(th), s = Math.sin(th), k = h / Math.max(Math.abs(c), Math.abs(s)); return [k * c, k * s]; };
  for (const [z, nz] of [[z1, 1], [z0, -1]]) {
    const b = g.pos.length / 3;
    for (let k = 0; k < seg; k++) {
      const th = Math.PI / 4 + 2 * Math.PI * k / seg, [bx, by] = borda(th);
      g.pos.push(cx + r * Math.cos(th), cy + r * Math.sin(th), z, bx, by, z); g.nor.push(0, 0, nz, 0, 0, nz);
    }
    for (let k = 0; k < seg; k++) {
      const a = b + 2 * k, c = b + 2 * ((k + 1) % seg);
      if (nz > 0) g.idx.push(a, a + 1, c + 1, a, c + 1, c); else g.idx.push(a, c + 1, a + 1, a, c, c + 1);
    }
  }
  const b = g.pos.length / 3; // parede do furo (normais para dentro)
  for (let k = 0; k < seg; k++) { const th = 2 * Math.PI * k / seg, c = Math.cos(th), s = Math.sin(th);
    g.pos.push(cx + r * c, cy + r * s, z0, cx + r * c, cy + r * s, z1); g.nor.push(-c, -s, 0, -c, -s, 0); }
  for (let k = 0; k < seg; k++) { const a = b + 2 * k, c = b + 2 * ((k + 1) % seg); g.idx.push(a, a + 1, c + 1, a, c + 1, c); }
  for (let k = 0; k < 4; k++) { // bordas
    const a = Math.PI / 2 * k, c = Math.cos(a), s = Math.sin(a), b2 = g.pos.length / 3;
    const p = (t) => [h * c - t * h * s, h * s + t * h * c], [xa, ya] = p(-1), [xb, yb] = p(1);
    g.pos.push(xa, ya, z0, xb, yb, z0, xb, yb, z1, xa, ya, z1); for (let i = 0; i < 4; i++) g.nor.push(c, s, 0);
    g.idx.push(b2, b2 + 1, b2 + 2, b2, b2 + 2, b2 + 3);
  }
  return g;
}

function grampo(L, H, e, x0, saida) {
  const corpo = G.vazia(), fuso = G.vazia(), pino = G.vazia(), barb = G.vazia(), furo = G.vazia();
  const yb = -L / 2, W = (s, z, x = 0) => [x0 + x, yb - s, z]; // s = distância para fora da borda
  // eixo do fuso: passa por dentro do olhal da célula (centro em zg; olhal Ø20 interno, fuso Ø16) e sobe
  // até a sapata, apoiada no meio da espessura da borda (inclinação limitada a 12°–50°)
  const zg = H - ALT_GANCHO, zR = zg + 2;
  const alfa = Math.max(0.21, Math.min(0.87, Math.atan2(H - e / 2 - zR, Math.max(saida, 1))));
  const ca = Math.cos(alfa), sa = Math.sin(alfa), tR = saida / ca;
  const eixo = (t, n = 0, x = 0) => W(saida - (tR - t) * ca + n * sa, zR + (tR - t) * sa + n * ca, x); // t = 0 na sapata; n = para cima, ⟂ ao eixo
  const a3 = [0, -ca, -sa], naoEixo = (g, t) => T(g, M.trans(...eixo(t)), M.alinharZ(a3));
  const sp = eixo(0), sS = yb - sp[1], zS = sp[2]; // sapata no sistema (s, z)
  // arco em I (alma no plano do C, abas ⟂): da ponta dentro do furo, por cima da borda, até a bucha do fuso
  const sF = -55, bucha = [sS + 36 * ca, zS - 36 * sa], bs = bucha[0];
  const ctrl = [[sF, H - 16], [sF, H + 10], [sF + 7, H + 30], [sF + 24, H + 42], [(sF + bs) / 2 + 6, H + 45], [bs - 2, H + 40], [bs + 9, H + 24],
    [bs + 9, H + 2], bucha];
  const cl = curvaCR(ctrl, 3), nC = cl.length, centro = [(sF + bs) / 2, H + 5];
  const quadros = [], secoes = [];
  cl.forEach((p, i) => {
    const a = cl[Math.max(0, i - 1)], b = cl[Math.min(nC - 1, i + 1)];
    let ts = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(ts, tz) || 1; ts /= tl; tz /= tl;
    let ns = tz, nz = -ts; if (ns * (p[0] - centro[0]) + nz * (p[1] - centro[1]) < 0) { ns = -ns; nz = -nz; }
    const t3 = [0, -ts, tz], u3 = [0, -ns, nz], v3 = [t3[1] * u3[2] - t3[2] * u3[1], t3[2] * u3[0] - t3[0] * u3[2], t3[0] * u3[1] - t3[1] * u3[0]];
    quadros.push({ p: W(p[0], p[1]), u: u3, v: v3 });
    const f = i / (nC - 1), cheio = Math.min(1, f / 0.25), D = 15 + 21 * cheio - 6 * Math.max(0, (f - 0.8) / 0.2);
    const wf = 12 + 10 * cheio, tw = 12 - 5 * cheio, tf = 5;
    secoes.push([[-D / 2, -wf / 2], [-D / 2 + tf, -wf / 2], [-D / 2 + tf, -tw / 2], [D / 2 - tf, -tw / 2], [D / 2 - tf, -wf / 2], [D / 2, -wf / 2],
      [D / 2, wf / 2], [D / 2 - tf, wf / 2], [D / 2 - tf, tw / 2], [-D / 2 + tf, tw / 2], [-D / 2 + tf, wf / 2], [-D / 2, wf / 2]]);
  });
  G.juntar(corpo, varrer(quadros, secoes));
  G.juntar(corpo, T(G.cilindro(6.5, -8, 2, 10), M.trans(...W(sF, H - 16))));                                 // ponta dentro do furo
  G.juntar(corpo, naoEixo(G.revolucao([[0, 20], [13, 20], [16, 24], [16, 48], [13, 52], [0, 52]], 16), 0));     // bucha roscada
  G.juntar(furo, T(G.disco(19, 0, 18), M.trans(x0, yb - sF, H + 0.5)));
  // fuso: sapata, alma lisa, rosca à mostra entre a bucha e o olhal, cabeça com o pino corrediço
  const tC = tR + 86;
  G.juntar(fuso, naoEixo(G.revolucao([[0, 0], [15, 0], [15, 5], [7, 8], [7, 12]], 16), 0));
  G.juntar(fuso, naoEixo(G.cilindro(6.7, 8, tC, 8, false), 0));
  const rosca = []; for (let t = 52; t < tR - 10; t += 5) rosca.push([6.7, t], [8, t + 2.5]);
  if (rosca.length > 2) G.juntar(fuso, naoEixo(G.revolucao(rosca, 8), 0));
  G.juntar(fuso, naoEixo(G.revolucao([[0, 0], [9, 0], [11, 2], [11, 20], [9, 22], [0, 22]], 14), tC));
  const pc = eixo(tC + 11), dp = [0.82, 0.57 * sa, -0.57 * ca]; // pino atravessado, mais para um lado
  const pA = pc.map((v, k) => v - dp[k] * 22), pB = pc.map((v, k) => v + dp[k] * 84);
  G.juntar(pino, G.barra(pA, pB, 4.5, 10), T(G.esfera(6, 8, 6), M.trans(...pA)), T(G.esfera(6, 8, 6), M.trans(...pB)));
  // barbante: bolo enrolado no fuso depois do olhal, voltas soltas e as pontas caindo
  const r = rng(91), cb = eixo(tR + 50);
  G.juntar(barb, T(G.esfera(1, 12, 8), M.trans(...cb), M.alinharZ(a3), M.esc(24, 24, 29)));
  for (let k = 0; k < 7; k++) G.juntar(barb, T(G.toro(23.7, 2.2, 14, 4), M.trans(...cb), M.alinharZ(a3), M.rotX((r() - 0.5) * 2.6), M.rotY((r() - 0.5) * 2.6), M.esc(1, 1, 1.12)));
  for (const dt of [-8, 9, 15]) G.juntar(barb, T(G.toro(10.5, 1.4, 12, 4), M.trans(...eixo(tR + dt)), M.alinharZ(a3), M.rotX(dt * 0.03)));
  for (const [dx, dy, Lp, t0] of [[9, 6, 250, 42], [-7, -5, 330, 54], [3, 10, 170, 62]]) {
    const o = eixo(t0, -24), pts = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push([o[0] + dx * (1 + 2 * t) + 7 * Math.sin(4 * t + dx), o[1] + dy * (1 + 1.5 * t), o[2] - Lp * t]); }
    G.juntar(barb, G.tubo(pts, 1.3, 5));
  }
  return { corpo, fuso, pino, barbante: barb, furo, gancho: [x0, yb - saida, zg] };
}

function suporte(op = {}) {
  const H = op.altura || 1100, L = op.lado || 400, e = op.espTampo || 32, eb = 30, rp = op.raioPerna || 18;
  const ip = L / 2 - 32; // eixo das barras (a ~32 mm das bordas)
  const aco = G.vazia(), base = G.vazia(), escuro = G.vazia(), ferr = G.vazia(), barras = G.vazia(), allen = G.vazia();
  // tampo com o furo central passante e base (um pouco maior que o tampo)
  const rF = 40;
  G.juntar(aco, chapaFurada(L, H - e, H, rF));
  G.juntar(base, caixaEm(-L / 2 - 10, -L / 2 - 10, 0, L / 2 + 10, L / 2 + 10, eb));
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    G.juntar(barras, G.barra([sx * ip, sy * ip, eb], [sx * ip, sy * ip, H - e], rp, 16, false));
    // parafuso Allen preto de cabeça cilíndrica no topo de cada barra, com o sextavado interno
    G.juntar(allen, T(G.revolucao([[0, 0], [15, 0], [15, 17], [13.5, 19], [0, 19]], 16), M.trans(sx * ip, sy * ip, H)));
    G.juntar(escuro, T(G.extrusao(hexa(8), 0, 0.4), M.trans(sx * ip, sy * ip, H + 19)));
    G.juntar(escuro, T(G.revolucao([[rp + 5, eb], [rp, eb + 5]], 16), M.trans(sx * ip, sy * ip, 0))); // cordão de solda no pé
  }
  // furos menores do tampo (discos escuros: não são passantes no modelo) e furos roscados da base
  const furos = [[-L / 2 + 75, -45, 21], [-95, 115, 15], [85, 120, 7], [L / 2 - 80, 40, 7], [-40, -125, 7], [120, -30, 6]];
  for (const [x, y, r] of furos) G.juntar(escuro, T(G.disco(r, 0, 16), M.trans(x, y, H + 0.5)));
  for (const [x, y] of [[90, 90], [-100, 60], [40, -110], [-60, -90]]) G.juntar(escuro, T(G.disco(7, 0, 12), M.trans(x, y, eb + 0.5)));
  // ferrugem: manchas leves no tampo (fora dos furos) e mais carregadas nas bordas e na base
  const livre = (x, y, r) => Math.hypot(x, y) > rF + r + 2 && furos.every(([fx, fy, fr]) => Math.hypot(x - fx, y - fy) > fr + r);
  G.juntar(ferr, manchas(24, -L / 2, -L / 2, L / 2, L / 2, H + 0.4, 4, 17, 7, livre));
  G.juntar(ferr, manchas(22, -L / 2 - 5, -L / 2 - 5, L / 2 + 5, L / 2 + 5, eb + 0.4, 5, 18, 11));
  G.juntar(ferr, manchasVert(9, 'x', 1, L / 2 + 0.4, -L / 2, L / 2, H - e, H, 4, 13, 3));
  G.juntar(ferr, manchasVert(9, 'y', -1, -L / 2 - 0.4, -L / 2, L / 2, H - e, H, 4, 13, 5));
  G.juntar(ferr, manchasVert(9, 'x', -1, -L / 2 - 0.4, -L / 2, L / 2, H - e, H, 4, 13, 9));
  G.juntar(ferr, manchasVert(9, 'y', 1, L / 2 + 0.4, -L / 2, L / 2, H - e, H, 4, 13, 13));
  // barbante amarrado na borda (+X) descendo até o ponto de amarração da corrente (montagem antiga, op.barbante)
  const xb = L / 2 - 70, xa = L / 2 + 25, za = H - 25 - 160;
  const barb = G.vazia();
  if (op.barbante) G.juntar(barb, G.tubo([[xb + 12, 0, H + 0.8], [L / 2 - 2, 0, H + 1.2], [L / 2 + 1.2, 0, H - 3], [L / 2 + 1.2, 0, H - e + 2], [L / 2 - 3, 0, H - e - 1.2], [xb + 14, 0, H - e - 1.2]], 0.9, 6));
  if (op.barbante) G.juntar(barb, G.tubo([[L / 2 + 1.2, 2, H - e + 4], [L / 2 + 8, 3, H - e - 50], [xa - 4, 2, za + 30], [xa, 0, za + 4]], 0.8, 6));
  if (op.barbante) G.juntar(barb, G.tubo([[L / 2 + 1.2, -2, H - e + 6], [L / 2 + 16, -4, H - e - 60], [xa + 3, -2, za + 26], [xa, 0, za + 4]], 0.8, 6));
  // grampo em C numa borda do tampo. op.grampo = { borda: k (a borda −Y girada k × 90° em torno de Z:
  // 0 = −Y, 1 = +X, 2 = +Y, 3 = −X), x: posição ao longo da borda, saida: mm do olhal para fora } ou false
  const og = op.grampo === false ? null : Object.assign({ borda: 0, x: 0, saida: 120 }, op.grampo || {});
  const pontos = { amarracao: [xa, 0, za], topo: [0, 0, H] };
  let gr = null, trG = null;
  if (og) {
    gr = grampo(L, H, e, og.x, og.saida); trG = M.rotZ(og.borda * Math.PI / 2);
    G.juntar(barb, G.transformar(gr.barbante, trG)); G.juntar(escuro, G.transformar(gr.furo, trG));
    const g = gr.gancho, a = og.borda * Math.PI / 2;
    pontos.gancho = [g[0] * Math.cos(a) - g[1] * Math.sin(a), g[0] * Math.sin(a) + g[1] * Math.cos(a), g[2]];
    pontos.canto = pontos.gancho;
  }
  const partes = [P('tampo', mat('acoEnferrujado'), aco), P('base', mat('acoEnferrujado', { cor: [0.25, 0.215, 0.19], metal: 0.4, rug: 0.85 }), base),
    P('pernas', mat('acoBarra'), barras), P('parafusos Allen', mat('acoEscuro', { cor: [0.045, 0.045, 0.05], metal: 0.5, rug: 0.5 }), allen),
    P('furos', mat('acoEscuro', { cor: [0.05, 0.048, 0.045], metal: 0.2, rug: 0.8 }), escuro), P('ferrugem', mat('ferrugem'), ferr)];
  if (gr) partes.push(P('grampo', mat('zincado', { cor: [0.60, 0.51, 0.27], metal: 0.6, rug: 0.5 }), G.transformar(gr.corpo, trG)),
    P('fuso', mat('zincado', { cor: [0.52, 0.47, 0.30], metal: 0.8, rug: 0.45 }), G.transformar(gr.fuso, trG)),
    P('pino do grampo', mat('zincado', { cor: [0.56, 0.56, 0.55], rug: 0.5 }), G.transformar(gr.pino, trG)));
  if (barb.pos.length) partes.push(P('barbante', mat('barbante'), barb));
  return { partes, pontos };
}

// ---------------------------------------------------------------- poste listrado com base de peso
// Origem no centro da base, no chão. Tubo de aço de ~2" pintado de amarelo (tinta gasta, com ferrugem) com 4 faixas
// de fita preta e o topo cortado torto, enferrujado; a base é uma roda de carro de aço (aro de ~13") deitada e cheia
// de concreto, com o tubo chumbado no meio (fotos 5_montagem_final/montagem_final_frente e tres_ramos_vista_da_parede,
// 2_montagem/corrente_suporte_e_poste_com_peso e corrente_fixacao_no_peso). pontos.argola = ponto da argola onde a
// corrente passa. Tudo ESTIMADO pelas fotos: base Ø ~360 × 150 mm (roda 5J × 13), faixas pelas frações da altura.
function postePeso(op = {}) {
  const H = op.altura || 1000, Rb = op.raioBase || 180, hb = op.alturaBase || 150, rt = op.raioTubo || 26;
  const conc = G.vazia(), aro = G.vazia(), tubo = G.vazia(), sujo = G.vazia(), fita = G.vazia(), aco = G.vazia(), escuro = G.vazia(), brita = G.vazia(), mancha = G.vazia();
  const r = rng(21);
  // roda deitada: aba de baixo, canal (o "vão" entre as abas) e aba de cima, onde o concreto fica rente
  G.juntar(aro, G.revolucao([[Rb - 26, 0], [Rb - 6, 0], [Rb, 5], [Rb, 16], [Rb - 9, 30], [Rb - 16, 42], [Rb - 25, 52], [Rb - 27, hb - 60], [Rb - 16, hb - 50],
    [Rb - 5, hb - 38], [Rb, hb - 26], [Rb, hb - 5], [Rb - 3, hb - 1], [Rb - 8, hb]], 36, { quina: 50 }));
  G.juntar(aro, G.disco(Rb - 6, 0.01, 36, true));
  // concreto: tampo levemente abaulado, com manchas escuras (gasto, sujo de óleo e ferrugem) e britas à mostra
  G.juntar(conc, G.revolucao([[Rb - 8, hb], [Rb - 16, hb + 1.5], [Rb * 0.6, hb + 4], [rt + 30, hb + 6], [rt, hb + 9]], 36, { quina: 80 }));
  const zTopo = (d) => hb + 1.5 + 6 * Math.max(0, Math.min(1, (Rb - 16 - d) / (Rb - 16 - rt)));
  const noTopo = (g, n, rMin, rMax, d0, d1, dz) => { for (let i = 0; i < n; i++) {
    const a = r() * 6.2832, d = d0 + (d1 - d0) * Math.sqrt(r()), rr = rMin + (rMax - rMin) * r(), sx = 0.6 + 0.8 * r();
    G.juntar(g, T(G.disco(rr, 0, 7), M.trans(d * Math.cos(a), d * Math.sin(a), zTopo(d) + dz), M.rotZ(r() * 6.28), M.esc(sx, 1 / sx, 1)));
  } };
  noTopo(mancha, 44, 9, 24, Rb * 0.78, Rb - 24, 1.4); noTopo(mancha, 12, 6, 16, rt + 12, Rb * 0.55, 1.5);
  noTopo(brita, 46, 2, 5, rt + 14, Rb - 22, 1.9);
  // tubo: o topo é cortado torto (borda irregular), com a boca oca à mostra
  const seg = 24, zT = [];
  for (let k = 0; k < seg; k++) { const a = 2 * Math.PI * k / seg; zT.push(H - 4 - 9 * (0.5 + 0.5 * Math.sin(2 * a + 1)) - 14 * Math.max(0, Math.sin(a - 0.6)) ** 6 - 5 * r()); }
  const zB = hb + 6, zF = H - 58; // o trecho de cima (zF até a boca) é ferrugem pura
  G.juntar(tubo, G.cilindro(rt, zB, zF, seg, false));
  for (const [raio, sinal] of [[rt, 1], [rt - 3, -1]]) { // parede de fora e de dentro do trecho de cima
    const b = sujo.pos.length / 3;
    for (let k = 0; k < seg; k++) { const a = 2 * Math.PI * k / seg, c = Math.cos(a), s = Math.sin(a);
      sujo.pos.push(raio * c, raio * s, sinal > 0 ? zF : H - 120, raio * c, raio * s, zT[k]); sujo.nor.push(sinal * c, sinal * s, 0, sinal * c, sinal * s, 0); }
    for (let k = 0; k < seg; k++) { const p = b + 2 * k, q = b + 2 * ((k + 1) % seg);
      if (sinal > 0) sujo.idx.push(p, q, q + 1, p, q + 1, p + 1); else sujo.idx.push(p, q + 1, q, p, p + 1, q + 1); }
  }
  { const b = sujo.pos.length / 3; // topo da parede do tubo (borda de 3 mm)
    for (let k = 0; k < seg; k++) { const a = 2 * Math.PI * k / seg, c = Math.cos(a), s = Math.sin(a);
      sujo.pos.push(rt * c, rt * s, zT[k], (rt - 3) * c, (rt - 3) * s, zT[k]); sujo.nor.push(0, 0, 1, 0, 0, 1); }
    for (let k = 0; k < seg; k++) { const p = b + 2 * k, q = b + 2 * ((k + 1) % seg); sujo.idx.push(p, q, q + 1, p, q + 1, p + 1); } }
  G.juntar(escuro, G.disco(rt - 3, H - 120, seg));
  G.juntar(sujo, G.revolucao([[rt + 7, hb + 7], [rt + 0.5, hb + 16]], seg));          // concreto sujo subindo no pé do tubo
  // 4 faixas de fita preta (frações da altura do tubo, medidas na foto montagem_final_frente)
  const Lt = H - zB;
  for (const [a, b] of [[0.13, 0.19], [0.335, 0.40], [0.56, 0.63], [0.805, 0.885]]) G.juntar(fita, G.cilindro(rt + 0.8, zB + Lt * a, zB + Lt * b, seg, false));
  // ferrugem aparecendo sob a tinta (cascas finas sobre o tubo), mais densa perto do topo e do pé
  for (let i = 0; i < 26; i++) { // cada mancha = 3 lascas sobrepostas (contorno irregular)
    const u = r(), f = i < 9 ? 0.62 + 0.38 * u : (i < 14 ? 0.1 * u : u), z0 = zB + 8 + f * (zF - zB - 70), a0 = r() * 6.28;
    for (let j = 0; j < 3; j++) { const z = z0 + (r() - 0.3) * 26, a = a0 + (r() - 0.5) * 0.5, sz = 8 + r() * 30, sa = 0.2 + r() * 0.5;
      G.juntar(sujo, G.revolucao([[rt + 0.4, z], [rt + 0.4, z + sz]], 3, { a0: a, a1: a + sa })); }
  }
  // argolas de vergalhão soldadas perto do topo (op.argolas = 1 ou 2; a primeira fica em +X). Ø ~100 mm
  // (foto 2_montagem/corrente_fixacao_no_peso; diâmetro estimado pela foto)
  const ra = op.raioArgola || 30, fa = op.raioArgola ? 4 : 3.2;
  const arg = (s) => T(G.toro(ra, fa, 28, 8), M.trans(s * (rt + ra - 4), 0, H - 28), M.rotX(Math.PI / 2), M.rotY(s * 0.25));
  G.juntar(aco, arg(1));
  if ((op.argolas || 2) > 1) G.juntar(aco, arg(-1));
  return {
    partes: [P('concreto', mat('concreto', { cor: [0.50, 0.49, 0.46] }), conc), P('britas', mat('concreto', { cor: [0.63, 0.62, 0.59] }), brita),
      P('concreto manchado', mat('concreto', { cor: [0.33, 0.31, 0.29] }), mancha),
      P('roda da base', mat('aroBorracha', { cor: [0.115, 0.095, 0.085], metal: 0.45, rug: 0.75 }), aro),
      P('manchas e boca do tubo', mat('aroBorracha', { cor: [0.16, 0.14, 0.125], metal: 0.1, rug: 0.9 }), escuro), P('tubo amarelo', mat('amareloGasto'), tubo),
      P('ferrugem do tubo', mat('amareloSujo'), sujo), P('fita preta', mat('fitaPreta'), fita), P('argolas', mat('acoEscuro', { cor: [0.20, 0.15, 0.12], metal: 0.5, rug: 0.75 }), aco)],
    pontos: { argola: [rt + ra - 4 + ra * 0.75, 0, H - 28 - ra * 0.6], argolaOposta: [-(rt + ra - 4 + ra * 0.75), 0, H - 28 - ra * 0.6], topo: [0, 0, H] },
  };
}

// ---------------------------------------------------------------- perfil estrutural de alumínio
// Perfil 40 × 40 com um canal em T por face (seção simplificada: 4 cantos em L e o núcleo). Abertura do canal
// de ~9 mm e abas de ~5 mm, como nos perfis de 40 mm de canal 8 (estimado pelas fotos; a marca não aparece).
function perfil40(L, a = 40) {
  // perfil ao longo de Z, de 0 a L, centrado em XY
  const g = G.vazia(), h = a / 2, c = a * 0.11, ab = a * 0.12; // c = meia-abertura do canal, ab = esp. das abas
  // 4 cantoneiras dos cantos
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    G.juntar(g, caixaEm(Math.min(sx * h, sx * c), Math.min(sy * h, sy * (h - ab)), 0, Math.max(sx * h, sx * c), Math.max(sy * h, sy * (h - ab)), L));
    G.juntar(g, caixaEm(Math.min(sx * h, sx * (h - ab)), Math.min(sy * h, sy * c), 0, Math.max(sx * h, sx * (h - ab)), Math.max(sy * h, sy * c), L));
  }
  // núcleo (visto pelo canal)
  G.juntar(g, caixaEm(-h * 0.5, -h * 0.5, 0, h * 0.5, h * 0.5, L));
  return g;
}
// perfil entre dois pontos (roll: giro em torno do eixo)
const perfilEntre = (p, q, a = 40, roll = 0) => {
  const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], L = Math.hypot(...d);
  return T(perfil40(L, a), M.trans(...p), M.alinharZ(d), M.rotZ(roll));
};
// perfil 40 × 80 entre dois pontos (dois de 40 lado a lado; os 80 mm ficam no plano vertical do eixo)
const perfil80Entre = (p, q) => {
  const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], L = Math.hypot(...d), base = M.mul(M.trans(...p), M.alinharZ(d));
  return G.juntar(T(perfil40(L), base, M.trans(0, 20, 0)), T(perfil40(L), base, M.trans(0, -20, 0)));
};
// cantoneira zincada de fixação: uma aba na parede (plano Y = 0) e outra na lateral do trilho; x = face do
// trilho, lado = ±1 (para onde a aba da parede se estende)
const cantoneira = (x, z, lado) => G.juntar(caixaEm(Math.min(x, x + lado * 36), 0, z - 14, Math.max(x, x + lado * 36), 4, z + 14),
  caixaEm(Math.min(x, x + lado * 4), 0, z - 14, Math.max(x, x + lado * 4), 34, z + 14),
  T(G.cilindro(4.5, 0, 3, 8), M.trans(x + lado * 22, 4, z), M.rotX(-Math.PI / 2)));

// Parede no plano Y = 0 (o modelo fica em Y >= 0, saindo da parede para +Y). Origem no chão, no meio entre os
// dois trilhos. Dois trilhos verticais presos à parede por cantoneiras; de cada um sai um braço horizontal de
// 40 × 40 apoiado numa travessa e escorado por cima por uma mão-francesa de 40 × 80; a ponta de cada braço está
// embrulhada em fita crepe, e no braço −X (o do lado do suporte) um barbante amarrado logo atrás da fita segura o
// olhal da célula de carga 1 (fotos 5_montagem_final/fixacao_braco_do_perfil e montagem_final_frente,
// 2_montagem/corrente_perfil_na_parede e corrente_fixacao_no_perfil). Proporções ESTIMADAS pelas fotos.
// pontos.amarracao2 = centro do olhal da célula, 82 mm abaixo do eixo do braço −X e a 22 + 40 + 2 + braco + 25 mm
// da parede (contrato com cena_lab.js, que calcula o comprimento do braço por essa cota); pontos.amarracao = o
// mesmo ponto sob o braço +X.
function perfilParede(op = {}) {
  const H = op.altura || 2100, D = op.vao || 330, B = op.braco || 260, zb = op.alturaBraco || 1000, a = 40;
  const al = G.vazia(), zin = G.vazia(), fp = G.vazia(), barb = G.vazia(), mad = G.vazia();
  const y0 = a / 2 + 2, yt = y0 + a + 2; // eixo dos trilhos (encostados na parede) e da travessa, à frente deles
  const yb = yt + B + 25, yPonta = yb + 45; // plano do barbante e ponta do braço (dentro da fita)
  for (const s of [-1, 1]) {
    const x = s * D / 2;
    G.juntar(al, perfilEntre([x, y0, 60], [x, y0, H]));                                         // trilho
    G.juntar(al, perfilEntre([x, y0 + a / 2, zb], [x, yPonta, zb]));                             // braço
    const sobe = Math.max(220, 0.85 * B);                                                       // mão-francesa por cima
    G.juntar(al, perfil80Entre([x, y0 + a / 2 + 6, zb + sobe], [x, yb - 70, zb + a / 2 + 30]));
    G.juntar(zin, T(G.juntar(caixaEm(-15, 0, -3, 15, 34, 0), caixaEm(-15, 0, -3, 15, 3, 34)), M.trans(x, y0 + a / 2, zb + sobe + 50)));
    // cantoneiras na parede, alternando os lados, a cada ~500 mm
    for (let z = 260, k = 0; z < H - 60; z += 500, k++) { const lado = (k % 2 ? -1 : 1) * s; G.juntar(zin, cantoneira(x + lado * a / 2, z, lado)); }
    // ponta do braço embrulhada em fita crepe (duas camadas tortas)
    G.juntar(fp, T(G.caixaArred(60, 70, 52, 10, 3), M.trans(x, yPonta - 3, zb + 1), M.rotZ(0.08 * s)));
    G.juntar(fp, T(G.caixaArred(63, 36, 55, 9, 3), M.trans(x, yPonta + 9, zb + 2), M.rotX(0.06), M.rotZ(-0.05 * s)));
  }
  { // barbante no braço −X: duas voltas justas no perfil, o nó em cima, as pernas que descem ao olhal e uma laçada solta
    const x = -D / 2, q = a / 2 + 1.2, volta = (y, dz) => [[x - q, y, zb - q], [x + q, y, zb - q], [x + q, y + dz, zb + q], [x - q, y + dz, zb + q]];
    G.juntar(barb, anelTubo(volta(yb, 3), 1, 5), anelTubo(volta(yb - 5, -4), 1, 5), T(G.esfera(3.4, 8, 6), M.trans(x + 4, yb + 1, zb + q + 1.5)));
    for (const dx of [-7, 7]) G.juntar(barb, G.tubo([[x + dx, yb, zb - q], [x + dx * 0.5, yb, zb - 50], [x, yb, zb - 73]], 0.9, 5, false));
    G.juntar(barb, G.tubo([[x - q, yb - 8, zb + 6], [x - q - 4, yb - 26, zb - 40], [x - q - 2, yb - 48, zb - 78], [x - q - 5, yb - 70, zb - 42], [x - q, yb - 86, zb + 12]], 0.9, 5, false));
  }
  // travessa baixa (sob os braços, à frente dos trilhos) e travessa alta com um toco de perfil e um bloco no meio
  G.juntar(al, perfilEntre([-D / 2 - 60, yt, zb - a], [D / 2 + 60, yt, zb - a]));
  G.juntar(al, perfilEntre([-D / 2 - 50, yt, H - 260], [D / 2 + 50, yt, H - 260]));
  G.juntar(al, perfilEntre([0, yt, H - 240], [0, yt, H - 40], a * 0.8));
  G.juntar(zin, caixaEm(-30, yt + 22, H - 230, 30, yt + 42, H - 120));
  // tábua de pé no rodapé, encostada na parede (aparece nas fotos: vai do trilho +X para o lado da mesa de pallet)
  G.juntar(mad, caixaEm(D / 2 - 160, 2, 0, D / 2 + 400, 42, 140));
  return {
    partes: [P('perfis', mat('aluminio'), al), P('cantoneiras', mat('zincado', { metal: 0.7, rug: 0.5 }), zin), P('fita crepe', mat('fitaPapel', { cor: [0.86, 0.84, 0.77] }), fp),
      P('barbante', mat('barbante'), barb), P('tábua', mat('madeira', { cor: [0.36, 0.25, 0.16], rug: 0.9 }), mad)],
    pontos: { amarracao: [D / 2, yb, zb - 82], amarracao2: [-D / 2, yb, zb - 82] },
  };
}

// ---------------------------------------------------------------- corrente
// pontos: polilinha 3D (mm). Os elos são distribuídos por comprimento de arco, com passo = comprimento
// interno do elo, alternando 90° em torno do eixo. op.elo = { comp, larg, fio } (externos, mm).
function corrente(pontos, op = {}) {
  const e = Object.assign({ comp: 30, larg: 13, fio: 4 }, op.elo || {});
  const nSeg = op.segTubo || 6, nArco = op.segArco || 5;
  const passo = e.comp - 2 * e.fio;
  // comprimento acumulado
  const acc = [0];
  for (let i = 1; i < pontos.length; i++) acc.push(acc[i - 1] + Math.hypot(pontos[i][0] - pontos[i - 1][0], pontos[i][1] - pontos[i - 1][1], pontos[i][2] - pontos[i - 1][2]));
  const Ltot = acc[acc.length - 1];
  const ponto = (s) => {
    s = Math.max(0, Math.min(Ltot, s));
    let i = 1; while (i < acc.length - 1 && acc[i] < s) i++;
    const t = (s - acc[i - 1]) / ((acc[i] - acc[i - 1]) || 1), a = pontos[i - 1], b = pontos[i];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  };
  // malha-modelo do elo (anel), em coordenadas locais (eixo longo Z, plano XZ)
  const modelo = anelTubo(estadio(e.comp, e.larg, e.fio, nArco), e.fio / 2, nSeg);
  const g = { pos: [], nor: [], idx: [] };
  const n = Math.max(1, Math.floor(Ltot / passo));
  const sobra = (Ltot - n * passo) / 2;
  let refAnt = null;
  const r0 = rng(5);
  for (let k = 0; k < n; k++) {
    const sA = sobra + k * passo, sB = sA + passo;
    const A = ponto(sA), B = ponto(sB), c = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2];
    let z = [B[0] - A[0], B[1] - A[1], B[2] - A[2]]; const zl = Math.hypot(...z) || 1; z = z.map((v) => v / zl);
    // referência estável: tenta manter o plano do elo próximo do anterior (sem torção)
    let ref = refAnt || (Math.abs(z[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]);
    let x = [ref[1] * z[2] - ref[2] * z[1], ref[2] * z[0] - ref[0] * z[2], ref[0] * z[1] - ref[1] * z[0]];
    let xl = Math.hypot(...x);
    if (xl < 1e-6) { ref = [1, 0, 0]; x = [ref[1] * z[2] - ref[2] * z[1], ref[2] * z[0] - ref[0] * z[2], ref[0] * z[1] - ref[1] * z[0]]; xl = Math.hypot(...x); }
    x = x.map((v) => v / xl);
    let y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    refAnt = x; // o próximo elo terá x' = x × z = −y: plano girado 90°
    // pequena variação aleatória de giro (elos nunca ficam perfeitos)
    const j = (r0() - 0.5) * 0.25, cj = Math.cos(j), sj = Math.sin(j);
    const x2 = x.map((v, i) => v * cj + y[i] * sj), y2 = y.map((v, i) => -x[i] * sj + v * cj);
    const m = [x2[0], x2[1], x2[2], 0, y2[0], y2[1], y2[2], 0, z[0], z[1], z[2], 0, c[0], c[1], c[2], 1];
    const base = g.pos.length / 3;
    for (let i = 0; i < modelo.pos.length; i += 3) {
      const px = modelo.pos[i], py = modelo.pos[i + 1], pz = modelo.pos[i + 2];
      const nx = modelo.nor[i], ny = modelo.nor[i + 1], nz = modelo.nor[i + 2];
      g.pos.push(m[0] * px + m[4] * py + m[8] * pz + m[12], m[1] * px + m[5] * py + m[9] * pz + m[13], m[2] * px + m[6] * py + m[10] * pz + m[14]);
      g.nor.push(m[0] * nx + m[4] * ny + m[8] * nz, m[1] * nx + m[5] * ny + m[9] * nz, m[2] * nx + m[6] * ny + m[10] * nz);
    }
    for (const i of modelo.idx) g.idx.push(i + base);
  }
  return { partes: [P('corrente', mat('galvanizado'), g)], pontos: { inicio: ponto(0), fim: ponto(Ltot) }, elos: n };
}

// ---------------------------------------------------------------- célula de carga em S
// Célula tipo S de alumínio de 10 kg (gravação "S 10" numa das barras; a marca não aparece nas fotos), com um olhal
// de suspensão forjado e zincado em cada ponta (M8 tipo DIN 580: anel Ø36 externo / Ø20 interno, 36 mm de altura)
// e o cabo saindo pelo lado do bloco central, sob resina amarelada. Medidas ESTIMADAS pelas fotos
// 1_equipamento/celula_de_carga_1_numerada e 2_montagem/celula_de_carga_2, tomando a altura do olhal (36 mm) como
// escala: corpo ~51 × 64 × 13 mm (2" × 2,5" × 0,5"), barras de 10 mm, rasgos de 11 mm, furo "binóculo" passante.
// Origem no centro da célula. pontos.topo e pontos.base = centro dos anéis dos olhais (18 mm além das barras);
// pontos.cabo = ponta do rabicho do cabo (lado −X).
// olhal de suspensão: assento em z = 0, anel no plano XZ com centro em z = 18
function olhalForjado() {
  const g = T(G.toro(14, 4, 18, 6), M.trans(0, 0, 18), M.rotX(Math.PI / 2));
  G.juntar(g, G.revolucao([[0, 0], [10, 0], [10, 4.5], [7, 8], [0, 8]], 12));              // colar
  G.juntar(g, T(G.esfera(1, 8, 5), M.trans(0, 0, 8), M.esc(8.5, 4.6, 6.5)));               // pescoço forjado
  return g;
}
function celulaCarga(op = {}) {
  const L = op.largura || 51, A = op.altura || 64, e = op.esp || 13;
  const alu = G.vazia(), ver = G.vazia(), aco = G.vazia(), res = G.vazia(), fio = G.vazia(), grav = G.vazia();
  const h = A / 2, w = L / 2, t = 10, f = 11, hc = h - t - f, lp = 12; // barras, rasgos, meia-altura do bloco central, postes
  const quad = (g, a, b, c, d, n) => { const k = g.pos.length / 3; g.pos.push(...a, ...b, ...c, ...d); for (let i = 0; i < 4; i++) g.nor.push(...n); g.idx.push(k, k + 1, k + 2, k, k + 2, k + 3); };
  // forma em S: barra de cima, poste (+X), bloco central, poste (−X, o lado do cabo), barra de baixo
  G.juntar(alu, caixaEm(-w, -e / 2, h - t, w, e / 2, h), caixaEm(w - lp, -e / 2, hc, w, e / 2, h - t));
  G.juntar(alu, caixaEm(-w, -e / 2, -h, w, e / 2, -h + t), caixaEm(-w, -e / 2, -h + t, -w + lp, e / 2, -hc));
  // bloco central com o furo "binóculo" passante: união de dois círculos de raio rc com centros em x = ±d
  const rc = 6.8, d = 4.6, nA = 28, angs = [];
  const raioFuro = (th) => { const c = Math.cos(th), s = Math.sin(th); return Math.max(...[-d, d].map((cx) => cx * c + Math.sqrt(Math.max(0, rc * rc - cx * cx * s * s)))); };
  for (let k = 0; k < nA; k++) angs.push(2 * Math.PI * (k + 0.5) / nA);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) angs.push((Math.atan2(sz * hc, sx * w) + 2 * Math.PI) % (2 * Math.PI));
  angs.sort((a, b) => a - b);
  const nB = angs.length;
  const borda = (th) => { const c = Math.cos(th), s = Math.sin(th), k = Math.min(w / Math.max(Math.abs(c), 1e-9), hc / Math.max(Math.abs(s), 1e-9)); return [k * c, k * s]; };
  for (const sy of [-1, 1]) { // faces ±Y, entre o furo e o contorno
    const b = alu.pos.length / 3, y = sy * e / 2;
    for (const th of angs) { const rf = raioFuro(th), [bx, bz] = borda(th); alu.pos.push(rf * Math.cos(th), y, rf * Math.sin(th), bx, y, bz); alu.nor.push(0, sy, 0, 0, sy, 0); }
    for (let k = 0; k < nB; k++) { const a = b + 2 * k, c = b + 2 * ((k + 1) % nB);
      if (sy < 0) alu.idx.push(a, a + 1, c + 1, a, c + 1, c); else alu.idx.push(a, c + 1, a + 1, a, c, c + 1); }
  }
  { const b = alu.pos.length / 3; // parede do furo
    for (const th of angs) { const rf = raioFuro(th), x = rf * Math.cos(th), z = rf * Math.sin(th), cx = x >= 0 ? d : -d, nl = Math.hypot(cx - x, z) || 1;
      alu.pos.push(x, -e / 2, z, x, e / 2, z); alu.nor.push((cx - x) / nl, 0, -z / nl, (cx - x) / nl, 0, -z / nl); }
    for (let k = 0; k < nB; k++) { const a = b + 2 * k, c = b + 2 * ((k + 1) % nB); alu.idx.push(a, c, c + 1, a, c + 1, a + 1); } }
  quad(alu, [w, -e / 2, -hc], [w, e / 2, -hc], [w, e / 2, hc], [w, -e / 2, hc], [1, 0, 0]);
  quad(alu, [-w, e / 2, -hc], [-w, -e / 2, -hc], [-w, -e / 2, hc], [-w, e / 2, hc], [-1, 0, 0]);
  quad(alu, [-w, -e / 2, hc], [w, -e / 2, hc], [w, e / 2, hc], [-w, e / 2, hc], [0, 0, 1]);
  quad(alu, [-w, e / 2, -hc], [w, e / 2, -hc], [w, -e / 2, -hc], [-w, -e / 2, -hc], [0, 0, -1]);
  // olhais forjados nas duas pontas (anéis no plano XZ)
  G.juntar(aco, T(olhalForjado(), M.trans(0, 0, h)), T(olhalForjado(), M.rotX(Math.PI), M.trans(0, 0, h)));
  // gravação na barra de baixo da face −Y: "+", seta do sentido da carga e "S 10" (letras de ~2,5 mm)
  const face = (sy, x, z) => [-sy, 0, 0, 0, 0, 0, 1, 0, 0, sy, 0, 0, x, sy * (e / 2 + 0.05), z, 1];
  const lg = letreiro('S 10', 2.6, 0.12, 0.15);
  G.juntar(grav, T(lg.g, face(-1, w - 12.5, -h + 5.2)));
  G.juntar(grav, T(G.juntar(G.caixa(0.45, 5.4, 0.12), T(G.caixa(0.45, 2.4, 0.12), M.trans(-0.75, -1.9, 0), M.rotZ(-0.6)), T(G.caixa(0.45, 2.4, 0.12), M.trans(0.75, -1.9, 0), M.rotZ(0.6)),
    T(G.caixa(2.4, 0.45, 0.12), M.trans(-4, 0, 0)), T(G.caixa(0.45, 2.4, 0.12), M.trans(-4, 0, 0))), face(-1, w - 16.5, -h + 5), M.trans(0, 0, 0.06)));
  // número da célula escrito à mão em vermelho, do lado oposto ao cabo (fotos 1_equipamento/celula_de_carga_1_numerada
  // e 5_montagem_final/fixacao_suporte_grampo_celula_2)
  if (op.numero) for (const sy of [-1, 1]) {
    const l = letreiro(String(op.numero), 12, 0.3, 0.2);
    G.juntar(ver, T(l.g, face(sy, w - 7 + sy * l.larg / 2, 0), M.trans(0, -6, 0)));
  }
  // resina sobre a saída do cabo (do lado −X até o furo, nas duas faces e na lateral), com os fios aparecendo
  for (const sy of [-1, 1]) {
    G.juntar(res, T(G.caixaArred(14, 2 * hc - 1, 1.1, 4, 3), M.trans(-w + 7.2, sy * (e / 2 + 0.5), 0), M.rotX(Math.PI / 2)));
    G.juntar(ver, T(G.caixa(5, 0.3, 1), M.trans(-w + 6, sy * (e / 2 + 1.15), 3), M.rotY(0.5)));
    G.juntar(fio, T(G.caixa(5, 0.3, 1), M.trans(-w + 6.5, sy * (e / 2 + 1.15), -3), M.rotY(-0.4)));
  }
  G.juntar(res, T(G.esfera(1, 8, 6), M.trans(-w - 0.3, 0, 0), M.esc(2.6, e / 2 + 0.9, hc - 1)));
  G.juntar(fio, G.barra([-w - 1, 0, 0], [-w - 13, 0, -0.4], 3.6, 8), G.tubo([[-w - 2, 0, 0], [-w - 30, 0, -2], [-w - 60, 0, -12]], 2.6, 8));
  return {
    partes: [P('corpo', mat('aluminioFosco', { metal: 0.5 }), alu), P('gravação', mat('pretoAnod', { cor: [0.30, 0.30, 0.31], metal: 0.2, rug: 0.7 }), grav), P('marca', mat('vermelho'), ver),
      P('olhais', mat('zincado', { cor: [0.70, 0.71, 0.72], metal: 0.45, rug: 0.6 }), aco),
      P('resina', mat('etiqueta', { cor: [0.93, 0.90, 0.76], rug: 0.3 }), res), P('cabo', mat('fitaPreta'), fio)],
    pontos: { topo: [0, 0, h + 18], base: [0, 0, -h - 18], cabo: [-w - 60, 0, -12] },
  };
}

// ---------------------------------------------------------------- amarrações de barbante e marcadores
// nó das três correntes: bolo de barbante no ponto p, com as duas pontas soltas pendendo (foto
// 5_montagem_final/tres_ramos_vista_do_perfil: ~0,2–0,3 m de barbante caindo do nó; estimado)
function noBarbante(p) {
  if (!Array.isArray(p)) p = [0, 0, 300];
  const g = G.vazia(), r = rng(77);
  G.juntar(g, T(G.esfera(9, 12, 8), M.trans(...p), M.esc(1.2, 1, 0.8)));
  for (let k = 0; k < 4; k++) G.juntar(g, T(G.toro(9, 1.2, 14, 4), M.trans(...p), M.rotZ(r() * 3), M.rotX(0.6 + r() * 1.5)));
  for (const [dx, dy, L] of [[6, 3, 230], [-4, -6, 300]]) {
    const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([p[0] + dx * (1 + 3 * t) + 10 * Math.sin(5 * t), p[1] + dy * (1 + 2 * t), p[2] - 6 - L * t]); }
    G.juntar(g, G.tubo(pts, 1.1, 5));
  }
  return { partes: [P('barbante', mat('barbante'), g)], pontos: {} };
}
// marcador preso à corrente: base preta do marcador e duas voltas de barbante prendendo-a ao elo.
// p = centro da esfera (medido), q = ponto da corrente logo abaixo (a esfera é desenhada por experimento.js)
function presilhaMarcador(p, q, diam = 19) {
  if (!Array.isArray(p)) { p = [0, 0, 330]; q = [0, 0, 300]; }
  const d = [p[0] - q[0], p[1] - q[1], p[2] - q[2]], L = Math.hypot(...d) || 1, u = d.map((v) => v / L);
  const base = G.barra(q, [p[0] - u[0] * diam * 0.42, p[1] - u[1] * diam * 0.42, p[2] - u[2] * diam * 0.42], 3.2, 10);
  G.juntar(base, T(G.cilindro(5.5, 0, 3, 12), M.trans(...q.map((v, k) => v + u[k] * (L - diam * 0.55))), M.alinharZ(u)));
  const b = G.vazia();
  for (const a of [-0.5, 0.5]) G.juntar(b, T(G.toro(7.5, 1.1, 14, 4), M.trans(...q), M.alinharZ(u), M.rotX(Math.PI / 2 + a)));
  return { partes: [P('base do marcador', mat('pretoAnod'), base), P('barbante', mat('barbante'), b)], pontos: {} };
}

// ---------------------------------------------------------------- marcador refletivo
// Origem no centro da base (encostada na superfície). pontos.centro = centro da esfera.
function marcadorGeom(d = 12) {
  const esf = G.transformar(G.esfera(d / 2, 18, 12), M.trans(0, 0, d / 2 + d * 0.15));
  const base = G.juntar(G.cilindro(d * 0.25, 0, d * 0.2, 12), G.cilindro(d * 0.12, d * 0.15, d * 0.4, 8, false));
  // costuras (gomos) da fita refletiva
  const cost = G.vazia();
  for (let k = 0; k < 3; k++) G.juntar(cost, T(G.toro(d / 2 + 0.003 * d, d * 0.007, 24, 3), M.trans(0, 0, d / 2 + d * 0.15), M.rotZ(k * Math.PI / 3), M.rotX(Math.PI / 2)));
  return { esf, base, cost };
}
function marcador(op = {}) {
  const d = op.diam || 12, g = marcadorGeom(d);
  return { partes: [P('esfera', mat('marcador'), g.esf), P('costuras', mat('pretoAnod', { cor: [0.25, 0.25, 0.26] }), g.cost), P('base', mat('pretoAnod'), g.base)], pontos: { centro: [0, 0, d / 2 + d * 0.15] } };
}

// ---------------------------------------------------------------- L-frame de calibração
// Canto na origem, braço longo em +X, curto em +Y, pés no chão. Os marcadores ficam no topo das barras.
// pontos.m0..m3 = centros dos marcadores (m0 no canto).
function lFrame(op = {}) {
  const LX = op.bracoX || 600, LY = op.bracoY || 400, w = 32, h = 38, zp = 22, d = op.diamMarcador || 19;
  const preto = G.vazia(), mk = G.vazia(), cost = G.vazia(), base = G.vazia(), ver = G.vazia(), bol = G.vazia(), aco = G.vazia();
  const z0 = zp, z1 = zp + h;
  // braços (com chanfro: caixa arredondada)
  G.juntar(preto, T(G.caixaArred(LX + w / 2, w, h, 4, 2), M.trans((LX + w / 2) / 2 - w / 2, 0, (z0 + z1) / 2)));
  G.juntar(preto, T(G.caixaArred(LY - w / 2, w, h, 4, 2), M.trans(0, w / 2 + (LY - w / 2) / 2, (z0 + z1) / 2), M.rotZ(Math.PI / 2)));
  // articulação no canto (bloco + manopla vermelha)
  G.juntar(preto, T(G.caixaArred(w + 14, w + 14, h + 10, 6, 3), M.trans(0, 0, (z0 + z1) / 2)));
  G.juntar(ver, T(G.cilindro(9, 0, 8, 20), M.trans(w / 2 + 7, w / 2 + 7, (z0 + z1) / 2), M.rotY(Math.PI / 2), M.rotX(-Math.PI / 4)));
  // pés com parafuso de nivelamento (canto e pontas)
  for (const [x, y] of [[0, 0], [LX - 20, 0], [0, LY - 20]]) {
    G.juntar(aco, T(G.cilindro(4, 6, z0, 10, false), M.trans(x, y, 0)));
    G.juntar(preto, T(G.cilindro(13, 0, 6, 20), M.trans(x, y, 0)));
    G.juntar(preto, T(G.cilindro(10, z1, z1 + 6, 16), M.trans(x, y, 0)));
  }
  // nível de bolha embutido no braço X
  G.juntar(preto, T(caixaEm(-22, -7, 0, 22, 7, 2), M.trans(LX * 0.35, 0, z1)));
  G.juntar(bol, T(G.caixaArred(36, 9, 3, 4, 3), M.trans(LX * 0.35, 0, z1 + 1.5)));
  // parafusos de acabamento
  for (const x of [LX * 0.15, LX * 0.55, LX * 0.75]) for (const s of [-1, 1]) G.juntar(aco, T(G.disco(3, 0, 10), M.trans(x, s * w / 2 + s * 0.2, z0 + h * 0.5), M.rotX(-s * Math.PI / 2)));
  // marcadores: canto, 2 no X, 1 no Y
  const pos = [[0, 0], [LX * 0.5, 0], [LX - 20, 0], [0, LY - 20]];
  const pts = {};
  pos.forEach(([x, y], i) => {
    const m = marcadorGeom(d), tr = M.trans(x, y, z1 + (i === 0 ? 5 : 0));
    G.juntar(mk, G.transformar(m.esf, tr)); G.juntar(cost, G.transformar(m.cost, tr)); G.juntar(base, G.transformar(m.base, tr));
    pts['m' + i] = [x, y, z1 + (i === 0 ? 5 : 0) + d / 2 + d * 0.15];
  });
  return {
    partes: [P('perfis', mat('pretoAnod'), preto), P('marcadores', mat('marcador'), mk), P('costuras', mat('pretoAnod', { cor: [0.25, 0.25, 0.26] }), cost),
      P('bases', mat('pretoAnod'), base), P('manopla', mat('vermelho'), ver), P('bolha', mat('bolha'), bol), P('parafusos', mat('zincado'), aco)],
    pontos: pts,
  };
}

// ---------------------------------------------------------------- wand de calibração
// Haste preta ao longo de +Z (deitada: gire na cena). Origem na ponta do cabo. pontos.m0, m1 = marcadores.
function wand(op = {}) {
  const L = op.comp || 640, sep = op.separacao || 300, d = op.diamMarcador || 19;
  const preto = G.vazia(), mk = G.vazia(), cost = G.vazia(), base = G.vazia(), aco = G.vazia();
  G.juntar(preto, T(G.caixaArred(30, 14, L, 4, 2), M.trans(0, 0, L / 2)));
  // cabo (empunhadura emborrachada mais grossa)
  G.juntar(preto, T(G.caixaArred(34, 18, 170, 7, 3), M.trans(0, 0, 90)));
  // braço lateral na ponta com os dois marcadores
  G.juntar(preto, T(G.caixaArred(12, 10, sep + 30, 3, 2), M.trans(25, 0, L - (sep + 30) / 2 - 5)));
  for (const z of [L - 15, L - 15 - sep]) G.juntar(preto, caixaEm(12, -5, z - 6, 22, 5, z + 6));
  // botões / parafusos prateados no corpo
  for (const z of [60, 95, L * 0.55, L - 40]) G.juntar(aco, T(G.disco(4.5, 0, 14), M.trans(0, 7.2, z), M.rotX(-Math.PI / 2)));
  const pts = {};
  [L - 15, L - 15 - sep].forEach((z, i) => {
    const m = marcadorGeom(d), tr = M.cadeia(M.trans(31, 0, z), M.rotY(Math.PI / 2));
    G.juntar(mk, G.transformar(m.esf, tr)); G.juntar(cost, G.transformar(m.cost, tr)); G.juntar(base, G.transformar(m.base, tr));
    pts['m' + i] = [31 + d / 2 + d * 0.15, 0, z];
  });
  return {
    partes: [P('haste', mat('pretoAnod'), preto), P('marcadores', mat('marcador'), mk), P('costuras', mat('pretoAnod', { cor: [0.25, 0.25, 0.26] }), cost), P('bases', mat('pretoAnod'), base), P('parafusos', mat('zincado'), aco)],
    pontos: pts,
  };
}

// ---------------------------------------------------------------- mesa de pallet sobre caixote
// Pallet de pinus (≈1200 × 800 × 140) apoiado num quadro de cantoneiras de aço, com um caixote de
// madeira por baixo. Origem no chão, no centro; +Y é o lado da parede. pontos.tampo = centro do tampo.
function mesaPallet(op = {}) {
  const C = op.comp || 1200, Lg = op.larg || 800, hp = op.alturaPallet || 140, Ht = op.altura || 750;
  const zq = Ht - hp; // altura do quadro metálico
  const pin = G.vazia(), pin2 = G.vazia(), ferro = G.vazia(), comp = G.vazia(), rip = G.vazia(), ver = G.vazia(), eti = G.vazia();
  const r = rng(31);
  // ---- pallet: 3 tábuas de baixo, 9 tacos, travessas e tábuas do tampo
  const tb = 22, hb = hp - 2 * tb;
  for (const y of [-Lg / 2 + 50, 0, Lg / 2 - 50]) G.juntar(pin2, caixaEm(-C / 2, y - 50, zq, C / 2, y + 50, zq + tb));
  for (const x of [-C / 2 + 50, 0, C / 2 - 50]) for (const y of [-Lg / 2 + 50, 0, Lg / 2 - 50])
    G.juntar(pin2, caixaEm(x - 50, y - 50, zq + tb, x + 50, y + 50, zq + tb + hb - 22));
  for (const x of [-C / 2 + 50, 0, C / 2 - 50]) G.juntar(pin, caixaEm(x - 50, -Lg / 2, zq + tb + hb - 22, x + 50, Lg / 2, zq + tb + hb));
  const nT = 7, wT = (Lg - (nT - 1) * 18) / nT;
  for (let i = 0; i < nT; i++) {
    const y0 = -Lg / 2 + i * (wT + 18), dz = (r() - 0.5) * 1.5;
    G.juntar(i % 2 ? pin : pin2, caixaEm(-C / 2, y0, zq + hp - tb + dz, C / 2, y0 + wT, zq + hp + dz));
    for (const x of [-C / 2 + 50, 0, C / 2 - 50]) for (const d of [-0.25, 0.25])
      G.juntar(ferro, T(G.disco(2.5, 0, 6), M.trans(x + (r() - 0.5) * 30, y0 + wT * (0.5 + d), zq + hp + dz + 0.6)));
  }
  // ---- quadro de cantoneiras (pernas e moldura sob o pallet)
  const xq = C / 2 - 120, yq = Lg / 2 - 60, ca = 38, ec = 4;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const x = sx * xq, y = sy * yq;
    G.juntar(ferro, caixaEm(Math.min(x, x - sx * ca), Math.min(y, y - sy * ec), 0, Math.max(x, x - sx * ca), Math.max(y, y - sy * ec), zq));
    G.juntar(ferro, caixaEm(Math.min(x, x - sx * ec), Math.min(y, y - sy * ca), 0, Math.max(x, x - sx * ec), Math.max(y, y - sy * ca), zq));
  }
  for (const sy of [-1, 1]) {
    const yA = sy > 0 ? yq - ec : -yq, yB = sy > 0 ? yq - ca : -yq;
    G.juntar(ferro, caixaEm(-xq, yA, zq - ca, xq, yA + ec, zq), caixaEm(-xq, yB, zq - ec, xq, yB + ca, zq));
  }
  for (const sx of [-1, 1]) {
    const xA = sx > 0 ? xq - ec : -xq, xB = sx > 0 ? xq - ca : -xq;
    G.juntar(ferro, caixaEm(xA, -yq, zq - ca, xA + ec, yq, zq), caixaEm(xB, -yq, zq - ec, xB + ca, yq, zq));
  }
  // ---- caixote por baixo: compensado escuro com ripas de pinus nas bordas e em diagonal
  const cx0 = -xq + 30, cx1 = xq - 30, cy0 = -yq + 20, cy1 = yq - 20, cz = zq - ca - 15, ripa = 70, er = 20;
  G.juntar(comp, caixaEm(cx0 + 10, cy0 + 10, 30, cx1 - 10, cy1 - 10, cz));
  G.juntar(rip, caixaEm(cx0, cy0, 0, cx1, cy0 + 90, 30), caixaEm(cx0, cy1 - 90, 0, cx1, cy1, 30));
  for (const [yy0, yy1] of [[cy0 - 10, cy0 + 10], [cy1 - 10, cy1 + 10]]) {
    G.juntar(rip, caixaEm(cx0, yy0, 30, cx1, yy1, 30 + ripa), caixaEm(cx0, yy0, cz - ripa, cx1, yy1, cz));
    G.juntar(rip, caixaEm(cx0, yy0, 30, cx0 + ripa, yy1, cz), caixaEm(cx1 - ripa, yy0, 30, cx1, yy1, cz));
    const dx = cx1 - cx0 - 2 * ripa, dz = cz - 30 - 2 * ripa, Ld = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
    G.juntar(rip, T(G.caixa(Ld, er, ripa * 0.9), M.trans((cx0 + cx1) / 2, (yy0 + yy1) / 2, (30 + cz) / 2), M.rotY(-a)));
  }
  for (const [xx0, xx1] of [[cx0 - 10, cx0 + 10], [cx1 - 10, cx1 + 10]]) {
    G.juntar(rip, caixaEm(xx0, cy0, 30, xx1, cy1, 30 + ripa), caixaEm(xx0, cy0, cz - ripa, xx1, cy1, cz));
    G.juntar(rip, caixaEm(xx0, cy0, 30, xx1, cy0 + ripa, cz), caixaEm(xx0, cy1 - ripa, 30, xx1, cy1, cz));
  }
  // etiquetas na face frontal (−Y)
  G.juntar(ver, caixaEm(-180, cy0 - 11.5, 220, -110, cy0 - 10.5, 300));
  G.juntar(eti, caixaEm(-60, cy0 - 11.5, 200, 30, cy0 - 10.5, 290));
  return {
    partes: [P('pallet (claro)', mat('madeira', { cor: [0.80, 0.66, 0.44] }), pin), P('pallet', mat('madeira', { cor: [0.74, 0.58, 0.36] }), pin2),
      P('ferro', mat('acoEscuro'), ferro), P('compensado', mat('madeira', { cor: [0.36, 0.25, 0.16] }), comp),
      P('ripas', mat('madeira', { cor: [0.70, 0.52, 0.30] }), rip), P('etiqueta verde', mat('bolha', { cor: [0.12, 0.35, 0.18], rug: 0.6 }), ver), P('etiqueta', mat('etiqueta'), eti)],
    pontos: { tampo: [0, 0, Ht] },
  };
}

// ---------------------------------------------------------------- caixas de papelão
// 2–3 caixas empilhadas (op.n, padrão 3; op.dims = [[a, b, c], ...]). Origem no chão, no centro da caixa de baixo.
function caixasPapelao(op = {}) {
  const n = Math.max(1, Math.min(3, op.n || 3));
  const dims = op.dims || [[900, 600, 300], [620, 420, 280], [450, 340, 240]];
  const pap = G.vazia(), pap2 = G.vazia(), fita = G.vazia(), eti = G.vazia();
  const r = rng(44);
  let z = 0;
  for (let i = 0; i < n; i++) {
    const [a, b, c] = dims[i], ox = i ? (r() - 0.5) * 120 : 0, oy = i ? (r() - 0.5) * 60 : 0, rz = i ? (r() - 0.5) * 0.25 : 0;
    const tr = M.cadeia(M.trans(ox, oy, z), M.rotZ(rz));
    G.juntar(i % 2 ? pap2 : pap, G.transformar(caixaEm(-a / 2, -b / 2, 0, a / 2, b / 2, c), tr));
    G.juntar(fita, G.transformar(caixaEm(-a / 2 - 0.5, -24, c - 0.2, a / 2 + 0.5, 24, c + 0.6), tr));
    G.juntar(fita, G.transformar(caixaEm(-a / 2 - 0.6, -24, c - 70, -a / 2 + 0.2, 24, c), tr), G.transformar(caixaEm(a / 2 - 0.2, -24, c - 70, a / 2 + 0.6, 24, c), tr));
    for (let k = 0; k < 2; k++) {
      const w = 60 + r() * 80, h = 40 + r() * 50, x = -a / 2 + 40 + r() * (a - 80 - w), zz = 30 + r() * (c - 60 - h);
      G.juntar(eti, G.transformar(caixaEm(x, -b / 2 - 0.8, zz, x + w, -b / 2 + 0.2, zz + h), tr));
    }
    z += c;
  }
  return {
    partes: [P('papelão', mat('madeira', { cor: [0.66, 0.50, 0.33], rug: 0.95 }), pap), P('papelão 2', mat('madeira', { cor: [0.60, 0.45, 0.30], rug: 0.95 }), pap2),
      P('fita', mat('fitaPapel', { cor: [0.72, 0.60, 0.42], rug: 0.4 }), fita), P('etiquetas', mat('etiqueta'), eti)],
    pontos: { topo: [0, 0, z] },
  };
}

// ---------------------------------------------------------------- tábuas encostadas na parede
// A parede é o plano Y = 0 e fica no lado +Y (como em mesaPallet): os pés das tábuas ficam no chão
// em Y < 0 e o topo encosta na parede. Origem no chão, junto à parede, no meio do grupo. op.n (2–4), op.comp.
function tabuasEncostadas(op = {}) {
  const n = Math.max(1, Math.min(4, op.n || 3)), r = rng(op.semente || 57);
  const mad = [G.vazia(), G.vazia()];
  let x = -(n - 1) * 110;
  for (let i = 0; i < n; i++) {
    const Lt = (op.comp || 2000) * (0.8 + r() * 0.3), w = 120 + r() * 120, e = 18 + r() * 12;
    const inc = 0.10 + r() * 0.12;   // inclinação em relação à vertical (rad)
    const base = Lt * Math.sin(inc); // distância do pé à parede
    const tr = M.cadeia(M.trans(x, -base - e / 2, 0), M.rotX(-inc), M.rotZ((r() - 0.5) * 0.15));
    G.juntar(mad[i % 2], G.transformar(caixaEm(-w / 2, -e / 2, 0, w / 2, e / 2, Lt), tr));
    x += w * 0.6 + 60 + r() * 80;
  }
  return {
    partes: [P('tábuas', mat('madeira', { cor: [0.52, 0.36, 0.22] }), mad[0]), P('tábuas 2', mat('madeira', { cor: [0.62, 0.46, 0.30] }), mad[1])],
    pontos: {},
  };
}

// ================================================================ parte elétrica
const MAT_EL = {
  plasticoPreto: { cor: [0.06, 0.06, 0.065], metal: 0.0, rug: 0.55 },
  plasticoGrafite: { cor: [0.16, 0.165, 0.17], metal: 0.1, rug: 0.5 },
  caboPreto: { cor: [0.05, 0.05, 0.05], metal: 0.0, rug: 0.45 },
  cromado: { cor: [0.85, 0.85, 0.86], metal: 1.0, rug: 0.2 },
  dourado: { cor: [0.85, 0.68, 0.30], metal: 1.0, rug: 0.3 },
  textoClaro: { cor: [0.92, 0.92, 0.92], metal: 0.0, rug: 0.6 },
  laranjaLogo: { cor: [0.90, 0.35, 0.12], metal: 0.0, rug: 0.5 },
  cinzaChapa: { cor: [0.74, 0.75, 0.75], metal: 0.15, rug: 0.6 },
  cinzaChapaEsc: { cor: [0.58, 0.59, 0.60], metal: 0.15, rug: 0.6 },
  verdeBorne: { cor: [0.10, 0.45, 0.22], metal: 0.0, rug: 0.5 },
  conectorTransp: { cor: [0.80, 0.82, 0.84], metal: 0.0, rug: 0.25 },
};
const matE = (nome, extra) => Object.assign({}, MAT_EL[nome], extra || {});

// fonte de traços (grade 4 × 6) para letreiros em relevo baixo: cada letra = lista de segmentos [x0,y0,x1,y1]
const FONTE = {
  A: [[0, 0, 2, 6], [2, 6, 4, 0], [1, 2.5, 3, 2.5]], C: [[4, 6, 0, 6], [0, 6, 0, 0], [0, 0, 4, 0]], E: [[4, 6, 0, 6], [0, 6, 0, 0], [0, 0, 4, 0], [0, 3, 3, 3]],
  I: [[0.8, 0, 0.8, 6]], L: [[0, 6, 0, 0], [0, 0, 4, 0]], M: [[0, 0, 0, 6], [0, 6, 2, 3], [2, 3, 4, 6], [4, 6, 4, 0]], N: [[0, 0, 0, 6], [0, 6, 4, 0], [4, 0, 4, 6]],
  Q: [[0, 0, 0, 6], [0, 6, 4, 6], [4, 6, 4, 0], [4, 0, 0, 0], [2.5, 1.5, 4.5, -0.8]], R: [[0, 0, 0, 6], [0, 6, 4, 6], [4, 6, 4, 3], [4, 3, 0, 3], [1.5, 3, 4, 0]],
  S: [[4, 6, 0, 6], [0, 6, 0, 3], [0, 3, 4, 3], [4, 3, 4, 0], [4, 0, 0, 0]], T: [[0, 6, 4, 6], [2, 6, 2, 0]], U: [[0, 6, 0, 0], [0, 0, 4, 0], [4, 0, 4, 6]],
  Y: [[0, 6, 2, 3], [4, 6, 2, 3], [2, 3, 2, 0]], ' ': [],
  G: [[4, 6, 0, 6], [0, 6, 0, 0], [0, 0, 4, 0], [4, 0, 4, 3], [4, 3, 2, 3]], O: [[0, 0, 0, 6], [0, 6, 4, 6], [4, 6, 4, 0], [4, 0, 0, 0]],
  D: [[0, 0, 0, 6], [0, 6, 3, 6], [3, 6, 4, 4.5], [4, 4.5, 4, 1.5], [4, 1.5, 3, 0], [3, 0, 0, 0]], B: [[0, 0, 0, 6], [0, 6, 3.5, 6], [3.5, 6, 3.5, 3], [0, 3, 4, 3], [4, 3, 4, 0], [4, 0, 0, 0]],
  1: [[0.6, 4.8, 2, 6], [2, 6, 2, 0]], 2: [[0, 6, 4, 6], [4, 6, 4, 3], [4, 3, 0, 3], [0, 3, 0, 0], [0, 0, 4, 0]],
  3: [[0, 6, 4, 6], [4, 6, 4, 0], [4, 0, 0, 0], [1, 3, 4, 3]], 4: [[0, 6, 0, 3], [0, 3, 4, 3], [4, 6, 4, 0]], 5: [[4, 6, 0, 6], [0, 6, 0, 3], [0, 3, 4, 3], [4, 3, 4, 0], [4, 0, 0, 0]],
  6: [[4, 6, 0, 6], [0, 6, 0, 0], [0, 0, 4, 0], [4, 0, 4, 3], [4, 3, 0, 3]], 7: [[0, 6, 4, 6], [4, 6, 1.5, 0]], 8: [[0, 0, 0, 6], [0, 6, 4, 6], [4, 6, 4, 0], [4, 0, 0, 0], [0, 3, 4, 3]],
  9: [[4, 3, 0, 3], [0, 3, 0, 6], [0, 6, 4, 6], [4, 6, 4, 0], [4, 0, 0, 0]], 0: [[1, 0, 0, 1], [0, 1, 0, 5], [0, 5, 1, 6], [1, 6, 3, 6], [3, 6, 4, 5], [4, 5, 4, 1], [4, 1, 3, 0], [3, 0, 1, 0]],
  P: [[0, 0, 0, 6], [0, 6, 4, 6], [4, 6, 4, 3], [4, 3, 0, 3]], V: [[0, 6, 2, 0], [2, 0, 4, 6]], W: [[0, 6, 1, 0], [1, 0, 2, 4], [2, 4, 3, 0], [3, 0, 4, 6]], X: [[0, 0, 4, 6], [0, 6, 4, 0]],
  '+': [[0.5, 3, 3.5, 3], [2, 1.5, 2, 4.5]], '-': [[0.8, 3, 3.2, 3]], '#': [[2, 6, 2, 3.2], [0, 3.2, 4, 3.2], [0.8, 1.8, 3.2, 1.8], [1.5, 0.4, 2.5, 0.4]], // '#' = símbolo de terra/blindagem
};
// texto no plano XY (normal +Z), começando em (0,0), altura h; devolve malha e largura
function letreiro(txt, h, esp = 0.6, traco = 0.16) {
  const g = G.vazia(), u = h / 6, t = traco * h;
  let x = 0;
  for (const ch of txt) {
    for (const [a, b, c, d] of FONTE[ch] || []) {
      const x0 = x + a * u, y0 = b * u, x1 = x + c * u, y1 = d * u, L = Math.hypot(x1 - x0, y1 - y0);
      G.juntar(g, T(G.caixa(L + t, t, esp), M.trans((x0 + x1) / 2, (y0 + y1) / 2, esp / 2), M.rotZ(Math.atan2(y1 - y0, x1 - x0))));
    }
    x += (ch === 'I' ? 2.6 : 5.6) * u;
  }
  return { g, larg: x - 1.6 * u };
}

// conector RJ45 (macho com capa) ao longo de +Z, ponta em z = 0 apontando para −Z; o cabo entra em z = L
function rj45() {
  const corpo = G.juntar(caixaEm(-6, -4.5, 0, 6, 4.5, 21), caixaEm(-3, 4.5, 6, 3, 6.5, 18)); // corpo + trava
  const capa = G.juntar(T(G.revolucao([[6.2, 0], [5.8, 10], [4.3, 22], [3.8, 26]], 12), M.trans(0, 0, 20)));
  const contatos = G.vazia();
  for (let k = 0; k < 8; k++) G.juntar(contatos, caixaEm(-4.6 + k * 1.3, -4.7, 1, -4.0 + k * 1.3, -4.4, 6));
  return { corpo, capa, contatos, L: 46 };
}

// ---------------------------------------------------------------- telas "pintadas"
// quad no plano XY (normal +Z)
function quadZ(x0, y0, x1, y1, z = 0) {
  return { pos: [x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z], nor: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], idx: [0, 1, 2, 0, 2, 3] };
}
// Pintor de telas: retângulos, traços e letras coloridos em coordenadas normalizadas (s, t) ∈ [0, 1]² (t para cima)
// sobre uma área de larg × alt mm, centrada em x = 0 e começando em y = b0. A camada k fica k·passo acima do plano
// (as de cima cobrem as de baixo). partes() devolve uma parte emissiva por cor.
function pintor(larg, alt, b0 = 0, c0 = 0, passo = 0.2) {
  const cores = new Map();
  const g = (cor) => { const k = cor.join(','); if (!cores.has(k)) cores.set(k, { cor, g: G.vazia() }); return cores.get(k).g; };
  const X = (s) => (s - 0.5) * larg, Y = (t) => b0 + t * alt, Z = (k) => c0 + k * passo;
  const p = {
    ret(cor, s0, t0, s1, t1, k = 1) { G.juntar(g(cor), quadZ(X(s0), Y(t0), X(s1), Y(t1), Z(k))); return p; },
    // traço de espessura e (mm) entre dois pontos
    traco(cor, s0, t0, s1, t1, e = 0.6, k = 1) {
      const x0 = X(s0), y0 = Y(t0), x1 = X(s1), y1 = Y(t1), L = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / L * e / 2, ny = (x1 - x0) / L * e / 2, z = Z(k);
      G.juntar(g(cor), { pos: [x0 - nx, y0 - ny, z, x1 - nx, y1 - ny, z, x1 + nx, y1 + ny, z, x0 + nx, y0 + ny, z], nor: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], idx: [0, 1, 2, 0, 2, 3] });
      return p;
    },
    // "linhas de texto": n traços horizontais de comprimentos variados, empilhados para baixo a partir de (s, t)
    texto(cor, s, t, compr, n = 1, dt = 0.022, e = 0.8, k = 1) {
      for (let i = 0; i < n; i++) p.traco(cor, s, t - i * dt, s + compr * (0.6 + 0.1 * ((i * 7 + 3) % 5)), t - i * dt, e, k);
      return p;
    },
    ponto(cor, s, t, r = 1, k = 1) { G.juntar(g(cor), T(G.disco(r, Z(k), 10), M.trans(X(s), Y(t), 0))); return p; },
    letras(cor, txt, s, t, h, k = 1, traco = 0.16) { const l = letreiro(txt, h, 0.08, traco); G.juntar(g(cor), T(l.g, M.trans(X(s), Y(t), Z(k)))); return p; },
    partes(nome, m, brilho = 0.5) {
      return [...cores.values()].map(({ cor, g: gm }, i) => P(nome + ' ' + (i + 1), { cor: cor.map((v) => v * 0.15), metal: 0, rug: 0.2, emissivo: cor.map((v) => v * brilho) }, G.transformar(gm, m)));
    },
  };
  return p;
}

// Tela do notebook das células: Windows 7 com o papel de parede azul "correlated SOLUTIONS" e a janela do programa
// da Lynx (Configuração dos Canais: lista dos canais com "Cel. Carga 01/02" em vermelho, gráfico preto com grade,
// escala de engenharia e o botão "Balanço") — fotos 3_medicoes/tela_lynx_configuracao_canais_celulas.
function telaLynx(p) {
  const az = [0.06, 0.42, 0.82], azC = [0.30, 0.68, 0.95], azM = [0.16, 0.56, 0.90], azE = [0.04, 0.26, 0.60], jan = [0.90, 0.92, 0.94], br = [0.98, 0.98, 0.98], tit = [0.60, 0.76, 0.92],
    pr = [0.02, 0.02, 0.025], gr = [0.50, 0.52, 0.53], cz = [0.36, 0.38, 0.41], bt = [0.78, 0.81, 0.85], vd = [0.72, 0.86, 0.76], vm = [0.85, 0.12, 0.10], am = [0.95, 0.85, 0.25],
    mar = [0.04, 0.08, 0.24], barra = [0.20, 0.36, 0.55], cla = [0.45, 0.62, 0.80], cia = [0.25, 0.78, 0.78];
  p.ret(az, 0, 0, 1, 1, 0).ret(azC, 0, 0.82, 1, 1, 1).ret(azM, 0, 0.64, 1, 0.82, 1);
  for (let i = 0; i < 5; i++) p.traco(azE, -0.02 + i * 0.01, 0.10 + i * 0.03, 0.30 - i * 0.035, 0.045, 1.8, 1); // ondas do papel de parede
  // ícones da área de trabalho (duas colunas à esquerda e um no canto de cima à direita)
  const ic = [br, am, azC, bt];
  for (let c = 0; c < 2; c++) for (let l = 0; l < 8; l++) {
    const s = 0.010 + c * 0.045, t = 0.915 - l * 0.108;
    p.ret(ic[(c * 3 + l) % 4], s, t, s + 0.026, t + 0.046, 2).traco(br, s - 0.004, t - 0.016, s + 0.030, t - 0.016, 0.7, 2);
  }
  p.ret(am, 0.957, 0.905, 0.979, 0.955, 2).traco(br, 0.945, 0.888, 0.990, 0.888, 0.7, 2);
  // logo do papel de parede: "correlated" em negrito sobre uma linha e "SOLUTIONS" espaçado
  p.letras(pr, 'CORRELATED', 0.728, 0.108, 9, 2, 0.27).traco(pr, 0.728, 0.097, 0.945, 0.097, 0.8, 2);
  [...'SOLUTIONS'].forEach((ch, i) => p.letras(mar, ch, 0.728 + i * 0.0255 + (ch === 'I' ? 0.005 : 0), 0.045, 6.5, 2, 0.13));
  // janelinha "Conectar" aparecendo por baixo da principal
  p.ret(tit, 0.385, 0.135, 0.585, 0.185, 2).ret(jan, 0.389, 0.141, 0.581, 0.185, 3).ret(bt, 0.425, 0.148, 0.49, 0.172, 4);
  // janela "Configuração dos Canais" (moldura Aero, botão de fechar, título)
  const w0 = 0.085, w1 = 0.955, h0 = 0.185, h1 = 0.835;
  p.ret(tit, w0, h0, w1, h1, 3).ret(jan, w0 + 0.004, h0 + 0.007, w1 - 0.004, h1 - 0.036, 4);
  p.ret(vm, w1 - 0.036, h1 - 0.029, w1 - 0.006, h1 - 0.005, 4).ret(bt, w1 - 0.066, h1 - 0.029, w1 - 0.040, h1 - 0.009, 4).traco(cz, w0 + 0.02, h1 - 0.018, w0 + 0.13, h1 - 0.018, 1.0, 4);
  // lista dos canais: fundo branco, coluna verde das leituras, linhas de texto (canais 6 e 7 em vermelho)
  p.ret(br, w0 + 0.008, 0.335, 0.375, 0.772, 5).ret(vd, 0.205, 0.50, 0.290, 0.748, 6).ret(bt, w0 + 0.008, 0.772, 0.375, 0.797, 5);
  for (let i = 0; i < 17; i++) {
    const t = 0.736 - i * 0.0225, c = i === 6 || i === 7 ? vm : gr;
    p.traco(c, 0.115 + (i % 4 ? 0.012 : 0), t, 0.185 - (i % 3) * 0.012, t, 0.9, 7);
    if (i < 11) p.traco(c, 0.228, t, 0.278, t, 0.9, 7).traco(gr, 0.300, t, 0.362 - (i % 2) * 0.018, t, 0.9, 7);
  }
  p.traco(gr, 0.200, 0.335, 0.200, 0.772, 0.35, 7).traco(gr, 0.293, 0.335, 0.293, 0.772, 0.35, 7);
  p.texto(gr, 0.10, 0.305, 0.09, 4, 0.021, 0.8, 5).texto(gr, 0.22, 0.262, 0.07, 2, 0.021, 0.8, 5).ret(bt, 0.305, 0.292, 0.372, 0.312, 5);
  // barra de ferramentas e gráfico preto com grade (8 × 6 divisões) e régua amarela
  p.ret(bt, 0.385, 0.776, w1 - 0.008, 0.799, 5);
  for (let i = 0; i < 15; i++) p.ret(i % 5 === 0 ? am : (i % 5 === 3 ? vm : cz), 0.392 + i * 0.0155, 0.781, 0.401 + i * 0.0155, 0.794, 6);
  p.ret(br, 0.69, 0.780, 0.755, 0.795, 6).ret(bt, 0.80, 0.780, 0.84, 0.795, 6).ret(bt, 0.90, 0.780, 0.94, 0.795, 6);
  const g0 = 0.390, g1 = w1 - 0.010, e0 = 0.425, e1 = 0.772, gx = g0 + 0.038, gy = e0 + 0.014;
  p.ret(pr, g0, e0, g1, e1, 5);
  for (let i = 1; i <= 8; i++) { const s = gx + (g1 - gx) * i / 8.35; p.traco(gr, s, gy, s, e1, 0.4, 6); }
  for (let j = 0; j <= 5; j++) { const t = gy + (e1 - gy) * (j + 0.25) / 5.6; p.traco(gr, gx, t, g1, t, 0.4, 6).traco(br, gx - 0.012, t, gx - 0.004, t, 0.7, 6); }
  p.traco(br, gx, gy, gx, e1, 0.7, 6).traco(br, gx, gy, g1, gy, 0.7, 6).traco(am, g0 + 0.010, e0, g0 + 0.010, e1, 0.7, 6);
  p.traco(am, g1 - 0.058, e1 - 0.014, g1 - 0.006, e1 - 0.014, 0.9, 6).traco(br, gx + 0.012, e1 - 0.04, gx + 0.024, e1 - 0.04, 0.5, 6).traco(br, gx + 0.018, e1 - 0.052, gx + 0.018, e1 - 0.028, 0.5, 6);
  // painel de baixo: nome/unidade, escala de engenharia (barra azul com pontas vermelhas), entrada, excitação, balanço
  p.ret(br, 0.396, 0.347, 0.452, 0.365, 5).ret(am, 0.396, 0.315, 0.452, 0.333, 5).ret(bt, 0.398, 0.277, 0.456, 0.297, 5).ret(bt, 0.388, 0.245, 0.456, 0.265, 5).ret(bt, 0.408, 0.213, 0.438, 0.233, 5);
  p.ret(tit, 0.524, 0.236, 0.539, 0.343, 5).ret(vm, 0.520, 0.337, 0.543, 0.347, 6).ret(vm, 0.520, 0.230, 0.543, 0.240, 6);
  p.texto(cz, 0.47, 0.375, 0.05, 1, 0.02, 0.8, 5).texto(cz, 0.555, 0.375, 0.06, 1, 0.02, 0.8, 5).texto(gr, 0.478, 0.335, 0.035, 3, 0.05, 0.7, 5).texto(gr, 0.552, 0.352, 0.03, 5, 0.029, 0.7, 5);
  p.ret(br, 0.676, 0.356, 0.766, 0.373, 5).ret(br, 0.796, 0.356, 0.896, 0.373, 5).ret(br, 0.676, 0.252, 0.756, 0.268, 5).ret(bt, 0.906, 0.300, 0.950, 0.319, 5).ret(bt, 0.846, 0.292, 0.888, 0.310, 5);
  p.texto(gr, 0.676, 0.385, 0.05, 1, 0.02, 0.7, 5).texto(gr, 0.796, 0.385, 0.05, 1, 0.02, 0.7, 5).texto(gr, 0.690, 0.318, 0.04, 3, 0.021, 0.7, 5).texto(gr, 0.800, 0.335, 0.05, 3, 0.022, 0.7, 5).texto(gr, 0.905, 0.280, 0.035, 3, 0.02, 0.7, 5);
  p.ret(mar, 0.786, 0.222, 0.880, 0.264, 5).traco(br, 0.812, 0.250, 0.852, 0.250, 1.0, 6).traco(br, 0.818, 0.235, 0.846, 0.235, 1.0, 6).traco(br, 0.793, 0.243, 0.801, 0.243, 0.6, 6).traco(br, 0.864, 0.243, 0.874, 0.243, 0.6, 6);
  for (const [a, b] of [[0.36, 0.42], [0.43, 0.49], [0.60, 0.67], [0.68, 0.745], [0.76, 0.815], [0.90, 0.94]]) p.ret(bt, a, h0 + 0.014, b, h0 + 0.034, 5);
  p.ponto(vm, 0.265, h0 + 0.028, 0.9, 5).ponto(cia, 0.285, h0 + 0.028, 0.9, 5);
  // barra de tarefas do Windows 7: botão iniciar, ícones, três programas abertos (os da Lynx) e relógio
  p.ret(barra, 0, 0, 1, 0.044, 3).ponto(azC, 0.016, 0.022, 3.2, 4).ret(am, 0.045, 0.010, 0.066, 0.034, 4).ponto(vm, 0.095, 0.022, 2.6, 4).ponto(azC, 0.165, 0.022, 2.6, 4);
  for (let i = 0; i < 3; i++) p.ret(cla, 0.195 + i * 0.084, 0.004, 0.272 + i * 0.084, 0.040, 4).ret(cia, 0.201 + i * 0.084, 0.011, 0.219 + i * 0.084, 0.033, 5).traco(br, 0.224 + i * 0.084, 0.022, 0.262 + i * 0.084, 0.022, 0.7, 5);
  p.traco(br, 0.950, 0.029, 0.985, 0.029, 0.7, 4).traco(br, 0.945, 0.013, 0.985, 0.013, 0.7, 4);
}

// Tela do notebook da Qualisys: QTM (Qualisys Track Manager) com a vista 3D de cima — fundo escuro com grade,
// eixos X vermelho e Y verde, origem azul, marcadores verdes e as três câmeras; à esquerda a árvore do projeto,
// à direita a lista de trajetórias, em baixo as mensagens e a linha do tempo (foto 6_qualisys/qtm_vista_3d_superior_cameras).
function telaQTM(p) {
  const cl = [0.93, 0.94, 0.95], fer = [0.84, 0.87, 0.91], br = [0.98, 0.98, 0.98], pr = [0.045, 0.045, 0.05], gd = [0.30, 0.30, 0.31], gc = [0.72, 0.72, 0.72], cz = [0.42, 0.44, 0.47],
    gr = [0.60, 0.62, 0.64], vm = [0.92, 0.22, 0.12], vd = [0.20, 0.90, 0.20], azu = [0.15, 0.50, 0.95], tb = [0.40, 0.40, 0.41], tl = [0.68, 0.74, 0.83], sel = [0.25, 0.55, 0.90],
    terra = [0.45, 0.36, 0.30], w11 = [0.86, 0.89, 0.93];
  p.ret(cl, 0, 0, 1, 1, 0);
  // título, menus (File Edit View Play Capture AIM Skeleton Tools Window Help) e barra de ferramentas
  p.traco(cz, 0.006, 0.977, 0.33, 0.977, 1.0, 1);
  [0.022, 0.026, 0.028, 0.026, 0.045, 0.022, 0.05, 0.03, 0.045, 0.026].reduce((s, w) => { p.traco(pr, s, 0.935, s + w, 0.935, 0.9, 1); return s + w + 0.012; }, 0.004);
  p.ret(fer, 0, 0.876, 1, 0.915, 1);
  for (let i = 0; i < 52; i++) if (i % 9 !== 8) p.ret(i === 29 ? vm : (i > 34 && i % 4 === 0 ? azu : cz), 0.006 + i * 0.019, 0.886, 0.017 + i * 0.019, 0.906, 2);
  p.ret(br, 0.345, 0.888, 0.415, 0.904, 2).ret(sel, 0.376, 0.884, 0.382, 0.908, 3);
  // árvore do projeto (esquerda)
  p.ret(br, 0, 0.15, 0.145, 0.872, 1).ret(fer, 0, 0.842, 0.145, 0.872, 2).traco(cz, 0.004, 0.857, 0.09, 0.857, 0.9, 3).ret(fer, 0, 0.80, 0.145, 0.826, 2).traco(pr, 0.004, 0.813, 0.03, 0.813, 0.9, 3);
  p.ret(fer, 0.004, 0.185, 0.064, 0.212, 2).ret(fer, 0.072, 0.185, 0.132, 0.212, 2).traco(pr, 0.012, 0.198, 0.032, 0.198, 0.8, 3).traco(pr, 0.092, 0.198, 0.114, 0.198, 0.8, 3).traco(pr, 0.004, 0.165, 0.065, 0.165, 0.8, 2);
  // vista 3D: fundo escuro, grade, cruz central, eixos e marcadores
  const v0 = 0.152, v1 = 0.942, u0 = 0.272, u1 = 0.872, ox = 0.547, oy = 0.562, ds = 0.0255, dt = ds * 16 / 9;
  p.ret(pr, v0, u0, v1, u1, 1);
  for (let i = -15; i <= 15; i++) { const s = ox + i * ds; if (s > v0 + 0.045 && s < v1 - 0.004 && i) p.traco(gd, s, u0, s, u1, 0.3, 2); }
  for (let j = -6; j <= 6; j++) { const t = oy + j * dt; if (t > u0 && t < u1 && j) p.traco(gd, v0 + 0.045, t, v1, t, 0.3, 2); }
  p.traco(gc, ox, u0, ox, u1, 0.6, 3).traco(gc, v0 + 0.045, oy, v1, oy, 0.6, 3);
  p.traco(vm, ox, oy, ox + 0.072, oy, 1.3, 4).traco(vm, ox + 0.066, oy + 0.016, ox + 0.082, oy, 1.2, 4).traco(vm, ox + 0.066, oy - 0.016, ox + 0.082, oy, 1.2, 4);
  p.traco(vd, ox, oy, ox, oy + 0.20, 1.3, 4).traco(vd, ox - 0.009, oy + 0.185, ox, oy + 0.215, 1.2, 4).traco(vd, ox + 0.009, oy + 0.185, ox, oy + 0.215, 1.2, 4);
  p.traco(vm, ox + 0.054, oy - 0.045, ox + 0.064, oy - 0.012, 0.7, 4).traco(vm, ox + 0.064, oy - 0.045, ox + 0.054, oy - 0.012, 0.7, 4); // "X"
  p.traco(vd, ox + 0.008, oy + 0.158, ox + 0.018, oy + 0.170, 0.7, 4).traco(vd, ox + 0.008, oy + 0.182, ox + 0.018, oy + 0.170, 0.7, 4);  // "Y" deitado
  p.ponto(azu, ox, oy, 1.6, 5).ponto(br, ox + 0.008, oy + 0.080, 1.0, 5);
  for (const [a, b] of [[-0.022, 0.150], [-0.014, 0.128], [0.030, 0.034], [0.050, 0.038], [0.068, 0.043], [0.078, 0.043], [0.018, -0.046], [0.006, -0.130], [0.000, -0.190]]) p.ponto(vd, ox + a, oy + b, 0.8, 5);
  for (const [a, b] of [[-0.172, 0.030], [0.208, -0.165], [0.070, -0.455]]) p.ret(br, ox + a - 0.008, oy + b - 0.014, ox + a + 0.008, oy + b + 0.014, 5).ret(pr, ox + a - 0.002, oy + b - 0.008, ox + a + 0.008, oy + b + 0.008, 6);
  p.traco(vd, 0.77, 0.845, 0.92, 0.845, 1.1, 4).traco(br, 0.905, 0.300, 0.935, 0.300, 1.4, 4);
  // barra vertical de ferramentas da vista (2D, seta, girar, mover, zoom…)
  p.ret(tb, 0.160, 0.335, 0.192, 0.835, 3);
  for (let i = 0; i < 9; i++) p.ret(gc, 0.168, 0.780 - i * 0.052, 0.184, 0.808 - i * 0.052, 4);
  // painel da direita: trajetórias (lista escura com ícones verdes; uma selecionada)
  p.ret(fer, 0.946, 0.272, 1, 0.872, 1).ret(pr, 0.952, 0.545, 1, 0.835, 2).ret(sel, 0.952, 0.735, 1, 0.752, 3).ret(pr, 0.952, 0.42, 1, 0.50, 2).ret(pr, 0.952, 0.30, 1, 0.37, 2);
  for (let i = 0; i < 10; i++) p.ponto(vd, 0.975, 0.823 - i * 0.027, 0.9, 4);
  p.traco(sel, 0.955, 0.853, 0.995, 0.853, 0.8, 2).traco(sel, 0.952, 0.515, 0.995, 0.515, 0.8, 2).traco(sel, 0.952, 0.385, 0.99, 0.385, 0.8, 2);
  // mensagens, linha do tempo e barra de estado
  p.ret(br, 0.152, 0.150, 1, 0.268, 1).traco(sel, 0.156, 0.253, 0.20, 0.253, 0.8, 2).ret(fer, 0.152, 0.152, 1, 0.172, 2);
  for (let i = 0; i < 5; i++) p.traco(cz, 0.176, 0.238 - i * 0.019, 0.262, 0.238 - i * 0.019, 0.7, 3).traco(cz, 0.275, 0.238 - i * 0.019, 0.33 + (i === 1 ? 0.40 : (i % 3) * 0.05), 0.238 - i * 0.019, 0.7, 3);
  p.ret(tl, 0, 0.088, 1, 0.148, 1);
  for (let i = 0; i <= 45; i++) p.traco(pr, 0.004 + i * 0.0205, i % 5 ? 0.138 : 0.128, 0.004 + i * 0.0205, 0.147, 0.3, 2);
  p.traco(pr, 0.002, 0.103, 0.33, 0.103, 0.8, 2).traco(cz, 0.002, 0.072, 0.07, 0.072, 0.8, 1);
  // faixa do papel de parede e barra de tarefas clara do Windows 11
  p.ret(terra, 0, 0.044, 1, 0.060, 1).ret(w11, 0, 0, 1, 0.044, 1).ret(azu, 0.006, 0.008, 0.024, 0.036, 2).traco(w11, 0.015, 0.008, 0.015, 0.036, 0.5, 3).traco(w11, 0.006, 0.022, 0.024, 0.022, 0.5, 3);
  p.ret(terra, 0.036, 0.010, 0.056, 0.034, 2).ponto(pr, 0.078, 0.022, 2.4, 2).traco(pr, 0.955, 0.029, 0.975, 0.029, 0.7, 2).traco(pr, 0.955, 0.013, 0.978, 0.013, 0.7, 2);
}

// ---------------------------------------------------------------- notebook
// Base sobre z = 0, centrada em XY; teclado para +Z, dobradiça no lado +Y; a tela abre op.angulo (110°).
// op.modelo:
//  'precision' (padrão) — Dell Precision M6800 de 17,3" (416,7 × 270,6 × 33–37 mm fechado), o notebook das células:
//     carcaça grafite, teclado com bloco numérico, grade de alto-falante e três botões acima do teclado, touchpad com
//     botões em cima e em baixo, Windows 7 com o papel de parede "correlated SOLUTIONS" e o programa da Lynx;
//  'qualisys' — Dell G15 (5530) de 15,6" (357,3 × 274,5 × 21–26 mm), o notebook da Qualisys: grafite, teclado
//     retroiluminado laranja, "prateleira térmica" com saídas de ar atrás da dobradiça, selo da GeForce RTX e o QTM.
// pontos.porta = conector na lateral −X (precision: USB; qualisys: RJ45); pontos.portaRede = RJ45 de verdade
// (precision: face de trás, +Y; qualisys: o mesmo da lateral −X); pontos.energia = entrada da fonte (atrás);
// pontos.tela = centro da tela.
function notebook(op = {}) {
  const q = op.modelo === 'qualisys';
  const W = op.larg || (q ? 357 : 417), D = op.prof || (q ? 275 : 271), hb = q ? 18 : 26, ht = q ? 7 : 9;
  const ang = (op.angulo || 110) * Math.PI / 180, rec = q ? 26 : 7; // rec = recuo da dobradiça (prateleira térmica do G15)
  const yd = D / 2 - rec, Lt = D - rec - 1.5, x0 = -W / 2, y0 = -D / 2;
  const base = G.vazia(), teclas = G.vazia(), leg = G.vazia(), luzTec = G.vazia(), grade = G.vazia(), tampa = G.vazia(), mold = G.vazia(),
    portas = G.vazia(), azul = G.vazia(), prata = G.vazia(), selo = G.vazia(), selo2 = G.vazia(), pad = G.vazia();
  G.juntar(base, T(G.caixaArred(W, D, hb, q ? 9 : 12, 4), M.trans(0, 0, hb / 2)));
  // ---- teclado com bloco numérico: 6 fileiras (a de funções é mais baixa); u = passo das teclas
  const u = q ? 17.9 : 18.2, un = q ? 15.6 : 17.4, vF = q ? 13 : 12, folga = 2.4, vao = q ? 3 : 5;
  const kx = x0 + (q ? 12 : 34), ky = yd - (q ? 34.5 : 34), kx1 = kx + 15 * u + vao + 4 * un, ky1 = ky - vF - 5 * u;
  const main = [Array(16).fill(15 / 16), [...Array(13).fill(1), 2], [1.5, ...Array(12).fill(1), 1.5], [1.75, ...Array(11).fill(1), 2.25],
    [2.25, ...Array(10).fill(1), 2.75], [1.25, 1, 1, 1.25, 5.5, 1.25, 1.25, 5 / 6, 5 / 6, 5 / 6]];
  const num = [[1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1], [2, 1, 1]];
  const fileiras = (fs, xa, uu) => {
    let y = ky;
    fs.forEach((f, l) => {
      const v = l ? u : vF; let x = xa;
      for (const w of f) {
        const a = w * uu;
        G.juntar(teclas, caixaEm(x + folga / 2, y - v + folga / 2, hb - 0.3, x + a - folga / 2, y - folga / 2, hb + 1.3));
        G.juntar(leg, quadZ(x + folga / 2 + 2, y - folga / 2 - (l ? 5.2 : 4.4), x + folga / 2 + 2 + Math.min(q ? 4.5 : 3.2, a - folga - 4), y - folga / 2 - 2.2, hb + 1.45));
        x += a;
      }
      y -= v;
    });
  };
  fileiras(main, kx, u); fileiras(num, kx + 15 * u + vao, un);
  G.juntar(luzTec, caixaEm(kx - 1.2, ky1 - 1.2, hb, kx1 + 1.2, ky + 1.2, hb + 0.3)); // fundo do teclado (no G15, a luz laranja)
  // ---- faixa acima do teclado: grade (alto-falantes no Precision, entrada de ar no G15), botões e liga/desliga
  const furos = (xa, xb, ya, yb, nx, ny, r) => {
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const x = xa + (xb - xa) * (i + 0.25 + (j % 2) * 0.5) / nx, y = ya + (yb - ya) * (j + 0.5) / ny;
      G.juntar(portas, quadZ(x - r, y - r * 0.55, x + r, y + r * 0.55, hb + 0.45));
    }
  };
  if (q) {
    G.juntar(grade, caixaEm(x0 + 18, yd - 29, hb, -x0 - 18, yd - 9, hb + 0.3)); furos(x0 + 20, -x0 - 20, yd - 28, yd - 10, 44, 4, 2.2);
    G.juntar(prata, T(G.disco(6.2, hb + 0.6, 20, false, 5.3), M.trans(0, yd - 19, 0))); G.juntar(pad, T(G.disco(5.3, hb + 0.6, 20), M.trans(0, yd - 19, 0)));
  } else {
    G.juntar(grade, caixaEm(x0 + 76, yd - 27, hb, -x0 - 62, yd - 13, hb + 0.3)); furos(x0 + 78, -x0 - 64, yd - 26, yd - 14, 46, 3, 1.5);
    for (let k = 0; k < 3; k++) G.juntar(prata, caixaEm(x0 + 40 + k * 9.5, yd - 23.5, hb, x0 + 46.5 + k * 9.5, yd - 17, hb + 0.6));
    G.juntar(prata, T(G.cilindro(5, hb, hb + 0.6, 18), M.trans(-x0 - 44, yd - 20, 0)));
  }
  // ---- apoio das mãos: touchpad (no Precision com três botões em cima e três em baixo), leitor digital, etiquetas
  const cx = kx + 7.25 * u, pw = q ? 105 : 100, ph = q ? 62 : 54, py = ky1 - (q ? 10 : 20);
  G.juntar(pad, caixaEm(cx - pw / 2, py - ph, hb, cx + pw / 2, py, hb + 0.3));
  if (q) {
    // selos no canto: GeForce RTX (verde) e Intel (azul)
    G.juntar(selo2, caixaEm(x0 + 14, y0 + 16, hb, x0 + 28, y0 + 26, hb + 0.25)); G.juntar(selo, caixaEm(x0 + 32, y0 + 15, hb, x0 + 44, y0 + 27, hb + 0.25));
  } else {
    for (const yb of [py + 2, py - ph - 13]) for (let k = 0; k < 3; k++) G.juntar(teclas, caixaEm(cx - pw / 2 + k * pw / 3 + 0.6, yb, hb, cx - pw / 2 + (k + 1) * pw / 3 - 0.6, yb + 11, hb + 0.8));
    G.juntar(azul, T(G.cilindro(3, hb, hb + 2.1, 10), M.trans(kx + 6.75 * u, ky - vF - 3 * u, 0))); // pino apontador entre G, H e B
    G.juntar(teclas, caixaEm(cx + pw / 2 + 24, py - 40, hb, cx + pw / 2 + 42, py - 20, hb + 0.3));  // leitor de digitais
    const lm = letreiro('DELL PRECISION M6800', 2.3, 0.12, 0.17);
    G.juntar(leg, T(lm.g, M.trans(x0 + 10, ky1 - 9, hb)));
    G.juntar(selo, caixaEm(-x0 - 62, y0 + 16, hb, -x0 - 46, y0 + 30, hb + 0.25)); G.juntar(prata, quadZ(-x0 - 59, y0 + 19, -x0 - 49, y0 + 24, hb + 0.4)); // selo Intel Core i7
  }
  // ---- portas e saídas de ar (caixas pretas rentes às faces)
  const lado = (s, ya, za, yb, zb, g = portas) => G.juntar(g, caixaEm(s < 0 ? x0 - 0.3 : -x0 - 3, ya, za, s < 0 ? x0 + 3 : -x0 + 0.3, yb, zb));
  const tras = (xa, za, xb, zb, g = portas) => G.juntar(g, caixaEm(xa, D / 2 - 3, za, xb, D / 2 + 0.3, zb));
  let porta, portaRede, energia;
  if (q) {
    lado(-1, 52, 3.5, 68, 15); lado(-1, 30, 6, 37, 13); lado(1, 50, 5.5, 64, 12); lado(1, 30, 5.5, 44, 12);     // RJ45 e fone; 2 USB-A
    for (const s of [-1, 1]) { lado(s, yd + 3, 4, D / 2 - 4, hb - 3); tras(s * 62, 4, s * 166, hb - 3); }         // saídas de ar da prateleira
    for (let k = 1; k < 4; k++) for (const s of [-1, 1]) G.juntar(grade, caixaEm(Math.min(s * 62, s * 166), D / 2 - 2, 4 + k * (hb - 7) / 4 - 0.5, Math.max(s * 62, s * 166), D / 2 + 0.6, 4 + k * (hb - 7) / 4 + 0.5));
    G.juntar(portas, T(G.cilindro(3.6, 0, 0.4, 14), M.trans(-40, D / 2, 9.5), M.rotX(-Math.PI / 2))); tras(-22, 6.5, -6, 12.5); tras(8, 7.5, 17, 11); tras(28, 6.5, 42, 12.5); // fonte, HDMI, USB-C, USB-A
    porta = portaRede = [x0, 60, 9.2]; energia = [-40, D / 2, 9.5];
  } else {
    lado(-1, 60, 5, 112, 20); lado(-1, 12, 9, 26, 15); lado(-1, -8, 9, 6, 15); lado(-1, -62, 10, -34, 12.5);     // saída de ar, 2 USB 3.0, leitor de cartão
    G.juntar(azul, caixaEm(x0 - 0.4, 13.5, 11.2, x0 + 2, 24.5, 12.8), caixaEm(x0 - 0.4, -6.5, 11.2, x0 + 2, 4.5, 12.8));
    G.juntar(portas, T(G.cilindro(2.6, 0, 0.4, 12), M.trans(x0, -78, 12), M.rotY(-Math.PI / 2)), T(G.cilindro(2.6, 0, 0.4, 12), M.trans(x0, -90, 12), M.rotY(-Math.PI / 2))); // fone e microfone
    lado(1, 60, 5, 112, 20); lado(1, 30, 9, 44, 15); lado(1, 12, 9, 26, 15); lado(1, -118, 9.5, -2, 10.3); lado(1, -70, 11.5, -58, 13.5); // ar, 2 USB, gaveta do DVD
    tras(x0 + 12, 5, x0 + 86, 20); tras(-x0 - 86, 5, -x0 - 12, 20);                                              // saídas de ar de trás
    tras(92, 6, 108, 19); tras(52, 8, 84, 18, azul); tras(30, 9, 44, 15); tras(6, 9, 22, 15);                     // RJ45, VGA (azul), eSATA, HDMI
    G.juntar(portas, T(G.cilindro(4.2, 0, 0.4, 14), M.trans(-20, D / 2, 12), M.rotX(-Math.PI / 2)));
    porta = [x0, 19, 12]; portaRede = [100, D / 2, 12.5]; energia = [-20, D / 2, 12];
  }
  // ---- tampa girando na dobradiça (y = yd, z = hb). Coordenadas da tampa: a = direita, b = da dobradiça para a
  // ponta, c = para fora da tela (c = 0 é a face da tela; c = −ht, as costas)
  const trT = M.cadeia(M.trans(0, yd, hb), M.rotX(-ang)), mT = M.mul(trT, [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1]);
  const mC = M.mul(mT, [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, Lt / 2, -ht, 1]); // costas: texto legível por quem olha de trás
  G.juntar(tampa, G.transformar(T(G.caixaArred(W, Lt, ht, q ? 8 : 11, 4), M.trans(0, Lt / 2, -ht / 2)), mT));
  G.juntar(tampa, G.barra([x0 + (q ? 42 : 28), yd, hb], [-x0 - (q ? 42 : 28), yd, hb], q ? 5 : 6, 12));
  G.juntar(mold, G.transformar(T(G.caixaArred(W - 3, Lt - 3, 0.5, q ? 6.5 : 9.5, 4), M.trans(0, Lt / 2, -0.15)), mT));
  const sw = q ? 344.2 : 383, sh = q ? 193.6 : 215.4, b0 = Lt - (q ? 9 : 14) - sh; // tela 16:9 de 15,6" / 17,3"
  const p = pintor(sw, sh, b0, 0.3);
  (q ? telaQTM : telaLynx)(p);
  const lf = letreiro('DELL', q ? 4 : 6, 0.12, 0.2), lc = letreiro('DELL', 11, 0.3, 0.2);
  G.juntar(prata, G.transformar(T(lf.g, M.trans(-lf.larg / 2, b0 / 2 - (q ? 0 : 3), 0.1)), mT));                           // "DELL" sob a tela
  G.juntar(prata, G.transformar(G.juntar(G.disco(21, 0.3, 40, false, 18.4), T(lc.g, M.trans(-lc.larg / 2, -5.5, 0))), mC)); // logo nas costas
  G.juntar(pad, G.transformar(T(G.disco(2.2, 0.3, 12), M.trans(0, Lt - (q ? 4.5 : 7), 0)), mT));                           // webcam
  const corBase = q ? [0.19, 0.195, 0.21] : [0.15, 0.15, 0.155];
  const partes = [P('base', matE('plasticoGrafite', { cor: corBase }), base), P('teclas', matE('plasticoPreto', { cor: [0.045, 0.045, 0.05] }), teclas),
    P('fundo do teclado', q ? { cor: [0.30, 0.12, 0.02], metal: 0, rug: 0.5, emissivo: [0.55, 0.23, 0.03] } : matE('plasticoGrafite', { cor: [0.20, 0.20, 0.21], rug: 0.6 }), luzTec),
    P('legendas', q ? { cor: [0.5, 0.25, 0.05], metal: 0, rug: 0.5, emissivo: [0.80, 0.42, 0.08] } : { cor: [0.66, 0.66, 0.66], metal: 0, rug: 0.6 }, leg),
    P('grade', matE('plasticoGrafite', { cor: q ? [0.09, 0.09, 0.10] : [0.15, 0.15, 0.155], rug: 0.7 }), grade), P('touchpad', matE('plasticoGrafite', { cor: q ? [0.10, 0.105, 0.115] : [0.085, 0.085, 0.09], rug: 0.35 }), pad),
    P('tampa', q ? matE('plasticoGrafite', { cor: [0.25, 0.255, 0.27], rug: 0.5 }) : matE('plasticoGrafite', { cor: [0.30, 0.30, 0.32], metal: 0.3, rug: 0.45 }), tampa),
    P('moldura da tela', matE('plasticoPreto', { cor: [0.025, 0.025, 0.028], rug: 0.4 }), mold), P('portas', matE('plasticoPreto', { cor: [0.01, 0.01, 0.01] }), portas),
    P('logos e botões', matE('cromado', { cor: [0.72, 0.73, 0.75], rug: 0.35 }), prata), P('selo Intel', { cor: [0.05, 0.35, 0.75], metal: 0, rug: 0.4 }, selo),
    ...p.partes('tela', mT)];
  if (azul.pos.length) partes.push(P('azul (USB 3.0, VGA, pino)', { cor: [0.08, 0.20, 0.62], metal: 0, rug: 0.45 }, azul));
  if (selo2.pos.length) partes.push(P('selo GeForce RTX', { cor: [0.46, 0.72, 0.02], metal: 0, rug: 0.4 }, selo2));
  const tela = [0, b0 + sh / 2, 0.3];
  return {
    partes,
    pontos: { porta, portaRede, energia, tela: [mT[0] * tela[0] + mT[4] * tela[1] + mT[8] * tela[2] + mT[12], mT[1] * tela[0] + mT[5] * tela[1] + mT[9] * tela[2] + mT[13], mT[2] * tela[0] + mT[6] * tela[1] + mT[10] * tela[2] + mT[14]] },
  };
}

// ---------------------------------------------------------------- Qualisys Camera Sync Unit
// Caixa preta de alumínio extrudado de 172 × 137 × 55 mm (largura × profundidade × altura; 900 g — ficha da
// Qualisys, PI_Camera_Sync_Unit.pdf), com uma tampa em cada ponta. Apoiada em z = 0, centrada; a largura fica em Y.
// Face −X = frente: 9 BNC — 6 entradas em 2 × 3 (TRIG NO, EVENT, SMPTE em cima; TRIG NC, SYNC, GENLOCK em baixo) e
// 3 saídas (MEAS. TIME, OUT 1, OUT 2) —, um LED por conector e o LED STATUS (manual do QTM, "Description of Camera
// Sync Unit"). Face +X = traseira: logotipo, trava Kensington e os dois RJ45 DATA/POWER da ligação em série.
// No tampo, "QUALISYS" (com os 4 pontos, um vermelho) e "CAMERA SYNC UNIT", lidos por quem está na frente (foto
// 1_equipamento/camera_sync_unit). A posição de cada conector e letreiro é ESTIMADA pelas figuras do manual e pela foto.
// pontos.entrada e pontos.saida = os dois RJ45 da traseira (cabo das câmeras e cabo do notebook).
// texto plano (um quadrilátero por traço) no plano XY, normal +Z; devolve a malha e a largura
function letreiroPlano(txt, h, traco = 0.16) {
  const g = G.vazia(), u = h / 6, t = traco * h;
  let x = 0;
  for (const ch of txt) {
    for (const [a, b, c, d] of FONTE[ch] || []) {
      const x0 = x + a * u, y0 = b * u, x1 = x + c * u, y1 = d * u, Lr = Math.hypot(x1 - x0, y1 - y0) || 1, dx = (x1 - x0) / Lr * t / 2, dy = (y1 - y0) / Lr * t / 2;
      const k = g.pos.length / 3;
      g.pos.push(x0 - dx + dy, y0 - dy - dx, 0, x1 + dx + dy, y1 + dy - dx, 0, x1 + dx - dy, y1 + dy + dx, 0, x0 - dx - dy, y0 - dy + dx, 0);
      for (let i = 0; i < 4; i++) g.nor.push(0, 0, 1);
      g.idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
    }
    x += (ch === 'I' ? 2.6 : 5.6) * u;
  }
  return { g, larg: x - 1.6 * u };
}
function syncUnit(op = {}) {
  const A = op.comp || 137, B = op.larg || 172, H = op.alt || 55, et = 4;
  const caixa = G.vazia(), tampas = G.vazia(), bnc = G.vazia(), branco = G.vazia(), dots = G.vazia(), furos = G.vazia(), led = G.vazia();
  // corpo extrudado ao longo de X e as duas tampas, um pouco maiores, com um parafuso em cada canto
  const eixoX = [0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1]; // (x, y, z) local -> (Y, Z, X)
  G.juntar(caixa, T(G.caixaArred(B - 3, H - 2.5, A - 2 * et, 7, 3), M.trans(0, 0, H / 2), eixoX));
  for (const s of [-1, 1]) G.juntar(tampas, T(G.caixaArred(B, H, et, 8, 3), M.trans(s * (A / 2 - et / 2), 0, H / 2), eixoX));
  // coordenadas de painel: a = direita de quem olha a face, b = altura, c = para fora
  const face = (s) => [0, s, 0, 0, 0, 0, 1, 0, s, 0, 0, 0, s * A / 2, 0, 0, 1];
  const ret = (g, a0, b0, a1, b1, c = 0.25) => G.juntar(g, quadZ(a0, b0, a1, b1, c));
  const moldura = (g, a0, b0, a1, b1, e = 0.6) => { ret(g, a0, b0, a1, b0 + e); ret(g, a0, b1 - e, a1, b1); ret(g, a0, b0, a0 + e, b1); ret(g, a1 - e, b0, a1, b1); };
  const F = { bnc: G.vazia(), branco: G.vazia(), led: G.vazia(), furos: G.vazia(), dots: G.vazia() }, R = { bnc: G.vazia(), branco: G.vazia(), led: G.vazia(), furos: G.vazia(), dots: G.vazia() };
  for (const P2 of [F, R]) for (const a of [-B / 2 + 7, B / 2 - 7]) for (const b of [7, H - 7]) G.juntar(P2.bnc, T(G.disco(2.6, 0.3, 10), M.trans(a, b, 0)));
  // ---- frente: BNC (porca, corpo com os dois pinos da baioneta, isolador branco), LEDs e molduras dos grupos
  const umBNC = G.juntar(G.revolucao([[7.2, 0], [7.2, 2.5], [4.9, 2.5], [4.9, 12], [0, 12]], 10), G.barra([-6.3, 0, 8.5], [6.3, 0, 8.5], 1, 6));
  const conectores = [...[-56.3, -33.8, -11.3].flatMap((a) => [[a, 38.5, 9.5], [a, 15, 9.5]]), ...[20.2, 42.2, 64.3].map((a) => [a, 24, 11])]; // [a, b, recuo do LED]
  for (const [a, b, da] of conectores) {
    G.juntar(F.bnc, T(umBNC, M.trans(a, b, 0)));
    G.juntar(F.branco, T(G.disco(3.3, 12.1, 10), M.trans(a, b, 0)));
    G.juntar(F.led, T(G.disco(1.2, 0.3, 8), M.trans(a - da, b + 11.5, 0)));
    ret(F.branco, a - da + 3, b + 11, a - da + 3 + (da > 10 ? 10 : 12), b + 12);                       // legenda (TRIG NO, EVENT…)
  }
  moldura(F.branco, -73.5, 3.5, 0.5, 51.5); moldura(F.branco, 3.5, 3.5, 74.5, 51.5);
  ret(F.led, 63.5, 7.5, 68.5, 10.5, 0.3); ret(F.branco, 50, 8.5, 60, 9.5);                             // LED STATUS e a legenda
  // ---- traseira: logotipo, trava Kensington e os dois RJ45 com os LEDs de link
  const lq = letreiroPlano('QUALISYS', 6.2, 0.2), lc = letreiroPlano('CAMERA SYNC UNIT', 2.7, 0.17), uq = 6.2 / 6;
  G.juntar(R.branco, T(lq.g, M.trans(-64, 36, 0.25)), T(lc.g, M.trans(-64, 30, 0.25)));
  [23.2, 27, 32.6, 38.2].forEach((x, i) => G.juntar(i ? R.branco : R.dots, T(G.disco(0.8, 0.25, 8), M.trans(-64 + x * uq, 36 + 7.9, 0))));
  ret(R.furos, -50, 10.5, -43, 13.5); ret(R.branco, -58, 10, -55, 14);
  const rj = [27, 55];
  for (const a of rj) {
    ret(R.bnc, a - 8.8, 25.5, a + 8.8, 40.5, 0.2); ret(R.furos, a - 7.8, 26.5, a + 7.8, 38, 0.3); ret(R.furos, a - 3, 38, a + 3, 39.6, 0.3);
    ret(R.led, a - 7.6, 38.2, a - 5, 39.8, 0.35); ret(R.led, a + 5, 38.2, a + 7.6, 39.8, 0.35);
  }
  moldura(R.branco, 13.5, 20, 68.5, 45); ret(R.branco, 30, 17, 52, 18);                                // moldura e "DATA / POWER"
  for (const [P2, s] of [[F, -1], [R, 1]]) { const m = face(s);
    G.juntar(bnc, G.transformar(P2.bnc, m)); G.juntar(branco, G.transformar(P2.branco, m)); G.juntar(led, G.transformar(P2.led, m));
    G.juntar(furos, G.transformar(P2.furos, m)); G.juntar(dots, G.transformar(P2.dots, m)); }
  // ---- tampo: "QUALISYS" com os 4 pontos sobre "ISYS" (o primeiro vermelho) e "CAMERA SYNC UNIT", lidos da frente
  const l1 = letreiroPlano('QUALISYS', 12, 0.2), l2 = letreiroPlano('CAMERA SYNC UNIT', 5.6, 0.17), zt = H - 1.25 + 0.3;
  const tampo = (l, x) => T(l.g, M.trans(x, l.larg / 2, zt), M.rotZ(-Math.PI / 2));
  G.juntar(branco, tampo(l1, 3), tampo(l2, -8.5));
  [23.2, 27, 32.6, 38.2].forEach((x, i) => G.juntar(i ? branco : dots, T(G.disco(1.5, zt, 10), M.trans(3 + 15.5, l1.larg / 2 - x * 2, 0))));
  const pR = (a, b) => [A / 2, a, b];
  return {
    partes: [P('caixa', matE('plasticoPreto', { cor: [0.05, 0.05, 0.055], metal: 0.35, rug: 0.5 }), caixa), P('tampas', matE('plasticoPreto', { cor: [0.04, 0.04, 0.045], metal: 0.3, rug: 0.6 }), tampas),
      P('BNC e blindagens', matE('cromado', { cor: [0.78, 0.78, 0.79], rug: 0.3 }), bnc), P('letreiros e isoladores', matE('textoClaro'), branco),
      P('portas', matE('plasticoPreto', { cor: [0.01, 0.01, 0.01] }), furos), P('ponto vermelho do logo', { cor: [0.85, 0.16, 0.12], metal: 0, rug: 0.5 }, dots),
      P('LEDs', { cor: [0.2, 0.9, 0.3], metal: 0, rug: 0.3, emissivo: [0.1, 0.6, 0.2] }, led)],
    pontos: { entrada: pR(rj[0], 32), saida: pR(rj[1], 32) },
  };
}

// ---------------------------------------------------------------- aquisição das células: Lynx ADS1800
// Gabinete de alumínio extrudado preto de 35 × 140 × 205 mm (alt. × larg. × prof., brochura da Lynx), com molduras
// pretas arredondadas nas duas pontas. Apoiado em z = 0, centrado em XY, comprimento ao longo de X.
// Face −X = painel frontal branco: 8 canais em bornes verdes de 4 vias (E, +, −, blindagem) — 1 a 4 em cima e 5 a 8
// em baixo, o canal 1 do lado +Y —, um bloco auxiliar de 8 vias (−V +V ⏚ A B R +S −S), "ADS1800", o LED ACT e o
// logo da LYNX. Os fios entram nos bornes por baixo (bornes deitados, parafusos virados para a frente).
// Face +X = painel traseiro: terra, entrada da fonte (11–30 VCC), dois LEDs, botão SW, conector de E/S de 12 vias,
// SYNC e a rede (LAN, RJ45).
// pontos.entradas = [canal 6, canal 7] (meio da boca dos bornes, por baixo); pontos.terminais = os 4 bornes de cada
// um ([E, +, −, blindagem]); pontos.saida = RJ45 da rede (face +X); pontos.alimentacao = entrada da fonte (face +X);
// pontos.frente = direção para fora do painel dos bornes (unitário).
function baseCelulas(op = {}) {
  const A = op.comp || 205, B = op.larg || 140, H = op.alt || 35, em = 9; // em = espessura das molduras das pontas
  const corpo = G.vazia(), mold = G.vazia(), painel = G.vazia(), borne = G.vazia(), paraf = G.vazia(), escuro = G.vazia(), tarja = G.vazia(), txt = G.vazia(), azul = G.vazia(),
    brancoLogo = G.vazia(), preto = G.vazia(), metal = G.vazia(), ledV = G.vazia(), ledAm = G.vazia(), eti = G.vazia(), barras = G.vazia();
  // perfil extrudado ao longo de X: cantos arredondados, aletas nas laterais e ressaltos nas bordas do tampo
  const eixoX = [0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1]; // (x, y, z) local -> (Y, Z, X)
  const Lc = A - 2 * em + 2, Bc = B - 6, z0 = 1, z1 = H - 1.5;
  G.juntar(corpo, T(G.caixaArred(Bc, z1 - z0, Lc, 4, 3), M.trans(0, 0, (z0 + z1) / 2), eixoX));
  for (const s of [-1, 1]) {
    for (let k = 0; k < 5; k++) G.juntar(corpo, caixaEm(-Lc / 2, s * Bc / 2 - 0.6, 7 + k * 5.2 - 0.9, Lc / 2, s * Bc / 2 + 1.1, 7 + k * 5.2 + 0.9));
    G.juntar(corpo, caixaEm(-Lc / 2, Math.min(s * (Bc / 2 - 3), s * (Bc / 2 - 12)), z1 - 0.5, Lc / 2, Math.max(s * (Bc / 2 - 3), s * (Bc / 2 - 12)), z1 + 1));
  }
  // etiquetas brancas sobre o tampo (patrimônio com código de barras perto do fundo; outra perto da frente)
  G.juntar(eti, caixaEm(A / 2 - 78, -8, z1, A / 2 - 42, 30, z1 + 0.25), caixaEm(-A / 2 + 30, 28, z1, -A / 2 + 48, 52, z1 + 0.25));
  for (let k = 0; k < 9; k++) G.juntar(barras, quadZ(A / 2 - 62, -4 + k * 3.4, A / 2 - 50, -4 + k * 3.4 + (k % 3 ? 1.2 : 2), z1 + 0.45));
  // ---- as duas pontas, em coordenadas do painel: a = direita de quem olha o painel, b = para cima, c = para fora
  // (c = 0 é a face da moldura; a chapa do painel fica 2 mm para dentro)
  const face = (s) => [0, s, 0, 0, 0, 0, 1, 0, s, 0, 0, 0, s * A / 2, 0, 0, 1]; // s = −1: frente (face −X); +1: traseira (face +X)
  const rc = 9, le = 10, cp = -1.6, ai = B / 2 - le; // raio dos cantos, largura das "orelhas", face da chapa, meia-largura da chapa
  const arco = (cx, cy, a0) => Array.from({ length: 7 }, (_, k) => [cx + rc * Math.cos(a0 + Math.PI / 2 * k / 6), cy + rc * Math.sin(a0 + Math.PI / 2 * k / 6)]);
  const orelhaD = [[ai, 0], ...arco(B / 2 - rc, rc, -Math.PI / 2), ...arco(B / 2 - rc, H - rc, 0), [ai, H]];
  const orelhaE = orelhaD.map(([a, b]) => [-a, b]).reverse();
  const moldura = G.juntar(G.vazia(), T(G.caixaArred(B, H, em - 2, rc, 6), M.trans(0, H / 2, -2 - (em - 2) / 2)), G.extrusao(orelhaD, -2, 0), G.extrusao(orelhaE, -2, 0),
    caixaEm(-ai, 0, -2, ai, 3, 0), caixaEm(-ai, H - 3, -2, ai, H, 0));
  const chapa = caixaEm(-ai, 3, -2, ai, H - 3, cp);
  const tampas = G.juntar(G.vazia(), T(G.cilindro(3.6, 0, 0.5, 18), M.trans(B / 2 - le / 2 - 0.5, H / 2, 0)), T(G.cilindro(3.6, 0, 0.5, 18), M.trans(-B / 2 + le / 2 + 0.5, H / 2, 0)));
  for (const s of [-1, 1]) { G.juntar(mold, G.transformar(moldura, face(s))); G.juntar(painel, G.transformar(chapa, face(s))); G.juntar(preto, G.transformar(tampas, face(s))); }
  // ---- painel frontal
  const F = { borne: G.vazia(), paraf: G.vazia(), escuro: G.vazia(), tarja: G.vazia(), txt: G.vazia(), azul: G.vazia(), branco: G.vazia(), preto: G.vazia() };
  const passo = 3.81, wb = 17.1, pb = 17.3, aC = -51, zInf = 6, zSup = 16.4, hBorne = 10, aAux = 22.8;
  const letra = (g, s, a, b, h, tr = 0.17) => { const l = letreiro(s, h, 0.25, tr); G.juntar(g, T(l.g, M.trans(a - l.larg / 2, b, cp + 0.1))); };
  // bloco de n vias começando em a0, base em zb: corpo com os parafusos na frente e, em baixo, o degrau das bocas dos fios
  const bloco = (a0, zb, n, larg) => {
    G.juntar(F.borne, caixaEm(a0, zb + 3.6, cp, a0 + larg, zb + hBorne, 7.4), caixaEm(a0, zb, cp, a0 + larg, zb + 3.6, 8.8));
    const ps = [];
    for (let k = 0; k < n; k++) {
      const a = a0 + larg / 2 + (k - (n - 1) / 2) * passo, ang = (k * 2.4 + a0 * 0.37 + zb) % Math.PI;
      G.juntar(F.paraf, T(G.cilindro(1.45, 7.4, 7.65, 10), M.trans(a, zb + 6.9, 0)));
      G.juntar(F.escuro, T(G.caixa(2.5, 0.45, 0.3), M.trans(a, zb + 6.9, 7.7), M.rotZ(ang)), caixaEm(a - 1.1, zb + 0.9, 8.8, a + 1.1, zb + 2.7, 8.95));
      ps.push([a, zb, 5]);
    }
    return ps;
  };
  const tarjaTxt = (a0, a1, b0, b1, itens, h) => { // tarja cinza com as legendas claras
    G.juntar(F.tarja, caixaEm(a0, b0, cp, a1, b1, cp + 0.15));
    for (const [s, a] of itens) letra(F.txt, s, a, (b0 + b1 - h) / 2, h);
  };
  const terminais = [];
  for (let lin = 0; lin < 2; lin++) for (let k = 0; k < 4; k++) {
    const a0 = aC + k * pb, zb = lin ? zInf : zSup, ps = bloco(a0, zb, 4, wb), canal = lin * 4 + k + 1;
    const [b0, b1] = lin ? [3.5, 5.7] : [zSup + hBorne + 0.9, zSup + hBorne + 4.1];
    tarjaTxt(a0 + 0.9, a0 + wb - 0.9, b0, b1, ['E', '+', '-', '#'].map((s, i) => [s, ps[i][0]]), lin ? 1.7 : 2.3);
    if (canal === 6 || canal === 7) terminais.push(ps);
  }
  const psAux = bloco(aAux, zSup, 8, 33);
  tarjaTxt(aAux + 0.6, aAux + 32.4, zSup + hBorne + 0.9, zSup + hBorne + 4.1, ['-V', '+V', '#', 'A', 'B', 'R', '+S', '-S'].map((s, i) => [s, psAux[i][0]]), 1.9);
  for (const [s, a, zb] of [['1', aC - 3.3, zSup], ['5', aC - 3.3, zInf], ['4', aC + 4 * pb + 1.9, zSup], ['8', aC + 4 * pb + 1.9, zInf]]) tarjaTxt(a - 1.7, a + 1.7, zb + 2.8, zb + 7.2, [[s, a]], 2.6);
  // "ADS1800" (azul, inclinado), LED ACT, logo LYNX (disco azul com duas faixas brancas) e o furinho ao lado
  const lA = letreiro('ADS1800', 3, 0.25, 0.21);
  G.juntar(F.azul, T(lA.g, M.trans(24.6, 10.4, cp), [1, 0, 0, 0, 0.2, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
  tarjaTxt(45.4, 55, 9.9, 13.9, [['ACT', 51.3]], 2.1);
  G.juntar(F.preto, T(G.disco(1.05, cp + 0.3, 12), M.trans(47.2, 11.9, 0)), T(G.disco(0.45, cp + 0.15, 8), M.trans(22.4, 12, 0)));
  G.juntar(F.azul, T(G.disco(2.7, cp + 0.15, 20), M.trans(25.6, 6.3, 0)));
  G.juntar(F.branco, caixaEm(22.7, 5.9, cp, 28.5, 6.4, cp + 0.3), caixaEm(23, 4.7, cp, 28.2, 5.2, cp + 0.3));
  const lL = letreiro('LYNX', 2.6, 0.25, 0.2);
  G.juntar(F.azul, T(lL.g, M.trans(29.6, 4.9, cp), M.esc(1.3, 1, 1)));
  const mF = face(-1);
  G.juntar(borne, G.transformar(F.borne, mF)); G.juntar(paraf, G.transformar(F.paraf, mF)); G.juntar(escuro, G.transformar(F.escuro, mF)); G.juntar(tarja, G.transformar(F.tarja, mF));
  G.juntar(txt, G.transformar(F.txt, mF)); G.juntar(azul, G.transformar(F.azul, mF)); G.juntar(brancoLogo, G.transformar(F.branco, mF)); G.juntar(preto, G.transformar(F.preto, mF));
  // ---- painel traseiro (brochura): terra, fonte, 2 LEDs, SW, E/S de 12 vias, SYNC, LAN
  const R = { preto: G.vazia(), metal: G.vazia(), txt: G.vazia(), ledV: G.vazia(), ledAm: G.vazia() };
  const anel = (g, a, b, r, e = 0.3) => G.juntar(g, T(G.disco(r, cp + 0.15, 14, false, r - e), M.trans(a, b, 0)));
  const risco = (g, a0, b0, a1, b1, e = 0.3) => G.juntar(g, T(G.caixa(Math.hypot(a1 - a0, b1 - b0) + e, e, 0.3), M.trans((a0 + a1) / 2, (b0 + b1) / 2, cp), M.rotZ(Math.atan2(b1 - b0, a1 - a0))));
  // parafuso de terra (com o símbolo ao lado) e entrada da fonte (conector circular metálico com porca)
  G.juntar(R.metal, T(G.cilindro(3.6, cp, cp + 1.6, 16), M.trans(-48, 25.6, 0)), T(G.extrusao(hexa(6.3), cp, cp + 2), M.trans(-40, 15.3, 0)), T(G.cilindro(4.7, cp + 2, cp + 7.5, 18), M.trans(-40, 15.3, 0)));
  G.juntar(R.preto, T(G.disco(3.1, cp + 7.55, 14), M.trans(-40, 15.3, 0)), T(G.caixa(4.6, 0.7, 0.2), M.trans(-48, 25.6, cp + 1.7), M.rotZ(0.6)), T(G.caixa(4.6, 0.7, 0.2), M.trans(-48, 25.6, cp + 1.7), M.rotZ(0.6 + Math.PI / 2)));
  risco(R.txt, -56, 25.2, -52.6, 25.2); risco(R.txt, -54.3, 25.2, -54.3, 27.6); for (let k = 0; k < 3; k++) risco(R.txt, -55.6 + k * 1.2, 23.4, -54.8 + k * 1.2, 25.2);
  letra(R.txt, 'POWER IN', -52.5, 12.8, 1.2); letra(R.txt, '11-30VDC', -52.5, 10.9, 1.2); letra(R.txt, 'MAX 15W', -52.5, 9.0, 1.2);
  risco(R.txt, -56, 6, -52.5, 6); risco(R.txt, -49.5, 6, -46, 6); anel(R.txt, -51, 6, 1.5); G.juntar(R.txt, T(G.disco(0.6, cp + 0.15, 8), M.trans(-51, 6, 0)));
  // LEDs (acesos em verde nas fotos), com os ícones de ligado e de relógio em baixo; botão SW embutido
  for (const a of [-25, -19.8]) { G.juntar(R.ledV, T(G.cilindro(1.3, cp, cp + 0.5, 12), M.trans(a, 15.6, 0))); anel(R.txt, a, 10.6, 1.5); risco(R.txt, a, 10.6, a, a < -22 ? 12.4 : 11.7); }
  risco(R.txt, -19.8, 10.6, -18.9, 10.6);
  G.juntar(R.preto, T(G.disco(1.0, cp + 0.15, 10), M.trans(-12.2, 13.2, 0))); anel(R.txt, -12.2, 8.6, 1.5); letra(R.txt, 'SW', -12.2, 5.2, 1.1);
  // conector de E/S de 12 vias (2 × 6, com a trava em cima), "IOIO" e a numeração dos pinos
  G.juntar(R.preto, caixaEm(-8.4, 12, cp, 12.6, 18.7, cp + 1.2), caixaEm(0.2, 18.7, cp, 4.4, 21.4, cp + 1.2));
  for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) G.juntar(R.metal, quadZ(-7.4 + i * 3.4, 12.8 + j * 3, -5 + i * 3.4, 14.9 + j * 3, cp + 1.4));
  anel(R.txt, 2.3, 24.6, 1.2, 0.25); risco(R.txt, -0.6, 23.6, 5.2, 23.6); risco(R.txt, -0.6, 25.6, 5.2, 25.6); risco(R.txt, -0.6, 23.6, -0.6, 25.6); risco(R.txt, 5.2, 23.6, 5.2, 25.6);
  letra(R.txt, '12', -5.5, 19.9, 1.5); letra(R.txt, '7', 9.5, 19.9, 1.5); letra(R.txt, '6', -5.5, 9.3, 1.5); letra(R.txt, '1', 9.5, 9.3, 1.5);
  // SYNC (tomada modular preta) e LAN (RJ45 blindado com dois LEDs)
  G.juntar(R.preto, caixaEm(15.2, 12.8, cp, 28.8, 25.4, cp + 0.6), caixaEm(33.4, 14.6, cp + 0.9, 46.4, 22.4, cp + 1.1));
  G.juntar(R.metal, caixaEm(17.5, 14.6, cp + 0.6, 26.5, 22, cp + 0.8), caixaEm(31.5, 13.2, cp, 48.3, 25, cp + 0.9));
  letra(R.txt, 'SYNC', 19.5, 26.6, 1.7); for (const [a, b] of [[25.2, 27.6], [27.4, 29.3], [28.6, 27], [26.4, 29.9]]) anel(R.txt, a, b, 0.9, 0.2);
  letra(R.txt, 'LAN', 34.4, 26.4, 1.7); G.juntar(R.txt, caixaEm(40.2, 29.2, cp, 41.6, 30.4, cp + 0.15), caixaEm(37.6, 26.3, cp, 39, 27.5, cp + 0.15), caixaEm(42.8, 26.3, cp, 44.2, 27.5, cp + 0.15));
  risco(R.txt, 38.3, 28.3, 43.5, 28.3, 0.25); risco(R.txt, 40.9, 28.3, 40.9, 29.2, 0.25); risco(R.txt, 38.3, 27.5, 38.3, 28.3, 0.25); risco(R.txt, 43.5, 27.5, 43.5, 28.3, 0.25);
  G.juntar(R.ledV, caixaEm(32.6, 23, cp + 0.9, 34.8, 24.4, cp + 1.1)); G.juntar(R.ledAm, caixaEm(45, 23, cp + 0.9, 47.2, 24.4, cp + 1.1));
  risco(R.txt, 50.4, 14.4, 54.4, 14.4); risco(R.txt, 50.4, 14.4, 52.4, 17.8); risco(R.txt, 54.4, 14.4, 52.4, 17.8); risco(R.txt, 52.4, 15.4, 52.4, 16.6, 0.25); // triângulo de atenção
  for (const [a0, a1] of [[4, 11], [12, 25], [26, 37], [38, 42], [44.5, 46], [47, 55]]) risco(R.txt, a0, 7.2, a1, 7.2, 0.5);                                  // "Lynx Tecnologia Eletrônica Ltda. …"
  const mR = face(1);
  G.juntar(preto, G.transformar(R.preto, mR)); G.juntar(metal, G.transformar(R.metal, mR)); G.juntar(ledV, G.transformar(R.ledV, mR)); G.juntar(ledAm, G.transformar(R.ledAm, mR));
  const txtTras = G.transformar(R.txt, mR);
  const pF = (q) => [-A / 2 - q[2], -q[0], q[1]]; // ponto do painel frontal (a, b, c) -> local
  return {
    partes: [P('gabinete', matE('plasticoPreto', { cor: [0.045, 0.045, 0.05], metal: 0.6, rug: 0.42 }), corpo), P('molduras', matE('plasticoPreto', { cor: [0.05, 0.05, 0.055], rug: 0.6 }), mold),
      P('painéis', { cor: [0.90, 0.90, 0.89], metal: 0, rug: 0.5 }, painel), P('bornes', matE('verdeBorne', { cor: [0.36, 0.70, 0.44] }), borne), P('parafusos', { cor: [0.84, 0.84, 0.82], metal: 0.35, rug: 0.5 }, paraf),
      P('fendas e bocas', matE('plasticoPreto', { cor: [0.03, 0.05, 0.035] }), escuro), P('tarjas', { cor: [0.36, 0.38, 0.38], metal: 0, rug: 0.6 }, tarja), P('legendas', matE('textoClaro'), txt),
      P('ADS1800 e logo', { cor: [0.10, 0.24, 0.62], metal: 0, rug: 0.5 }, azul), P('faixas do logo', matE('textoClaro', { cor: [0.95, 0.95, 0.95] }), brancoLogo),
      P('conectores pretos', matE('plasticoPreto', { cor: [0.02, 0.02, 0.022] }), preto), P('conectores metálicos', matE('cromado', { cor: [0.72, 0.73, 0.74], rug: 0.35 }), metal),
      P('legendas de trás', matE('plasticoPreto', { cor: [0.08, 0.08, 0.09] }), txtTras), P('LEDs verdes', { cor: [0.2, 0.9, 0.3], metal: 0, rug: 0.3, emissivo: [0.1, 0.7, 0.2] }, ledV),
      P('LED âmbar', { cor: [0.8, 0.6, 0.1], metal: 0, rug: 0.3, emissivo: [0.3, 0.2, 0.02] }, ledAm), P('etiquetas', matE('textoClaro', { cor: [0.92, 0.92, 0.90] }), eti),
      P('código de barras', matE('plasticoPreto'), barras)],
    pontos: { entradas: terminais.map((ps) => pF([(ps[1][0] + ps[2][0]) / 2, ps[0][1], ps[0][2]])), terminais: terminais.map((ps) => ps.map(pF)),
      saida: [A / 2, 39.9, 19.1], alimentacao: [A / 2 + 6, -40, 15.3], frente: [-1, 0, 0] },
  };
}

// ---------------------------------------------------------------- bancada cinza dos computadores
// Mesa de tampo cinza-claro com os cantos arredondados e fita de borda escura, sobre dois pés-painel cinza (um em
// cada ponta, recuados) ligados por um painel traseiro alto e uma travessa na frente: por baixo fica aberta.
// op.comp (comprimento, X), op.larg (profundidade, Y; padrão 600), op.altura (850). Origem no chão, no centro;
// frente (lado do operador) em −Y. pontos.tampo = centro do tampo; pontos.vao = [mín, máx] do espaço livre por baixo.
function mesaApoio(op = {}) {
  const A = op.comp || 1000, B = op.larg || 600, H = op.altura || 850, et = 30, rc = Math.min(60, B / 5, A / 5);
  const tampo = G.vazia(), borda = G.vazia(), pes = G.vazia(), estr = G.vazia(), sap = G.vazia(), furos = G.vazia();
  G.juntar(borda, T(G.caixaArred(A, B, et - 0.8, rc, 8), M.trans(0, 0, H - 0.8 - (et - 0.8) / 2)));
  G.juntar(tampo, T(G.caixaArred(A - 2.4, B - 2.4, 0.8, rc - 1.2, 8), M.trans(0, 0, H - 0.4)));
  // pés-painel nas pontas (recuados da borda do tampo), com sapatas niveladoras e os furos de montagem à vista
  const ep = 28, xp = A / 2 - 75, yf = -B / 2 + 50, yt = B / 2 - 40, zc = H - et;
  for (const s of [-1, 1]) {
    G.juntar(pes, caixaEm(s * xp - ep / 2, yf, 12, s * xp + ep / 2, yt, zc));
    for (const y of [yf + 45, yt - 45]) G.juntar(sap, T(G.cilindro(16, 0, 6, 14), M.trans(s * xp, y, 0)), T(G.cilindro(5, 6, 12, 8, false), M.trans(s * xp, y, 0)));
    for (const [y, z] of [[yf + 120, zc - 300], [yt - 150, zc - 520]]) G.juntar(furos, T(G.disco(5, 0, 12), M.trans(s * (xp + ep / 2 + 0.3), y, z), M.rotY(s * Math.PI / 2)));
  }
  // painel traseiro (saia) e travessa metálica na frente, logo abaixo do tampo
  G.juntar(pes, caixaEm(-xp + ep / 2, yt - 60, zc - 330, xp - ep / 2, yt - 42, zc));
  G.juntar(estr, caixaEm(-xp + ep / 2, yf + 30, zc - 40, xp - ep / 2, yf + 55, zc));
  return {
    partes: [P('tampo', matE('cinzaChapa', { cor: [0.69, 0.70, 0.69], metal: 0.05, rug: 0.5 }), tampo), P('borda do tampo', matE('cinzaChapaEsc', { cor: [0.30, 0.31, 0.32], metal: 0, rug: 0.6 }), borda),
      P('pés e painel', matE('cinzaChapa', { cor: [0.62, 0.63, 0.63] }), pes), P('travessa', matE('cinzaChapaEsc', { cor: [0.42, 0.43, 0.44], metal: 0.4 }), estr),
      P('sapatas', matE('plasticoPreto'), sap), P('furos', matE('plasticoPreto', { cor: [0.03, 0.03, 0.03] }), furos)],
    pontos: { tampo: [0, 0, H], vao: [[-xp + ep / 2, yf, 0], [xp - ep / 2, yt - 60, zc - 40]] },
  };
}

// ---------------------------------------------------------------- cabos
// reamostra a polilinha com passo constante
function reamostrar(pts, passo) {
  const out = [pts[0]]; let resto = passo;
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1]; const b = pts[i];
    let d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    while (d >= resto) {
      const t = resto / d; a = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      out.push(a); d -= resto; resto = passo;
    }
    resto -= d;
  }
  const u = pts[pts.length - 1], v = out[out.length - 1];
  if (Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]) > passo * 0.2) out.push(u); else out[out.length - 1] = u;
  return out;
}
// quadro de transporte paralelo: para cada ponto, [t, u, w]
function quadros(pts) {
  const n = pts.length, Q = [];
  let ref = null;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const tl = Math.hypot(...t) || 1; t = t.map((v) => v / tl);
    if (!ref) ref = Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    let u = [ref[1] * t[2] - ref[2] * t[1], ref[2] * t[0] - ref[0] * t[2], ref[0] * t[1] - ref[1] * t[0]];
    const ul = Math.hypot(...u) || 1; u = u.map((v) => v / ul);
    const w = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
    ref = w; Q.push([t, u, w]);
  }
  return Q;
}
// cabo(pontos, op): op.raio (3,5), op.cor ([r,g,b]), op.ramais (rabichos nas pontas), op.conectores (RJ45 nas
// pontas; padrão = op.ramais), op.fios = n (n fios trançados + terra verde-amarelo), op.cores (cores dos fios),
// op.malha (com op.fios: malha de blindagem no lugar do terra, sem pontas de cobre).
function cabo(pontosIn, op = {}) {
  const raio = op.raio || 3.5, pts = reamostrar(pontosIn, op.passo || Math.max(8, raio * 4));
  const corCabo = op.cor ? { cor: op.cor, metal: 0, rug: 0.45 } : matE('caboPreto');
  const partes = [], n = pts.length;
  const ini = pts[0], fim = pts[n - 1];
  if (op.fios) {
    const nf = op.fios, cores = op.cores || [[0.75, 0.06, 0.05], [0.04, 0.04, 0.04], [0.85, 0.85, 0.85], [0.08, 0.40, 0.15], [0.10, 0.25, 0.70], [0.85, 0.75, 0.10]];
    const Q = quadros(pts), rf = op.raioFio || 1, R = rf * 1.35, passoH = op.passoTranca || 90;
    let s = 0; const sAcc = [0];
    for (let i = 1; i < n; i++) { s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]); sAcc.push(s); }
    const hel = (k, tot) => pts.map((p, i) => {
      const [, u, w] = Q[i], a = 2 * Math.PI * (sAcc[i] / passoH + k / tot);
      const fade = Math.min(1, sAcc[i] / 30, (s - sAcc[i]) / 30); // os fios se juntam nas pontas
      const c = Math.cos(a) * R * fade, sn = Math.sin(a) * R * fade;
      return [p[0] + u[0] * c + w[0] * sn, p[1] + u[1] * c + w[1] * sn, p[2] + u[2] * c + w[2] * sn];
    });
    for (let k = 0; k < nf; k++) partes.push(P('fio ' + (k + 1), { cor: cores[k % cores.length], metal: 0, rug: 0.4 }, G.tubo(hel(k, nf + 1), rf, 5)));
    // op.malha: em vez do fio terra, a malha de blindagem do cabo (trança de cobre estanhado), como nas células
    if (op.malha) {
      partes.push(P('malha', { cor: [0.62, 0.63, 0.65], metal: 0.8, rug: 0.45 }, G.tubo(hel(nf, nf + 1), rf * 1.15, 5)));
      return { partes, pontos: { inicio: ini, fim } };
    }
    // terra: verde com faixas amarelas (trechos alternados)
    const ht = hel(nf, nf + 1), verde = G.vazia(), amarelo = G.vazia(), tr = 4;
    for (let i = 0; i < n - 1; i += tr) {
      const seg = ht.slice(i, Math.min(n, i + tr + 1));
      if (seg.length >= 2) G.juntar((i / tr) % 2 ? amarelo : verde, G.tubo(seg, rf, 5, false));
    }
    partes.push(P('terra (verde)', { cor: [0.10, 0.50, 0.15], metal: 0, rug: 0.4 }, verde), P('terra (amarelo)', { cor: [0.90, 0.80, 0.10], metal: 0, rug: 0.4 }, amarelo));
    // pontas desencapadas (cobre)
    const cobre = G.vazia();
    for (const p of [ini, fim]) G.juntar(cobre, T(G.esfera(R + rf, 8, 6), M.trans(...p)));
    partes.push(P('pontas', matE('dourado', { cor: [0.80, 0.45, 0.25] }), cobre));
    return { partes, pontos: { inicio: ini, fim } };
  }
  const corpo = G.tubo(pts, raio, 8);
  const pontos = { inicio: ini, fim };
  const conect = op.conectores !== undefined ? op.conectores : !!op.ramais;
  const plug = G.vazia(), capa = G.vazia(), cont = G.vazia();
  const Q = quadros(pts);
  const ponta = (idx, sinal) => { // sinal: +1 = início (cabo segue para +t), −1 = fim
    const [t, u] = Q[idx], d = t.map((v) => -v * sinal), p = pts[idx];
    return { p, d, u };
  };
  for (const [idx, sinal, nome] of [[0, 1, 'inicio'], [n - 1, -1, 'fim']]) {
    const { p, d, u } = ponta(idx, sinal);
    if (op.ramais) {
      // dois rabichos laterais curtos saindo a ~60 mm da ponta, abrindo em leque
      const k0 = Math.min(n - 1, Math.max(0, idx + sinal * Math.round(60 / (op.passo || Math.max(8, raio * 4)))));
      const base = pts[k0], [tt, uu, ww] = Q[k0];
      for (const s of [-1, 1]) {
        const dir = [0, 1, 2].map((a) => -tt[a] * sinal * 0.55 + (uu[a] * s * 0.8 + ww[a] * 0.2));
        const rab = []; for (let j = 0; j <= 10; j++) { const L = 120 * j / 10, cur = 0.25 * (j / 10) ** 2;
          rab.push([0, 1, 2].map((a) => base[a] + dir[a] * L + d[a] * L * cur)); }
        G.juntar(corpo, G.tubo(rab, 2, 6));
        pontos[nome + (s < 0 ? 'RamalA' : 'RamalB')] = rab[10];
      }
    }
    if (conect) {
      const r = rj45();
      // o conector fica além da ponta, apontando na direção d (saindo do cabo)
      const m = M.cadeia([u[0], u[1], u[2], 0, ...(() => { const y = [u[1] * d[2] - u[2] * d[1], u[2] * d[0] - u[0] * d[2], u[0] * d[1] - u[1] * d[0]]; return [y[0], y[1], y[2], 0]; })(),
        -d[0], -d[1], -d[2], 0, p[0] + d[0] * r.L, p[1] + d[1] * r.L, p[2] + d[2] * r.L, 1]);
      G.juntar(plug, G.transformar(r.corpo, m)); G.juntar(capa, G.transformar(r.capa, m)); G.juntar(cont, G.transformar(r.contatos, m));
      pontos[nome] = [p[0] + d[0] * r.L, p[1] + d[1] * r.L, p[2] + d[2] * r.L];
    }
  }
  partes.push(P('cabo', corCabo, corpo));
  if (plug.pos.length) partes.push(P('RJ45', matE('conectorTransp'), plug), P('capas', matE('caboPreto', { cor: [0.12, 0.12, 0.12] }), capa), P('contatos', matE('dourado'), cont));
  return { partes, pontos };
}

Object.assign(window.LAB_MODELOS, { suporte, postePeso, perfilParede, corrente, celulaCarga, lFrame, wand, marcador, mesaPallet, caixasPapelao, tabuasEncostadas,
  notebook, syncUnit, baseCelulas, mesaApoio, cabo, noBarbante, presilhaMarcador });
// para modelo_entorno.js (mesmo estilo: materiais, letreiro e helpers)
window.LAB_MODELOS._util = { MAT, mat, caixaEm, letreiro, rng, hexa, poligono, estadio, anelTubo, P, T };
})();
