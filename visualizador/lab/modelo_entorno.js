// Modelos 3D do entorno da montagem final (objetos a até ~2 m dela e o fundo próximo), pelas fotos de
// ../experimento/fotos/5_montagem_final e 2_montagem. Mesmo estilo de modelo_montagem.js: mm, Z para cima,
// origem no chão; +Y local = lado da parede (cena_lab.js os põe com paraParede). Cada função devolve
// { partes, pontos }.
// Medidas: as de catálogo vêm de produtos equivalentes aos das fotos (a fonte está no comentário de cada
// modelo); o resto é ESTIMADO pelas fotos (proporção com o tambor de 880 mm e o suporte de 400 mm). Nada foi
// medido com trena.
(() => {
'use strict';
const G = window.LAB_GEOM, M = G.mat, U = window.LAB_MODELOS._util;
const { mat, caixaEm, letreiro, rng, P, T, hexa, estadio, anelTubo } = U;
const cor = (c, metal = 0, rug = 0.7, tex, extra) => Object.assign({ cor: c, metal, rug }, tex ? { tex } : {}, extra || {});
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
  bege: cor([0.80, 0.78, 0.70], 0.05, 0.6, 'pintura'), begeEsc: cor([0.70, 0.68, 0.60], 0.05, 0.7),
  sacoPreto: cor([0.035, 0.035, 0.04], 0, 0.35), aco: cor([0.55, 0.55, 0.54], 0.85, 0.45, 'metal'), acoEsc: cor([0.20, 0.20, 0.20], 0.6, 0.6, 'metal'),
  ferroPreto: cor([0.07, 0.07, 0.075], 0.4, 0.7, 'ferrugem'), ferrugem: cor([0.36, 0.22, 0.14], 0.2, 0.9, 'ferrugem'),
  azulLogo: cor([0.10, 0.30, 0.65], 0, 0.5), branco: cor([0.90, 0.90, 0.88], 0, 0.6),
  pernaBranca: cor([0.84, 0.84, 0.80], 0, 0.6, 'pintura'), madeiraClara: cor([0.80, 0.68, 0.48], 0, 0.75, 'madeira'),
  compensado: cor([0.72, 0.56, 0.36], 0, 0.8, 'compensado', { texDir: [0, 0, 1] }), compensadoEsc: cor([0.56, 0.42, 0.28], 0, 0.85, 'compensado', { texDir: [0, 0, 1] }),
  vermelho: cor([0.72, 0.07, 0.06], 0.2, 0.45, 'pintura'), vermelhoEsc: cor([0.45, 0.04, 0.04], 0.2, 0.5, 'pintura'),
  amarelo: cor([0.93, 0.66, 0.05], 0.2, 0.45, 'pintura'), amareloClaro: cor([0.90, 0.80, 0.30], 0.15, 0.55, 'pintura'),
  verde: cor([0.13, 0.36, 0.20], 0.2, 0.6, 'lascada'), verdeCinza: cor([0.42, 0.50, 0.42], 0.35, 0.7, 'ferrugem'),
  azulTambor: cor([0.07, 0.17, 0.40], 0.3, 0.42, 'pintura'), cinzaTampa: cor([0.62, 0.64, 0.66], 0.35, 0.5, 'pintura'),
  cinzaConduite: cor([0.72, 0.73, 0.74], 0.3, 0.5), cinzaCaixa: cor([0.66, 0.67, 0.68], 0.2, 0.55),
  caboPreto: cor([0.03, 0.03, 0.03], 0, 0.45), fitaTransp: { cor: [0.85, 0.85, 0.80], metal: 0, rug: 0.15 }, cobre: cor([0.80, 0.45, 0.25], 1, 0.35),
  latao: cor([0.78, 0.62, 0.28], 1, 0.35), borracha: cor([0.05, 0.05, 0.05], 0, 0.85, 'fosco'), cromo: cor([0.85, 0.85, 0.86], 1, 0.2),
  zincado: cor([0.72, 0.73, 0.74], 0.9, 0.4, 'metal'), vidroFosco: { cor: [0.42, 0.45, 0.47], metal: 0.1, rug: 0.25 }, laranja: cor([0.92, 0.42, 0.08], 0, 0.6),
  escuro: cor([0.03, 0.03, 0.035], 0, 0.6),
};

// ---------------------------------------------------------------- helpers de forma
// tronco de pirâmide retangular: base w0 × d0 em z0 e topo w1 × d1 em z1 (o topo pode ser deslocado em ox, oy)
function tronco(w0, d0, z0, w1, d1, z1, ox = 0, oy = 0) {
  const b = [[-w0 / 2, -d0 / 2, z0], [w0 / 2, -d0 / 2, z0], [w0 / 2, d0 / 2, z0], [-w0 / 2, d0 / 2, z0]];
  const t = [[ox - w1 / 2, oy - d1 / 2, z1], [ox + w1 / 2, oy - d1 / 2, z1], [ox + w1 / 2, oy + d1 / 2, z1], [ox - w1 / 2, oy + d1 / 2, z1]];
  const g = G.vazia();
  const quad = (p, q, r, s) => {
    const e1 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], e2 = [s[0] - p[0], s[1] - p[1], s[2] - p[2]];
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const nl = Math.hypot(...n) || 1; n = n.map((v) => v / nl);
    const k = g.pos.length / 3; g.pos.push(...p, ...q, ...r, ...s); for (let i = 0; i < 4; i++) g.nor.push(...n); g.idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  };
  for (let i = 0; i < 4; i++) quad(b[i], b[(i + 1) % 4], t[(i + 1) % 4], t[i]);
  quad(t[0], t[1], t[2], t[3]); quad(b[3], b[2], b[1], b[0]);
  return g;
}
// prisma ao longo de X: polígono convexo [[y, z], …] (anti-horário visto de +X), de x0 a x1
const prismaX = (poli, x0, x1) => G.transformar(G.extrusao(poli, x0, x1), [0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1]);
// barra de seção retangular a × b entre dois pontos; `lado` = direção em que fica a medida a
function barraRet(p, q, a, b, lado = [1, 0, 0]) {
  const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], L = Math.hypot(...d), z = d.map((v) => v / L);
  const k = lado[0] * z[0] + lado[1] * z[1] + lado[2] * z[2];
  let x = [lado[0] - k * z[0], lado[1] - k * z[1], lado[2] - k * z[2]]; const xl = Math.hypot(...x) || 1; x = x.map((v) => v / xl);
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return G.transformar(G.caixa(a, b, L), [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2, 1]);
}
// encosta no chão e na parede (plano Y = 0, peça em Y < 0) uma malha inclinada: nenhuma quina passa do piso ou da parede
function assentarNaParede(g) {
  let zMin = Infinity, yMax = -Infinity;
  for (let k = 0; k < g.pos.length; k += 3) { yMax = Math.max(yMax, g.pos[k + 1]); zMin = Math.min(zMin, g.pos[k + 2]); }
  return [Math.max(0, yMax), Math.min(0, zMin)];
}

