// Cena do laboratório para a vista 3D do Experimento (mm, eixos do Qualisys, Z para cima).
// O L-frame fica na origem por definição (é ele que define os eixos na calibração).
//
// Montagem final (fotos em experimento/fotos/5_montagem_final): três correntes que se encontram num nó,
// presas ao braço do perfil de alumínio na parede, ao canto do tampo do suporte de aço e ao poste com peso.
// Quando o ensaio tem os marcadores 'centro' e C1_01…C3_03 (ex.: Estatica_corrente.tsv), as correntes passam
// pelos marcadores medidos e as peças são posicionadas prolongando cada cabo até o seu ponto de fixação.
// A parede NÃO está alinhada com os eixos do Qualisys (o L-frame foi posto em diagonal): a direção dela sai
// dos dados, pela reta que passa pela fixação no braço do perfil e pela fixação no suporte (ambos junto da
// parede, como nas fotos). Tudo o que não foi medido (móveis, câmeras) é posto no "sistema da parede":
// s = ao longo da parede (positivo para a esquerda de quem olha a parede), n = distância da parede.
(() => {
'use strict';
const rad = (g) => g * Math.PI / 180;

const CONFIG = {
  // Sala medida com trena laser: 14 110 mm de comprimento × 4 443 mm de largura, pé-direito 7 887 mm
  // (fotos em experimento/fotos/3_medicoes). O portão da garagem é centralizado e vai quase de canto a canto.
  sala: { comp: 14110, larg: 4443, alt: 7887 },
  // Ponto de captura das panorâmicas (1 500 mm do chão) e transformação do "sistema da sala" (+X portão,
  // +Y parede da porta, origem no chão sob a câmera: o de proxies.js e sala.js) para o Qualisys. pos e giro
  // são recalculados (ajustarSala) para a parede dos perfis do panorama coincidir com a encontrada nos dados.
  captura: { pos: [-3757, 236], altura: 1500, giro: 90 },
  azimute0Sala: 114.5,                       // alinhamento do panorama no sistema da sala (pontos de fuga)
  perfilNaSala: 150,                         // posição do perfil ao longo da parede, no sistema da sala (~5 m do portão)
  piso: { lado: 1200 },                      // mm cobertos por piso.jpg
  // móveis do panorama que saem da cena: os marcados "antigo" em proxies.js (não existem no estado final)
  // e os que viraram modelo 3D (o pallet sobre o caixote é a mesaPallet)
  removerProxies: ['pallet', 'caixa_sobre_pallet', 'caixa_laranja', 'caixa_mochila', 'tabua_em_pe', 'mesa_pecas', 'mesa_caixote'],
  montagem: {
    // sem os marcadores dos cabos: parede em x = 1330 (normal para −X) e peças no sistema da parede [s, n]
    parede: { o: [1330, 326], normal: [-1, 0] },
    suporte: [-1300, 550], poste: [-550, 1450], no: [-350, 750, 260],
    alturaSuporte: 1100,                     // altura do tampo do suporte de aço (corrente presa no canto)
    afastSuporte: 60,                        // folga mínima entre o suporte e a parede
  },
  // móveis da montagem final, no sistema da parede [s, n] (fotos)
  moveis: { mesaPallet: [1000, 420], caixas: [2050, 450], tabuas: [2600, 0] },
  // Câmeras (NO_OF_CAMERAS = 3): posições de partida pelas fotos, no sistema da parede [s, n]. Regras da
  // busca (escolherCameras): todas na mesma altura; cada uma mira no centro dos marcadores e vê TODOS os
  // alvos (dentro do campo de visão, nenhum raio bloqueado); nenhuma câmera aparece no campo de outra.
  visada: { fovH: 56, fovV: 44, folga: 3, folgaCamera: 4, sepMin: 35, distancias: [1800, 2200, 2600, 3000, 3400], alturas: [1700, 1800, 1600, 1900, 1500, 2000], alturaFoto: 1700 },
  // Parte elétrica (sistema da parede [s, n]; ajustar pelas fotos): câmeras ligadas em série
  // (câmera -> câmera -> câmera) até a base da Qualisys (Camera Sync Unit) e dela ao notebook 1;
  // células de carga (4 fios + terra cada) até a base de aquisição e dela ao notebook 2.
  eletrica: {
    // mesa dos dois computadores, em frente à porta pequena (parede oposta; centro da porta em s ≈ −2 850,
    // pelo panorama), quase centralizada com ela e um pouco deslocada para o lado do portão da garagem (+s):
    // notebook 1 + base da Qualisys (lado do portão) e notebook 2 + base das células de carga
    mesaQualisys: [-2550, 3500], comprimentoMesa: 1400,
  },
  cameras: [
    [2000, 1200],                            // à esquerda de quem olha a parede, junto das caixas
    [-3000, 1700],                           // à direita, perto do guindaste amarelo
    [-1800, 3300],                           // à frente e à direita
  ],
};
// derivado (usado por experimento.js e pelo renderizador)
Object.defineProperty(CONFIG, 'ambiente', { enumerable: true, get() {
  const c = CONFIG.captura;
  return { centro: [c.pos[0], c.pos[1], c.altura], raio: 4500, azimute0: rad(CONFIG.azimute0Sala + c.giro) };
} });

const G = () => window.LAB_GEOM, Mo = () => window.LAB_MODELOS, M = () => G().mat;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dist = (a, b) => Math.hypot(...sub(a, b));
const unit2 = (v) => { const n = Math.hypot(v[0], v[1]) || 1; return [v[0] / n, v[1] / n]; };

// ---------------------------------------------------------------- sistema da sala <-> Qualisys
function salaParaQ(x, y) {
  const c = CONFIG.captura, a = rad(c.giro);
  return [c.pos[0] + x * Math.cos(a) - y * Math.sin(a), c.pos[1] + x * Math.sin(a) + y * Math.cos(a)];
}
function qParaSala(x, y) {
  const c = CONFIG.captura, a = -rad(c.giro), dx = x - c.pos[0], dy = y - c.pos[1];
  return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
}
const matSala = () => M().cadeia(M().trans(CONFIG.captura.pos[0], CONFIG.captura.pos[1], 0), M().rotZ(rad(CONFIG.captura.giro)));
// a parede dos perfis é a de y = y_oposta no sistema da sala, com normal +Y para dentro; leva essa parede
// (e o perfil, em x = perfilNaSala) para a parede encontrada no Qualisys
function ajustarSala(P) {
  const W = window.LAB_PAREDES || { y_oposta: -1586 }, c = CONFIG.captura;
  c.giro = Math.atan2(P.n[1], P.n[0]) * 180 / Math.PI - 90;
  const a = rad(c.giro), sx = CONFIG.perfilNaSala, sy = W.y_oposta;
  c.pos = [P.o[0] - (sx * Math.cos(a) - sy * Math.sin(a)), P.o[1] - (sx * Math.sin(a) + sy * Math.cos(a))];
}
const proxiesAtivos = () => (window.LAB_PROXIES || []).filter((p) => !p.antigo && !CONFIG.removerProxies.includes(p.nome));

// ---------------------------------------------------------------- sistema da parede
// P = { o:[x,y] (perfil, no chão, no plano da parede), s:[..] (ao longo, para a esquerda), n:[..] (para dentro) }
const naParede = (P, s, n, z = 0) => [P.o[0] + s * P.s[0] + n * P.n[0], P.o[1] + s * P.s[1] + n * P.n[1], z];
const daParede = (P, p) => { const d = [p[0] - P.o[0], p[1] - P.o[1]]; return [d[0] * P.s[0] + d[1] * P.s[1], d[0] * P.n[0] + d[1] * P.n[1]]; };
// matriz de um modelo cujo X local vai para ex e Y local para ey (no plano), na posição t
const matBase = (ex, ey, t) => [ex[0], ex[1], 0, 0, ey[0], ey[1], 0, 0, 0, 0, 1, 0, t[0], t[1], t[2] || 0, 1];

// ---------------------------------------------------------------- cabos a partir dos marcadores
function ate(p, q, z) { const t = (z - p[2]) / ((q[2] - p[2]) || 1e-9); return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, z]; }
// curva suave (Catmull-Rom) passando pelos pontos
function suave(pts, n = 24) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map((a) => 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3)));
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}
// marcadores = [{ nome, p }] -> { no, cabos:{ perfil, suporte, poste: pontos do nó para fora } } ou null.
// Qual cabo vai a qual peça: o do perfil é o mais curto na horizontal e o mais "em pé" (o braço fica quase em
// cima do nó); dos outros dois, o do suporte é o que termina mais longe do nó (o suporte fica junto da parede).
function cabosMedidos(marcadores) {
  if (!marcadores) return null;
  const no = marcadores.find((m) => /^centro$/i.test(m.nome));
  const grupos = {};
  for (const m of marcadores) { const r = /^C(\d+)_0?(\d+)$/i.exec(m.nome); if (r) (grupos[r[1]] = grupos[r[1]] || []).push(m.p); }
  const ks = Object.keys(grupos);
  if (!no || ks.length !== 3) return null;
  const cabos = ks.map((k) => {
    const pts = grupos[k].slice().sort((a, b) => dist(a, no.p) - dist(b, no.p));
    const d = sub(pts[pts.length - 1], no.p);
    return { pts, h: Math.hypot(d[0], d[1]), inc: Math.atan2(d[2], Math.hypot(d[0], d[1])) };
  });
  cabos.sort((a, b) => b.inc - a.inc);           // mais em pé primeiro
  const [perfil, ...resto] = cabos;
  resto.sort((a, b) => b.h - a.h);               // o mais longo na horizontal é o do suporte
  return { no: no.p, cabos: { perfil: perfil.pts, suporte: resto[0].pts, poste: resto[1].pts } };
}

