// Modelos 3D do entorno da montagem final (objetos a até ~2 m dela e o fundo próximo), pelas fotos de
// ../experimento/fotos/5_montagem_final e 2_montagem. Mesmo estilo de modelo_montagem.js: mm, Z para cima,
// origem no chão; +Y local = lado da parede (cena_lab.js os põe com paraParede). Cada função devolve
// { partes, pontos }. TODAS as medidas daqui são ESTIMADAS pelas fotos (proporção com peças conhecidas,
// como o suporte de 400 mm e a altura do braço do perfil); nenhuma foi medida com trena.
(() => {
'use strict';
const G = window.LAB_GEOM, M = G.mat, U = window.LAB_MODELOS._util;
const { mat, caixaEm, letreiro, rng, P, T } = U;
const cor = (c, metal = 0, rug = 0.7) => ({ cor: c, metal, rug });
// curva suave (Catmull-Rom) pelos pontos
function suave(pts, n = 10) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < n; k++) { const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map((a) => 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3))); }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}
const MAT_E = {
  bege: cor([0.84, 0.82, 0.73], 0.05, 0.6), begeEsc: cor([0.70, 0.68, 0.60], 0.05, 0.7),
  sacoPreto: cor([0.035, 0.035, 0.04], 0, 0.35), aco: cor([0.55, 0.55, 0.54], 0.85, 0.45), acoEsc: cor([0.20, 0.20, 0.20], 0.6, 0.6),
  azulLogo: cor([0.10, 0.30, 0.65], 0, 0.5), branco: cor([0.90, 0.90, 0.88], 0, 0.6),
  pernaBranca: cor([0.86, 0.86, 0.82], 0, 0.6), compensado: cor([0.78, 0.65, 0.46], 0, 0.8), compensadoEsc: cor([0.62, 0.48, 0.32], 0, 0.85),
  vermelho: cor([0.72, 0.07, 0.06], 0.2, 0.45), vermelhoEsc: cor([0.45, 0.04, 0.04], 0.2, 0.5),
  amarelo: cor([0.93, 0.72, 0.06], 0.2, 0.45), verde: cor([0.16, 0.34, 0.22], 0.2, 0.6), verdeEsc: cor([0.09, 0.20, 0.13], 0.2, 0.7),
  azulTambor: cor([0.08, 0.19, 0.42], 0.3, 0.45), cinzaConduite: cor([0.72, 0.73, 0.74], 0.3, 0.5), cinzaCaixa: cor([0.66, 0.67, 0.68], 0.2, 0.55),
  caboPreto: cor([0.03, 0.03, 0.03], 0, 0.45), fitaTransp: { cor: [0.85, 0.85, 0.80], metal: 0, rug: 0.15 }, cobre: cor([0.80, 0.45, 0.25], 1, 0.35),
  borracha: cor([0.05, 0.05, 0.05], 0, 0.85), cromo: cor([0.85, 0.85, 0.86], 1, 0.2),
};

