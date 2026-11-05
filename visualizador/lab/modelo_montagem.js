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
  acoEnferrujado: { cor: [0.27, 0.255, 0.245], metal: 0.6, rug: 0.7 },
  ferrugem: { cor: [0.33, 0.255, 0.20], metal: 0.25, rug: 0.9 },
  acoEscuro: { cor: [0.16, 0.155, 0.15], metal: 0.7, rug: 0.55 },
  acoBarra: { cor: [0.42, 0.40, 0.38], metal: 0.8, rug: 0.55 },
  galvanizado: { cor: [0.78, 0.80, 0.82], metal: 1.0, rug: 0.3 },
  zincado: { cor: [0.70, 0.71, 0.72], metal: 1.0, rug: 0.4 },
  laranja: { cor: [0.66, 0.42, 0.16], metal: 0.1, rug: 0.75 },
  laranjaSujo: { cor: [0.40, 0.24, 0.12], metal: 0.15, rug: 0.9 },
  fitaPreta: { cor: [0.05, 0.05, 0.05], metal: 0.0, rug: 0.45 },
  concreto: { cor: [0.47, 0.46, 0.43], metal: 0.0, rug: 0.95 },
  aroBorracha: { cor: [0.20, 0.15, 0.12], metal: 0.3, rug: 0.85 },
  aluminio: { cor: [0.74, 0.76, 0.78], metal: 0.9, rug: 0.4 },
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
// olhal (parafuso com anel): anel no plano XZ com centro em z = hAnel, haste de z0 a base do anel
function olhal(rAnel, fio, z0, hAnel, rosca = true) {
  const g = G.transformar(G.toro(rAnel, fio, 20, 8), M.mul(M.trans(0, 0, hAnel), M.rotX(Math.PI / 2)));
  G.juntar(g, G.cilindro(fio * 1.25, hAnel - rAnel - fio * 2.2, hAnel - rAnel + fio * 0.3, 12));  // colar
  G.juntar(g, G.cilindro(fio * 0.85, z0, hAnel - rAnel - fio * 2, 10, true));                      // haste
  if (rosca) G.juntar(g, T(G.extrusao(hexa(fio * 1.7), 0, fio * 1.4), M.trans(0, 0, z0 + fio * 0.2))); // porca
  return g;
}
const hexa = (r) => Array.from({ length: 6 }, (_, k) => [r * Math.cos(Math.PI / 3 * k + Math.PI / 6), r * Math.sin(Math.PI / 3 * k + Math.PI / 6)]);
const poligono = (n, r, a0 = 0) => Array.from({ length: n }, (_, k) => [r * Math.cos(a0 + 2 * Math.PI * k / n), r * Math.sin(a0 + 2 * Math.PI * k / n)]);