// ---------------------------------------------------------------- cabos
// rota de cabo: de a, desce (por 'desce', lista de pontos no caminho até o chão), corre pelo chão com folga
// e curvas suaves (pseudoaleatórias, mas fixas pela semente) e sobe até b (por 'sobe', do chão até b)
function rotaCabo(a, b, semente, { desce = [], sobe = [], folga = 0.18 } = {}) {
  let x = Math.sin(semente * 12.9898) * 43758.5453;
  const rnd = () => { x = Math.sin(x * 78.233 + 1.7) * 43758.5453; return x - Math.floor(x); };
  const r = 4.5;
  const ini = desce.length ? desce[desce.length - 1] : a, fim = sobe.length ? sobe[0] : b;
  const A = [ini[0], ini[1], r], B = [fim[0], fim[1], r];
  const d = [B[0] - A[0], B[1] - A[1]], L = Math.hypot(d[0], d[1]) || 1, nrm = [-d[1] / L, d[0] / L];
  const amp = Math.min(450, folga * L) * (rnd() < 0.5 ? -1 : 1), meio = [];
  const n = Math.max(2, Math.round(L / 600));
  for (let i = 1; i < n; i++) {
    const t = i / n, w = amp * Math.sin(Math.PI * t) + (rnd() - 0.5) * Math.min(160, 0.06 * L);
    meio.push([A[0] + d[0] * t + nrm[0] * w, A[1] + d[1] * t + nrm[1] * w, r]);
  }
  const pts = [a, ...desce];
  if (ini[2] > r + 1) pts.push([ini[0] + (A[0] - ini[0]) * 0.02, ini[1], r + 30]);
  pts.push(A, ...meio, B);
  if (fim[2] > r + 1) pts.push([fim[0], fim[1], r + 30]);
  pts.push(...sobe, b);
  return suave(pts.filter((p, i, arr) => i === 0 || dist(p, arr[i - 1]) > 1), 10).map((p) => [p[0], p[1], Math.max(p[2], r)]);
}