// ---------------------------------------------------------------- transformador "GLOBAL"
// Autotransformador a seco da Global Transformadores em caixa de aço bege (IP 23, RAL 7032). Medidas da tabela
// dimensional do fabricante para 20/25 kVA: 460 de largura × 540 de altura × 325 de profundidade com a tampa do
// painel (globaltransformadores.com.br, "tabela dimensional autotrafo"). A caixa não tem venezianas: dois pés
// pretos, tampa de cima em bandeja, a tampa do painel de ligação saliente numa face (com o adesivo GLOBAL), borne
// de aterramento de latão, plaqueta na lateral e olhais de içamento. O painel fica virado para o suporte
// (−X local), como em 5_montagem_final/fixacao_suporte_grampo_celula_2. Em cima: uma lâmina de serra de fita
// enrolada (Ø ~380) e um saco de lixo preto em pé (fotos tres_ramos_vista_do_perfil; estimados).
function transformador(op = {}) {
  const X = op.prof || 260, Y = op.larg || 460, H = op.alt || 540, hp = 50, ht = 38, zc = hp + (H - ht - hp) * 0.56;
  const corpo = G.vazia(), pes = G.vazia(), placa = G.vazia(), adesivo = G.vazia(), logo = G.vazia(), aro = G.vazia(), saco = G.vazia(), latao = G.vazia(), zinc = G.vazia(), esc = G.vazia();
  G.juntar(corpo, caixaEm(-X / 2, -Y / 2, hp, X / 2, Y / 2, H - ht));
  G.juntar(corpo, caixaEm(-X / 2 - 8, -Y / 2 - 8, H - ht, X / 2 + 8, Y / 2 + 8, H));                 // tampa em bandeja
  G.juntar(esc, caixaEm(-X / 2 + 6, -Y / 2 + 6, hp - 6, X / 2 - 6, Y / 2 - 6, hp));                   // vão de ventilação por baixo
  for (const sy of [-1, 1]) G.juntar(pes, caixaEm(-X / 2 + 8, sy * 212 - 20, 0, X / 2 - 8, sy * 212 + 20, hp)); // pés (perfis pretos)
  // tampa do painel de ligação (60 % da largura × 35 % da altura, 65 mm saliente) com o adesivo
  const pw = 0.6 * Y, ph = 0.35 * H, xf = -X / 2 - 65;
  G.juntar(corpo, caixaEm(xf, -pw / 2, zc - ph / 2, -X / 2, pw / 2, zc + ph / 2));
  const frente = (y, z) => [0, -1, 0, 0, 0, 0, 1, 0, -1, 0, 0, 0, xf - 0.4, y, z, 1]; // plano XY do letreiro -> face −X
  G.juntar(adesivo, T(G.caixa(200, 78, 0.8), frente(0, zc), M.trans(0, 0, -0.2)));
  G.juntar(logo, T(G.disco(19, 0.5, 20), frente(74, zc + 8)));
  const l1 = letreiro('GLOBAL', 21, 0.5, 0.2), l2 = letreiro('TRANSFORMADORES', 7.5, 0.5, 0.18);
  G.juntar(logo, T(l1.g, frente(48, zc + 2)), T(l2.g, frente(48, zc - 14)));
  for (const [y, z] of [[-pw / 2 + 12, zc - ph / 2 + 12], [pw / 2 - 12, zc - ph / 2 + 12], [-pw / 2 + 12, zc + ph / 2 - 12], [pw / 2 - 12, zc + ph / 2 - 12]])
    G.juntar(zinc, T(G.cilindro(4, 0, 2.5, 8), M.trans(xf, y, z), M.rotY(-Math.PI / 2)));
  G.juntar(latao, T(G.cilindro(6, 0, 14, 10), M.trans(-X / 2, Y / 2 - 60, hp + 45), M.rotY(-Math.PI / 2)));          // borne de aterramento
  G.juntar(placa, caixaEm(-75, -Y / 2 - 1, H - ht - 130, 75, -Y / 2, H - ht - 40));                                     // plaqueta na lateral
  for (const sy of [-1, 1]) G.juntar(zinc, T(G.toro(13, 3.5, 14, 6), M.trans(0, sy * 150, H + 15), M.rotY(Math.PI / 2)), G.barra([0, sy * 150, H], [0, sy * 150, H + 4], 5, 8));
  // lâmina de serra de fita enrolada (aro de Ø ~380 × 28) e saco preto amassado
  G.juntar(aro, T(G.revolucao([[188, 0], [189.2, 0], [189.2, 28], [188, 28]], 48, { quina: 10 }), M.trans(20, 10, H + 0.5), M.rotX(0.03)));
  G.juntar(aro, T(G.revolucao([[189.2, 0], [188, 28]], 48), M.trans(20, 10, H + 0.5), M.rotX(0.03), M.esc(0.985, 0.985, 1)));
  const r = rng(12), perfilSaco = [];
  for (let i = 0; i <= 14; i++) { const t = i / 14, boca = Math.max(0, (t - 0.72) / 0.28); // a boca do saco estreita e afunda, amassada
    perfilSaco.push([(100 + 20 * Math.sin(t * 8) * (0.3 + t)) * (1 - 0.5 * boca * boca), H + 1 + t * 430]); }
  perfilSaco.push([28, H + 1 + 418], [0, H + 1 + 405]);
  const sc = G.revolucao(perfilSaco, 20, { quina: 999 });
  for (let i = 0; i < sc.pos.length; i += 3) { const a = Math.atan2(sc.pos[i + 1], sc.pos[i]); const k = 1 + 0.12 * Math.sin(a * 5 + sc.pos[i + 2] * 0.03) + 0.05 * (r() - 0.5); sc.pos[i] *= k; sc.pos[i + 1] *= k; }
  G.juntar(saco, T(sc, M.trans(0, 55, 0)), T(G.disco(96, H + 2, 20, true), M.trans(0, 55, 0)));
  return {
    partes: [P('chapa bege', MAT_E.bege, corpo), P('pés', MAT_E.escuro, pes), P('vão de baixo', MAT_E.escuro, esc), P('adesivo', MAT_E.branco, adesivo),
      P('logotipo', MAT_E.azulLogo, logo), P('plaqueta', MAT_E.zincado, placa), P('borne de latão', MAT_E.latao, latao), P('olhais e parafusos', MAT_E.zincado, zinc),
      P('lâmina de serra enrolada', MAT_E.aco, aro), P('saco preto', MAT_E.sacoPreto, saco)],
    pontos: { topo: [0, 0, H] },
  };
}