// ---------------------------------------------------------------- transformador bege "GLOBAL"
// Caixa de chapa ~480 × 400 × 560 sobre pés, plaqueta "GLOBAL Transformadores" na frente (−Y), venezianas
// nas laterais; em cima um aro de aço deitado com um olhal e um saco de lixo preto em pé (fotos
// tres_ramos_vista_da_parede, corrente_grossa_perfil_ao_suporte, fixacao_braco_do_perfil).
function transformador(op = {}) {
  const W = op.larg || 480, D = op.prof || 400, H = op.alt || 560, hp = 28;
  const corpo = G.vazia(), esc = G.vazia(), placa = G.vazia(), logo = G.vazia(), aro = G.vazia(), saco = G.vazia(), pes = G.vazia();
  G.juntar(corpo, T(G.caixaArred(W, D, H - hp, 8, 3), M.trans(0, 0, hp + (H - hp) / 2)));
  G.juntar(corpo, caixaEm(-W / 2 - 6, -D / 2 - 6, H - 4, W / 2 + 6, D / 2 + 6, H + 6)); // tampa com aba
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) G.juntar(pes, caixaEm(sx * (W / 2 - 40) - 20, sy * (D / 2 - 30) - 20, 0, sx * (W / 2 - 40) + 20, sy * (D / 2 - 30) + 20, hp));
  // venezianas nas laterais (±X) e grade de baixo na frente
  for (const sx of [-1, 1]) for (let k = 0; k < 7; k++) G.juntar(esc, caixaEm(sx * W / 2 - 0.8, -D / 2 + 70 + k * 38, H - 210, sx * W / 2 + 0.8, -D / 2 + 70 + k * 38 + 22, H - 90));
  for (let k = 0; k < 9; k++) G.juntar(esc, caixaEm(-W / 2 + 60 + k * 42, -D / 2 - 0.8, hp + 30, -W / 2 + 60 + k * 42 + 26, -D / 2 + 0.5, hp + 110));
  // plaqueta (caixinha branca) com o logotipo e a etiqueta prateada
  G.juntar(placa, caixaEm(W / 2 - 230, -D / 2 - 55, H - 250, W / 2 - 30, -D / 2, H - 120));
  G.juntar(logo, T(G.disco(16, 0, 18), M.trans(W / 2 - 200, -D / 2 - 55.6, H - 185), M.rotX(Math.PI / 2)));
  const l = letreiro('GLOBAL', 16, 0.5, 0.18);
  G.juntar(logo, T(l.g, [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, W / 2 - 175, -D / 2 - 55.4, H - 192, 1]));
  G.juntar(placa, caixaEm(-W / 2 + 40, -D / 2 - 1, H - 200, -W / 2 + 150, -D / 2, H - 130));
  // aro de aço deitado (Ø ~380 × 30) e olhal; saco preto amassado
  G.juntar(aro, T(G.revolucao([[185, 0], [188, 0], [188, 30], [185, 30]], 48, { quina: 10 }), M.trans(30, 10, H + 6), M.rotX(0.04)));
  G.juntar(aro, T(G.revolucao([[188, 0], [185, 30]], 48), M.trans(30, 10, H + 6), M.rotX(0.04), M.esc(0.985, 0.985, 1)));
  G.juntar(aro, T(G.toro(16, 4, 16, 6), M.trans(-60, 60, H + 40), M.rotX(Math.PI / 2)), G.barra([-60, 60, H + 6], [-60, 60, H + 26], 5, 10));
  const r = rng(12), perfilSaco = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; perfilSaco.push([110 + 25 * Math.sin(t * 9) * (0.3 + t) + (t > 0.85 ? -40 * (t - 0.85) / 0.15 : 0), H + 6 + t * 420]); }
  const sc = G.revolucao(perfilSaco, 20, { quina: 999 });
  for (let i = 0; i < sc.pos.length; i += 3) { const a = Math.atan2(sc.pos[i + 1], sc.pos[i]); const k = 1 + 0.12 * Math.sin(a * 5 + sc.pos[i + 2] * 0.03) + 0.05 * (r() - 0.5); sc.pos[i] *= k; sc.pos[i + 1] *= k; }
  G.juntar(saco, T(sc, M.trans(-40, 70, 0)));
  G.juntar(saco, T(G.disco(108, H + 8, 20, true), M.trans(-40, 70, 0)));
  return {
    partes: [P('chapa bege', MAT_E.bege, corpo), P('pés', MAT_E.begeEsc, pes), P('venezianas', MAT_E.acoEsc, esc), P('plaqueta', MAT_E.branco, placa),
      P('logotipo', MAT_E.azulLogo, logo), P('aro de aço', MAT_E.aco, aro), P('saco preto', MAT_E.sacoPreto, saco)],
    pontos: { topo: [0, 0, H] },
  };
}