// ---------------------------------------------------------------- linha de visada
// obstáculo = caixa orientada { c:[x,y,z] centro, h:[hx,hy,hz] meias-medidas, g: giro em Z (rad) }
function caixaQ(cx, cy, z0, sx, sy, sz, g = 0) { return { c: [cx, cy, z0 + sz / 2], h: [sx / 2, sy / 2, sz / 2], g }; }
function distCaixa2D(x, y, o) {
  const cg = Math.cos(-o.g), sg = Math.sin(-o.g), dx = x - o.c[0], dy = y - o.c[1];
  const lx = Math.abs(dx * cg - dy * sg) - o.h[0], ly = Math.abs(dx * sg + dy * cg) - o.h[1];
  return Math.hypot(Math.max(lx, 0), Math.max(ly, 0)) + Math.min(Math.max(lx, ly), 0);
}
// o segmento a->b (parando 15 mm antes de b) atravessa a caixa?
function cortaCaixa(a, b, o) {
  const cg = Math.cos(-o.g), sg = Math.sin(-o.g);
  const loc = (p) => { const dx = p[0] - o.c[0], dy = p[1] - o.c[1]; return [dx * cg - dy * sg, dx * sg + dy * cg, p[2] - o.c[2]]; };
  const A = loc(a), B = loc(b), d = sub(B, A), L = Math.hypot(...d), tmax = Math.max(0, 1 - 15 / (L || 1));
  let t0 = 0, t1 = tmax;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-9) { if (Math.abs(A[k]) > o.h[k]) return false; continue; }
    let ta = (-o.h[k] - A[k]) / d[k], tb = (o.h[k] - A[k]) / d[k];
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}
// ângulos (graus) do ponto p no campo de uma câmera com centro óptico o mirando em alvo
function angulos(o, alvo, p) {
  const f = sub(alvo, o), nf = Math.hypot(...f);
  for (let k = 0; k < 3; k++) f[k] /= nf;
  let r = [f[1], -f[0], 0]; const nr = Math.hypot(...r) || 1; r = r.map((v) => v / nr);
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], v = sub(p, o), z = dot(v, f), deg = 180 / Math.PI;
  return { z, h: Math.atan2(dot(v, r), z) * deg, v: Math.atan2(dot(v, u), z) * deg };
}
const noCampo = (a, folga) => a.z > 0 && Math.abs(a.h) <= CONFIG.visada.fovH / 2 - folga && Math.abs(a.v) <= CONFIG.visada.fovV / 2 - folga;
// a câmera vê cada marcador? -> [{ ok, motivo }]
function verAlvos(o, alvo, marcadores, obst) {
  return marcadores.map((m) => {
    if (!noCampo(angulos(o, alvo, m.p), CONFIG.visada.folga)) return { ok: false, motivo: 'fora do campo de visão' };
    const bloq = obst.find((ob) => cortaCaixa(o, m.p, ob));
    return bloq ? { ok: false, motivo: 'bloqueado' + (bloq.nome ? ' por ' + bloq.nome : '') } : { ok: true };
  });
}
// posições das câmeras: mesma altura para todas; cada uma perto da posição da foto, em chão livre,
// vendo todos os alvos e sem nenhuma outra câmera no seu campo de visão (os LEDs ofuscariam a imagem)
function escolherCameras(inicios, alvo, marcadores, obst, livreChao) {
  const V = CONFIG.visada, L = Mo(), oc = {};
  const centroOptico = (alt) => (oc[alt] = oc[alt] || (L.cameraTripe ? L.cameraTripe({ altura: alt, inclinacao: 0 }).centroOptico : [100, 0, alt]));
  const avaliar = (x, y, alt) => {
    const giro = Math.atan2(alvo[1] - y, alvo[0] - x), c0 = centroOptico(alt);
    const o = [x + c0[0] * Math.cos(giro), y + c0[0] * Math.sin(giro), alt];
    const vis = verAlvos(o, alvo, marcadores, obst);
    return { x, y, alt, giro, o, vis, n: vis.filter((v) => v.ok).length };
  };
  // a câmera k aparece no campo de e (ou e no de k)?
  const seVeem = (k, e) => noCampo(angulos(e.o, alvo, k.o), -V.folgaCamera) || noCampo(angulos(k.o, alvo, e.o), -V.folgaCamera);
  const sep = (k, e) => {
    const a = Math.atan2(k.y - alvo[1], k.x - alvo[0]), b = Math.atan2(e.y - alvo[1], e.x - alvo[0]);
    return Math.abs(((a - b) * 180 / Math.PI + 540) % 360 - 180);
  };
  let melhor = null;
  for (const alt of V.alturas) {
    const escolhidas = [];
    let custoTotal = 0, completas = 0;
    for (const p0 of inicios) {
      const az0 = Math.atan2(p0[1] - alvo[1], p0[0] - alvo[0]);
      const cand = [avaliar(p0[0], p0[1], alt)];
      for (let daz = -180; daz < 180; daz += 5) for (const d of V.distancias) {
        const a = az0 + daz * Math.PI / 180;
        cand.push(avaliar(alvo[0] + d * Math.cos(a), alvo[1] + d * Math.sin(a), alt));
      }
      const validos = cand.filter((k) => livreChao(k.x, k.y) && escolhidas.every((e) => sep(k, e) >= V.sepMin && !seVeem(k, e)));
      const custo = (k) => Math.hypot(k.x - p0[0], k.y - p0[1]);
      const ok = validos.filter((k) => k.n === marcadores.length).sort((a, b) => custo(a) - custo(b));
      const k = ok[0] || validos.sort((a, b) => b.n - a.n || custo(a) - custo(b))[0] || cand[0];
      if (k.n === marcadores.length) completas++;
      custoTotal += custo(k);
      escolhidas.push(k);
    }
    // primeiro: todas vendo tudo; depois: perto das posições e da altura das fotos (~1,7 m)
    const nota = completas * 1e7 - custoTotal - 3 * inicios.length * Math.abs(alt - V.alturaFoto);
    if (!melhor || nota > melhor.nota) melhor = { nota, escolhidas };
  }
  return melhor.escolhidas.map((k) => ({ ...k, seVe: melhor.escolhidas.some((e) => e !== k && seVeem(k, e)) }));
}