// ---------------------------------------------------------------- bancada de pernas brancas com morsa
// Tampo de madeira clara (~1 000 × 600 × 40, com balanço) sobre saia e quatro pernas de madeira pintadas de
// branco, que afinam para baixo. Na quina da frente (−Y) do lado do suporte (−X), um torno de bancada nº 6
// vermelho de base fixa: mordente de 150 mm, ~380 de comprimento e ~170 de altura (catálogos Metalsul TMF06 e
// Bremen nº 6), com o manípulo de pontas em bola pendurado na vertical à frente da borda. Em cima: caixa de
// madeira com um tubo retangular de aço e um carretel com motor; embaixo: peças de ferro, um disco perfurado
// encostado na parede, um flange enferrujado e um bloco sobre um palete (fotos montagem_final_lateral_cameras,
// tres_ramos_vista_do_perfil e 2_montagem/corrente_suporte_e_poste_com_peso; estimados).
function bancadaMorsa(op = {}) {
  const C = op.comp || 1000, Lg = op.larg || 600, H = op.alt || 830, et = 40, bal = 30, z0 = H;
  const tampo = G.vazia(), pernas = G.vazia(), morsa = G.vazia(), aco = G.vazia(), ferro = G.vazia(), mad = G.vazia(), verm = G.vazia(), ferr = G.vazia(), cinza = G.vazia(), disco = G.vazia(), furos = G.vazia();
  G.juntar(tampo, caixaEm(-C / 2 - bal, -Lg / 2 - bal, H - et, C / 2 + bal, Lg / 2, H)); // atrás fica rente à parede
  const xp = C / 2 - 45, yp = Lg / 2 - 45;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) G.juntar(pernas, T(tronco(58, 58, 0, 76, 76, H - et), M.trans(sx * xp, sy * yp, 0)));
  for (const sy of [-1, 1]) G.juntar(pernas, caixaEm(-xp, sy * yp - 11, H - et - 120, xp, sy * yp + 11, H - et));     // saia
  for (const sx of [-1, 1]) G.juntar(pernas, caixaEm(sx * xp - 11, -yp, H - et - 120, sx * xp + 11, yp, H - et));
  // ---- torno de bancada: mordente fixo em yF, corpo fixo atrás dele (com a bigorna), mordente móvel à frente
  const x = -C / 2 + 130, yF = -195, yM = yF - 60; // aberto 60 mm
  G.juntar(morsa, caixaEm(x - 85, yF - 20, z0, x + 85, yF + 170, z0 + 22));                       // base aparafusada
  G.juntar(morsa, T(tronco(130, 150, z0 + 22, 110, 120, z0 + 118), M.trans(x, yF + 80, 0)));     // corpo fixo
  G.juntar(morsa, caixaEm(x - 75, yF, z0 + 108, x + 75, yF + 40, z0 + 168));                      // mordente fixo
  G.juntar(morsa, caixaEm(x - 42, yF + 42, z0 + 118, x + 42, yF + 140, z0 + 134));                // bigorna
  G.juntar(morsa, caixaEm(x - 24, yM - 110, z0 + 60, x + 24, yF + 6, z0 + 108));                  // barra-guia
  G.juntar(morsa, caixaEm(x - 75, yM - 40, z0 + 108, x + 75, yM, z0 + 168));                      // mordente móvel
  G.juntar(morsa, T(tronco(100, 70, z0 + 52, 120, 60, z0 + 110), M.trans(x, yM - 34, 0)));
  G.juntar(aco, caixaEm(x - 76, yM, z0 + 142, x + 76, yM + 4, z0 + 168), caixaEm(x - 76, yF - 4, z0 + 142, x + 76, yF, z0 + 168)); // mordentes de aço
  G.juntar(aco, G.barra([x, yM - 110, z0 + 84], [x, yM - 152, z0 + 84], 16, 14));                 // cubo do fuso
  const yh = yM - 138; // manípulo atravessado no cubo, pendurado na vertical à frente da borda da bancada
  G.juntar(aco, G.barra([x, yh, z0 + 84 + 30], [x, yh, z0 + 84 - 215], 7, 10), T(G.esfera(11, 10, 8), M.trans(x, yh, z0 + 84 + 32)), T(G.esfera(11, 10, 8), M.trans(x, yh, z0 + 84 - 217)));
  for (const [dx, dy] of [[-68, -6], [68, -6], [-68, 156], [68, 156]]) G.juntar(aco, T(G.extrusao(hexa(8), 0, 7), M.trans(x + dx, yF + dy, z0 + 22)));
  // ---- em cima: caixa de madeira, tubo retangular de aço, carretel com motor, aparelho pequeno, cilindro de aço
  const xc = -C / 2 + 320;
  G.juntar(mad, caixaEm(xc - 250, 20, z0, xc + 250, 300, z0 + 150));
  G.juntar(ferr, caixaEm(xc - 290, 100, z0 + 150, xc + 310, 210, z0 + 260));
  G.juntar(aco, T(G.cilindro(70, -100, 100, 24), M.trans(xc + 60, 155, z0 + 260 + 88), M.rotY(Math.PI / 2)));
  for (const s of [-1, 1]) G.juntar(verm, T(G.cilindro(88, -7, 7, 24), M.trans(xc + 60 + s * 107, 155, z0 + 260 + 88), M.rotY(Math.PI / 2)));
  G.juntar(cinza, caixaEm(xc - 210, 100, z0 + 260, xc - 60, 205, z0 + 390), T(G.cilindro(42, -70, 70, 18), M.trans(xc - 135, 152, z0 + 330), M.rotY(Math.PI / 2)));
  G.juntar(ferro, caixaEm(250, -190, z0, 340, -120, z0 + 48));
  G.juntar(aco, G.barra([-70, -80, z0 + 30], [150, -130, z0 + 30], 30, 18));
  // ---- embaixo: peças de ferro, disco perfurado encostado na parede, flange enferrujado sobre um calço, bloco num palete
  G.juntar(ferro, caixaEm(-C / 2 + 100, -160, 0, -C / 2 + 330, 120, 150), caixaEm(-90, -150, 0, 60, 60, 110));
  const emPe = M.cadeia(M.trans(150, 250, 250), M.rotX(Math.PI / 2 - 0.16)); // disco de Ø 500 em pé, inclinado 9° contra a parede
  G.juntar(disco, T(G.cilindro(250, -4, 4, 36), emPe));
  for (let k = 0; k < 10; k++) G.juntar(furos, T(G.disco(22, 4.3, 12), emPe, M.rotZ(2 * Math.PI * k / 10), M.trans(170, 0, 0)));
  G.juntar(furos, T(G.disco(40, 4.3, 16), emPe));
  G.juntar(mad, caixaEm(-360, -90, 0, -230, 80, 90), caixaEm(100, -210, 0, 400, 90, 60));
  G.juntar(ferr, T(G.cilindro(190, 90, 112, 28), M.trans(-295, -5, 0)));
  G.juntar(ferro, caixaEm(140, -170, 60, 370, 50, 200));
  return {
    partes: [P('tampo de madeira', MAT_E.madeiraClara, tampo), P('pernas brancas', MAT_E.pernaBranca, pernas), P('morsa', MAT_E.vermelho, morsa),
      P('morsa (aço)', MAT_E.aco, aco), P('flanges do carretel', MAT_E.vermelho, verm), P('motor', cor([0.50, 0.51, 0.52], 0.4, 0.55, 'pintura'), cinza),
      P('tubo e flange enferrujados', MAT_E.ferrugem, ferr), P('peças de ferro', MAT_E.ferroPreto, ferro),
      P('madeira', cor([0.60, 0.46, 0.30], 0, 0.85, 'madeira'), mad), P('disco perfurado', cor([0.66, 0.60, 0.40], 0.3, 0.7, 'ferrugem'), disco),
      P('furos do disco', MAT_E.escuro, furos)],
    pontos: { tampo: [0, 0, H] },
  };
}