// ---------------------------------------------------------------- bancada de pernas brancas com morsa
// Tampo de compensado sobre quatro pernas brancas com travessas; morsa vermelha na ponta −X; peças de aço
// em cima (rolo com flanges, blocos) e embaixo (fotos montagem_final_lateral_cameras, tres_ramos_vista_do_perfil).
function bancadaMorsa(op = {}) {
  const C = op.comp || 1000, Lg = op.larg || 600, H = op.alt || 800, et = 25, pp = 60;
  const tampo = G.vazia(), pernas = G.vazia(), morsa = G.vazia(), morsaEsc = G.vazia(), aco = G.vazia(), acoEsc = G.vazia();
  G.juntar(tampo, caixaEm(-C / 2, -Lg / 2, H - et, C / 2, Lg / 2, H));
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) G.juntar(pernas, T(G.caixaArred(pp, pp, H - et, 8, 2), M.trans(sx * (C / 2 - 50), sy * (Lg / 2 - 50), (H - et) / 2)));
  for (const sy of [-1, 1]) G.juntar(pernas, caixaEm(-C / 2 + 50, sy * (Lg / 2 - 50) - 20, 140, C / 2 - 50, sy * (Lg / 2 - 50) + 20, 190), caixaEm(-C / 2 + 50, sy * (Lg / 2 - 50) - 20, H - et - 90, C / 2 - 50, sy * (Lg / 2 - 50) + 20, H - et));
  for (const sx of [-1, 1]) G.juntar(pernas, caixaEm(sx * (C / 2 - 50) - 20, -Lg / 2 + 50, 140, sx * (C / 2 - 50) + 20, Lg / 2 - 50, 190));
  // morsa (torno de bancada) na ponta −X, mordentes para −Y
  const xm = -C / 2 + 170, z0 = H;
  G.juntar(morsa, caixaEm(xm - 90, -80, z0, xm + 90, 120, z0 + 30));                // base giratória
  G.juntar(morsa, caixaEm(xm - 70, -40, z0 + 30, xm + 70, 120, z0 + 130));          // corpo fixo
  G.juntar(morsa, caixaEm(xm - 70, -150, z0 + 50, xm + 70, -60, z0 + 140));         // mandíbula móvel
  G.juntar(morsa, caixaEm(xm - 22, -60, z0 + 60, xm + 22, -40, z0 + 110));          // guia
  G.juntar(morsaEsc, caixaEm(xm - 72, -62, z0 + 100, xm + 72, -58, z0 + 140), caixaEm(xm - 72, -42, z0 + 100, xm + 72, -38, z0 + 140)); // mordentes
  G.juntar(morsaEsc, G.barra([xm, -150, z0 + 85], [xm, -200, z0 + 85], 9, 12), G.barra([xm - 110, -205, z0 + 85], [xm + 110, -205, z0 + 85], 6, 10));
  // rolo de aço com flanges, deitado (o "cilindro" das fotos), e blocos
  G.juntar(aco, T(G.cilindro(55, -170, 170, 28), M.trans(80, 30, H + 62), M.rotY(Math.PI / 2)));
  for (const x of [-120, 200]) G.juntar(aco, T(G.cilindro(75, -8, 8, 28), M.trans(80 + x, 30, H + 62), M.rotY(Math.PI / 2)));
  G.juntar(acoEsc, caixaEm(280, -200, H, 420, -100, H + 70), caixaEm(-60, -230, H, 40, -150, H + 40));
  // peças pesadas embaixo, no chão
  G.juntar(acoEsc, caixaEm(-C / 2 + 80, -150, 0, -C / 2 + 330, 150, 140), caixaEm(-40, -120, 0, 220, 140, 110), caixaEm(260, -60, 0, 400, 180, 230));
  return {
    partes: [P('tampo de compensado', MAT_E.compensado, tampo), P('pernas brancas', MAT_E.pernaBranca, pernas), P('morsa', MAT_E.vermelho, morsa),
      P('morsa (aço)', MAT_E.acoEsc, morsaEsc), P('rolo', MAT_E.aco, aco), P('peças', mat('acoEscuro'), acoEsc)],
    pontos: { tampo: [0, 0, H] },
  };
}