// ---------------------------------------------------------------- montagem da cena
// alvo = centro dos marcadores; marcadores = [{nome, p}] (posições médias). Devolve { grupos, medido, visada }
function montar(cena, alvo, marcadores) {
  const Mt = M(), L = Mo(), grupos = { lframe: [], cameras: [], montagem: [], sala: [] };
  const add = (g, modelo, m) => { if (modelo) grupos[g].push(cena.adicionar(modelo, m)); };
  const ponto = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
  const mt = CONFIG.montagem, med = cabosMedidos(marcadores), obst = [];
  const ultimo = (c) => c[c.length - 1];
  const prolongar = (c, z) => ate(c.length > 1 ? c[c.length - 2] : med.no, ultimo(c), z);

  // ---- alturas de fixação: o braço do perfil e o suporte crescem se o último marcador estiver acima deles
  const cel = L.celulaCarga ? L.celulaCarga() : null, dzCel = cel ? cel.pontos.topo[2] - cel.pontos.base[2] : 0;
  const perfil0 = L.perfilParede(), a20 = perfil0.pontos.amarracao2, zBraco0 = 1000;
  const zSaida = med ? Math.max(a20[2] - dzCel, ultimo(med.cabos.perfil)[2] + 30) : a20[2] - dzCel; // onde a corrente sai da célula
  const perfil = med ? L.perfilParede({ alturaBraco: zBraco0 + (zSaida + dzCel - a20[2]) }) : perfil0;
  const a2 = perfil.pontos.amarracao2; // braço do lado do suporte (à direita de quem olha a parede)
  const hSup = med ? Math.max(mt.alturaSuporte, ultimo(med.cabos.suporte)[2] + 40) : mt.alturaSuporte;

  // ---- parede: pela fixação no braço e pela fixação no suporte (ambas junto da parede)
  let P, saidaPerfil, fixSup, no;
  if (med) {
    no = med.no;
    saidaPerfil = prolongar(med.cabos.perfil, zSaida);
    fixSup = prolongar(med.cabos.suporte, hSup);
    let s = unit2([saidaPerfil[0] - fixSup[0], saidaPerfil[1] - fixSup[1]]); // do suporte para o perfil = esquerda
    let n = [-s[1], s[0]];
    if ((no[0] - saidaPerfil[0]) * n[0] + (no[1] - saidaPerfil[1]) * n[1] < 0) { n = [-n[0], -n[1]]; s = [n[1], -n[0]]; }
    // origem do perfil: a ponta do braço está a (a2.x, a2.y) do perfil, no sistema da parede
    P = { s, n, o: [saidaPerfil[0] - a2[0] * s[0] - a2[1] * n[0], saidaPerfil[1] - a2[0] * s[1] - a2[1] * n[1]] };
  } else {
    const n = unit2(mt.parede.normal);
    P = { n, s: [n[1], -n[0]], o: mt.parede.o };
    no = naParede(P, mt.no[0], mt.no[1], mt.no[2]);
  }
  ajustarSala(P);
  const mPerfil = matBase(P.s, P.n, [P.o[0], P.o[1], 0]);           // perfil: X local ao longo, Y local para dentro
  const paraParede = (t) => matBase([-P.s[0], -P.s[1]], [-P.n[0], -P.n[1]], t); // móveis com +Y local = lado da parede

  // ---- sala (modelo com as fotos assadas, ou caixas dos móveis pintadas com o panorama)
  const mCap = matSala(), A = window.LAB_AMBIENTE || {};
  if (window.LAB_SALA && A.sala) {
    const mat = { assado: true, textura: A.sala, ao: 1, realce: 0.15, cor: [1, 1, 1], metal: 0, rug: 1 };
    const fora = (nm) => CONFIG.removerProxies.some((r) => nm === 'proxy:' + r);
    add('sala', { partes: window.LAB_SALA.partes.filter((p) => !fora(p.nome)).map((p) => ({ nome: p.nome, material: mat,
      pos: new Float32Array(p.pos), nor: new Float32Array(p.nor), uv: new Float32Array(p.uv), idx: new Uint32Array(p.idx) })) }, mCap);
  } else if (window.LAB_PROXIES) {
    const mat = { projetado: true, cor: [1, 1, 1], metal: 0, rug: 1 };
    for (const p of proxiesAtivos()) add('sala', { partes: [G().parte(p.nome, mat, G().caixa(...p.tamanho))] },
      Mt.cadeia(mCap, Mt.trans(...p.centro), Mt.rotZ(rad(p.giro || 0))));
  }

  // ---- L-frame na origem: braço longo em +X, curto em +Y
  if (L.lFrame) add('lframe', L.lFrame(), Mt.id());

  // ---- perfil + célula de carga pendurada no braço
  const cabos = [], celulas = {};
  add('montagem', perfil, mPerfil);
  let ponta = ponto(mPerfil, a2);
  if (cel) {
    const t = cel.pontos.topo;
    add('montagem', cel, Mt.trans(ponta[0] - t[0], ponta[1] - t[1], ponta[2] - t[2]));
    celulas.braco = [ponta[0], ponta[1], ponta[2] - dzCel / 2];
    ponta = [ponta[0], ponta[1], ponta[2] - dzCel];
  }
  cabos.push([ponta, ...(med ? med.cabos.perfil.slice().reverse() : [])]);

  // ---- suporte de aço: alinhado com a parede, corrente presa no canto de trás do lado do perfil
  if (L.suporte) {
    const sup = L.suporte({ altura: hSup, grampo: false }), q = 400 / 2 - 15;
    let cs, cn;
    if (med) {
      const [fs, fn] = daParede(P, fixSup);
      cs = fs - q; cn = Math.max(fn + q, q + mt.afastSuporte); // centro: canto (s+, n−) na fixação, sem entrar na parede
    } else [cs, cn] = mt.suporte;
    const c = naParede(P, cs, cn);
    const mSup = matBase(P.s, P.n, c);
    add('montagem', sup, mSup);
    let canto = med ? fixSup : ponto(mSup, [q, -q, hSup]);
    if (cel) { // célula de carga presa no canto, no prolongamento da corrente
      const alvoC = med ? ultimo(med.cabos.suporte) : no, d = sub(alvoC, canto), Ld = Math.hypot(...d) || 1, u = d.map((v) => v / Ld);
      const t = cel.pontos.topo, b = cel.pontos.base, comp = t[2] - b[2];
      const mC = Mt.cadeia(Mt.trans(...canto), Mt.alinharZ(u.map((v) => -v)), Mt.trans(-t[0], -t[1], -t[2]));
      add('montagem', cel, mC);
      celulas.suporte = canto.map((v, k) => v + u[k] * comp / 2);
      canto = canto.map((v, k) => v + u[k] * comp);
    }
    cabos.push([canto, ...(med ? med.cabos.suporte.slice().reverse() : [])]);
    const g = Math.atan2(P.s[1], P.s[0]);
    for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const pp = naParede(P, cs + a * q, cn + b * q); obst.push({ ...caixaQ(pp[0], pp[1], 0, 30, 30, hSup, g), nome: 'perna do suporte' }); }
    obst.push({ ...caixaQ(c[0], c[1], hSup - 25, 400, 400, 25, g), nome: 'tampo do suporte' });
    obst.push({ ...caixaQ(c[0], c[1], 0, 480, 480, 30, g), nome: 'base do suporte' });
  }

  // ---- poste com peso: a argola fica ~46 mm abaixo do topo; o poste cresce se o cabo terminar mais alto
  if (L.postePeso) {
    const ref0 = L.postePeso().pontos.argola, folgaTopo = 1000 - ref0[2];
    const zUlt = med ? ultimo(med.cabos.poste)[2] : 0;
    const poste = L.postePeso({ altura: Math.max(1000, zUlt + folgaTopo + 40) }), ar = poste.pontos.argola;
    let anel, centro;
    if (med) {
      anel = prolongar(med.cabos.poste, ar[2]);
      const d = unit2([no[0] - anel[0], no[1] - anel[1]]);
      centro = [anel[0] - ar[0] * d[0], anel[1] - ar[0] * d[1]];
    } else centro = naParede(P, mt.poste[0], mt.poste[1]);
    const dir = Math.atan2(no[1] - centro[1], no[0] - centro[0]);
    const mPoste = Mt.cadeia(Mt.trans(centro[0], centro[1], 0), Mt.rotZ(dir));
    add('montagem', poste, mPoste);
    cabos.push([anel || ponto(mPoste, ar), ...(med ? med.cabos.poste.slice().reverse() : [])]);
    obst.push({ ...caixaQ(centro[0], centro[1], 0, 56, 56, ar[2] + 40), nome: 'poste' });
    obst.push({ ...caixaQ(centro[0], centro[1], 0, 330, 330, 120), nome: 'base do poste' });
  }

  // ---- comprimento de cada corrente (curva suave pelos pontos): trecho medido (nó até o último marcador)
  // e total até a fixação (o último trecho é prolongado: estimativa)
  const compr = (pts) => { const q = suave(pts, 40); let t = 0; for (let i = 1; i < q.length; i++) t += dist(q[i], q[i - 1]); return t; };
  const corda = (pts) => { let t = 0; for (let i = 1; i < pts.length; i++) t += dist(pts[i], pts[i - 1]); return t; };
  const comprimentos = med ? ['perfil', 'suporte', 'poste'].map((nome, i) => {
    const total = [...cabos[i]].reverse().concat([]), medido = [no, ...med.cabos[nome]];
    const tot = [no, ...cabos[i].slice(1).reverse(), cabos[i][0]];
    return { nome, medido: compr(medido), medidoReto: corda(medido), total: compr(tot), fixacao: cabos[i][0], ultimo: ultimo(med.cabos[nome]) };
  }) : null;

  // ---- correntes: da fixação, pelos marcadores, até o nó (sem marcadores: flecha parabólica ilustrativa)
  if (L.corrente) for (const c of cabos) {
    let pts = c.concat([no]);
    if (!med) {
      const A0 = pts[0], sag = 0.12 * dist(A0, no); pts = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([0, 1, 2].map((a) => A0[a] + (no[a] - A0[a]) * t - (a === 2 ? 4 * sag * t * (1 - t) : 0))); }
    }
    add('montagem', L.corrente(suave(pts)), Mt.id());
  }

  // ---- móveis da montagem final, encostados na parede à esquerda do perfil
  const g = Math.atan2(P.s[1], P.s[0]), mv = CONFIG.moveis;
  if (L.mesaPallet) { const c = naParede(P, ...mv.mesaPallet); add('montagem', L.mesaPallet(), paraParede(c)); obst.push({ ...caixaQ(c[0], c[1], 0, 1200, 800, 750, g), nome: 'mesa de pallet' }); }
  if (L.caixasPapelao) { const c = naParede(P, ...mv.caixas); add('montagem', L.caixasPapelao({ n: 2 }), paraParede(c)); obst.push({ ...caixaQ(c[0], c[1], 0, 700, 500, 700, g), nome: 'caixas' }); }
  if (L.tabuasEncostadas) { const c = naParede(P, ...mv.tabuas); add('montagem', L.tabuasEncostadas({ n: 3 }), paraParede(c)); const cc = naParede(P, mv.tabuas[0], 200); obst.push({ ...caixaQ(cc[0], cc[1], 0, 700, 400, 2000, g), nome: 'tábuas' }); }

  // ---- câmeras
  const marc = (marcadores && marcadores.length) ? marcadores : [{ nome: 'nó', p: no }];
  const mira = marc.reduce((acc, m) => acc.map((v, k) => v + m.p[k] / marc.length), [0, 0, 0]);
  for (const p of proxiesAtivos()) { // móveis da sala viram obstáculos
    const [qx, qy] = salaParaQ(p.centro[0], p.centro[1]);
    obst.push({ ...caixaQ(qx, qy, p.centro[2] - p.tamanho[2] / 2, p.tamanho[0], p.tamanho[1], p.tamanho[2], rad((p.giro || 0) + CONFIG.captura.giro)), nome: p.nome.replace(/_/g, ' ') });
  }
  const sala = salaQ();
  const dentro = (x, y) => { const [sx, sy] = qParaSala(x, y); return sx > sala.x0 + 450 && sx < sala.x1 - 450 && sy > sala.y0 + 450 && sy < sala.y1 - 450; };
  const livreChao = (x, y) => dentro(x, y) && obst.every((o) => o.c[2] - o.h[2] > 300 || distCaixa2D(x, y, o) > 450);
  { // mesa do computador (em frente à porta): obstáculo para os tripés e para a visada
    const cM = naParede(P, ...CONFIG.eletrica.mesaQualisys);
    obst.push({ ...caixaQ(cM[0], cM[1], 0, CONFIG.eletrica.comprimentoMesa, 600, 850, Math.atan2(P.s[1], P.s[0])), nome: 'mesa dos computadores' });
  }
  const inicios = CONFIG.cameras.map(([s, n]) => naParede(P, s, n));
  const cams = escolherCameras(inicios, mira, marc, obst, livreChao);
  if (L.cameraTripe) for (const k of cams) {
    const incl = Math.atan2(k.alt - mira[2], Math.hypot(mira[0] - k.o[0], mira[1] - k.o[1])) * 180 / Math.PI;
    add('cameras', L.cameraTripe({ altura: k.alt, inclinacao: incl }), Mt.cadeia(Mt.trans(k.x, k.y, 0), Mt.rotZ(k.giro)));
  }
  // ---- parte elétrica: câmeras em série -> base da Qualisys -> notebook 1; células -> base -> notebook 2
  const E = CONFIG.eletrica, fimCabos = cams.map((k) => {
    const cm = L.cameraTripe ? L.cameraTripe({ altura: k.alt, inclinacao: 0 }).pontos : null;
    if (!cm || !cm.caboFim) return [k.x, k.y, 4.5];
    const c = Math.cos(k.giro), sn = Math.sin(k.giro), f = cm.caboFim;
    return [k.x + f[0] * c - f[1] * sn, k.y + f[0] * sn + f[1] * c, 4.5];
  });
  if (L.cabo && L.mesaApoio && L.notebook && L.syncUnit) {
    const cM = naParede(P, ...E.mesaQualisys), cmp = E.comprimentoMesa;
    const mesa = L.mesaApoio({ comp: cmp }), hT = (mesa.pontos && mesa.pontos.tampo) ? mesa.pontos.tampo[2] : 850;
    add('montagem', mesa, matBase([-P.s[0], -P.s[1]], [-P.n[0], -P.n[1]], cM)); // frente (−Y local) para o operador
    // sobre a mesa (s ao longo da parede, n para dentro da sala; o operador fica do lado da porta)
    const sobre = (ds, dn, dz = 0) => naParede(P, E.mesaQualisys[0] + ds, E.mesaQualisys[1] + dn, hT + dz);
    const virado = (p) => matBase([-P.s[0], -P.s[1]], [-P.n[0], -P.n[1]], p); // tela virada para o experimento
    const pt = (m, q, def) => (q ? ponto(m, q) : def);
    // o computador da Qualisys é o mais próximo do portão da garagem (+s); o das células, o mais longe
    const nb1 = L.notebook(), su = L.syncUnit(), mNb1 = virado(sobre(cmp / 4, 60)), mSu = matBase(P.s, P.n, sobre(cmp / 4 + 120, -190));
    add('montagem', nb1, mNb1); add('montagem', su, mSu);
    const entSu = pt(mSu, su.pontos && su.pontos.entrada, sobre(cmp / 4, -190)), saiSu = pt(mSu, su.pontos && su.pontos.saida, entSu);
    const portaNb1 = pt(mNb1, nb1.pontos && nb1.pontos.porta, sobre(cmp / 4, 60));
    const bordaTras = (p, z = hT) => { const [ps] = daParede(P, p); return naParede(P, ps, E.mesaQualisys[1] - 300 - 15, z); }; // desce pela borda de trás
    const ligaMesa = (a, b) => suave([a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, hT + 6], b], 12);
    // câmeras em série: da mais longe à mais perto da mesa, e dela à base da Qualisys
    const ordem = [0, 1, 2].sort((a, b) => dist(fimCabos[b], cM) - dist(fimCabos[a], cM));
    for (let i = 0; i < ordem.length; i++) {
      const a = fimCabos[ordem[i]], ultimaCam = i === ordem.length - 1, b = ultimaCam ? entSu : fimCabos[ordem[i + 1]];
      const rota = ultimaCam ? rotaCabo(a, b, 11 + i, { sobe: [bordaTras(entSu, 300), bordaTras(entSu, hT + 5)] }) : rotaCabo(a, b, 11 + i);
      add('montagem', L.cabo(rota, { raio: 3.5, ramais: true, conectores: true }), Mt.id());
    }
    add('montagem', L.cabo(ligaMesa(saiSu, portaNb1), { raio: 2.5 }), Mt.id());
    // notebook 2 + base das células na outra metade da mesa
    if (L.baseCelulas) {
      const nb2 = L.notebook(), bc = L.baseCelulas(), mNb2 = virado(sobre(-cmp / 4, 60)), mB = matBase(P.s, P.n, sobre(-cmp / 4 - 120, -190));
      add('montagem', nb2, mNb2); add('montagem', bc, mB);
      const ent = (bc.pontos && bc.pontos.entradas) ? bc.pontos.entradas.map((q) => ponto(mB, q)) : [sobre(-cmp / 4, -190), sobre(-cmp / 4, -190)];
      const sai = pt(mB, bc.pontos && bc.pontos.saida, ent[0]), portaNb2 = pt(mNb2, nb2.pontos && nb2.pontos.porta, sobre(-cmp / 4, 60));
      add('montagem', L.cabo(ligaMesa(sai, portaNb2), { raio: 2.5 }), Mt.id());
      // célula do braço: desce junto do trilho do perfil até o chão e corre pelo chão até a mesa
      if (celulas.braco) {
        const c0 = celulas.braco, [s0] = daParede(P, c0), trilho = (z) => naParede(P, s0 + 25, 60, z);
        const rota = rotaCabo(c0, ent[0], 31, { desce: [trilho(c0[2] - 40), trilho(300), trilho(40)], sobe: [bordaTras(ent[0], 300), bordaTras(ent[0], hT + 5)] });
        add('montagem', L.cabo(rota, { fios: 4 }), Mt.id());
      }
      // célula do suporte: desce pela perna do suporte até o chão e corre até a mesa
      if (celulas.suporte) {
        const c0 = celulas.suporte;
        const rota = rotaCabo(c0, ent[1], 23, { desce: [[c0[0], c0[1], c0[2] - 60], [c0[0], c0[1], 40]], sobe: [bordaTras(ent[1], 300), bordaTras(ent[1], hT + 5)] });
        add('montagem', L.cabo(rota, { fios: 4 }), Mt.id());
      }
    }
  }

  const visada = cams.map((k) => ({ o: k.o, vis: k.vis, todos: k.n === marc.length, seVe: k.seVe, altura: k.alt }));
  return { grupos, medido: !!med, visada, nomes: marc.map((m) => m.nome), parede: P, comprimentos };
}