// ---------------------------------------------------------------- chapa de compensado encostada
// Parede no plano Y = 0, a chapa em Y < 0 com o topo encostado. ~1 220 × 2 200 × 18 (chapa padrão de compensado).
function chapaEncostada(op = {}) {
  const W = op.larg || 1220, L = op.comp || 2200, e = 18, base = op.afast || 520;
  const inc = Math.asin(base / L);
  const tr = M.cadeia(M.trans(0, -base - e / 2, 0), M.rotX(-inc));
  let g = G.transformar(caixaEm(-W / 2, -e / 2, 0, W / 2, e / 2, L), tr);
  const [dy, dz] = assentarNaParede(g); // a quina de baixo não entra no piso nem a de cima na parede
  g = G.transformar(g, M.trans(0, -dy - 1, -dz + 0.6));
  return { partes: [P('compensado', MAT_E.compensado, g)], pontos: {} };
}

// ---------------------------------------------------------------- máquina verde com cabeçote amarelo
// Máquina antiga de pedestal fundido verde (tronco de pirâmide de ~690 de altura, com porta em arco e veneziana
// de alumínio oxidado) e cabeçote fundido amarelo-claro em cima, com plaqueta, rasgo oval, furo de eixo, um
// tambor amarelo deitado com alavanca vermelha e uma alavanca verde comprida para trás (fotos
// 5_montagem_final/tres_ramos_vista_do_perfil e 2_montagem/visao_geral_cameras). Não foi identificada (parece um
// guincho/sarilho ou o cabeçote de uma máquina-ferramenta de coluna): TODAS as medidas são estimadas pelas fotos.
// A frente (porta em arco) fica em −X local, virada para o suporte, como nas fotos.
function maquinaVerde() {
  const v = G.vazia(), porta = G.vazia(), esc = G.vazia(), am = G.vazia(), plaq = G.vazia(), ver = G.vazia(), ac = G.vazia();
  const hp = 690, incl = (z) => -220 + 20 * z / hp; // y da face da frente do pedestal na altura z
  G.juntar(v, tronco(540, 440, 0, 460, 400, hp), caixaEm(-285, -235, 0, 285, 235, 28));
  // porta em arco (370 × 515) com a veneziana na metade de baixo, deitada na face inclinada da frente
  const arco = [[-185, 0], [185, 0], [185, 330]]; for (let k = 1; k < 12; k++) { const a = Math.PI * k / 12; arco.push([185 * Math.cos(a), 330 + 185 * Math.sin(a)]); } arco.push([-185, 330]);
  const naFrente = M.cadeia(M.trans(0, -220.5, 70), M.rotX(-Math.atan2(20, hp)), M.rotX(Math.PI / 2));
  G.juntar(porta, T(G.extrusao(arco, 0, 7), naFrente));
  for (let k = 0; k < 6; k++) G.juntar(esc, T(caixaEm(-150, 38 + k * 40, 7, 150, 38 + k * 40 + 20, 7.6), naFrente));
  for (let k = 0; k < 6; k++) G.juntar(porta, T(caixaEm(-152, 58 + k * 40, 7, 152, 58 + k * 40 + 5, 16), naFrente));
  G.juntar(ac, T(G.cilindro(9, 0, 14, 10), naFrente, M.trans(150, 400, 7)));
  // cabeçote amarelo: prisma de contorno hexagonal irregular, um pouco mais largo que o pedestal e pendendo para a frente
  G.juntar(am, prismaX([[-218, hp], [135, hp], [135, hp + 330], [70, hp + 420], [-150, hp + 420], [-218, hp + 350]], -240, 240));
  const frenteCab = (x, z, g) => T(g, M.trans(x, -218.6, z), M.rotX(Math.PI / 2));
  G.juntar(plaq, frenteCab(-150, hp + 190, G.caixa(90, 170, 1.2)));                              // plaqueta escura
  G.juntar(esc, frenteCab(90, hp + 170, G.caixaArred(64, 150, 1.2, 30, 5)));                      // rasgo oval
  G.juntar(v, frenteCab(90, hp + 262, G.caixaArred(96, 26, 3, 12, 4)));                           // arco verde em cima do rasgo
  G.juntar(esc, frenteCab(20, hp + 320, G.disco(25, 0.7, 16)));                                   // furo de eixo
  G.juntar(ac, T(G.barra([0, 0, 0], [0, -58, 0], 6, 8), M.trans(90, -218, hp + 150)), T(G.esfera(11, 10, 8), M.trans(90, -280, hp + 150)));
  // tambor amarelo deitado no topo, à esquerda, com o cubo e a alavanca vermelha
  G.juntar(am, T(G.cilindro(140, -100, 100, 28), M.trans(-130, 30, hp + 400), M.rotY(Math.PI / 2)));
  G.juntar(ac, T(G.cilindro(34, 0, 26, 16), M.trans(-230, 30, hp + 400), M.rotY(-Math.PI / 2)));
  G.juntar(ver, G.barra([-250, 30, hp + 400], [-262, -70, hp + 500], 8, 8), T(G.esfera(13, 10, 8), M.trans(-262, -70, hp + 500)));
  // alavanca verde comprida para trás, com a pá na ponta
  G.juntar(v, G.barra([150, 120, hp + 400], [185, 470, hp + 520], 11, 10), T(G.caixa(26, 90, 60), M.trans(188, 500, hp + 530), M.rotX(0.33)));
  const vira = M.rotZ(-Math.PI / 2), gira = (g) => G.transformar(g, vira); // a frente passa de −Y para −X
  return { partes: [P('pedestal verde', MAT_E.verde, gira(v)), P('porta em arco', MAT_E.verdeCinza, gira(porta)), P('aberturas', MAT_E.escuro, gira(esc)),
    P('cabeçote amarelo', MAT_E.amareloClaro, gira(am)), P('plaqueta', cor([0.20, 0.21, 0.22], 0.3, 0.5), gira(plaq)), P('alavanca vermelha', MAT_E.vermelho, gira(ver)),
    P('eixos e puxadores', MAT_E.acoEsc, gira(ac))], pontos: {} };
}