// ---------------------------------------------------------------- chapa de compensado encostada
// Parede no plano Y = 0, a chapa em Y < 0 com o topo encostado. ~1 220 × 2 200 × 18.
function chapaEncostada(op = {}) {
  const W = op.larg || 1220, L = op.comp || 2200, e = 18, base = op.afast || 520;
  const inc = Math.asin(base / L), g = G.vazia(), b = G.vazia();
  const tr = M.cadeia(M.trans(0, -base - e / 2, 0), M.rotX(-inc));
  G.juntar(g, G.transformar(caixaEm(-W / 2, -e / 2, 0, W / 2, e / 2, L), tr));
  G.juntar(b, G.transformar(caixaEm(-W / 2 - 0.5, -e / 2 - 0.5, 0, W / 2 + 0.5, -e / 2, L), tr));
  return { partes: [P('compensado', MAT_E.compensado, g), P('face', MAT_E.compensadoEsc, b)], pontos: {} };
}

// ---------------------------------------------------------------- máquina verde com guincho amarelo
function maquinaVerde() {
  const v = G.vazia(), ve = G.vazia(), am = G.vazia(), ac = G.vazia();
  G.juntar(v, T(G.caixaArred(560, 460, 620, 60, 6), M.trans(0, 0, 310)));
  G.juntar(v, caixaEm(-300, -250, 0, 300, 250, 60));
  for (let k = 0; k < 8; k++) G.juntar(ve, caixaEm(-170, -231, 160 + k * 40, 170, -228, 160 + k * 40 + 22)); // grelha da frente
  G.juntar(am, T(G.caixaArred(520, 360, 280, 40, 6), M.trans(0, 20, 620 + 140)));
  G.juntar(am, T(G.cilindro(110, -200, 200, 28), M.trans(0, -150, 760), M.rotY(Math.PI / 2)));
  G.juntar(ac, T(G.cilindro(85, -150, 150, 24), M.trans(0, -150, 760), M.rotY(Math.PI / 2)));
  G.juntar(ve, caixaEm(-120, -175, 820, 120, -173, 880)); // janelinha escura na caixa amarela
  return { partes: [P('base verde', MAT_E.verde, v), P('grelha', MAT_E.verdeEsc, ve), P('guincho', MAT_E.amarelo, am), P('cabo do guincho', MAT_E.acoEsc, ac)], pontos: {} };
}

// ---------------------------------------------------------------- máquina vermelha (armário)
function maquinaVermelha() {
  const r = G.vazia(), re = G.vazia(), vid = G.vazia();
  G.juntar(r, T(G.caixaArred(800, 600, 1000, 15, 3), M.trans(0, 0, 560)), caixaEm(-380, -280, 0, 380, 280, 60));
  G.juntar(r, caixaEm(-390, -260, 1060, 390, 290, 1120));
  G.juntar(re, caixaEm(-330, -302, 300, 330, -298, 900));
  G.juntar(vid, caixaEm(-250, -304, 600, 250, -301, 860));
  return { partes: [P('armário vermelho', MAT_E.vermelho, r), P('porta', MAT_E.vermelhoEsc, re), P('visor', { cor: [0.12, 0.14, 0.16], metal: 0.2, rug: 0.15 }, vid)], pontos: {} };
}

// ---------------------------------------------------------------- guindaste de oficina amarelo
// Pernas para −Y (para dentro da sala), mastro atrás, lança inclinada com cilindro hidráulico, corrente e gancho.
function guindaste() {
  const am = G.vazia(), pr = G.vazia(), cr = G.vazia(), rod = G.vazia();
  for (const sx of [-1, 1]) {
    G.juntar(am, caixaEm(sx * 330 - 35, -1100, 40, sx * 330 + 35, 200, 110));
    G.juntar(rod, T(G.cilindro(40, -18, 18, 16), M.trans(sx * 330, -1060, 40), M.rotY(Math.PI / 2)), T(G.cilindro(40, -18, 18, 16), M.trans(sx * 330, 140, 40), M.rotY(Math.PI / 2)));
  }
  G.juntar(am, caixaEm(-400, 100, 40, 400, 200, 120));
  G.juntar(am, caixaEm(-45, 120, 120, 45, 210, 1450));                         // mastro
  const top = [0, 165, 1400], ponta = [0, -900, 1750];
  G.juntar(am, T(G.caixa(80, Math.hypot(ponta[1] - top[1], ponta[2] - top[2]), 90), M.trans(0, (top[1] + ponta[1]) / 2, (top[2] + ponta[2]) / 2), M.rotX(Math.atan2(ponta[2] - top[2], ponta[1] - top[1]) - Math.PI)));
  G.juntar(pr, G.barra([0, 120, 300], [0, -380, 1560], 28, 14), G.barra([0, -150, 950], [0, -380, 1560], 18, 12));
  G.juntar(pr, caixaEm(-25, 110, 600, 25, 140, 700)); // bomba
  G.juntar(cr, G.tubo([[0, -900, 1700], [0, -905, 1500], [0, -900, 1300]], 6, 6));
  G.juntar(cr, T(G.toro(30, 7, 16, 6), M.trans(0, -900, 1260), M.rotX(Math.PI / 2)));
  return { partes: [P('guindaste', MAT_E.amarelo, am), P('cilindro', MAT_E.acoEsc, pr), P('corrente e gancho', MAT_E.aco, cr), P('rodas', MAT_E.borracha, rod)], pontos: {} };
}