// caixa da sala: limites no sistema da sala e cantos no Qualisys
function salaQ() {
  const W = window.LAB_PAREDES || { x_portao: 5400, x_fundo: -8710, y_porta: 2857, y_oposta: -1586, teto: CONFIG.sala.alt };
  const cs = [[W.x_fundo, W.y_oposta], [W.x_portao, W.y_oposta], [W.x_portao, W.y_porta], [W.x_fundo, W.y_porta]].map(([x, y]) => salaParaQ(x, y));
  const xs = cs.map((q) => q[0]), ys = cs.map((q) => q[1]);
  return { x0: W.x_fundo, x1: W.x_portao, y0: W.y_oposta, y1: W.y_porta, teto: W.teto || CONFIG.sala.alt,
    min: [Math.min(...xs), Math.min(...ys), 0], max: [Math.max(...xs), Math.max(...ys), W.teto || CONFIG.sala.alt] };
}
// parâmetros de cena.ambiente(). Com a sala assada, ela faz paredes e piso e o panorama vira só fundo. Sem
// ela, a caixa da sala só vale alinhada aos eixos (giro múltiplo de 90°); senão, esfera aterrada.
function ambiente() {
  const amb = CONFIG.ambiente;
  if (window.LAB_SALA && (window.LAB_AMBIENTE || {}).sala) return { ...amb, modo: 'fundo' };
  const alinhada = Math.abs(((CONFIG.captura.giro % 90) + 90) % 90) < 0.5;
  if (!alinhada) return { ...amb, modo: null, sala: null, raio: 6000 };
  const s = salaQ();
  return { ...amb, modo: null, sala: { min: s.min, max: s.max } };
}

window.LAB_CENA = { CONFIG, montar, ambiente, cabosMedidos };
})();