// gerador pseudoaleatório com semente (manchas de ferrugem sempre iguais)
function rng(s) { return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// manchas finas (decalques) sobre uma face horizontal z, dentro do retângulo
function manchas(n, x0, y0, x1, y1, z, rMin, rMax, sem) {
  const r = rng(sem), g = G.vazia();
  for (let i = 0; i < n; i++) {
    const rr = rMin + (rMax - rMin) * r(), x = x0 + rr + (x1 - x0 - 2 * rr) * r(), y = y0 + rr + (y1 - y0 - 2 * rr) * r();
    const sx = 0.6 + 0.8 * r();
    G.juntar(g, T(G.disco(rr, 0, 9), M.trans(x, y, z), M.rotZ(r() * 6.28), M.esc(sx, 1 / sx, 1)));
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
// Origem no centro da base, no chão. Tampo quadrado de chapa grossa, 4 pernas redondas,
// quadro de cantoneiras sob o tampo e chapa de base. pontos.amarracao = furo na borda +X do tampo.
// Grampo em C (sargento) prendendo a borda do tampo: no plano XZ local, com a abertura voltada para −X
// (para dentro do tampo) e o dorso em +X, fora da chapa. Do braço de baixo pende um gancho e um
// esticador; 'canto' = olhal de baixo do esticador (x local, 0, z).
function grampo(H, e) {
  const corpo = G.vazia(), est = G.vazia(), xd = 34; // dorso a 34 mm da borda (para fora)
  const zt = H, zb = H - e;
  G.juntar(corpo, caixaEm(xd - 8, -7, zb - 62, xd + 8, 7, zt + 52));         // dorso
  G.juntar(corpo, caixaEm(-40, -7, zt + 36, xd, 7, zt + 52));               // braço de cima
  G.juntar(corpo, caixaEm(-36, -9, zt, -20, 9, zt + 36));                  // mandíbula fixa
  G.juntar(corpo, caixaEm(-40, -8, zb - 62, xd, 8, zb - 46));               // braço de baixo
  G.juntar(corpo, G.barra([-28, 0, zb - 110], [-28, 0, zb - 6], 5, 12));    // fuso
  G.juntar(corpo, T(G.cilindro(10, 0, 6, 16), M.trans(-28, 0, zb - 6)));   // sapata
  G.juntar(corpo, G.barra([-58, 0, zb - 106], [2, 0, zb - 106], 3.5, 10));  // manípulo em T
  // gancho saindo do braço de baixo, junto ao dorso, e esticador
  const zg = zb - 62;
  G.juntar(est, T(G.toro(13, 3, 18, 6), M.trans(xd, 0, zg - 14), M.rotX(Math.PI / 2)));
  const z1 = zg - 30, z2 = z1 - 120;
  G.juntar(est, T(G.toro(9, 3, 16, 6), M.trans(xd, 0, z1 - 6), M.rotY(0), M.rotX(0)));   // olhal de cima (gira 90°)
  G.juntar(est, G.barra([xd, 0, z1 - 15], [xd, 0, z1 - 40], 3.5, 10));
  for (const s of [-1, 1]) G.juntar(est, G.barra([xd + s * 9, 0, z1 - 38], [xd + s * 9, 0, z2 + 38], 3, 10)); // corpo aberto
  G.juntar(est, G.barra([xd - 11, 0, z1 - 38], [xd + 11, 0, z1 - 38], 4, 10), G.barra([xd - 11, 0, z2 + 38], [xd + 11, 0, z2 + 38], 4, 10));
  G.juntar(est, G.barra([xd, 0, z2 + 40], [xd, 0, z2 + 12], 3.5, 10));
  G.juntar(est, T(G.toro(9, 3, 16, 6), M.trans(xd, 0, z2), M.rotX(Math.PI / 2)));      // olhal de baixo
  return { corpo, esticador: est, canto: [xd, 0, z2 - 9] };
}

function suporte(op = {}) {
  const H = op.altura || 1100, L = op.lado || 400, e = op.espTampo || 25, eb = 28, rp = 15;
  const ip = L / 2 - 22; // posição das pernas (quase nos cantos)
  const aco = G.vazia(), escuro = G.vazia(), ferr = G.vazia(), barras = G.vazia();
  // tampo e base (a base é um pouco maior que o tampo)
  G.juntar(aco, caixaEm(-L / 2, -L / 2, H - e, L / 2, L / 2, H));
  G.juntar(aco, caixaEm(-L / 2 - 20, -L / 2 - 20, 0, L / 2 + 20, L / 2 + 20, eb));
  // pernas
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    G.juntar(barras, G.barra([sx * ip, sy * ip, eb], [sx * ip, sy * ip, H - e], rp, 16, false));
    // porca/sextavado no topo das pernas (aparecem no tampo)
    G.juntar(escuro, T(G.extrusao(hexa(19), 0, 14), M.trans(sx * ip, sy * ip, H)));
    G.juntar(escuro, T(G.extrusao(hexa(17), 0, 10), M.trans(sx * ip, sy * ip, eb)));
  }
  // furos no tampo (anéis escuros simulando furo) e no da base; parafusos perto dos cantos
  const furos = [[0, 0, 20], [L / 2 - 70, 0, 12], [-90, 110, 10], [80, -120, 10], [-L / 2 + 70, -40, 12]];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    G.juntar(escuro, T(G.cilindro(11, 0, 9, 16), M.trans(sx * (ip - 45), sy * (ip - 45), H)));
    G.juntar(escuro, T(G.cilindro(10, 0, 8, 16), M.trans(sx * (ip - 40), sy * (ip + 5), eb)));
  }
  for (const [x, y, r] of furos) {
    G.juntar(escuro, T(G.cilindro(r, -e + 1, 0.6, 18, false), M.trans(x, y, H)));
    G.juntar(escuro, G.disco(r, H - e + 2, 18, false));
  }
  for (const [x, y] of [[90, 90], [-100, 60], [40, -110]]) G.juntar(escuro, G.disco(9, eb + 0.5, 14));
  // ferrugem
  G.juntar(ferr, manchas(70, -L / 2, -L / 2, L / 2, L / 2, H + 0.4, 3, 16, 7));
  G.juntar(ferr, manchas(50, -L / 2 - 10, -L / 2 - 10, L / 2 + 10, L / 2 + 10, eb + 0.4, 4, 20, 11));
  G.juntar(ferr, manchasVert(10, 'x', 1, L / 2 + 0.4, -L / 2, L / 2, H - e, H, 3, 10, 3));
  G.juntar(ferr, manchasVert(10, 'y', -1, -L / 2 - 0.4, -L / 2, L / 2, H - e, H, 3, 10, 5));
  G.juntar(ferr, manchasVert(10, 'x', -1, -L / 2 - 0.4, -L / 2, L / 2, H - e, H, 3, 10, 9));
  G.juntar(ferr, manchasVert(10, 'y', 1, L / 2 + 0.4, -L / 2, L / 2, H - e, H, 3, 10, 13));
  // barbante amarrado na borda (+X) descendo até o ponto de amarração da corrente
  const xb = L / 2 - 70, xa = L / 2 + 25, za = H - e - 160;
  const barb = G.vazia();
  if (op.barbante) G.juntar(barb, G.tubo([[xb + 12, 0, H + 0.8], [L / 2 - 2, 0, H + 1.2], [L / 2 + 1.2, 0, H - 3], [L / 2 + 1.2, 0, H - e + 2], [L / 2 - 3, 0, H - e - 1.2], [xb + 14, 0, H - e - 1.2]], 0.9, 6));
  if (op.barbante) G.juntar(barb, G.tubo([[L / 2 + 1.2, 2, H - e + 4], [L / 2 + 8, 3, H - e - 50], [xa - 4, 2, za + 30], [xa, 0, za + 4]], 0.8, 6));
  if (op.barbante) G.juntar(barb, G.tubo([[L / 2 + 1.2, -2, H - e + 6], [L / 2 + 16, -4, H - e - 60], [xa + 3, -2, za + 26], [xa, 0, za + 4]], 0.8, 6));
  // grampo em C no canto do tampo (op.cantoGrampo = [sx, sy], padrão [+1, +1]) e esticador pendurado
  const [gx, gy] = op.cantoGrampo || [1, 1];
  const gr = grampo(H, e);
  const ang = Math.atan2(gy, gx), cx = gx * (L / 2 - 18), cy = gy * (L / 2 - 18);
  const trG = M.cadeia(M.trans(cx, cy, 0), M.rotZ(ang));
  const partes = [P('aço', mat('acoEnferrujado'), aco), P('pernas', mat('acoBarra'), barras), P('furos e porcas', mat('acoEscuro'), escuro), P('ferrugem', mat('ferrugem'), ferr)];
  if (barb.pos.length) partes.push(P('barbante', mat('barbante'), barb));
  if (op.grampo !== false) {
    partes.push(P('grampo', mat('zincado', { cor: [0.62, 0.60, 0.55] }), G.transformar(gr.corpo, trG)), P('esticador', mat('galvanizado'), G.transformar(gr.esticador, trG)));
  }
  const c = gr.canto, canto = [cx + c[0] * Math.cos(ang), cy + c[0] * Math.sin(ang), c[2]];
  return { partes, pontos: { amarracao: [xa, 0, za], topo: [0, 0, H], canto } };
}

// ---------------------------------------------------------------- poste listrado com base de concreto
// Origem no centro da base, no chão. pontos.argola = centro da argola de cima (onde a corrente passa).
function postePeso(op = {}) {
  const H = op.altura || 1000, Rb = op.raioBase || 175, hb = op.alturaBase || 120, rt = op.raioTubo || 26;
  const conc = G.vazia(), aro = G.vazia(), lar = G.vazia(), sujo = G.vazia(), fita = G.vazia(), aco = G.vazia();
  // base: dois discos (aro metálico preto/enferrujado) com concreto aparente no topo
  G.juntar(aro, G.revolucao([[0, 0], [Rb - 6, 0], [Rb, 6], [Rb, hb * 0.48], [Rb - 4, hb * 0.5], [Rb, hb * 0.52], [Rb, hb - 6], [Rb - 3, hb]], 40));
  G.juntar(aro, G.disco(Rb, 0.01, 40, true));
  const topo = G.revolucao([[Rb - 3, hb], [Rb - 14, hb + 3], [Rb * 0.6, hb + 7], [rt + 16, hb + 12], [rt + 2, hb + 16]], 40, { quina: 80 });
  G.juntar(conc, topo);
  // pedrinhas do concreto
  const r = rng(21);
  for (let i = 0; i < 60; i++) {
    const a = r() * 6.28, d = rt + 20 + r() * (Rb - rt - 40), s = 2 + r() * 4;
    G.juntar(aro, T(G.esfera(s, 6, 4), M.trans(d * Math.cos(a), d * Math.sin(a), hb + 9 - (d - rt) / (Rb - rt) * 6), M.esc(1, 1, 0.45)));
  }
  // tubo
  G.juntar(lar, G.cilindro(rt, hb, H - 40, 24, false));
  // topo cortado torto + boca
  G.juntar(sujo, G.revolucao([[rt, H - 40], [rt, H], [rt - 3, H]], 24, { quina: 10 }));
  G.juntar(sujo, G.disco(rt - 3, H - 30, 24));
  // faixas de fita preta (alturas como na foto)
  const faixas = [[0.32, 0.36], [0.55, 0.60], [0.68, 0.72], [0.82, 0.86]];
  for (const [a, b] of faixas) G.juntar(fita, G.cilindro(rt + 0.8, hb + (H - hb) * a, hb + (H - hb) * b, 24, false));
  // sujeira/ferrugem no tubo (manchas cilíndricas finas)
  for (let i = 0; i < 26; i++) {
    const z = hb + 30 + r() * (H - hb - 80), a = r() * 6.28, sz = 8 + r() * 40, sa = 0.3 + r() * 0.8;
    G.juntar(sujo, G.revolucao([[rt + 0.4, z], [rt + 0.4, z + sz]], 8, { a0: a, a1: a + sa }));
  }
  // duas argolas soldadas no topo, viradas para os lados
  const ra = 30, fa = 3.2;
  const arg = (s) => T(G.toro(ra, fa, 28, 8), M.trans(s * (rt + ra - 4), 0, H - 28), M.rotX(Math.PI / 2), M.rotY(s * 0.25));
  G.juntar(aco, arg(1), arg(-1));
  return {
    partes: [P('concreto', mat('concreto'), conc), P('aro da base', mat('aroBorracha'), aro), P('tubo laranja', mat('laranja'), lar),
      P('sujeira', mat('laranjaSujo'), sujo), P('fita preta', mat('fitaPreta'), fita), P('argolas', mat('acoEscuro'), aco)],
    pontos: { argola: [rt + ra - 4 + ra * 0.75, 0, H - 28 - ra * 0.6], argolaOposta: [-(rt + ra - 4 + ra * 0.75), 0, H - 28 - ra * 0.6], topo: [0, 0, H] },
  };
}

// ---------------------------------------------------------------- perfil estrutural de alumínio
// Seção 40x40 com canais em T (poligonal simplificada): núcleo + 4 abas formando os canais.
function perfil40(L, a = 40) {
  // perfil ao longo de Z, de 0 a L, centrado em XY
  const g = G.vazia(), h = a / 2, c = a * 0.2, ab = a * 0.2; // c = meia-abertura do canal, ab = esp. das abas
  // 4 cantoneiras dos cantos
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    G.juntar(g, caixaEm(Math.min(sx * h, sx * c), Math.min(sy * h, sy * (h - ab)), 0, Math.max(sx * h, sx * c), Math.max(sy * h, sy * (h - ab)), L));
    G.juntar(g, caixaEm(Math.min(sx * h, sx * (h - ab)), Math.min(sy * h, sy * c), 0, Math.max(sx * h, sx * (h - ab)), Math.max(sy * h, sy * c), L));
  }
  // núcleo e almas diagonais (vistas pelo canal)
  G.juntar(g, caixaEm(-h * 0.45, -h * 0.45, 0, h * 0.45, h * 0.45, L));
  return g;
}
// perfil entre dois pontos (roll: giro em torno do eixo)
const perfilEntre = (p, q, a = 40, roll = 0) => {
  const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], L = Math.hypot(...d);
  return T(perfil40(L, a), M.trans(...p), M.alinharZ(d), M.rotZ(roll));
};
// cantoneira de fixação pequena (zincada)
const cantoneira = (x, y, z, rz) => T(G.juntar(caixaEm(0, -12, 0, 30, 12, 4), caixaEm(0, -12, 0, 4, 12, 30)), M.trans(x, y, z), M.rotZ(rz));