// ---------------------------------------------------------------- armário vermelho: cabine de jateamento
// Pelo perfil das fotos (caixa de chapa vermelha, fechada até o chão, com o canto de cima da frente cortado e
// um visor nessa face inclinada, e uma caixinha no teto) é uma cabine de jateamento de piso. Medidas externas de
// um modelo desse porte: 1 000 × 850 × 1 700 mm (gabinete de jateamento por sucção CMV GS-9075 X). O chanfro
// (começa ~440 abaixo do teto e avança ~170), o visor (~480 × 280), a porta lateral e as bocas das luvas são
// ESTIMADOS (as luvas ficam do lado que as fotos não mostram). Frente (lado da sala) em −Y.
function maquinaVermelha() {
  const W = 1000, D = 850, H = 1700, ch = 440, av = 170, zr = 45;
  const r = G.vazia(), re = G.vazia(), vid = G.vazia(), pr = G.vazia(), ac = G.vazia(), br = G.vazia(), cab = G.vazia();
  G.juntar(r, prismaX([[-D / 2, zr], [D / 2, zr], [D / 2, H], [-D / 2 + av, H], [-D / 2, H - ch]], -W / 2, W / 2));
  G.juntar(pr, caixaEm(-W / 2 + 12, -D / 2 + 12, 0, W / 2 - 12, D / 2 - 12, zr));                 // rodapé recuado
  // face inclinada: tampa com moldura, visor fosco e fecho
  const Ls = Math.hypot(av, ch), ds = [0, av / Ls, ch / Ls], ns = [0, -ch / Ls, av / Ls];
  const naRampa = [1, 0, 0, 0, ds[0], ds[1], ds[2], 0, ns[0], ns[1], ns[2], 0, 0, -D / 2 + av / 2, H - ch / 2, 1];
  G.juntar(re, T(G.caixaArred(620, 400, 7, 14, 3), naRampa, M.trans(0, 0, 3.5)));
  G.juntar(vid, T(G.caixaArred(480, 280, 2.5, 10, 3), naRampa, M.trans(0, 0, 8)));
  G.juntar(ac, T(G.caixa(46, 22, 14), naRampa, M.trans(250, -215, 7)), T(G.caixa(46, 22, 14), naRampa, M.trans(-250, -215, 7)));
  // frente vertical: bocas das luvas (Ø 190, a ~1 050 do chão) com o aro
  for (const sx of [-1, 1]) {
    G.juntar(pr, T(G.disco(95, 0, 28), M.trans(sx * 215, -D / 2 - 0.8, 1050), M.rotX(Math.PI / 2)));
    G.juntar(re, T(G.toro(98, 9, 28, 6), M.trans(sx * 215, -D / 2 - 2, 1050), M.rotX(Math.PI / 2)));
  }
  G.juntar(re, caixaEm(-W / 2 + 60, -D / 2 - 4, 120, W / 2 - 60, -D / 2, 760));                    // tampa do funil
  // lateral do lado do suporte (−X): porta de carga com dobradiças e fecho; etiqueta pequena no alto
  G.juntar(re, caixaEm(-W / 2 - 5, -250, 760, -W / 2, 300, 1500));
  G.juntar(ac, caixaEm(-W / 2 - 16, -235, 1090, -W / 2 - 5, -205, 1170), caixaEm(-W / 2 - 11, 285, 880, -W / 2 - 5, 305, 950), caixaEm(-W / 2 - 11, 285, 1310, -W / 2 - 5, 305, 1380));
  G.juntar(br, caixaEm(-W / 2 - 0.8, 60, 1570, -W / 2, 120, 1600));
  // teto: caixinha da luminária perto de trás, com os cabos soltos
  G.juntar(r, caixaEm(-75, 190, H, 75, 340, H + 120));
  G.juntar(cab, G.tubo(suave([[60, 265, H + 60], [150, 280, H + 90], [260, 330, H + 30], [330, 400, H + 8], [380, 424, H - 120], [370, 428, H - 520]]), 5, 6));
  return { partes: [P('cabine vermelha', MAT_E.vermelho, r), P('tampas e aros', MAT_E.vermelhoEsc, re), P('visor', MAT_E.vidroFosco, vid),
    P('rodapé e bocas das luvas', MAT_E.escuro, pr), P('fechos e dobradiças', MAT_E.zincado, ac), P('etiqueta', MAT_E.branco, br), P('cabos', MAT_E.caboPreto, cab)], pontos: {} };
}