// ---------------------------------------------------------------- tambor azul de 200 L
function tambor() {
  const az = G.vazia(), br = G.vazia(), ac = G.vazia(), r = 290, H = 880;
  G.juntar(az, G.cilindro(r, 0, H, 40));
  for (const z of [H * 0.33, H * 0.66]) G.juntar(az, T(G.toro(r, 9, 40, 6), M.trans(0, 0, z)));
  G.juntar(ac, T(G.toro(r - 6, 7, 40, 6), M.trans(0, 0, H)), T(G.disco(32, H + 1, 16), M.trans(150, 60, 0)));
  G.juntar(br, G.revolucao([[r + 0.6, 340], [r + 0.6, 640]], 40, { a0: -Math.PI / 2 - 0.55, a1: -Math.PI / 2 + 0.55 }));
  G.juntar(br, T(G.cilindro(45, H, H + 230, 16), M.trans(-80, -40, 0)), T(G.cilindro(40, H, H + 180, 16), M.trans(40, -120, 0)));
  return { partes: [P('tambor', MAT_E.azulTambor, az), P('rótulo e frascos', MAT_E.branco, br), P('bocal', MAT_E.acoEsc, ac)], pontos: {} };
}

// ---------------------------------------------------------------- eletroduto com caixa de tomadas
// Parede no plano Y = 0; conduíte cinza Ø25 descendo do alto (op.zTopo) até a caixa (op.zCaixa) com duas
// tomadas (uma com marca vermelha), abraçadeiras a cada ~1 m (fotos montagem_final_frente e _lateral_cameras).
function eletroduto(op = {}) {
  const zc = op.zCaixa || 1300, zt = op.zTopo || 4300, y = -16;
  const cond = G.vazia(), cx = G.vazia(), tom = G.vazia(), ver = G.vazia(), abr = G.vazia();
  G.juntar(cond, G.barra([0, y, zc + 40], [0, y, zt], 12.5, 14));
  for (let z = zc + 400; z < zt; z += 1000) G.juntar(abr, caixaEm(-22, -3, z, 22, -1, z + 20), caixaEm(-15, y - 14, z, 15, y + 12, z + 20));
  for (let z = zc + 1500; z < zt; z += 3000) G.juntar(cond, T(G.cilindro(15.5, -25, 25, 14), M.trans(0, y, z)));
  G.juntar(cx, caixaEm(-120, -55, zc - 40, 120, 0, zc + 40));
  for (const [x, vermelha] of [[-60, false], [60, true]]) {
    G.juntar(tom, caixaEm(x - 42, -57, zc - 30, x + 42, -55, zc + 30));
    G.juntar(vermelha ? ver : tom, T(G.disco(16, 0, 18), M.trans(x, -57.4, zc), M.rotX(Math.PI / 2)));
    for (const dx of [-6, 6]) G.juntar(abr, T(G.disco(2.4, 0, 8), M.trans(x + dx, -57.8, zc), M.rotX(Math.PI / 2)));
  }
  return { partes: [P('eletroduto', MAT_E.cinzaConduite, cond), P('caixa', MAT_E.cinzaCaixa, cx), P('tomadas', MAT_E.branco, tom), P('marca vermelha', MAT_E.vermelho, ver), P('abraçadeiras e furos', MAT_E.acoEsc, abr)], pontos: {} };
}