// Parede no plano Y = 0 (o modelo fica em Y >= 0, saindo da parede para +Y). Origem no chão, no meio
// entre os dois montantes. pontos.amarracao = ponto onde a corrente se prende (sob o bloco com fita,
// na ponta do braço +X). pontos.amarracao2 = ponta do outro braço.
function perfilParede(op = {}) {
  const H = op.altura || 2100, D = op.vao || 330, B = op.braco || 260, zb = op.alturaBraco || 1000, a = 40;
  const al = G.vazia(), zin = G.vazia(), fp = G.vazia(), barb = G.vazia(), mad = G.vazia();
  const y0 = a / 2 + 2; // eixo dos montantes, encostados na parede
  for (const s of [-1, 1]) {
    // montante vertical
    G.juntar(al, perfilEntre([s * D / 2, y0, 60], [s * D / 2, y0, H]));
    // braço horizontal saindo da travessa baixa e diagonal subindo até o montante (mão-francesa por cima)
    const yt = y0 + a + 2, pt = [s * D / 2, yt + B, zb];
    G.juntar(al, perfilEntre([s * D / 2, yt + a / 2, zb], pt));
    G.juntar(al, perfilEntre([s * D / 2, y0 + a / 2, zb + B * 1.25], [s * D / 2, yt + B - 30, zb + a / 2], a * 0.9));
    G.juntar(zin, cantoneira(s * D / 2 - 12, y0 + a / 2, zb + B * 1.25 - 15, -Math.PI / 2));
    // cantoneiras de fixação na parede (a cada ~350 mm)
    for (let z = 200; z < H - 50; z += 350) G.juntar(zin, cantoneira(s * D / 2 + s * 22, 0.5, z, s > 0 ? 0 : Math.PI));
    // bloco embrulhado em fita crepe na ponta do braço
    const bl = T(G.caixaArred(70, 60, 50, 10, 3), M.trans(pt[0], pt[1] + 10, pt[2] + 6), M.rotZ(0.08 * s));
    G.juntar(fp, bl);
    G.juntar(fp, T(G.caixaArred(72, 30, 52, 8, 3), M.trans(pt[0], pt[1] + 20, pt[2] + 6), M.rotX(0.06)));
    // tampa plástica branca na ponta
    G.juntar(zin, caixaEm(pt[0] - 21, pt[1] + 38, pt[2] - 21, pt[0] + 21, pt[1] + 42, pt[2] + 21));
    // barbante em volta do bloco descendo ao elo
    const yb = pt[1] + 25;
    G.juntar(barb, anelTubo(estadio(60, 76, 1.6, 4).map(([x, , z]) => [pt[0] + x, yb, pt[2] + 6 + z * 0.0 + (z > 0 ? 28 : -28)]), 0.8, 5));
    G.juntar(barb, G.tubo([[pt[0] - 6, yb, pt[2] - 22], [pt[0] - 3, yb, pt[2] - 60], [pt[0], yb, pt[2] - 82]], 0.8, 5, false));
    G.juntar(barb, G.tubo([[pt[0] + 6, yb, pt[2] - 22], [pt[0] + 3, yb, pt[2] - 60], [pt[0], yb, pt[2] - 82]], 0.8, 5, false));
  }
  // travessa baixa (à frente dos montantes, na altura dos braços) e travessa alta com um bloco no meio
  G.juntar(al, perfilEntre([-D / 2 - 90, y0 + a + 2, zb], [D / 2 + 90, y0 + a + 2, zb]));
  G.juntar(al, perfilEntre([-D / 2 - 50, y0 + a + 2, H - 260], [D / 2 + 50, y0 + a + 2, H - 260]));
  G.juntar(al, perfilEntre([0, y0 + a + 2, H - 240], [0, y0 + a + 2, H - 40], a * 0.8));
  G.juntar(zin, caixaEm(-30, y0 + a + 24, H - 230, 30, y0 + a + 44, H - 120));
  // calço de madeira no rodapé (aparece na foto)
  G.juntar(mad, caixaEm(-D / 2 - 60, 2, 0, D / 2 + 80, 30, 70));
  const yb = y0 + a + 2 + B + 25;
  return {
    partes: [P('perfis', mat('aluminio'), al), P('cantoneiras', mat('zincado'), zin), P('fita crepe', mat('fitaPapel'), fp),
      P('barbante', mat('barbante'), barb), P('calço', mat('madeira'), mad)],
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
// Origem no centro da célula. Olhal de cima e de baixo; pontos.topo e pontos.base = centro dos anéis.
function celulaCarga(op = {}) {
  const L = op.largura || 52, A = op.altura || 62, e = op.esp || 13;
  // corpo em S: perfil 2D (polígono côncavo -> montado com caixas)
  const alu = G.vazia(), esc = G.vazia(), eti = G.vazia(), ver = G.vazia(), aco = G.vazia();
  const h = A / 2, w = L / 2, t = 9, f = 9; // t = espessura das barras horizontais, f = fenda
  // forma em S: barra de cima, poste esquerdo, bloco central, poste direito, barra de baixo.
  // Fenda superior aberta para a direita, fenda inferior aberta para a esquerda.
  G.juntar(alu, caixaEm(-w, -e / 2, h - t, w, e / 2, h));
  G.juntar(alu, caixaEm(-w, -e / 2, h - t - f, -w + 9, e / 2, h - t));
  G.juntar(alu, caixaEm(-w, -e / 2, -h + t + f, w, e / 2, h - t - f));
  G.juntar(alu, caixaEm(w - 9, -e / 2, -h + t, w, e / 2, -h + t + f));
  G.juntar(alu, caixaEm(-w, -e / 2, -h, w, e / 2, -h + t));
  // as fendas da forma em S: tiras escuras dentro das fendas
  // furo duplo (formato de 8) no centro: discos escuros nas duas faces
  for (const sy of [-1, 1]) {
    for (const x of [-7, 7]) G.juntar(esc, T(G.disco(7.5, 0, 20), M.trans(x - 3, sy * (e / 2 + 0.2), 0), M.rotX(-sy * Math.PI / 2)));
    G.juntar(esc, T(caixaEm(-10, -0.1, -3, 4, 0.1, 3), M.trans(0, sy * (e / 2 + 0.25), 0)));
    // etiqueta (selo colorido) e marca vermelha
    G.juntar(eti, T(G.caixaArred(10, 14, 0.4, 3, 3), M.trans(12, sy * (e / 2 + 0.3), 2), M.rotX(Math.PI / 2)));
    G.juntar(ver, T(caixaEm(-2, -0.2, -6, 2, 0.2, 6), M.trans(-15, sy * (e / 2 + 0.3), 2), M.rotY(0.2)));
  }
  // olhais (parafuso com anel), anéis no plano XZ
  G.juntar(aco, olhal(10, 3.2, h - 2, h + 26));
  G.juntar(aco, T(olhal(10, 3.2, h - 2, h + 26), M.rotX(Math.PI)));
  return {
    partes: [P('corpo', mat('aluminioFosco'), alu), P('furos', mat('pretoAnod'), esc), P('etiqueta', mat('etiqueta'), eti), P('marca', mat('vermelho'), ver), P('olhais', mat('zincado'), aco)],
    pontos: { topo: [0, 0, h + 26], base: [0, 0, -h - 26] },
  };
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

// ---------------------------------------------------------------- notebook
// Base sobre z = 0, centrada em XY; teclado para +Z, dobradiça no lado +Y; a tela abre op.angulo (110°).
// pontos.porta = conector na lateral −X; pontos.portaRede = segunda porta (lado +X).
function notebook(op = {}) {
  const W = op.larg || 340, D = op.prof || 240, hb = 18, ht = 6, ang = (op.angulo || 110) * Math.PI / 180;
  const tampa = G.vazia(), teclas = G.vazia(), tela = G.vazia(), base = G.vazia(), portas = G.vazia();
  G.juntar(base, T(G.caixaArred(W, D, hb, 8, 3), M.trans(0, 0, hb / 2)));
  // teclado (6 fileiras) e touchpad
  const kx = 17.5, ky = 16.5, gap = 2.2;
  for (let l = 0; l < 6; l++) {
    const n = 14, y = D / 2 - 30 - l * ky;
    for (let k = 0; k < n; k++) {
      let w = kx - gap, x = -W / 2 + 32 + k * kx;
      if (l === 5 && k >= 4 && k <= 9) { if (k > 4) continue; w = kx * 6 - gap; }
      G.juntar(teclas, caixaEm(x, y - ky + gap, hb - 0.2, x + w, y, hb + 1.2));
    }
  }
  G.juntar(teclas, caixaEm(-50, -D / 2 + 14, hb, 50, -D / 2 + 76, hb + 0.3));
  // portas USB/rede na lateral
  G.juntar(portas, caixaEm(-W / 2 - 0.3, 10, 5, -W / 2 + 4, 24, 10), caixaEm(-W / 2 - 0.3, 34, 4, -W / 2 + 4, 48, 13));
  G.juntar(portas, caixaEm(W / 2 - 4, 20, 4, W / 2 + 0.3, 36, 13));
  // tampa girando em torno da dobradiça (y = D/2, z = hb)
  const trT = M.cadeia(M.trans(0, D / 2 - 4, hb), M.rotX(-ang));
  G.juntar(tampa, G.transformar(T(G.caixaArred(W, D, ht, 8, 3), M.trans(0, -D / 2, ht / 2)), trT));
  G.juntar(tampa, G.barra([-W / 2 + 30, D / 2 - 4, hb], [W / 2 - 30, D / 2 - 4, hb], 5, 12));
  G.juntar(tela, G.transformar(caixaEm(-W / 2 + 12, -D + 14, -0.4, W / 2 - 12, -24, 0.2), trT));
  return {
    partes: [P('base', matE('plasticoGrafite'), base), P('teclas', matE('plasticoPreto'), teclas), P('tampa', matE('plasticoGrafite', { cor: [0.12, 0.12, 0.13] }), tampa),
      P('tela', { cor: [0.20, 0.27, 0.36], metal: 0, rug: 0.15, emissivo: [0.10, 0.14, 0.20] }, tela), P('portas', matE('plasticoPreto', { cor: [0.02, 0.02, 0.02] }), portas)],
    pontos: { porta: [-W / 2, 17, 7.5], portaRede: [W / 2, 28, 8.5] },
  };
}

// ---------------------------------------------------------------- Qualisys Camera Sync Unit
// Caixa preta de alumínio apoiada em z = 0, centrada; conectores BNC na face −X, RJ45 na face +X.
// pontos.entrada = RJ45 do cabo das câmeras (face +X); pontos.saida = RJ45/USB para o notebook (face +X).
function syncUnit(op = {}) {
  const A = op.comp || 220, B = op.larg || 160, H = op.alt || 45;
  const caixa = G.vazia(), tampas = G.vazia(), bnc = G.vazia(), isol = G.vazia(), txt = G.vazia(), dots = G.vazia(), furos = G.vazia(), led = G.vazia();
  G.juntar(caixa, T(G.caixaArred(A - 12, B, H, 4, 2), M.trans(0, 0, H / 2)));
  // tampas laterais (faces das pontas) um pouco maiores, com parafusos
  for (const s of [-1, 1]) {
    G.juntar(tampas, caixaEm(s > 0 ? A / 2 - 6 : -A / 2, -B / 2 - 1, -0.01, s > 0 ? A / 2 : -A / 2 + 6, B / 2 + 1, H + 1));
    for (const [y, z] of [[-B / 2 + 8, 7], [B / 2 - 8, 7], [-B / 2 + 8, H - 7], [B / 2 - 8, H - 7]])
      G.juntar(bnc, T(G.disco(2.4, 0, 10), M.trans(s * (A / 2 + 0.2), y, z), M.rotY(s * Math.PI / 2)));
  }
  // 6 BNC na face −X
  for (let k = 0; k < 6; k++) {
    const y = -B / 2 + 22 + k * (B - 44) / 5, tr = M.cadeia(M.trans(-A / 2, y, H / 2), M.rotY(-Math.PI / 2));
    G.juntar(bnc, G.transformar(G.juntar(T(G.extrusao(hexa(7), 0, 2.5), M.id()), G.cilindro(5.2, 2.5, 13, 16), G.cilindro(5.8, 6, 7.5, 16, false)), tr));
    G.juntar(isol, G.transformar(G.disco(3.3, 13.05, 12), tr));
    G.juntar(bnc, G.transformar(G.barra([5.2, 0, 8], [7.5, 0, 8], 1, 6), tr));
  }
  // face +X: 2 RJ45 fêmea, USB e LED
  const rj = [[-30, 'entrada'], [0, 'saida']];
  for (const [y] of rj) G.juntar(furos, caixaEm(A / 2 - 0.4, y - 8, 12, A / 2 + 0.4, y + 8, 26));
  G.juntar(furos, caixaEm(A / 2 - 0.4, 30, 15, A / 2 + 0.4, 42, 20));
  G.juntar(led, T(G.disco(1.6, 0, 8), M.trans(A / 2 + 0.5, 55, H - 10), M.rotY(Math.PI / 2)));
  // letreiro: "QUALISYS" e "CAMERA SYNC UNIT" no tampo, girados como na foto (lendo ao longo de Y)
  const l1 = letreiro('QUALISYS', 14, 0.5, 0.17), l2 = letreiro('CAMERA SYNC UNIT', 6, 0.4, 0.16);
  G.juntar(txt, T(l1.g, M.trans(10, -l1.larg / 2, H), M.rotZ(Math.PI / 2)));
  G.juntar(txt, T(l2.g, M.trans(24, -l2.larg / 2, H), M.rotZ(Math.PI / 2)));
  // cinco pontos laranja em arco sobre o "I" de QUALISYS
  const uI = 14 / 6, xI = 4 * 5.6 * uI + 0.8 * uI; // posição do I no texto
  for (let k = 0; k < 5; k++) { const a = Math.PI * (0.25 + 0.125 * k); G.juntar(dots, T(G.disco(1.3, 0, 8), M.trans(10 - 14 - 3 - 5 * Math.sin(a), -l1.larg / 2 + xI + 7 * Math.cos(a), H + 0.5))); }
  return {
    partes: [P('caixa', matE('plasticoPreto', { metal: 0.3, rug: 0.5 }), caixa), P('tampas', matE('plasticoGrafite'), tampas), P('BNC', matE('cromado'), bnc),
      P('isoladores', matE('textoClaro'), isol), P('portas', matE('plasticoPreto', { cor: [0.01, 0.01, 0.01] }), furos), P('letreiro', matE('textoClaro'), txt),
      P('pontos do logo', matE('laranjaLogo'), dots), P('LED', { cor: [0.2, 0.9, 0.3], metal: 0, rug: 0.3, emissivo: [0.1, 0.6, 0.2] }, led)],
    pontos: { entrada: [A / 2, -30, 19], saida: [A / 2, 0, 19] },
  };
}

// ---------------------------------------------------------------- base de aquisição das células
// Caixa pequena apoiada em z = 0; bornes verdes (parafusados) na face −X; USB e LEDs na face +X.
// pontos.entradas = [2 pontos nos bornes (face −X)]; pontos.saida = USB (face +X).
function baseCelulas(op = {}) {
  const A = op.comp || 180, B = op.larg || 120, H = op.alt || 60;
  const caixa = G.vazia(), tampa = G.vazia(), borne = G.vazia(), paraf = G.vazia(), usb = G.vazia(), ledV = G.vazia(), ledA = G.vazia(), eti = G.vazia();
  G.juntar(caixa, T(G.caixaArred(A, B, H - 6, 6, 3), M.trans(0, 0, (H - 6) / 2)));
  G.juntar(tampa, T(G.caixaArred(A - 4, B - 4, 6, 5, 3), M.trans(0, 0, H - 3)));
  for (const [x, y] of [[-A / 2 + 10, -B / 2 + 10], [A / 2 - 10, -B / 2 + 10], [-A / 2 + 10, B / 2 - 10], [A / 2 - 10, B / 2 - 10]]) G.juntar(paraf, T(G.disco(2.5, 0, 10), M.trans(x, y, H + 0.2)));
  // 2 blocos de bornes de 5 vias (4 fios + terra) saindo da face −X
  const entradas = [];
  for (const yc of [-B / 4, B / 4]) {
    G.juntar(borne, caixaEm(-A / 2 - 16, yc - 22, 8, -A / 2, yc + 22, 26));
    for (let k = 0; k < 5; k++) {
      const y = yc - 17.6 + k * 8.8;
      G.juntar(paraf, T(G.cilindro(2.6, 0, 1.5, 10), M.trans(-A / 2 - 8, y, 26)));
      G.juntar(usb, caixaEm(-A / 2 - 16.3, y - 2.5, 11, -A / 2 - 15.9, y + 2.5, 17));
    }
    entradas.push([-A / 2 - 16, yc, 14]);
  }
  G.juntar(usb, caixaEm(A / 2 - 0.4, -6, 20, A / 2 + 0.4, 6, 25));
  G.juntar(ledV, T(G.disco(2, 0, 10), M.trans(A / 2 - 20, -B / 2 + 18, H + 0.4)));
  G.juntar(ledA, T(G.disco(2, 0, 10), M.trans(A / 2 - 20, -B / 2 + 28, H + 0.4)));
  G.juntar(eti, caixaEm(-50, -25, H, 30, 25, H + 0.4));
  return {
    partes: [P('caixa', matE('plasticoGrafite', { cor: [0.22, 0.23, 0.25] }), caixa), P('tampa', matE('plasticoPreto'), tampa), P('bornes', matE('verdeBorne'), borne),
      P('parafusos', matE('cromado'), paraf), P('furos', matE('plasticoPreto', { cor: [0.01, 0.01, 0.01] }), usb), P('etiqueta', matE('textoClaro'), eti),
      P('LED verde', { cor: [0.2, 0.9, 0.3], metal: 0, rug: 0.3, emissivo: [0.1, 0.7, 0.2] }, ledV), P('LED âmbar', { cor: [1, 0.6, 0.1], metal: 0, rug: 0.3, emissivo: [0.6, 0.3, 0.02] }, ledA)],
    pontos: { entradas, saida: [A / 2, 0, 22.5] },
  };
}

// ---------------------------------------------------------------- mesa/gabinete cinza
// Gabinete de chapa cinza-clara com tampo de laminado mais espesso e pés niveladores. Origem no chão,
// no centro; frente em −Y. pontos.tampo = centro do tampo.
function mesaApoio(op = {}) {
  const A = op.comp || 1000, B = op.larg || 600, H = op.altura || 850, et = 30;
  const tampo = G.vazia(), corpo = G.vazia(), frisos = G.vazia(), pes = G.vazia(), puxa = G.vazia();
  G.juntar(tampo, T(G.caixaArred(A, B, et, 6, 3), M.trans(0, 0, H - et / 2)));
  G.juntar(tampo, caixaEm(-A / 2 + 1, -B / 2 - 1.5, H - et + 3, A / 2 - 1, -B / 2 + 1, H - 3)); // fita de borda
  const zc0 = 60, zc1 = H - et;
  G.juntar(corpo, caixaEm(-A / 2 + 25, -B / 2 + 30, zc0, A / 2 - 25, B / 2 - 20, zc1));
  // rodapé recuado
  G.juntar(frisos, caixaEm(-A / 2 + 45, -B / 2 + 50, 25, A / 2 - 45, B / 2 - 40, zc0));
  // portas frontais (2) com frestas e puxadores
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -A / 2 + 27 : 2, x1 = s < 0 ? -2 : A / 2 - 27;
    G.juntar(corpo, caixaEm(x0, -B / 2 + 28, zc0 + 3, x1, -B / 2 + 30, zc1 - 45));
    G.juntar(puxa, caixaEm(s < 0 ? x1 - 30 : x0 + 10, -B / 2 + 22, zc1 - 140, s < 0 ? x1 - 10 : x0 + 30, -B / 2 + 28, zc1 - 80));
  }
  G.juntar(frisos, caixaEm(-A / 2 + 27, -B / 2 + 28.5, zc1 - 42, A / 2 - 27, -B / 2 + 30.5, zc1 - 4)); // gaveta/faixa superior
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const x = sx * (A / 2 - 60), y = sy * (B / 2 - 60);
    G.juntar(pes, T(G.cilindro(6, 0, 30, 10, false), M.trans(x, y, 0)), T(G.cilindro(18, 0, 8, 16), M.trans(x, y, 0)));
  }
  return {
    partes: [P('tampo', matE('cinzaChapa', { cor: [0.80, 0.81, 0.81], rug: 0.5 }), tampo), P('corpo', matE('cinzaChapa'), corpo), P('rodapé e frisos', matE('cinzaChapaEsc'), frisos),
      P('pés', matE('cromado', { rug: 0.4 }), pes), P('puxadores', matE('plasticoPreto'), puxa)],
    pontos: { tampo: [0, 0, H] },
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
// pontas; padrão = op.ramais), op.fios = n (n fios trançados + terra verde-amarelo), op.cores (cores dos fios).
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
  notebook, syncUnit, baseCelulas, mesaApoio, cabo });
})();