// ---------------------------------------------------------------- guindaste de oficina amarelo (girafa dobrável)
// Guincho hidráulico dobrável de 2 t com prolongador, amarelo. Medidas de catálogo (Vonder 2 t e manuais de
// modelos equivalentes): dobrado ~750 × 700 × 1 510 mm, chassi de 570 de largura, pernas de 1 116, lança de 1 041
// (recolhida) com prolongador de 60 × 60 num tubo de 70 × 70, pernas e base em tubo de ~70 × 70, coluna de ~80,
// macaco longo de 8 t (~62 de diâmetro, ~680 entre pinos), quatro rodízios de 89 mm na base e dois de 76 mm nas
// pontas das pernas. Nas fotos (5_montagem_final/tres_ramos_vista_do_perfil e montagem_final_lateral_cameras,
// 2_montagem/visao_geral_cameras) ele está DOBRADO: as duas pernas giradas para cima e encostadas para trás, a
// lança toda abaixada para a frente com a corrente e o gancho na ponta, o macaco entre o pé da coluna e a lança,
// e um cordão laranja amarrando o conjunto. A posição exata de cada peça dobrada é ESTIMADA pelas fotos.
// Frente (lado da lança e da sala) em −Y.
function guindaste() {
  const am = G.vazia(), pr = G.vazia(), cr = G.vazia(), rod = G.vazia(), garfo = G.vazia(), eti = G.vazia(), furo = G.vazia(), cord = G.vazia();
  // vista lateral: xs = para a frente (lança), z = altura; xl = lateral. Local: y = 380 − xs
  const S = (xs, xl, z) => [xl, 380 - xs, z], X = [1, 0, 0];
  const rodizio = (c, r, eixo, garfoDir) => { // roda de raio r com centro c, eixo de giro `eixo`; o garfo sai na direção garfoDir
    G.juntar(rod, T(G.cilindro(r, -13, 13, 16), M.trans(...c), M.alinharZ(eixo)));
    G.juntar(garfo, T(G.cilindro(7, -17, 17, 8), M.trans(...c), M.alinharZ(eixo)));
    const topo = c.map((v, k) => v + garfoDir[k] * (r + 9));
    for (const s of [-1, 1]) G.juntar(garfo, barraRet(c.map((v, k) => v + eixo[k] * s * 16), topo.map((v, k) => v + eixo[k] * s * 16), 4, 30, eixo));
    G.juntar(garfo, barraRet(topo.map((v, k) => v - garfoDir[k] * 3), topo.map((v, k) => v + garfoDir[k] * 3), 44, 44, eixo));
    return topo.map((v, k) => v + garfoDir[k] * 3);
  };
  // ---- base: travessa de trás e duas longarinas, sobre quatro rodízios de 89 mm
  const zb = 140; // eixo dos tubos da base
  G.juntar(am, barraRet(S(60, -285, zb), S(60, 285, zb), 70, 70, [0, 0, 1]));
  for (const s of [-1, 1]) {
    G.juntar(am, barraRet(S(25, s * 250, zb), S(560, s * 250, zb), 70, 70, X));
    for (const xs of [70, 500]) rodizio(S(xs, s * 250, 44.5), 44.5, X, [0, 0, 1]);
    // perna levantada: gira no pino da frente da longarina e encosta para trás a 26° da vertical; rodízio na ponta
    const a = 26 * Math.PI / 180, pe = S(560, s * 250, 165), ponta = S(560 - 1116 * Math.sin(a), s * 250, 165 + 1116 * Math.cos(a));
    G.juntar(am, barraRet(pe, ponta, 70, 70, X));
    const u = [0, Math.sin(a), Math.cos(a)], nf = [0, -Math.cos(a), Math.sin(a)]; // ao longo da perna; face de baixo dela (agora virada para a frente e para cima)
    rodizio(ponta.map((v, k) => v - u[k] * 60 + nf[k] * (35 + 6 + 9 + 38)), 38, X, nf.map((v) => -v));
    G.juntar(garfo, T(G.cilindro(9, -40, 40, 10), M.trans(...S(545, s * 250, 150)), M.rotY(Math.PI / 2)));       // pino da perna
    G.juntar(eti, barraRet(pe.map((v, k) => v + u[k] * 330 + s * (k === 0 ? 35.6 : 0)), pe.map((v, k) => v + u[k] * 430 + s * (k === 0 ? 35.6 : 0)), 1, 46, X)); // adesivo de aviso
  }
  // ---- coluna (levemente inclinada para trás), com os dois tirantes de barra chata
  const pvS = [75, 1440], pe0 = S(110, 0, zb + 35), topo = S(pvS[0], 0, pvS[1]);
  G.juntar(am, barraRet(pe0, topo, 80, 80, X), barraRet(S(60, 0, zb + 41), S(150, 0, zb + 41), 150, 12, X));
  for (const s of [-1, 1]) G.juntar(am, barraRet(S(420, s * 205, zb + 38), S(100, s * 48, 1050), 8, 50, X));
  const pivo = [pvS[0] + 55, pvS[1] + 30]; // pino da lança, à frente do topo da coluna (a lança desce sem encostar nela)
  for (const s of [-1, 1]) G.juntar(am, barraRet(S(pvS[0] - 10, s * 46, pvS[1] - 50), S(pivo[0] + 8, s * 46, pivo[1] + 22), 8, 90, X)); // orelhas do pivô
  G.juntar(garfo, T(G.cilindro(9, -58, 58, 10), M.trans(...S(pivo[0], 0, pivo[1])), M.rotY(Math.PI / 2)));
  // corrimão de empurrar: arco fino atrás do topo da coluna
  G.juntar(am, G.tubo(suave([S(70, -150, 1180), S(20, -150, 1300), S(-5, -110, 1375), S(-8, 0, 1390), S(-5, 110, 1375), S(20, 150, 1300), S(70, 150, 1180)], 6), 11, 8));
  for (const s of [-1, 1]) G.juntar(am, G.barra(S(70, s * 150, 1180), S(95, s * 42, 1180), 11, 8));
  // ---- lança abaixada: do pivô, a 33° da vertical para a frente; prolongador de 60 × 60 saindo da ponta
  const b = 33 * Math.PI / 180, dl = [Math.sin(b), -Math.cos(b)], naLanca = (t, off = 0) => S(pivo[0] + dl[0] * t - dl[1] * off, 0, pivo[1] + dl[1] * t + dl[0] * off);
  G.juntar(am, barraRet(naLanca(-90), naLanca(950), 70, 70, X), barraRet(naLanca(820), naLanca(1160), 60, 60, X));
  for (const t of [300, 480, 660, 840]) for (const s of [-1, 1]) G.juntar(furo, T(G.disco(9, 0, 10), M.trans(...naLanca(t).map((v, k) => v + (k === 0 ? s * 35.4 : 0))), M.rotY(s * Math.PI / 2)));
  for (const s of [-1, 1]) G.juntar(eti, barraRet(naLanca(120).map((v, k) => v + (k === 0 ? s * 35.6 : 0)), naLanca(260).map((v, k) => v + (k === 0 ? s * 35.6 : 0)), 1, 54, X));
  // ---- macaco longo: do suporte no pé da coluna à orelha sob a lança; camisa amarela, haste cromada, bomba embaixo
  const m0 = S(200, 0, 300), m1 = naLanca(520, -66), dm = m1.map((v, k) => v - m0[k]), Lm = Math.hypot(...dm), um = dm.map((v) => v / Lm), noMacaco = (t) => m0.map((v, k) => v + um[k] * t);
  G.juntar(am, G.barra(noMacaco(20), noMacaco(Lm * 0.66), 31, 16), barraRet(S(120, 0, 290), S(205, 0, 290), 60, 14, X));
  G.juntar(cr, G.barra(noMacaco(Lm * 0.66), noMacaco(Lm - 12), 15, 12));
  G.juntar(pr, G.barra(noMacaco(-6), noMacaco(46), 36, 14), G.barra(noMacaco(Lm - 14), noMacaco(Lm + 6), 20, 10));
  G.juntar(pr, G.barra(noMacaco(20).map((v, k) => v + (k === 0 ? 30 : 0)), noMacaco(95).map((v, k) => v + (k === 0 ? 62 : 0)), 13, 10)); // encaixe da alavanca
  for (const s of [-1, 1]) G.juntar(am, barraRet(naLanca(505, -20).map((v, k) => v + (k === 0 ? s * 26 : 0)), naLanca(535, -78).map((v, k) => v + (k === 0 ? s * 26 : 0)), 8, 44, X));
  G.juntar(eti, T(G.revolucao([[31.5, 150], [31.5, 300]], 8, { a0: -2.6, a1: -0.5 }), M.trans(...m0), M.alinharZ(um)));
  // ---- corrente e gancho na ponta do prolongador
  const pg = naLanca(1150), elo = anelTubo(estadio(38, 20, 5.5, 5), 2.75, 5); let zc = pg[2] - 30;
  for (let k = 0; k < 8; k++, zc -= 27) G.juntar(cr, T(elo, M.trans(pg[0], pg[1], zc), M.rotZ(k % 2 ? Math.PI / 2 : 0)));
  G.juntar(cr, G.barra([pg[0], pg[1], zc + 8], [pg[0], pg[1], zc - 26], 7, 8));
  const gancho = []; for (let k = 0; k <= 12; k++) { const a = Math.PI * 0.5 - Math.PI * 1.35 * k / 12; gancho.push([pg[0], pg[1] + 26 * Math.cos(a), zc - 52 + 26 * Math.sin(a)]); }
  G.juntar(cr, G.tubo(gancho, 7, 8));
  // ---- cordão laranja amarrando as pernas, a coluna e a lança
  G.juntar(cord, anelTubo([S(225, -292, 760), S(375, -292, 760), S(375, 292, 760), S(225, 292, 760), S(44, 60, 760), S(44, -60, 760)], 3, 5));
  return { partes: [P('guindaste', MAT_E.amarelo, am), P('bomba e pinos do macaco', MAT_E.acoEsc, pr), P('haste, corrente e gancho', MAT_E.aco, cr),
    P('rodízios', MAT_E.borracha, rod), P('garfos e pinos', MAT_E.zincado, garfo), P('adesivos', MAT_E.branco, eti), P('furos da lança', MAT_E.escuro, furo),
    P('cordão laranja', MAT_E.laranja, cord)], pontos: {} };
}

