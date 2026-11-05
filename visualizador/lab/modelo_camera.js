// Modelo 3D procedural: câmera Qualisys Miqus (corpo de 140 × 87 × 84 mm, ~700 g — qualisys.com/cameras/miqus —, com
// lente C-mount e anel de LEDs com aletas) sobre tripé Manfrotto 055 de alumínio de 3 seções (MT055XPRO3: tubos das
// pernas de Ø 30 / 26 / 22,5 mm, coluna de Ø 28 mm) com cabeça de 3 eixos X-PRO (MHXPRO-3W, 13 cm de altura), como nas
// fotos de ../experimento/fotos/1_equipamento/. O diâmetro do anel de LEDs (~95 mm) e os detalhes da cabeça são
// ESTIMADOS pelas fotos. Usa window.LAB_GEOM (lab_geom.js).
//
// LAB_MODELOS.cameraTripe({ altura, inclinacao, abertura }) -> { partes, centroOptico, eixo }
//   altura      altura do centro óptico (meio da lente) acima do chão, mm (padrão 1500)
//   inclinacao  graus, positivo = lente para baixo (padrão 15)
//   abertura    raio, no chão, dos pés das pernas, mm (padrão 600)
//   giroPernas  giro do tripé em torno da coluna, em relação à câmera, rad (padrão 0): a cabeça gira solta,
//               então as pernas podem ser viradas para não bater num móvel
// pontos.pes = [[quadril, pé], …] de cada perna (para testar colisão); pontos.caboFim = fim do cabo no chão.
// Sistema local: origem no chão, no centro do tripé; Z para cima; eixo óptico para +X
// (inclinado no plano XZ). Unidades em mm.
(() => {
'use strict';
const G = window.LAB_GEOM, M = G.mat;
const T = (g, ...ms) => G.transformar(g, M.cadeia(...ms));
const rad = (d) => d * Math.PI / 180;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mulv = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => mulv(a, 1 / (len(a) || 1));
const aplicar = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
// troca de eixos: extrusão feita em (x,y) ao longo de z vira (Y,Z) ao longo de X
const YZ_X = [0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1];
// leva o eixo Z local para +X (sólidos de revolução ao longo do eixo óptico)
const Z_X = M.rotY(Math.PI / 2);

// retângulo arredondado (convexo, CCW), base em y=0, topo em y=h; raios diferentes em baixo e em cima
function retArred(w, h, rb, rt, seg = 6) {
  const p = [], x = w / 2;
  const canto = (cx, cy, r, a0) => { for (let k = 0; k <= seg; k++) { const a = a0 + Math.PI / 2 * k / seg; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
  canto(x - rb, rb, rb, -Math.PI / 2);
  canto(x - rt, h - rt, rt, 0);
  canto(-x + rt, h - rt, rt, Math.PI / 2);
  canto(-x + rb, rb, rb, Math.PI);
  return p;
}
// polígono convexo arredondado passando perto dos vértices dados
function poliArred(vs, r, seg = 6) {
  const p = [], n = vs.length;
  for (let i = 0; i < n; i++) {
    const a = vs[(i + n - 1) % n], b = vs[i], c = vs[(i + 1) % n];
    const d1 = norm([b[0] - a[0], b[1] - a[1], 0]), d2 = norm([c[0] - b[0], c[1] - b[1], 0]);
    const n1 = [d1[1], -d1[0]], n2 = [d2[1], -d2[0]]; // normais para fora (CCW)
    const a1 = Math.atan2(n1[1], n1[0]); let a2 = Math.atan2(n2[1], n2[0]);
    while (a2 < a1) a2 += 2 * Math.PI;
    // centro do arco: recuado do vértice
    const bis = norm([n1[0] + n2[0], n1[1] + n2[1], 0]);
    const cosm = Math.cos((a2 - a1) / 2);
    const cx = b[0] - bis[0] * r / cosm, cy = b[1] - bis[1] * r / cosm;
    for (let k = 0; k <= seg; k++) { const t = a1 + (a2 - a1) * k / seg; p.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); }
  }
  return p;
}
// curva suave (Catmull-Rom) por pontos de controle
function spline(ctrl, porTrecho = 10) {
  const out = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    for (let k = 0; k < porTrecho; k++) {
      const t = k / porTrecho, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map((a) => 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3)));
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}
// coloca uma malha feita ao longo de +Z entre os pontos p (z=0) e na direção d
const aoLongo = (g, p, d) => T(g, M.trans(...p), M.alinharZ(d));

// ---------------------------------------------------------------- materiais
const MAT = {
  plastico: { cor: [0.055, 0.055, 0.06], metal: 0, rug: 0.55 },
  aluminio: { cor: [0.07, 0.07, 0.08], metal: 0.6, rug: 0.32 },      // alumínio anodizado preto (pernas, coluna)
  borracha: { cor: [0.035, 0.035, 0.037], metal: 0, rug: 0.9 },
  vermelho: { cor: [0.72, 0.04, 0.05], metal: 0.55, rug: 0.28 },
  prata: { cor: [0.78, 0.79, 0.8], metal: 1, rug: 0.22 },
  cinzaClaro: { cor: [0.70, 0.71, 0.72], metal: 0, rug: 0.45 },       // casca superior da câmera
  cinzaEscuro: { cor: [0.16, 0.165, 0.17], metal: 0.15, rug: 0.5 },   // corpo inferior / traseira
  aletas: { cor: [0.045, 0.045, 0.05], metal: 0.2, rug: 0.6 },        // dissipador preto fosco
  leds: { cor: [0.86, 0.76, 0.52], metal: 0, rug: 0.35, emissivo: [0.22, 0.14, 0.04] },
  vidro: { cor: [0.02, 0.02, 0.028], metal: 0.3, rug: 0.04 },
  nivel: { cor: [0.62, 0.92, 0.18], metal: 0, rug: 0.15, emissivo: [0.08, 0.12, 0.02] },
  etiqueta: { cor: [0.93, 0.93, 0.9], metal: 0, rug: 0.7 },
  cabo: { cor: [0.06, 0.06, 0.065], metal: 0, rug: 0.45 },
};

// "gota" preta sobre o topo arredondado da casca: segue a seção (topo plano + cantos de raio rc)
// e afina de meia-largura total na frente (x = xf) até um ponto em x = xt
function gotaTopo(xt, xf, meia, ztopo, rc, nx = 28, ns = 18) { // nx × ns = subdivisões ao longo e através
  const g = G.vazia(), plano = meia - rc, zc = ztopo - rc, off = 0.9;
  const arcoMax = plano + rc * Math.PI / 2 * 0.62; // até onde a gota desce pela lateral
  const sec = (s) => { // ponto e normal na seção, por comprimento de arco a partir do centro
    const a = Math.abs(s), sg = Math.sign(s) || 1;
    if (a <= plano) return [[s, ztopo + off], [0, 1]];
    const f = (a - plano) / rc;
    return [[sg * (plano + (rc + off) * Math.sin(f)), zc + (rc + off) * Math.cos(f)], [sg * Math.sin(f), Math.cos(f)]];
  };
  for (let i = 0; i <= nx; i++) {
    const u = i / nx, x = xt + (xf - xt) * u;
    const w = arcoMax * Math.pow(Math.sin(u * Math.PI / 2), 0.9) * (0.25 + 0.75 * u);
    for (let j = 0; j <= ns; j++) {
      const s = -w + 2 * w * j / ns, [[y, z], [ny, nz]] = sec(s);
      g.pos.push(x, y, z); g.nor.push(0, ny, nz);
    }
  }
  for (let i = 0; i < nx; i++) for (let j = 0; j < ns; j++) {
    const a = i * (ns + 1) + j, b = a + ns + 1;
    g.idx.push(a, b, b + 1, a, b + 1, a + 1);
  }
  return g;
}

// ---------------------------------------------------------------- câmera (quadro da câmera: base do corpo em z=0, centro em x=0, lente para +X)
const CAM = { comp: 140, larg: 87, alt: 84, zLente: 38 }; // corpo: medidas de catálogo; zLente (eixo óptico): pela foto
function camera(P) {
  const { comp, larg, alt, zLente } = CAM, x0 = -comp / 2, x1 = comp / 2, zCasca = 39; // zCasca: onde começa a casca clara
  // corpo escuro inteiro (seção arredondada extrudada ao longo de X)
  P.cinzaEscuro.push(T(G.extrusao(retArred(larg, alt, 8, 28), x0, x1), YZ_X));
  // casca cinza clara: metade de cima, um pouco maior, sem cobrir frente e traseira
  const casca = retArred(larg + 3, alt + 1.5, 8, 29.5).filter((p) => p[1] >= zCasca);
  casca.unshift([(larg + 3) / 2, zCasca]); casca.push([-(larg + 3) / 2, zCasca]);
  P.cinzaClaro.push(T(G.extrusao(casca, x0 + 6, x1 - 3), YZ_X));
  // faixa clara contornando a traseira (moldura do painel)
  const moldura = retArred(larg + 3, alt + 1.5, 9, 29.5);
  P.cinzaClaro.push(T(G.extrusao(moldura, x0 + 1, x0 + 6), YZ_X));
  P.cinzaEscuro.push(T(G.extrusao(retArred(larg - 10, alt - 12, 6, 22), x0 - 1, x0 + 2), M.trans(0, 0, 0), YZ_X, M.trans(0, 6, 0)));
  // frente preta (máscara) e "gota" preta no topo, apontando para trás
  P.aletas.push(T(G.extrusao(retArred(larg + 3.5, alt + 2, 9, 30), x1 - 4, x1 + 1), YZ_X));
  P.aletas.push(gotaTopo(x0 + 34, x1 - 3, (larg + 3) / 2, alt + 1.5, 29.5, 16, 10));
  // aletas verticais nas laterais do corpo inferior
  for (const s of [-1, 1]) for (let x = x0 + 12; x <= x1 - 10; x += 7)
    P.aletas.push(T(G.caixa(2.6, 4, 33), M.trans(x, s * (larg / 2 + 1.5), 21)));
  // conectores Ethernet na traseira (dois), etiqueta com nº de série, LED de status
  for (const y of [-14, 14]) {
    P.plastico.push(T(G.caixa(6, 18, 14), M.trans(x0 - 2, y, alt - 22)));
    P.prata.push(T(G.caixa(1, 14, 10), M.trans(x0 - 5, y, alt - 22)));
  }
  P.etiqueta.push(T(G.caixa(0.8, 30, 18), M.trans(x0 - 1.2, -14, 36)));
  P.plastico.push(T(G.caixa(0.8, 7, 4), M.trans(x0 - 1.2, 20, 44)));
  // trava de lente (suporte preto em L sob a lente) e botão "Lock"
  P.plastico.push(T(G.caixa(70, 46, 5), M.trans(x1 + 32, 0, zLente - 30)));
  P.plastico.push(T(G.caixa(6, 50, 30), M.trans(x1 + 66, 0, zLente - 18)));
  for (const sy of [-1, 1]) P.plastico.push(T(G.caixa(60, 4, 16), M.trans(x1 + 30, sy * 21, zLente - 22)));
  P.etiqueta.push(T(G.caixa(6, 4, 3), M.trans(x1 - 1, 18, zLente + 20)));
  // lente C-mount (ao longo do eixo óptico): anéis pretos com faixa prateada
  const lente = [[16, 0], [16, 4], [18.6, 4], [18.6, 9], [17.4, 9], [17.4, 15], [19.2, 15], [19.2, 27], [17.6, 27], [17.6, 33], [18.8, 33], [18.8, 46], [14, 46], [12, 44]];
  P.plastico.push(T(G.revolucao(lente, 28), M.trans(x1, 0, zLente), Z_X));
  P.prata.push(T(G.revolucao([[18.9, 5], [18.9, 8.5]], 28), M.trans(x1, 0, zLente), Z_X));
  P.vidro.push(T(G.revolucao([[0, 46.5], [9, 46], [12, 44.5]], 20, { quina: 90 }), M.trans(x1, 0, zLente), Z_X));
  for (let k = 0; k < 24; k++) { // serrilhado do anel de foco
    const a = 2 * Math.PI * k / 24;
    P.plastico.push(T(G.caixa(1.4, 1.6, 11), M.trans(x1, 0, zLente), Z_X, M.rotZ(a), M.trans(19.6, 0, 21)));
  }
  // anel de LEDs (estroboscópio): cubo, aletas radiais, placa frontal de alumínio, duas fileiras de LEDs, filtro
  // (montado em tamanho "de desenho" e reduzido em torno do eixo óptico: Ø ~95 mm nas pontas das aletas, pela foto)
  const xa = x1 + 38, kA = 0.78, A = { aletas: [], prata: [], leds: [], vidro: [] }; // xa: início do conjunto (~3 cm da lente à mostra)
  A.aletas.push(T(G.revolucao([[24.6, 0], [36, 0], [36, 30], [31, 30], [31, 3], [24.6, 3]], 32), M.trans(xa, 0, zLente), Z_X));
  P.plastico.push(T(G.revolucao([[19, 42], [19.6, 42], [19.6, 46], [19, 46]], 24), M.trans(x1, 0, zLente), Z_X));
  const nAl = 30;
  for (let k = 0; k < nAl; k++) {
    const a = 2 * Math.PI * (k + 0.5) / nAl;
    A.aletas.push(T(G.caixaArred(26, 5.6, 28, 2.2, 1), M.trans(xa, 0, zLente), Z_X, M.rotZ(a), M.trans(36 + 12, 0, 15)));
  }
  A.prata.push(T(G.revolucao([[31, 0], [51, 0], [52, 1.2], [52, 3], [31, 3]], 40), M.trans(xa + 30, 0, zLente), Z_X));
  for (let k = 0; k < 40; k++) { // dentes na borda da placa
    const a = 2 * Math.PI * k / 40;
    A.prata.push(T(G.caixa(2.2, 2.6, 3), M.trans(xa + 30, 0, zLente), Z_X, M.rotZ(a), M.trans(52.6, 0, 1.5)));
  }
  for (const [r, n] of [[38, 40], [44.5, 46]]) for (let k = 0; k < n; k++) {
    const a = 2 * Math.PI * (k + (r > 40 ? 0.5 : 0)) / n;
    A.leds.push(T(G.revolucao([[2.7, 0], [2.7, 2.6], [0, 3.8]], 6, { quina: 50 }), M.trans(xa + 33, 0, zLente), Z_X, M.trans(r * Math.cos(a), r * Math.sin(a), 0)));
  }
  A.aletas.push(T(G.revolucao([[31, 3], [31, -2], [29, -2]], 32), M.trans(xa + 30, 0, zLente), Z_X));
  A.vidro.push(T(G.disco(30, 0, 32), M.trans(xa + 30.5, 0, zLente), Z_X));
  const reduz = M.cadeia(M.trans(0, 0, zLente), M.esc(1, kA, kA), M.trans(0, 0, -zLente));
  for (const k in A) for (const g of A[k]) P[k].push(G.transformar(g, reduz));
  return { xLenteMeio: x1 + 21, xFrente: xa + 34 };
}

// ---------------------------------------------------------------- cabeça de 3 eixos (origem: topo da coluna)
// parte fixa (base, giro panorâmico, garfo) e parte que inclina (bloco, placa, câmera, manopla traseira)
const PIVO = 80;
function cabecaFixa(P) {
  P.aluminio.push(G.cilindro(30, 0, 9, 28));
  P.vermelho.push(G.revolucao([[31, 9], [33.5, 10], [33.5, 15], [31, 16]], 32));
  P.borracha.push(G.revolucao([[31, 16], [35, 17], [35, 30], [31, 36]], 32));
  P.plastico.push(T(G.caixaArred(58, 54, 26, 14), M.trans(0, 0, 49)));
  // garfo: duas bochechas em volta do eixo de inclinação
  for (const s of [-1, 1]) P.plastico.push(T(G.caixaArred(44, 12, 50, 6), M.trans(-2, s * 31, PIVO - 10)));
  P.plastico.push(T(G.caixa(30, 70, 12), M.trans(-4, 0, 60)));
  // botão de fricção prateado serrilhado (lado -Y) com centro preto
  const kn = G.revolucao([[0, 0], [21, 0], [23.5, 2], [23.5, 15], [21, 17], [0, 17]], 32);
  const knob = [kn];
  for (let k = 0; k < 28; k++) { const a = 2 * Math.PI * k / 28; knob.push(T(G.caixa(1.6, 2.6, 11), M.rotZ(a), M.trans(23.8, 0, 8.5))); }
  for (const g of knob) P.prata.push(T(g, M.trans(0, -37, PIVO), M.rotX(Math.PI / 2)));
  P.plastico.push(T(G.cilindro(14, 0, 1.5, 20), M.trans(0, -54.5, PIVO), M.rotX(Math.PI / 2)));
  P.vermelho.push(T(G.cilindro(3, 0, 1, 16), M.trans(9, -56, PIVO), M.rotX(Math.PI / 2)));
  // botão preto do outro lado (+Y) com o logo vermelho
  P.borracha.push(T(G.revolucao([[0, 0], [17, 0], [18, 3], [18, 14], [15, 18], [0, 18]], 24), M.trans(0, 37, PIVO), M.rotX(-Math.PI / 2)));
  P.vermelho.push(T(G.cilindro(5, 0, 1, 16), M.trans(0, 55.4, PIVO), M.rotX(-Math.PI / 2)));
  // manopla lateral (inclinação lateral), para trás e para o lado +Y
  manopla(P, [-10, 44, PIVO - 6], norm([-0.55, 0.72, -0.42]), 165);
}
function manopla(P, p, d, L) {
  P.plastico.push(aoLongo(G.cilindro(9, -6, 24, 14), p, d));
  P.borracha.push(aoLongo(G.revolucao([[0, 20], [12, 20], [14, 30], [15.5, L * 0.55], [14.5, L - 18], [12, L - 4], [0, L]], 18, { quina: 60 }), p, d));
}
function cabecaInclina(P) {
  // quadro relativo ao pivô (z=0 no eixo de inclinação)
  P.plastico.push(T(G.caixaArred(50, 46, 40, 10), M.trans(0, 0, 12)));
  P.plastico.push(T(G.cilindro(14, -25, 25, 20), M.rotX(Math.PI / 2)));
  // placa de engate rápido com dois níveis de bolha
  P.plastico.push(T(G.caixaArred(92, 60, 10, 6), M.trans(-6, 0, 37)));
  P.aluminio.push(T(G.caixa(84, 52, 4), M.trans(-6, 0, 44)));
  P.plastico.push(T(G.caixaArred(30, 18, 12, 4), M.trans(14, 33, 34)));
  P.nivel.push(T(G.cilindro(4.5, 0, 9, 16), M.trans(8, 42.5, 34), M.rotX(Math.PI / 2), M.trans(0, 0, -4.5)));
  P.nivel.push(T(G.cilindro(4.5, 0, 9, 16), M.trans(20, 42.5, 34), M.rotY(Math.PI / 2), M.trans(0, 0, -4.5)));
  P.vermelho.push(T(G.cilindro(4, 0, 6, 16), M.trans(-50, 22, 37), M.rotY(-Math.PI / 2)));
  // manopla traseira (inclinação frente-trás)
  manopla(P, [-24, 0, 6], norm([-0.92, -0.08, -0.38]), 175);
  return 46; // topo da placa (base do corpo da câmera)
}

// ---------------------------------------------------------------- tripé 055 (origem no chão)
const AZ0 = [0, 120, 240].map(rad);
function tripe(P, zs, topoColuna, abertura, giro = 0) {
  // aranha (peça fundida no topo) e coluna central
  const AZ = AZ0.map((a) => a + giro);
  const rv = 66, tri = AZ.map((a) => [rv * Math.cos(a), rv * Math.sin(a)]);
  P.plastico.push(G.extrusao(poliArred(tri, 22, 6), zs - 50, zs));
  P.aluminio.push(G.extrusao(poliArred(AZ.map((a) => [52 * Math.cos(a + Math.PI / 3), 52 * Math.sin(a + Math.PI / 3)]), 18, 5), zs - 46, zs - 4));
  P.vermelho.push(G.revolucao([[22, zs], [24, zs], [24, zs + 4], [22, zs + 4]], 28));
  P.nivel.push(T(G.cilindro(7, 0, 1.5, 24), M.trans(38 * Math.cos(rad(60)), 38 * Math.sin(rad(60)), zs)));
  P.prata.push(T(G.revolucao([[7, 0], [8.5, 0], [8.5, 2.5], [7, 2.5]], 24), M.trans(38 * Math.cos(rad(60)), 38 * Math.sin(rad(60)), zs)));
  P.aluminio.push(G.cilindro(14, zs - 280, topoColuna - 10, 20));
  P.plastico.push(G.revolucao([[24, zs - 92], [26, zs - 88], [26, zs - 56], [22, zs - 50]], 28));
  P.plastico.push(T(G.cilindro(9, 0, 22, 24), M.trans(0, -24, zs - 72), M.rotX(Math.PI / 2)));
  P.borracha.push(T(G.revolucao([[0, 0], [10, 0], [11, 4], [11, 14], [8, 18], [0, 18]], 24), M.trans(0, -44, zs - 72), M.rotX(Math.PI / 2)));
  P.plastico.push(G.revolucao([[0, zs - 300], [16, zs - 300], [16, zs - 284], [14, zs - 280]], 20));
  P.aluminio.push(G.revolucao([[14, topoColuna - 10], [28, topoColuna - 8], [28, topoColuna], [0, topoColuna]], 28));
  // pernas: três seções telescópicas com travas de alavanca e pé de borracha
  const pes = [];
  AZ.forEach((a, i) => {
    const c = Math.cos(a), s = Math.sin(a);
    const H = [50 * c, 50 * s, zs - 36], F = [abertura * c, abertura * s, 30];
    const d = norm(sub(F, H)), L = len(sub(F, H));
    const at = (t) => add(H, mulv(d, t));
    // ombro de plástico com plaqueta prateada (lado de fora)
    const out = norm([c, s, 0]), lado = norm([-s, c, 0]);
    const base = M.mul(M.trans(...H), M.alinharZ(d));
    P.plastico.push(T(G.caixaArred(40, 38, 110, 9), base, M.trans(0, 0, 40)));
    // plaqueta: orientada para fora (perpendicular a d, no plano de out)
    const nOut = norm(sub(out, mulv(d, out[0] * d[0] + out[1] * d[1] + out[2] * d[2])));
    const pl = add(at(48), mulv(nOut, 19.5));
    P.prata.push(T(G.caixaArred(26, 2, 72, 5), M.trans(...pl), base3(d, nOut)));
    P.vermelho.push(T(G.cilindro(4, 0, 2, 16), M.trans(...add(at(4), mulv(nOut, 4))), M.alinharZ(lado), M.trans(0, 0, 18)));
    // dobradiça
    P.aluminio.push(T(G.cilindro(7, -22, 22, 12), M.trans(...H), M.alinharZ(lado)));
    const t1 = 0.43 * L, t2 = 0.74 * L;
    P.aluminio.push(aoLongo(G.cilindro(15, 0, t1, 18, false), at(60), d));
    P.aluminio.push(aoLongo(G.cilindro(13, 0, t2 - t1 + 10, 16, false), at(t1 - 10 + 60 * 0), d));
    P.aluminio.push(aoLongo(G.cilindro(11.25, 0, L - t2 + 10, 14, false), at(t2 - 10), d));
    if (i > 0) P.borracha.push(aoLongo(G.revolucao([[15, 0], [18.5, 6], [18.5, 220], [15, 226]], 18), at(130), d)); // espuma (duas das três pernas)
    // travas (alavanca preta com faixa prateada)
    for (const [t, r] of [[t1 + 60 * 0, 15], [t2, 13]]) {
      P.plastico.push(aoLongo(G.revolucao([[r + 1, -8], [r + 4, -4], [r + 4, 24], [r + 1, 30]], 18), at(t), d));
      const lv = add(at(t + 4), mulv(nOut, r + 8));
      P.plastico.push(T(G.caixaArred(20, 9, 66, 3.5), M.trans(...lv), base3(d, nOut)));
      P.prata.push(T(G.caixa(12, 1, 26), M.trans(...add(lv, mulv(nOut, 4.8))), base3(d, nOut), M.trans(0, 0, -14)));
    }
    // pé de borracha
    P.borracha.push(T(G.revolucao([[0, 0], [16, 0], [17.5, 4], [16.5, 22], [12, 34], [0, 34]], 16), M.trans(F[0], F[1], 0)));
    pes.push({ H, F, d, L, at, nOut });
  });
  return pes;
}
// base com Z ao longo de d e X ao longo de n (n ⟂ d)
function base3(d, n) {
  const y = [d[1] * n[2] - d[2] * n[1], d[2] * n[0] - d[0] * n[2], d[0] * n[1] - d[1] * n[0]];
  return [n[0], n[1], n[2], 0, y[0], y[1], y[2], 0, d[0], d[1], d[2], 0, 0, 0, 0, 1];
}

// ---------------------------------------------------------------- montagem
function cameraTripe(op = {}) {
  const altura = op.altura ?? 1500, incl = rad(op.inclinacao ?? 15), abertura = op.abertura ?? 600, giroP = op.giroPernas || 0;
  const P = {}; for (const k in MAT) P[k] = [];
  // quadro da câmera em relação ao pivô: corpo recuado 15 mm, base sobre a placa
  const Pcam = {}; for (const k in MAT) Pcam[k] = [];
  const cam = camera(Pcam);
  const recuo = -15;
  const Pinc = {}; for (const k in MAT) Pinc[k] = [];
  const topoPlaca = cabecaInclina(Pinc);
  const oLocal = [recuo + cam.xLenteMeio, 0, topoPlaca + CAM.zLente];
  const R = M.rotY(incl);
  const oRot = aplicar(R, oLocal);
  const topoColuna = altura - PIVO - oRot[2];
  const zs = Math.max(260, Math.min(topoColuna - 45, 1400));
  const pes = tripe(P, zs, topoColuna, abertura, giroP);
  const Pfix = {}; for (const k in MAT) Pfix[k] = [];
  cabecaFixa(Pfix);
  const mFix = M.trans(0, 0, topoColuna);
  const mInc = M.cadeia(M.trans(0, 0, topoColuna + PIVO), R);
  const mCam = M.cadeia(mInc, M.trans(recuo, 0, topoPlaca));
  for (const k in MAT) {
    for (const g of Pfix[k]) P[k].push(T(g, mFix));
    for (const g of Pinc[k]) P[k].push(T(g, mInc));
    for (const g of Pcam[k]) P[k].push(T(g, mCam));
  }
  // cabo: sai do conector traseiro, faz uma curva para trás e desce encostado na perna 2 até o chão
  const c0 = aplicar(mCam, [-CAM.comp / 2 - 6, 14, CAM.alt - 22]);
  const c1 = aplicar(mCam, [-CAM.comp / 2 - 45, 16, CAM.alt - 10]);
  const c2 = aplicar(mCam, [-CAM.comp / 2 - 95, 30, CAM.alt - 70]);
  const pe = pes[1], ladoPerna = (t, off) => add(add(pe.at(t), mulv(pe.nOut, off)), [0, 0, 0]);
  const c3 = ladoPerna(0.22 * pe.L, 40), c4 = ladoPerna(0.5 * pe.L, 26), c5 = ladoPerna(0.85 * pe.L, 30);
  const c6 = add(pe.F, add(mulv(pe.nOut, 60), [0, 0, -30 + 5]));
  const cg = Math.cos(giroP), sg = Math.sin(giroP), noChao = (x, y) => [x * cg - y * sg, x * sg + y * cg, -30 + 5]; // acompanha o giro das pernas
  const c7 = add(pe.F, add(mulv(pe.nOut, 200), noChao(-60, 40)));
  const c8 = add(pe.F, add(mulv(pe.nOut, 520), noChao(-180, 140)));
  c6[2] = 8; c7[2] = 4.5; c8[2] = 4.5; // no chão (nOut tem componente vertical)
  const fio = spline([c0, c1, c2, c3, c4, c5, c6, c7, c8], 8);
  fio.forEach((p) => { p[2] = Math.max(p[2], 4); });
  P.cabo.push(G.tubo(fio, 3.6, 8));
  P.cabo.push(T(G.caixaArred(16, 18, 14, 4), M.trans(...c0), mCam.slice(0, 12).concat([0, 0, 0, 1])));
  // junta tudo por material
  const partes = [];
  for (const k in MAT) {
    const gs = P[k].filter(Boolean); if (!gs.length) continue;
    const g = G.juntar(G.vazia(), ...gs);
    partes.push(G.parte(k, MAT[k], g));
  }
  const eixo = aplicar(R, [1, 0, 0]);
  // pontos.caboFim: onde o cabo da câmera termina no chão (para emendar a ligação em série); caboDir: direção
  return { partes, centroOptico: aplicar(mInc, oLocal), eixo, pontos: { caboFim: c8, caboDir: [c8[0] - c7[0], c8[1] - c7[1], 0], pes: pes.map((q) => [q.H, q.F]) } };
}

window.LAB_MODELOS = window.LAB_MODELOS || {};
window.LAB_MODELOS.cameraTripe = cameraTripe;
})();