// ---------------------------------------------------------------- fio preto pendurado na parede
// Parede no plano Y = 0. Desce do alto, faz uma laçada solta, é preso com fita transparente e termina com a
// ponta desencapada (foto corrente_grossa_perfil_ao_suporte).
function fioParede(op = {}) {
  const zt = op.zTopo || 2900;
  const pts = [[-200, -4, zt + 400], [-120, -6, zt], [60, -8, zt - 420], [160, -10, zt - 700], [170, -12, zt - 760], [120, -40, zt - 900], [60, -60, zt - 1250], [90, -50, zt - 1420],
    [150, -30, zt - 1250], [170, -20, zt - 980], [175, -14, zt - 800], [140, -30, zt - 1000], [110, -40, zt - 1180], [95, -35, zt - 1300]];
  const g = G.tubo(suave(pts), 2.4, 8);
  const fita = G.vazia(), cobre = G.vazia();
  G.juntar(fita, caixaEm(110, -14, zt - 790, 230, -11, zt - 740), caixaEm(-40, -9, zt - 280, 60, -6, zt - 230));
  G.juntar(cobre, G.barra([95, -35, zt - 1300], [92, -36, zt - 1325], 1.2, 6), G.barra([97, -34, zt - 1300], [100, -33, zt - 1322], 1.2, 6));
  return { partes: [P('fio preto', MAT_E.caboPreto, g), P('fita', MAT_E.fitaTransp, fita), P('ponta', MAT_E.cobre, cobre)], pontos: {} };
}


// ---------------------------------------------------------------- malas da Qualisys
// mala preta em pé com "QUALISYS" (sob a mesa dos computadores, fotos 1_equipamento/tres_cameras_traseira_tripes
// e camera_frente_anel_leds_tripe) e maleta de alumínio deitada no chão (2_montagem/visao_geral_cameras).
// Frente em −Y. ~620 × 230 × 420 e ~1 100 × 260 × 140 (estimados).
function malasQualisys(op = {}) {
  const preta = G.vazia(), txt = G.vazia(), alu = G.vazia(), fecho = G.vazia(), rod = G.vazia();
  G.juntar(preta, T(G.caixaArred(620, 230, 420, 18, 4), M.trans(0, 0, 225)));
  for (const sx of [-1, 1]) G.juntar(rod, T(G.cilindro(14, -10, 10, 12), M.trans(sx * 260, 0, 14), M.rotY(Math.PI / 2)));
  const l1 = letreiro('QUALISYS', 52, 0.6, 0.16), l2 = letreiro('MOTION CAPTURE SYSTEMS', 13, 0.5, 0.16);
  const frente = (l, z) => [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, -l.larg / 2, -115.6, z, 1];
  G.juntar(txt, T(l1.g, frente(l1, 250)), T(l2.g, frente(l2, 215)));
  const [dx, dy] = op.maleta || [150, -650];
  G.juntar(alu, T(G.caixaArred(1100, 260, 140, 14, 4), M.trans(dx, dy, 75), M.rotZ(0.12)));
  G.juntar(fecho, T(caixaEm(-480, -132, 60, 480, -129, 90), M.trans(dx, dy, 0), M.rotZ(0.12)));
  for (const x of [-300, 300]) G.juntar(fecho, T(caixaEm(x - 25, -136, 55, x + 25, -130, 95), M.trans(dx, dy, 0), M.rotZ(0.12)));
  G.juntar(fecho, T(G.barra([-60, -150, 75], [60, -150, 75], 8, 10), M.trans(dx, dy, 0), M.rotZ(0.12)));
  return { partes: [P('mala preta', MAT_E.caboPreto, preta), P('letreiro', MAT_E.branco, txt), P('rodinhas', MAT_E.borracha, rod),
    P('maleta de alumínio', MAT_E.cromo, alu), P('fechos e alça', MAT_E.acoEsc, fecho)], pontos: {} };
}

Object.assign(window.LAB_MODELOS, { malasQualisys, transformador, bancadaMorsa, chapaEncostada, maquinaVerde, maquinaVermelha, guindaste, tambor, eletroduto, fioParede });
})();