// ---------------------------------------------------------------- tambor azul de 200 L
// Tambor metálico de 200 L de tampa fixa: Ø 585 nas recravações e ~597 nos dois frisos de rolamento, 878 de
// altura, tampa e fundo rebaixados ~12 mm, bocais de 2" e 3/4" opostos, a ~222 mm do centro (ISO 15750). Corpo
// azul-escuro e tampa cinza-claro, com uma etiqueta branca de produto químico entre os frisos (os frisos ficam a
// ~290 e ~590 do fundo, pela foto). Em cima: um saco plástico branco amassado, um frasco deitado e peças
// (fotos 5_montagem_final/tres_ramos_vista_do_perfil e 2_montagem/visao_geral_cameras; estimados).
function tambor() {
  const R = 286, Rc = 292.5, Rf = 298.5, H = 878, zt = H - 12;
  const az = G.vazia(), tampa = G.vazia(), rot = G.vazia(), txt = G.vazia(), ver = G.vazia(), bocal = G.vazia(), saco = G.vazia(), fr = G.vazia(), frAz = G.vazia(), pecas = G.vazia();
  const friso = (z) => [[R, z - 15], [R + 5, z - 11], [Rf, z - 4], [Rf, z + 4], [R + 5, z + 11], [R, z + 15]];
  G.juntar(az, G.revolucao([[R - 10, 0], [Rc - 1.5, 0], [Rc, 1.5], [Rc, 10], [R + 2, 13], [R, 17], ...friso(290), ...friso(590), [R, H - 17], [R + 2, H - 13], [Rc, H - 10], [Rc, H - 1.5], [Rc - 1.5, H]], 48, { quina: 40 }));
  G.juntar(az, G.disco(R - 10, 0.5, 48, true));
  G.juntar(tampa, G.revolucao([[Rc - 1.5, H], [R - 6, H], [R - 8, H - 2], [R - 8, zt], [216, zt], [213, zt + 2.5], [206, zt + 2.5], [203, zt], [0, zt]], 48, { quina: 40 }));
  // bocais: 2" (flange Ø 70) e 3/4" (Ø 38), opostos
  const ab = 0.7, cb = Math.cos(ab), sb = Math.sin(ab);
  G.juntar(bocal, T(G.revolucao([[0, 12], [26, 12], [26, 9], [35, 9], [35, 0]].reverse(), 20), M.trans(222 * cb, 222 * sb, zt)), T(G.extrusao(hexa(13), 12, 16), M.trans(222 * cb, 222 * sb, zt)));
  G.juntar(bocal, T(G.revolucao([[0, 9], [13, 9], [13, 7], [19, 7], [19, 0]].reverse(), 16), M.trans(-222 * cb, -222 * sb, zt)));
  // etiqueta branca (~320 × 210) na frente (−Y), com faixas de texto e o losango vermelho de risco
  const a0 = -Math.PI / 2 - 0.56, a1 = -Math.PI / 2 + 0.56;
  G.juntar(rot, G.revolucao([[R + 0.6, 335], [R + 0.6, 545]], 20, { a0, a1 }));
  const r = rng(8);
  for (let k = 0; k < 9; k++) { const z = 520 - k * 19, ini = a0 + 0.06, fim = ini + 0.35 + 0.3 * r(); G.juntar(txt, G.revolucao([[R + 0.9, z], [R + 0.9, z + (k === 0 ? 11 : 5)]], 8, { a0: ini, a1: fim })); }
  G.juntar(ver, T(G.caixa(50, 1, 50), M.rotZ(0.33), M.trans(0, -(R + 1.6), 395), M.rotY(Math.PI / 4)));
  // em cima: saco plástico branco amassado, frasco deitado com rótulo azul, peças escuras
  const sc = G.esfera(1, 18, 12);
  for (let i = 0; i < sc.pos.length; i += 3) { const k = 1 + 0.16 * Math.sin(sc.pos[i] * 9 + sc.pos[i + 1] * 7) + 0.10 * (r() - 0.5); sc.pos[i] *= k; sc.pos[i + 1] *= k; sc.pos[i + 2] *= k; }
  G.juntar(saco, T(sc, M.trans(-70, 50, zt + 40), M.rotZ(0.5), M.esc(125, 95, 42)));
  G.juntar(fr, T(G.cilindro(30, -75, 75, 16), M.trans(60, -110, zt + 30.5), M.rotZ(-0.4), M.rotY(Math.PI / 2)), T(G.cilindro(13, 75, 98, 12), M.trans(60, -110, zt + 30.5), M.rotZ(-0.4), M.rotY(Math.PI / 2)));
  G.juntar(frAz, T(G.cilindro(30.6, -35, 30, 16, false), M.trans(60, -110, zt + 30.5), M.rotZ(-0.4), M.rotY(Math.PI / 2)));
  G.juntar(pecas, T(G.caixa(90, 40, 22), M.trans(110, 60, zt + 11), M.rotZ(0.8)), T(G.caixa(50, 50, 14), M.trans(-170, -90, zt + 7), M.rotZ(0.3)));
  return { partes: [P('tambor', MAT_E.azulTambor, az), P('tampa', MAT_E.cinzaTampa, tampa), P('etiqueta', MAT_E.branco, rot), P('texto da etiqueta', cor([0.25, 0.26, 0.28], 0, 0.6), txt),
    P('losango de risco', MAT_E.vermelho, ver), P('bocais', MAT_E.zincado, bocal), P('saco plástico', cor([0.88, 0.89, 0.88], 0, 0.3), saco), P('frasco', MAT_E.branco, fr),
    P('rótulo do frasco', MAT_E.azulLogo, frAz), P('peças', MAT_E.ferroPreto, pecas)], pontos: {} };
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
  const preta = G.vazia(), txt = G.vazia(), alu = G.vazia(), fecho = G.vazia(), rod = G.vazia(), canto = G.vazia();
  G.juntar(preta, T(G.caixaArred(620, 230, 420, 18, 4), M.trans(0, 0, 225)));
  for (const sx of [-1, 1]) G.juntar(rod, T(G.cilindro(14, -10, 10, 12), M.trans(sx * 260, 0, 14), M.rotY(Math.PI / 2)));
  const l1 = letreiro('QUALISYS', 52, 0.6, 0.16), l2 = letreiro('MOTION CAPTURE SYSTEMS', 13, 0.5, 0.16);
  const frente = (l, z) => [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, -l.larg / 2, -115.6, z, 1];
  G.juntar(txt, T(l1.g, frente(l1, 250)), T(l2.g, frente(l2, 215)));
  const [dx, dy] = op.maleta || [150, -650], mm = M.cadeia(M.trans(dx, dy, 0), M.rotZ(0.12));
  G.juntar(alu, T(G.caixaArred(1100, 260, 136, 14, 4), mm, M.trans(0, 0, 73)));
  // cantoneiras pretas nas quinas, friso do meio (onde a tampa fecha), fechos e alça
  for (const sx of [-1, 1]) G.juntar(canto, T(caixaEm(sx * 551 - 6, -131, 5, sx * 551 + 6, 131, 141.5), mm));
  G.juntar(canto, T(caixaEm(-550, -131.5, 70, 550, -130, 76), mm));
  for (const x of [-300, 300]) G.juntar(fecho, T(caixaEm(x - 25, -136, 55, x + 25, -130, 95), mm));
  G.juntar(fecho, T(G.tubo([[-60, -131, 73], [-60, -152, 73], [60, -152, 73], [60, -131, 73]], 7, 8), mm));
  return { partes: [P('mala preta', cor([0.03, 0.03, 0.03], 0, 0.55, 'fosco'), preta), P('letreiro', MAT_E.branco, txt), P('rodinhas', MAT_E.borracha, rod),
    P('maleta de alumínio', cor([0.80, 0.81, 0.82], 0.9, 0.38, 'metal'), alu), P('cantoneiras', cor([0.10, 0.10, 0.11], 0.3, 0.5), canto), P('fechos e alça', MAT_E.acoEsc, fecho)], pontos: {} };
}

Object.assign(window.LAB_MODELOS, { malasQualisys, transformador, bancadaMorsa, chapaEncostada, maquinaVerde, maquinaVermelha, guindaste, tambor, eletroduto, fioParede });
})();
