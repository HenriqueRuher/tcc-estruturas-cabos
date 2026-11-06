// Cena do laboratório para a vista 3D do Experimento (mm, eixos do Qualisys, Z para cima).
// O L-frame fica na origem por definição (é ele que define os eixos na calibração).
//
// Montagem final (fotos em experimento/fotos/5_montagem_final): uma corrente grossa do braço do perfil de
// alumínio (na parede) ao grampo do suporte de aço, passando pelo nó, e uma corrente média do poste com peso
// ao nó. Quando o ensaio tem os marcadores 'centro' e C1_01…C3_03 (ex.: Estatica_corrente.tsv), as correntes
// passam pelos marcadores medidos e cada ramo continua pela tangente até fechar o comprimento medido da
// corrente; as fixações (célula 1 no braço, célula 2 no grampo, argola do poste) ficam nesses pontos.
// A parede dos perfis fica paralela ao eixo X do Qualisys (y ≈ 1 135 mm), pela imagem IR da câmera 1 do QTM
// (ver CONFIG.montagem.paredeQ); sem essa estimativa, sai da reta entre as fixações do perfil e do suporte.
// Tudo o que não foi medido (móveis) é posto no "sistema da parede": s = ao longo da parede (positivo para a
// esquerda de quem olha a parede), n = distância da parede.
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
  // posição do perfil ao longo da parede, no sistema da sala (~5 m do portão): 272 faz os trilhos pintados
  // no panorama coincidirem com os trilhos 3D (antes 150, com a parede antiga)
  perfilNaSala: 272,
  piso: { lado: 1200 },                      // mm cobertos por piso.jpg
  // móveis do panorama que saem da cena: os marcados "antigo" em proxies.js (não existem no estado final)
  // e os que viraram modelo 3D (o pallet sobre o caixote é a mesaPallet)
  removerProxies: ['pallet', 'caixa_sobre_pallet', 'caixa_laranja', 'caixa_mochila', 'tabua_em_pe', 'mesa_pecas', 'mesa_caixote',
    'bancada_cadeiras', 'tambor_azul', 'guindaste_amarelo', 'chapa_madeira',
    'bancada_porta_tampo', 'bancada_porta_corpo', 'caixas_sobre_bancada', // a bancada da porta é a mesa dos computadores (modelo 3D)
    'escada_aluminio',                       // a escada do panorama não aparece nas fotos da montagem final
    'caixas_carrinho_portao'],               // ocupava o lugar das caixas de papelão e das tábuas da montagem final (modelos 3D)
  montagem: {
    // sem os marcadores dos cabos: parede em x = 1330 (normal para −X) e peças no sistema da parede [s, n]
    parede: { o: [1330, 326], normal: [-1, 0] },
    suporte: [-1300, 550], poste: [-550, 1450], no: [-350, 750, 260],
    alturaSuporte: 1100,                     // altura do tampo do suporte de aço (corrente presa no canto)
    afastSuporte: 60,                        // folga mínima entre o suporte e a parede
    // Com os marcadores (Estatica_corrente, calibração de 04/11/2026): parede e suporte no sistema do
    // Qualisys, ESTIMADOS pela imagem IR da câmera 1 do QTM (6_qualisys/qtm_vista_2d_camera_1.jpg): a pose
    // da câmera sai dos 10 marcadores (PnP, erro RMS ≈ 5 px em 1824 × 1088; centro óptico (692, −1648, 1535))
    // e o rodapé, os trilhos e a chapa de base do suporte foram retroprojetados no piso. O rodapé ficou em
    // y ≈ 1 125 mm e paralelo ao eixo X (as lajotas também), e não na reta entre as fixações: o suporte fica
    // ~0,4 m à frente da parede e girado. Se paredeQ/suporteQ forem null, volta à regra antiga (fixações).
    paredeQ: { o: [0, 1135], normal: [0, -1] }, // face da parede (atrás do rodapé), normal para dentro da sala
    suporteQ: { centro: [984, 503], giro: -21.5 }, // centro da chapa de base (mm) e giro em Z (graus), IR
    vaoPerfil: 380,                          // entre os eixos dos trilhos (IR: x ≈ −684 e −302); estimado
    alturaPerfil: 3500,                      // topo dos trilhos (foto montagem_final_lateral_cameras); estimado
  },
  // Correntes (medidas pelo usuário; fotos 3_medicoes/balanca_*): a grossa vai do braço do perfil ao suporte
  // passando pelo nó (eta = posição do nó a partir do perfil); a média vai do poste ao nó, com 1,425 m
  // efetivos e o resto (0,577 m) enrolado/pendurado no topo do poste. Elos ESTIMADOS pelas fotos e conferidos
  // pela massa linear (aço 7,85 g/cm³): grossa fio 6, 38 × 20 mm (≈ 0,69 kg/m); média fio 5, 32 × 17 mm (≈ 0,47 kg/m).
  correntes: {
    grossa: { comp: 2004, kgm: 0.685, massa: 1.373, eta: 0.5539, elo: { comp: 38, larg: 20, fio: 6 } },
    media: { comp: 2002, kgm: 0.4735, massa: 0.948, efetivo: 1425, elo: { comp: 32, larg: 17, fio: 5 } },
  },
  // ramos medidos -> peças: poste = ramo cujo 1º marcador após o nó fica abaixo do nó; dos outros dois, o perfil
  // é o da esquerda de quem olha a parede (vindo do poste). No Estatica_corrente: perfil = C1, poste = C2, suporte = C3.
  // móveis da montagem final, no sistema da parede [s, n] (fotos)
  // (mesa de pallet: borda da direita em x ≈ −1 050 pela imagem IR da câmera 1 -> s = 1 200; estimado)
  moveis: { mesaPallet: [1200, 420], caixas: [2250, 450], tabuas: [3000, 0] }, // tábuas depois das caixas, sem encostar nelas
  // entorno imediato, no sistema da parede [s, n] (s > 0 = esquerda de quem olha a parede, n = distância da
  // parede). Posições ESTIMADAS pelas fotos de 5_montagem_final (sem trena), em duas fileiras como em
  // tres_ramos_vista_do_perfil: na parede, transformador, bancada, chapa encostada e cabine vermelha; à frente
  // delas, a máquina verde (diante da chapa) e o guindaste; mais para o meio da sala, o tambor. Cada peça tem
  // folga das vizinhas (antes a máquina verde entrava 22 cm na vermelha e a chapa atravessava a bancada).
  entorno: {
    transformador: [-2330, 250],             // à direita do suporte (fora do quadro da câmera 1 do QTM), na parede
    bancada: [-3150, 301],                   // bancada de pernas brancas com a morsa vermelha, logo depois, rente à parede
    chapa: [-4320, 0],                       // chapa de compensado encostada, a partir do fim da bancada
    maquinaVerde: [-4230, 860],              // à frente da chapa, com a porta em arco virada para o suporte
    maquinaVermelha: [-5460, 440],           // cabine de jateamento, na parede, depois da chapa
    guindaste: [-4760, 1600],                // dobrado, ao lado da máquina verde, com a lança para o meio da sala
    tambor: [-4450, 2560],                   // no meio da sala, atrás das câmeras (visao_geral_cameras, _lateral_cameras)
    eletrodutos: [[1000, 1300], [-2700, 1250]], // [s, z da caixa de tomadas] sobre a mesa de pallet e junto da bancada
    fioParede: [-500, 2900],                 // fio preto pendurado na parede (corrente_grossa_perfil_ao_suporte)
  },
  // Câmeras (NO_OF_CAMERAS = 3): centros ópticos no sistema do Qualisys, pela vista 3D de cima do QTM
  // (6_qualisys/qtm_vista_3d_superior_cameras.jpg). Recalculado aqui: ajuste dos 10 marcadores na imagem com
  // projeção perspectiva (origem (875, 515) px, 7,23 mm/px no piso, olho a 11,7 m; RMS 0,3 px) e as câmeras
  // levadas à altura de 1 535 mm. A #1 do QTM confere com o PnP da imagem IR. Regras da busca (escolherCameras):
  // todas na mesma altura; cada uma mira no centro dos marcadores e vê TODOS os alvos; nenhuma vê outra.
  camerasQ: [
    { nome: '#1', o: [692, -1648] },         // #1 do QTM (PnP da imagem IR; vista de cima: (715, −1738))
    { nome: 'à esquerda', o: [-1737, 67] },  // perto das caixas, à esquerda de quem olha a parede
    { nome: 'à direita', o: [2103, -642] },  // perto da chapa e do guindaste
  ],
  // fovH/fovV: ajustados no PnP da câmera 1 (f ≈ 1 498 px -> 62,7° × 39,9°); estimado
  visada: { fovH: 62, fovV: 40, folga: 3, folgaCamera: 4, sepMin: 35, distancias: [1800, 2200, 2600, 3000, 3400], alturas: [1535, 1600, 1500, 1700, 1450, 1800], alturaFoto: 1535 },
  // Parte elétrica (sistema da parede [s, n]; ajustar pelas fotos): câmeras ligadas em série
  // (câmera -> câmera -> câmera) até a base da Qualisys (Camera Sync Unit) e dela ao notebook 1;
  // células de carga (cabo preto de 4 vias + malha cada) até a aquisição Lynx ADS1800 (canais 6 e 7) e dela,
  // por cabo de rede, ao notebook 2.
  eletrica: {
    // Mesa dos dois computadores = a bancada cinza junto da porta (a "bancada_porta" do panorama: 2 344 × 800 mm,
    // tampo a ~850 mm). Os notebooks ficam na ponta do lado do suporte (−s), encostada na câmera #1: nas fotos
    // 2_montagem/notebook_celulas_e_ads1800_na_mesa e 5_montagem_final/montagem_final_lateral_cameras o tripé
    // dessa câmera está logo à frente do canto da mesa. Na ponta, o notebook das células com o ADS1800 atrás;
    // ao lado dele (para +s), o notebook da Qualisys com a Camera Sync Unit.
    mesaQualisys: [-47, 3437], comprimentoMesa: 2344, profundidadeMesa: 800,
  },
  // sem os marcadores: câmeras no sistema da parede [s, n]
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
// Curva suave pelos pontos com parametrização pela corda (Catmull-Rom não uniforme), amostrada a cada ~passo mm.
// Com pontos muito desiguais (20 mm e depois 500 mm) a versão uniforme faz a curva voltar para trás no trecho
// curto; esta não. Usada nas correntes e nos cabos.
function suaveC(pts, passo = 12) {
  const P = pts.filter((p, i) => i === 0 || dist(p, pts[i - 1]) > 1e-6), n = P.length;
  if (n < 3) return P.map((p) => p.slice());
  const t = [0]; for (let i = 1; i < n; i++) t.push(t[i - 1] + dist(P[i], P[i - 1]));
  const m = P.map((p, i) => { const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1); return [0, 1, 2].map((k) => (P[b][k] - P[a][k]) / (t[b] - t[a])); });
  const out = [];
  for (let i = 0; i < n - 1; i++) {
    const h = t[i + 1] - t[i], q = Math.max(1, Math.ceil(h / passo));
    for (let j = 0; j < q; j++) {
      const s = j / q, s2 = s * s, s3 = s2 * s;
      out.push([0, 1, 2].map((k) => (2 * s3 - 3 * s2 + 1) * P[i][k] + (s3 - 2 * s2 + s) * h * m[i][k] + (-2 * s3 + 3 * s2) * P[i + 1][k] + (s3 - s2) * h * m[i + 1][k]));
    }
  }
  out.push(P[n - 1].slice());
  return out;
}
// marcadores = [{ nome, p }] -> { no, cabos:{ perfil, suporte, poste: pontos do nó para fora }, ramos } ou null.
// Qual ramo vai a qual peça (Estatica_corrente: perfil = C1, poste = C2, suporte = C3, conferido por quatro
// caminhos: comprimentos C1 + C3 ≈ 1,96 m ≈ corrente grossa e C2 ≈ 1,41 m ≈ 1,425 m da média; só C2 desce
// abaixo do nó; equilíbrio de forças no nó; imagem IR da câmera 1 do QTM). Regra:
//  - poste: o ramo cujo primeiro marcador depois do nó (o mais perto, _03) fica abaixo do nó (a corrente do
//    poste faz barriga antes de subir); se nenhum ou mais de um, o de marcador mais baixo;
//  - dos outros dois, o perfil é o que fica à esquerda de quem olha a parede vindo do poste (fotos).
// Os marcadores são ordenados pelo número (_03 = mais perto do nó), com a distância ao nó como desempate.
function cabosMedidos(marcadores) {
  if (!marcadores) return null;
  const no = marcadores.find((m) => /^centro$/i.test(m.nome));
  const grupos = {};
  for (const m of marcadores) { const r = /^C(\d+)_0?(\d+)$/i.exec(m.nome); if (r) (grupos[r[1]] = grupos[r[1]] || []).push({ i: +r[2], p: m.p }); }
  const ks = Object.keys(grupos);
  if (!no || ks.length !== 3) return null;
  const cabos = ks.map((k) => {
    const pts = grupos[k].slice().sort((a, b) => (b.i - a.i) || (dist(a.p, no.p) - dist(b.p, no.p))).map((m) => m.p);
    return { k: 'C' + k, pts, z1: pts[0][2] - no.p[2], zMin: Math.min(...pts.map((p) => p[2])) };
  });
  const abaixo = cabos.filter((c) => c.z1 < 0);
  const poste = abaixo.length === 1 ? abaixo[0] : cabos.slice().sort((a, b) => a.zMin - b.zMin)[0];
  const [a, b] = cabos.filter((c) => c !== poste);
  // vista: do fim do ramo do poste para o meio dos outros dois fins; esquerda = giro de +90° em torno de Z
  const fim = (c) => c.pts[c.pts.length - 1], m = [(fim(a)[0] + fim(b)[0]) / 2, (fim(a)[1] + fim(b)[1]) / 2];
  const v = unit2([m[0] - fim(poste)[0], m[1] - fim(poste)[1]]), esq = [-v[1], v[0]];
  const lado = (c) => (fim(c)[0] - m[0]) * esq[0] + (fim(c)[1] - m[1]) * esq[1];
  const [perfil, suporte] = lado(a) > lado(b) ? [a, b] : [b, a];
  return { no: no.p, cabos: { perfil: perfil.pts, suporte: suporte.pts, poste: poste.pts }, ramos: { perfil: perfil.k, suporte: suporte.k, poste: poste.k } };
}

// ---------------------------------------------------------------- cabos
// rota de cabo: de a, desce (por 'desce', lista de pontos no caminho até o chão), corre pelo chão com folga
// e curvas suaves (pseudoaleatórias, mas fixas pela semente) e sobe até b (por 'sobe', do chão até b)
// chao = pontos [x, y] do caminho pelo chão (de rotaChao); sem ele, o cabo faz uma barriga para um dos lados.
function rotaCabo(a, b, semente, { desce = [], sobe = [], folga = 0.18, chao = null } = {}) {
  let x = Math.sin(semente * 12.9898) * 43758.5453;
  const rnd = () => { x = Math.sin(x * 78.233 + 1.7) * 43758.5453; return x - Math.floor(x); };
  const r = 4.5;
  const ini = desce.length ? desce[desce.length - 1] : a, fim = sobe.length ? sobe[0] : b;
  const A = [ini[0], ini[1], r], B = [fim[0], fim[1], r];
  const d = [B[0] - A[0], B[1] - A[1]], L = Math.hypot(d[0], d[1]) || 1, nrm = [-d[1] / L, d[0] / L];
  const amp = Math.min(450, folga * L) * (rnd() < 0.5 ? -1 : 1), meio = [];
  const n = Math.max(2, Math.round(L / 600));
  if (chao) meio.push(...chao.map(([px, py]) => [px, py, r]));
  else for (let i = 1; i < n; i++) {
    const t = i / n, w = amp * Math.sin(Math.PI * t) + (rnd() - 0.5) * Math.min(160, 0.06 * L);
    meio.push([A[0] + d[0] * t + nrm[0] * w, A[1] + d[1] * t + nrm[1] * w, r]);
  }
  const pts = [a, ...desce];
  if (ini[2] > r + 1) pts.push([ini[0] + (A[0] - ini[0]) * 0.02, ini[1], r + 30]);
  pts.push(A, ...meio, B);
  if (fim[2] > r + 1) pts.push([fim[0], fim[1], r + 30]);
  pts.push(...sobe, b);
  return suaveC(pts.filter((p, i, arr) => i === 0 || dist(p, arr[i - 1]) > 1), 20).map((p) => [p[0], p[1], Math.max(p[2], r)]);
}

// Caminho de um cabo pelo chão, de a até b, desviando do que está no caminho: A* numa grade (passo 80 mm).
// caixas = obstáculos { c, h, g } que tocam o chão; discos = [x, y, raio] (pés dos tripés). Passar perto de um
// obstáculo custa mais (o cabo prefere a folga) e por dentro dele não passa, menos junto das pontas, que
// podem estar encostadas num móvel. Devolve os pontos [x, y] do meio do caminho (sem a e b), já com uma
// ondulação leve de cabo solto, ou null se não achar caminho. evitar = [x, y, raio] dos cabos já postos: passar
// por cima deles é permitido, mas custa mais (o cabo cruza os outros de través em vez de correr por cima deles).
function rotaChao(a, b, caixas, discos = [], semente = 1, { passo = 80, folga = 150, borda = 1600, evitar = [] } = {}) {
  const x0 = Math.min(a[0], b[0]) - borda, y0 = Math.min(a[1], b[1]) - borda;
  const nx = Math.ceil((Math.abs(a[0] - b[0]) + 2 * borda) / passo) + 1, ny = Math.ceil((Math.abs(a[1] - b[1]) + 2 * borda) / passo) + 1;
  const custo = new Float32Array(nx * ny);
  const perto = new Set(); // células da grade perto de um cabo já posto
  for (const [ex, ey] of evitar) { const ci = Math.round(ex / passo), cj = Math.round(ey / passo); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) perto.add((ci + i) * 100003 + cj + j); }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * passo, y = y0 + j * passo;
    let d = Infinity;
    for (const o of caixas) d = Math.min(d, distCaixa2D(x, y, o));
    for (const [cx, cy, r] of discos) d = Math.min(d, Math.hypot(x - cx, y - cy) - r);
    const ponta = Math.hypot(x - a[0], y - a[1]) < 220 || Math.hypot(x - b[0], y - b[1]) < 220;
    let c = d < 20 ? (ponta ? 8 : Infinity) : (d < folga ? 1 + 6 * (1 - d / folga) : 1);
    if (c !== Infinity && !ponta && perto.has(Math.round(x / passo) * 100003 + Math.round(y / passo))) c += 3;
    custo[j * nx + i] = c;
  }
  const celula = (p) => Math.max(0, Math.min(ny - 1, Math.round((p[1] - y0) / passo))) * nx + Math.max(0, Math.min(nx - 1, Math.round((p[0] - x0) / passo)));
  const ini = celula(a), fim = celula(b), bx = fim % nx, by = (fim - bx) / nx;
  const g = new Float32Array(nx * ny).fill(Infinity), veio = new Int32Array(nx * ny).fill(-1), fechado = new Uint8Array(nx * ny);
  const fila = [[0, ini]]; g[ini] = 0; // fila de prioridade (heap binário) de [f, célula]
  const tira = () => {
    const topo = fila[0], ult = fila.pop();
    if (fila.length) { fila[0] = ult; for (let i = 0; ;) { let m = i; const l = 2 * i + 1, r = l + 1;
      if (l < fila.length && fila[l][0] < fila[m][0]) m = l; if (r < fila.length && fila[r][0] < fila[m][0]) m = r;
      if (m === i) break; [fila[i], fila[m]] = [fila[m], fila[i]]; i = m; } }
    return topo;
  };
  const poe = (e) => { fila.push(e); for (let i = fila.length - 1; i > 0;) { const p = (i - 1) >> 1; if (fila[p][0] <= fila[i][0]) break; [fila[i], fila[p]] = [fila[p], fila[i]]; i = p; } };
  while (fila.length) {
    const [, k] = tira();
    if (k === fim) break;
    if (fechado[k]) continue; fechado[k] = 1;
    const i = k % nx, j = (k - i) / nx;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = i + di, jj = j + dj; if ((!di && !dj) || ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
      const q = jj * nx + ii, c = custo[q]; if (fechado[q] || c === Infinity) continue;
      const t = g[k] + Math.hypot(di, dj) * (c + custo[k]) / 2;
      if (t < g[q]) { g[q] = t; veio[q] = k; poe([t + Math.hypot(ii - bx, jj - by), q]); }
    }
  }
  if (veio[fim] < 0 && fim !== ini) return null;
  let cel = []; for (let k = fim; k >= 0; k = veio[k]) cel.push(k);
  cel = cel.reverse().map((k) => [x0 + (k % nx) * passo, y0 + Math.floor(k / nx) * passo]);
  const pts = [[a[0], a[1]], ...cel.slice(1, -1), [b[0], b[1]]];
  // estica o caminho: liga direto os pontos que se veem sem passar mais perto de um obstáculo do que já passavam
  const pior = (p) => custo[celula(p)];
  const reto = (p, q) => {
    const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / (passo / 2)), lim = Math.max(2.4, Math.min(8, pior(p)), Math.min(8, pior(q)));
    for (let i = 1; i < n; i++) if (pior([p[0] + (q[0] - p[0]) * i / n, p[1] + (q[1] - p[1]) * i / n]) > lim) return false;
    return true;
  };
  const cantos = [pts[0]];
  for (let i = 0; i < pts.length - 1;) { let j = pts.length - 1; while (j > i + 1 && !reto(pts[i], pts[j])) j--; cantos.push(pts[j]); i = j; }
  // pontos a cada ~300 mm (a spline fica junto do caminho) com um vaivém de ±18 mm, que some junto das pontas
  const out = []; let s = 0;
  const total = cantos.reduce((t, p, i) => (i ? t + Math.hypot(p[0] - cantos[i - 1][0], p[1] - cantos[i - 1][1]) : 0), 0);
  for (let i = 1; i < cantos.length; i++) {
    const p = cantos[i - 1], q = cantos[i], L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, n = Math.max(1, Math.round(L / 300));
    for (let k = 1; k <= n; k++) {
      if (i === cantos.length - 1 && k === n) break;
      const u = s + L * k / n, w = 18 * Math.sin(u / 240 + semente * 1.7) * Math.min(1, u / 300, (total - u) / 300);
      out.push([p[0] + (q[0] - p[0]) * k / n - (q[1] - p[1]) / L * w, p[1] + (q[1] - p[1]) * k / n + (q[0] - p[0]) / L * w]);
    }
    s += L;
  }
  return out;
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
// vendo todos os alvos e sem nenhuma outra câmera no seu campo de visão (os LEDs ofuscariam a imagem).
// fixas = posições medidas: só move a câmera que não vê todos os alvos (o resto vira diagnóstico)
function escolherCameras(inicios, alvo, marcadores, obst, livreChao, fixas = false) {
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
  for (const alt of (fixas ? [V.alturaFoto, ...V.alturas.filter((a) => a !== V.alturaFoto)] : V.alturas)) {
    const escolhidas = [];
    let custoTotal = 0, completas = 0;
    for (const p0 of inicios) {
      const az0 = Math.atan2(p0[1] - alvo[1], p0[0] - alvo[0]);
      const cand = [avaliar(p0[0], p0[1], alt)];
      for (let daz = -180; daz < 180; daz += 5) for (const d of V.distancias) {
        const a = az0 + daz * Math.PI / 180;
        cand.push(avaliar(alvo[0] + d * Math.cos(a), alvo[1] + d * Math.sin(a), alt));
      }
      { // diagnóstico da posição de partida (por que a busca teve de mover a câmera)
        const k = cand[0], d = [];
        if (!livreChao(k.x, k.y)) d.push('chão ocupado ou fora da sala');
        if (k.n < marcadores.length) d.push(k.vis.map((v, i) => (v.ok ? null : `${marcadores[i].nome}: ${v.motivo}`)).filter(Boolean).join(', '));
        escolhidas.forEach((e, j) => { if (sep(k, e) < V.sepMin) d.push(`a ${Math.round(sep(k, e))}° da câmera ${j + 1}`); if (seVeem(k, e)) d.push(`vê a câmera ${j + 1}`); });
        k.diag = d;
      }
      const validos = cand.filter((k) => livreChao(k.x, k.y) && escolhidas.every((e) => sep(k, e) >= V.sepMin && !seVeem(k, e)));
      const custo = (k) => Math.hypot(k.x - p0[0], k.y - p0[1]);
      const ok = validos.filter((k) => k.n === marcadores.length).sort((a, b) => custo(a) - custo(b));
      // posições medidas (vista de cima do QTM): a câmera só sai do lugar se não vir todos os marcadores;
      // chão ocupado (móveis com posição estimada) e câmera no campo de outra só são relatados
      const k = (fixas && cand[0].n === marcadores.length) ? cand[0] : (ok[0] || validos.sort((a, b) => b.n - a.n || custo(a) - custo(b))[0] || cand[0]);
      if (k.n === marcadores.length) completas++;
      custoTotal += custo(k);
      k.diagPartida = cand[0].diag;
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
  const mt = CONFIG.montagem, CR = CONFIG.correntes, med = cabosMedidos(marcadores), obst = [], avisos = [];
  const ultimo = (c) => c[c.length - 1];
  const unit3 = (v) => { const n = Math.hypot(...v) || 1; return v.map((x) => x / n); };
  const soma = (a, b, k = 1) => a.map((v, i) => v + k * b[i]);
  const compr = (pts) => { const q = suave(pts, 40); let t = 0; for (let i = 1; i < q.length; i++) t += dist(q[i], q[i - 1]); return t; };
  const cel = L.celulaCarga ? L.celulaCarga() : null, dzCel = cel ? cel.pontos.topo[2] - cel.pontos.base[2] : 0;
  const cruz = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  const esc3 = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const furoOlhal = (cel && cel.medidas && cel.medidas.furoOlhal) || 10; // raio interno do anel dos olhais das células
  // caixa de obstáculo de um modelo já posto com a matriz m (giro em Z + translação): a caixa que o envolve
  const obstDe = (modelo, m, nome) => {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const p of modelo.partes) for (let k = 0; k < p.pos.length; k += 3) for (let j = 0; j < 3; j++) { const v = p.pos[k + j]; if (v < mn[j]) mn[j] = v; if (v > mx[j]) mx[j] = v; }
    const cc = ponto(m, [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, 0]);
    return { ...caixaQ(cc[0], cc[1], mn[2], mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2], Math.atan2(m[1], m[0])), nome };
  };
  let olhalPerfil = null, olhalSup = null; // olhais onde a corrente grossa se prende: { normal: eixo do anel, furo }

  // ---- fim real de cada ramo: a corrente continua além do último marcador, pela tangente do último trecho,
  // até completar o comprimento medido (perfil–nó = eta·2,004 m; nó–suporte = (1 − eta)·2,004 m; poste–nó = 1,425 m)
  const alvoL = { perfil: CR.grossa.comp * CR.grossa.eta, suporte: CR.grossa.comp * (1 - CR.grossa.eta), poste: CR.media.efetivo };
  const fins = {};
  if (med) for (const nome of ['perfil', 'suporte', 'poste']) {
    const c = med.cabos[nome], arco = compr([med.no, ...c]), u = unit3(sub(ultimo(c), c.length > 1 ? c[c.length - 2] : med.no));
    const falta = alvoL[nome] - arco;
    if (falta < 0) avisos.push(`ramo ${nome}: ${Math.round(-falta)} mm mais longo que a corrente medida`);
    fins[nome] = { p: soma(ultimo(c), u, Math.max(5, falta)), u, arco, falta };
  }

  // ---- parede e perfil
  let P, no, perfil;
  const D = mt.vaoPerfil || 330, Hp = mt.alturaPerfil || 2100;
  if (med) {
    no = med.no;
    const E1 = fins.perfil.p, zb = E1[2] + dzCel + 82; // célula pendurada na vertical sob o barbante do braço
    let n, s;
    if (mt.paredeQ) { n = unit2(mt.paredeQ.normal); s = [n[1], -n[0]]; }
    else { // regra antiga: reta entre as fixações do perfil e do suporte
      s = unit2([E1[0] - fins.suporte.p[0], E1[1] - fins.suporte.p[1]]); n = [-s[1], s[0]];
      if ((no[0] - E1[0]) * n[0] + (no[1] - E1[1]) * n[1] < 0) { n = [-n[0], -n[1]]; s = [n[1], -n[0]]; }
    }
    // comprimento do braço: da parede até o ponto de amarração (sem paredeQ, o braço padrão)
    const yBraco = 22 + 40 + 2 + 25; // eixo dos trilhos + perfil + folga + barbante (ver perfilParede)
    const B = mt.paredeQ ? Math.max(200, Math.min(900, (E1[0] - mt.paredeQ.o[0]) * n[0] + (E1[1] - mt.paredeQ.o[1]) * n[1] - yBraco)) : 260;
    perfil = L.perfilParede({ alturaBraco: zb, braco: B, vao: D, altura: Hp });
    const a2 = perfil.pontos.amarracao2; // braço da direita de quem olha a parede (lado do suporte)
    P = { s, n, o: [E1[0] - a2[0] * s[0] - a2[1] * n[0], E1[1] - a2[0] * s[1] - a2[1] * n[1]] };
  } else {
    const n = unit2(mt.parede.normal);
    P = { n, s: [n[1], -n[0]], o: mt.parede.o };
    no = naParede(P, mt.no[0], mt.no[1], mt.no[2]);
    perfil = L.perfilParede();
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

  // ---- perfil + célula de carga 1 pendurada no braço da direita (lado do suporte)
  const celulas = {};
  add('montagem', perfil, mPerfil);
  let fixPerfil = ponto(mPerfil, perfil.pontos.amarracao2);
  if (cel) {
    const c1 = L.celulaCarga({ numero: 1 }), t = c1.pontos.topo;
    // virada com a saída do cabo para o lado da mesa de pallet (foto montagem_final_frente)
    const mC = Mt.cadeia(matBase([-P.s[0], -P.s[1]], [-P.n[0], -P.n[1]], fixPerfil), Mt.trans(-t[0], -t[1], -t[2]));
    add('montagem', c1, mC);
    celulas.braco = ponto(mC, c1.pontos.cabo);
    fixPerfil = ponto(mC, c1.pontos.base);                              // centro do anel do olhal de baixo
    olhalPerfil = { normal: [-P.n[0], -P.n[1], 0], furo: furoOlhal };   // o anel fica no plano da parede (eixo ⟂ à parede)
  }

  // ---- suporte de aço com o grampo em C e a célula de carga 2 (alinhada com a corrente)
  let fixSup = null, mSup = null;
  if (L.suporte) {
    const Ls = 400, e = 25;
    let c, ex, ey, H, gr = false, gancho = null, uS = null;
    if (med) {
      uS = fins.suporte.u; gancho = soma(fins.suporte.p, uS, dzCel);
      if (mt.suporteQ) { c = mt.suporteQ.centro; const g = rad(mt.suporteQ.giro); ex = [Math.cos(g), Math.sin(g)]; ey = [-Math.sin(g), Math.cos(g)]; }
      else { // sem a estimativa da foto: suporte com uma borda voltada para o nó, olhal 120 mm para fora
        ey = unit2([gancho[0] - no[0], gancho[1] - no[1]]); ex = [ey[1], -ey[0]];
        c = [gancho[0] + ey[0] * (Ls / 2 + 120), gancho[1] + ey[1] * (Ls / 2 + 120)];
      }
      // gancho no sistema do suporte -> borda mais próxima, posição ao longo dela e saída do fuso
      const d = [gancho[0] - c[0], gancho[1] - c[1]], lx = d[0] * ex[0] + d[1] * ex[1], ly = d[0] * ey[0] + d[1] * ey[1];
      const proj = [-ly, lx, ly, -lx], k = proj.indexOf(Math.max(...proj)), a = -k * Math.PI / 2;
      const cx = lx * Math.cos(a) - ly * Math.sin(a), cy = lx * Math.sin(a) + ly * Math.cos(a);
      const saida = -Ls / 2 - cy;
      if (saida < 30 || saida > 350 || Math.abs(cx) > Ls / 2 - 30) avisos.push(`grampo do suporte fora do esperado (saída ${Math.round(saida)} mm, ao longo ${Math.round(cx)} mm)`);
      gr = { borda: k, x: Math.max(-Ls / 2 + 40, Math.min(Ls / 2 - 40, cx)), saida: Math.max(40, saida) };
      H = gancho[2] + e + 38 + 36; // tampo -> eixo do fuso (e + 38) -> fundo do olhal forjado (36); ver grampo()
    } else {
      const [cs, cn] = mt.suporte; c = naParede(P, cs, cn); ex = P.s; ey = P.n; H = mt.alturaSuporte;
    }
    const sup = L.suporte({ altura: H, grampo: gr });
    mSup = matBase(ex, ey, [c[0], c[1], 0]);
    add('montagem', sup, mSup);
    if (med) {
      const gReal = ponto(mSup, sup.pontos.gancho);
      if (dist(gReal, gancho) > 5) avisos.push(`olhal do grampo a ${Math.round(dist(gReal, gancho))} mm do previsto`);
      if (cel) {
        // célula 2: alinhada com a corrente e pendurada no fuso do grampo pelo anel do olhal de cima. O eixo do anel
        // (Y local da célula) segue o fuso o mais que a direção da corrente deixa; sem isso o fuso atravessava o anel.
        // A saída do cabo (−X local) fica para a esquerda de quem olha a parede (foto fixacao_suporte_grampo_celula_2).
        const c2 = L.celulaCarga({ numero: 2 }), t = c2.pontos.topo, fz = sup.pontos.eixoFuso || [0, -1, 0];
        const fW = [ex[0] * fz[0] + ey[0] * fz[1], ex[1] * fz[0] + ey[1] * fz[1], fz[2]], kf = esc3(fW, uS);
        let yC = [fW[0] - kf * uS[0], fW[1] - kf * uS[1], fW[2] - kf * uS[2]];
        yC = Math.hypot(...yC) > 0.05 ? unit3(yC) : unit3(cruz(uS, [ex[0], ex[1], 0]));
        let xC = cruz(yC, uS);
        if (-(xC[0] * P.s[0] + xC[1] * P.s[1]) < 0) { yC = yC.map((v) => -v); xC = xC.map((v) => -v); }
        const mC = Mt.cadeia(Mt.trans(...gReal), [xC[0], xC[1], xC[2], 0, yC[0], yC[1], yC[2], 0, uS[0], uS[1], uS[2], 0, 0, 0, 0, 1], Mt.trans(-t[0], -t[1], -t[2]));
        add('montagem', c2, mC);
        celulas.suporte = ponto(mC, c2.pontos.cabo);
        fixSup = ponto(mC, c2.pontos.base);
        olhalSup = { normal: yC, furo: furoOlhal };
        const incl = Math.asin(Math.min(1, Math.abs(kf))) * 180 / Math.PI;
        if (incl > 36) avisos.push(`anel do olhal da célula 2 inclinado ${Math.round(incl)}° no fuso do grampo`);
      } else fixSup = gReal;
    }
    const g = Math.atan2(ex[1], ex[0]), q = Ls / 2 - 32;
    for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const pp = [c[0] + a * q * ex[0] + b * q * ey[0], c[1] + a * q * ex[1] + b * q * ey[1]]; obst.push({ ...caixaQ(pp[0], pp[1], 0, 36, 36, H, g), nome: 'perna do suporte' }); }
    obst.push({ ...caixaQ(c[0], c[1], H - 25, Ls, Ls, 25, g), nome: 'tampo do suporte' });
    obst.push({ ...caixaQ(c[0], c[1], 0, Ls + 40, Ls + 40, 30, g), nome: 'base do suporte' });
  }

  // ---- poste com peso. A corrente sobe do nó quase na vertical, encosta no tubo ao lado da argola (que fica
  // voltada para o nó e vazia, como em 5_montagem_final/tres_ramos_vista_da_parede), dá quase uma volta no tubo logo
  // abaixo da boca cortada e a sobra cai do outro lado da argola. O comprimento efetivo acaba onde a corrente
  // encosta no tubo. Nenhum elo atravessa a argola nem o tubo (antes a corrente terminava no meio do anel e a
  // volta cortava o fio da argola e a parede do tubo).
  let fixPoste = null, sobraPoste = null;
  if (L.postePeso) {
    const ra = 45, lm = CR.media.elo, A0 = rad(35); // argola de ~100 mm (estimada pela foto); A0: azimute em que a corrente encosta
    let centro, Hpo, dir, md = null, esp = 1, rw = 0, rd = 0;
    if (med) {
      md = L.postePeso({ altura: 1000, argolas: 1, raioArgola: ra }).medidas;
      rw = md.raioTubo + lm.larg / 2 + 4; rd = rw + 6.5; // raio da volta (4 mm de folga: os elos são retos) e raio onde a corrente encosta
      const E2 = fins.poste.p, uh = unit2([fins.poste.u[0], fins.poste.u[1]]), xw = [-uh[0], -uh[1]], yw = [-xw[1], xw[0]]; // xw: do tubo para o nó
      // de que lado da argola a corrente sobe (esp = ±1): o que deixa o tubo mais longe das linhas de visada das
      // câmeras para o marcador vizinho (o tubo não pode tapar um marcador que foi medido)
      const m1 = med.cabos.poste[med.cabos.poste.length - 1], cc = (e) => [E2[0] - rd * (Math.cos(A0) * xw[0] + e * Math.sin(A0) * yw[0]), E2[1] - rd * (Math.cos(A0) * xw[1] + e * Math.sin(A0) * yw[1])];
      const folgaVisada = (c) => Math.min(...CONFIG.camerasQ.map((k) => { const d = unit2([k.o[0] - m1[0], k.o[1] - m1[1]]), v = [c[0] - m1[0], c[1] - m1[1]];
        return v[0] * d[0] + v[1] * d[1] > 0 ? Math.abs(v[0] * d[1] - v[1] * d[0]) : Math.hypot(v[0], v[1]); }));
      esp = folgaVisada(cc(1)) >= folgaVisada(cc(-1)) ? 1 : -1;
      centro = cc(esp); dir = Math.atan2(xw[1], xw[0]);
      Hpo = E2[2] + 56; // a volta fica 16 mm abaixo do centro da argola (abaixo do ponto mais baixo da boca torta) e a corrente encosta 12 mm antes
      fixPoste = E2;
    } else { centro = naParede(P, mt.poste[0], mt.poste[1]); Hpo = 1000; dir = Math.atan2(no[1] - centro[1], no[0] - centro[0]); }
    const poste = L.postePeso({ altura: Hpo, argolas: 1, raioArgola: ra });
    const mPoste = Mt.cadeia(Mt.trans(centro[0], centro[1], 0), Mt.rotZ(dir));
    add('montagem', poste, mPoste);
    if (!fixPoste) fixPoste = ponto(mPoste, poste.pontos.argola);
    obst.push({ ...caixaQ(centro[0], centro[1], 0, 56, 56, Hpo + 20), nome: 'poste' });
    obst.push({ ...caixaQ(centro[0], centro[1], 0, 360, 360, 150), nome: 'base do poste' });
    // sobra da corrente média (2,002 − 1,425 = 0,577 m), no sistema do poste (X = lado da argola e do nó): de onde
    // encosta (35°) entra na volta, enrola até 302° descendo 6 mm, sem cruzar o plano da argola, e cai a 318°
    if (med && md) {
      const zr = Hpo - 28, sobra = CR.media.comp - CR.media.efetivo, pol = (r, az, z) => [r * Math.cos(az), esp * r * Math.sin(az), z];
      const loc = [pol(rw + 3, rad(48), zr - 20), pol(rw, rad(62), zr - 16.5)];
      for (let az = 77; az <= 302; az += 15) loc.push(pol(rw, rad(az), zr - 16 - 6 * (az - 62) / 240));
      loc.push(pol(rw + 6, rad(318), zr - 38));
      const pts = [fixPoste, ...loc.map((q) => ponto(mPoste, q))];
      let usado = 0; for (let i = 1; i < pts.length; i++) usado += dist(pts[i], pts[i - 1]);
      const ult = ultimo(pts), fora = unit2([ult[0] - centro[0], ult[1] - centro[1]]), resto = Math.max(60, sobra - usado);
      for (let i = 1; i <= 8; i++) { const t = i / 8, w = 5 * Math.sin(Math.PI * t); pts.push([ult[0] + fora[0] * w, ult[1] + fora[1] * w, ult[2] - resto * t]); }
      sobraPoste = pts.slice(1); // de onde encosta no tubo até a ponta solta
    }
  }

  // ---- correntes pelos marcadores. A corrente fica logo abaixo de cada marcador (o marcador é amarrado em
  // cima do elo): o traçado desce 16 mm, perpendicular à corrente.
  const off = (p, t) => { const tt = unit3(t), dn = [tt[0] * tt[2], tt[1] * tt[2], -1 + tt[2] * tt[2]]; const k = Math.hypot(...dn) > 1e-3 ? unit3(dn) : [0, 0, -1]; return soma(p, k, 16); };
  const comMarc = (pts, iMarc) => pts.map((p, i) => (iMarc.includes(i) ? off(p, sub(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)])) : p));
  if (L.corrente && med) {
    const marcaPres = [];
    // grossa: perfil -> C1 (01, 02, 03) -> nó -> C3 (03, 02, 01) -> suporte
    const c1 = med.cabos.perfil.slice().reverse(), c3 = med.cabos.suporte, iNo = 1 + c1.length;
    const gPts = [fixPerfil, ...c1, no, ...c3, fixSup || fins.suporte.p];
    const iM = gPts.map((_, i) => i).filter((i) => i > 0 && i < gPts.length - 1);
    const gOff = comMarc(gPts, iM);
    iM.forEach((i) => { if (i !== iNo) marcaPres.push([gPts[i], gOff[i]]); });
    // (os elos das pontas ficam enfiados nos anéis dos olhais das células, sem atravessá-los)
    add('montagem', L.corrente(suaveC(gOff), { elo: CR.grossa.elo, inicio: olhalPerfil, fim: olhalSup }), Mt.id());
    // média, numa peça só: ponta solta -> volta no tubo do poste -> C2 (01, 02, 03) -> nó. No nó ela para a um
    // elo da grossa (é o barbante que as une).
    const c2 = med.cabos.poste.slice().reverse(), mPts = [fixPoste, ...c2, no];
    const iM2 = mPts.map((_, i) => i).filter((i) => i > 0 && i < mPts.length - 1);
    const mOff = comMarc(mPts, iM2); mOff[mOff.length - 1] = gOff[iNo];
    iM2.forEach((i) => marcaPres.push([mPts[i], mOff[i]]));
    const pista = sobraPoste ? [...sobraPoste.slice().reverse(), ...mOff] : mOff;
    add('montagem', L.corrente(suaveC(pista), { elo: CR.media.elo, fim: { folga: CR.grossa.elo.larg / 2 + 3 } }), Mt.id());
    if (L.presilhaMarcador) for (const [p, q] of marcaPres) add('montagem', L.presilhaMarcador(p, q), Mt.id());
    if (L.noBarbante) add('montagem', L.noBarbante(gOff[iNo]), Mt.id());
  } else if (L.corrente) { // sem marcadores: flecha parabólica ilustrativa
    const fixS = mSup ? ponto(mSup, [0, -200, mt.alturaSuporte - 30]) : null;
    for (const A0 of [fixPerfil, fixS, fixPoste].filter(Boolean)) {
      const sag = 0.12 * dist(A0, no), pts = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([0, 1, 2].map((a) => A0[a] + (no[a] - A0[a]) * t - (a === 2 ? 4 * sag * t * (1 - t) : 0))); }
      add('montagem', L.corrente(suave(pts)), Mt.id());
    }
  }

  // ---- comprimentos: trecho medido pelos marcadores (nó -> último marcador, curva suave) e o que falta até
  // a fixação para fechar o comprimento medido das correntes
  const comprimentos = med ? ['perfil', 'suporte', 'poste'].map((nome) => ({
    nome, ramo: med.ramos[nome], medido: fins[nome].arco, falta: fins[nome].falta, corrente: nome === 'poste' ? 'media' : 'grossa', fixacao: fins[nome].p, ultimo: ultimo(med.cabos[nome]),
  })) : null;

  // ---- móveis da montagem final, encostados na parede à esquerda do perfil
  const g = Math.atan2(P.s[1], P.s[0]), mv = CONFIG.moveis;
  const cPallet = naParede(P, ...mv.mesaPallet);
  if (L.mesaPallet) { add('montagem', L.mesaPallet(), paraParede(cPallet)); obst.push({ ...caixaQ(cPallet[0], cPallet[1], 0, 1200, 800, 750, g), nome: 'mesa de pallet' }); }
  // (os obstáculos são a caixa que envolve cada modelo: com caixas menores que o modelo, um pé de tripé entrava nas caixas de papelão)
  if (L.caixasPapelao) { const m = paraParede(naParede(P, ...mv.caixas)), mod = L.caixasPapelao({ n: 2 }); add('montagem', mod, m); obst.push(obstDe(mod, m, 'caixas')); }
  if (L.tabuasEncostadas) { const m = paraParede(naParede(P, ...mv.tabuas)), mod = L.tabuasEncostadas({ n: 3 }); add('montagem', mod, m); obst.push(obstDe(mod, m, 'tábuas')); }
  // entorno (modelo_entorno.js): [nome, modelo, [s, n], é obstáculo?]
  const En = CONFIG.entorno, ent = [];
  if (L.transformador) ent.push(['transformador', L.transformador(), En.transformador, true]);
  if (L.bancadaMorsa) ent.push(['bancada', L.bancadaMorsa(), En.bancada, true]);
  if (L.chapaEncostada) ent.push(['chapa de madeira', L.chapaEncostada(), En.chapa, false]);
  if (L.maquinaVerde) ent.push(['máquina verde', L.maquinaVerde(), En.maquinaVerde, true]);
  if (L.maquinaVermelha) ent.push(['máquina vermelha', L.maquinaVermelha(), En.maquinaVermelha, true]);
  if (L.guindaste) ent.push(['guindaste', L.guindaste(), En.guindaste, true]); // dobrado, como nas fotos
  if (L.tambor) ent.push(['tambor', L.tambor(), En.tambor, true]);
  for (const [nome, modelo, sn, ehObst] of ent) {
    const m = paraParede(naParede(P, sn[0], sn[1]));
    add('montagem', modelo, m);
    if (ehObst) obst.push(obstDe(modelo, m, nome));
  }
  if (L.eletroduto) for (const [s0, zc] of En.eletrodutos) add('montagem', L.eletroduto({ zCaixa: zc }), paraParede(naParede(P, s0, 0)));
  if (L.fioParede) add('montagem', L.fioParede({ zTopo: En.fioParede[1] }), paraParede(naParede(P, En.fioParede[0], 0)));

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
    obst.push({ ...caixaQ(cM[0], cM[1], 0, CONFIG.eletrica.comprimentoMesa, CONFIG.eletrica.profundidadeMesa, 850, Math.atan2(P.s[1], P.s[0])), nome: 'mesa dos computadores' });
  }
  // partida: com os marcadores, os centros ópticos da vista de cima do QTM (o pé do tripé fica atrás do centro óptico)
  const c0 = L.cameraTripe ? L.cameraTripe({ altura: CONFIG.visada.alturaFoto, inclinacao: 0 }).centroOptico : [100, 0, 0];
  const inicios = med ? CONFIG.camerasQ.map((k) => { const u = unit2([mira[0] - k.o[0], mira[1] - k.o[1]]); return [k.o[0] - u[0] * c0[0], k.o[1] - u[1] * c0[0], 0]; })
    : CONFIG.cameras.map(([s, n]) => naParede(P, s, n));
  const cams = escolherCameras(inicios, mira, marc, obst, livreChao, !!med);
  cams.forEach((k, i) => { k.movida = Math.hypot(k.x - inicios[i][0], k.y - inicios[i][1]); k.nome = med ? CONFIG.camerasQ[i].nome : String(i + 1); });
  // malas da Qualisys (a preta em pé sob a mesa; a de alumínio no chão, à frente da outra metade da mesa; estimado):
  // entram aqui porque também são obstáculo para as pernas dos tripés, para a queda dos cabos e para os cabos do chão
  const El = CONFIG.eletrica, cMesa = naParede(P, ...El.mesaQualisys);
  const maleta = [-860, 720], mMalas = matBase([-P.s[0], -P.s[1]], [-P.n[0], -P.n[1]], naParede(P, El.mesaQualisys[0] - 250, El.mesaQualisys[1] + 120));
  const cMaleta = ponto(mMalas, [maleta[0], maleta[1], 0]), cMala = ponto(mMalas, [0, 0, 0]), gMalas = Math.atan2(-P.s[1], -P.s[0]);
  const obstMalas = [{ ...caixaQ(cMaleta[0], cMaleta[1], 0, 1100, 260, 150, gMalas + 0.12), nome: 'maleta de alumínio' },
    { ...caixaQ(cMala[0], cMala[1], 0, 620, 230, 440, gMalas), nome: 'mala preta' }];
  // As pernas do tripé não podem atravessar os móveis: a posição da câmera é medida e não muda, então o tripé
  // é girado em torno da coluna (a cabeça gira solta) e, se preciso, as pernas são fechadas um pouco. A mesa de
  // pallet entra como duas caixas (pallet em cima, quadro e caixote recuados embaixo), porque um pé cabe sob a
  // aba do pallet, como na foto.
  const obstPernas = [...obst.flatMap((o) => (o.nome !== 'mesa de pallet' ? [o]
    : [{ ...o, c: [o.c[0], o.c[1], 680], h: [o.h[0], o.h[1], 70] }, { ...o, c: [o.c[0], o.c[1], 305], h: [o.h[0] - 120, o.h[1] - 60, 305] }])), ...obstMalas];
  const noPiso = (x, y, folga) => { const [sx, sy] = qParaSala(x, y); return sx > sala.x0 + folga && sx < sala.x1 - folga && sy > sala.y0 + folga && sy < sala.y1 - folga; };
  const apoiarTripe = (k) => {
    const mundo = (p, fi) => { const c = Math.cos(k.giro + fi), sn = Math.sin(k.giro + fi); return [k.x + p[0] * c - p[1] * sn, k.y + p[0] * sn + p[1] * c, p[2]]; };
    for (const abertura of [600, 560, 520, 480, 440, 400, 360]) {
      const pt = L.cameraTripe({ altura: k.alt, inclinacao: 0, abertura, cabos: 0 }).pontos || {};
      if (!pt.pes) return {};
      for (let i = 0; i < 36; i++) { // giros de 0, +10°, −10°, +20°… até 180°
        const fi = rad((i % 2 ? 1 : -1) * Math.ceil(i / 2) * 10);
        const pes = pt.pes.map(([H, F]) => [mundo(H, fi), mundo(F, fi)]);
        const bate = pes.some(([H, F]) => {
          if (!noPiso(F[0], F[1], 40)) return true;
          for (let t = 0; t <= 1.001; t += 1 / 16) {
            const p = [0, 1, 2].map((a) => H[a] + (F[a] - H[a]) * t);
            if (obstPernas.some((o) => Math.abs(p[2] - o.c[2]) < o.h[2] + 15 && distCaixa2D(p[0], p[1], o) < 25)) return true;
          }
          return false;
        });
        if (!bate) return { abertura, giroPernas: fi, pes: pes.map(([, F]) => F) };
      }
    }
    return {};
  };
  // Os cabos saem da traseira da câmera e caem soltos até o chão (fotos). O azimute da queda, no quadro da câmera
  // (π = bem atrás), é o mais perto de "bem atrás" que fique a ≥ 13° de cada perna e caia em chão livre: sem isso
  // o cabo da câmera #1 descia por dentro da mesa dos computadores, que fica logo atrás dela.
  const quedaCabo = (k) => {
    const AZ = [0, 120, 240].map((gr) => rad(gr) + (k.giroPernas || 0)), dif = (p, q) => Math.abs(Math.atan2(Math.sin(p - q), Math.cos(p - q)));
    for (const d of [0, 14, -14, 28, -28, 42, -42, 56, -56, 70, -70, 84, -84, 98, -98, 112, -112, 126, -126]) {
      const az = Math.PI + rad(d);
      if (!AZ.every((p) => dif(p, az) >= rad(13))) continue;
      const livre = [240, 290, 340, 400, 440].every((r) => { const x = k.x + r * Math.cos(k.giro + az), y = k.y + r * Math.sin(k.giro + az);
        return noPiso(x, y, 40) && obstPernas.every((o) => distCaixa2D(x, y, o) > 40); });
      if (livre) return az;
    }
    return undefined;
  };
  // ligação em série: da câmera mais longe da mesa dos computadores à mais perto, e dela à Camera Sync Unit. A
  // primeira da série usa uma porta; as outras, as duas (entrada e saída)
  const ordem = cams.map((_, i) => i).sort((a, b) => Math.hypot(cams[b].x - cMesa[0], cams[b].y - cMesa[1]) - Math.hypot(cams[a].x - cMesa[0], cams[a].y - cMesa[1]));
  if (L.cameraTripe) cams.forEach((k, i) => {
    Object.assign(k, apoiarTripe(k)); k.azCabo = quedaCabo(k);
    const incl = Math.atan2(k.alt - mira[2], Math.hypot(mira[0] - k.o[0], mira[1] - k.o[1])) * 180 / Math.PI;
    const mK = Mt.cadeia(Mt.trans(k.x, k.y, 0), Mt.rotZ(k.giro));
    const mod = L.cameraTripe({ altura: k.alt, inclinacao: incl, abertura: k.abertura, giroPernas: k.giroPernas, azCabo: k.azCabo, cabos: 0, plugues: ordem[0] === i ? 1 : 2 });
    add('cameras', mod, mK);
    k.cabos = ((mod.pontos && mod.pontos.cabos) || []).map((rt) => rt.map((q) => ponto(mK, q)));
  });
  // ---- parte elétrica: câmeras em série -> base da Qualisys -> notebook 1; células -> base -> notebook 2
  // os cabos correm pelo chão desviando dos móveis, dos pés dos tripés, do L-frame e das malas
  const caixasChao = [...obst.filter((o) => o.c[2] - o.h[2] < 60), ...obstMalas,
    caixaQ(290, 0, 0, 650, 60, 60), caixaQ(0, 195, 0, 60, 450, 60)];
  const pesTripes = cams.flatMap((k) => [[k.x, k.y, 220], ...(k.pes || []).map((f) => [f[0], f[1], 45])]); // pés e o miolo sob o tripé
  // nenhum cabo passa por baixo das correntes (a zona do ensaio fica livre); só para o cabo da célula 2 a faixa
  // abre junto do suporte, para ele poder sair da chapa de base
  const zonaEnsaio = [], zonaAberta = [];
  if (med) for (const nome of ['perfil', 'suporte', 'poste']) {
    const f = fins[nome].p, n = Math.ceil(Math.hypot(f[0] - no[0], f[1] - no[1]) / 120);
    for (let i = 0; i <= n; i++) {
      const q = [no[0] + (f[0] - no[0]) * i / n, no[1] + (f[1] - no[1]) * i / n];
      zonaEnsaio.push([q[0], q[1], 110]);
      if (nome !== 'suporte' || Math.hypot(q[0] - f[0], q[1] - f[1]) > 320) zonaAberta.push([q[0], q[1], 110]);
    }
  }
  // cabos já postos no chão e sobre a mesa: pontos [x, y, z, raio] a cada 5 mm, numa grade de 32 mm (busca rápida
  // dos vizinhos). Um cabo novo evita correr por cima dos outros (custo na busca do caminho) e, onde cruza um
  // deles, passa por cima (sobe o que for preciso, com rampa de 14 mm de cada lado) em vez de atravessá-lo.
  const cabosChao = [], gradeCabos = new Map(), CEL = 32, chave = (i, j) => i * 100003 + j;
  let zMesa = null; // altura do tampo da mesa dos computadores (os cabos sobre ela também se cruzam)
  const peloChao = (a, b, semente, zona = zonaEnsaio) => rotaChao(a, b, caixasChao, [...pesTripes, ...zona], semente, { evitar: cabosChao.filter((q, i) => i % 6 === 0 && q[2] < 40).map((q) => [q[0], q[1], 45]) });
  const assentar = (rota, raio) => {
    const fino = [rota[0]];
    for (let i = 1; i < rota.length; i++) { const p = rota[i - 1], q = rota[i], n = Math.max(1, Math.ceil(dist(p, q) / 5)); for (let j = 1; j <= n; j++) fino.push([0, 1, 2].map((e) => p[e] + (q[e] - p[e]) * j / n)); }
    const out = fino.map((p) => {
      let z = p[2];
      const ci = Math.floor(p[0] / CEL), cj = Math.floor(p[1] / CEL);
      for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
        const lista = gradeCabos.get(chave(i, j)); if (!lista) continue;
        for (const q of lista) {
          const R = raio + q[3], dx = p[0] - q[0], dy = p[1] - q[1];
          if (Math.abs(dx) > R + 18 || Math.abs(dy) > R + 18 || p[2] > q[2] + R + 0.8 || p[2] < q[2] - R) continue;
          const d = Math.hypot(dx, dy), w = d <= R + 4 ? 1 : (d >= R + 18 ? 0 : 0.5 * (1 + Math.cos(Math.PI * (d - R - 4) / 14)));
          z = Math.max(z, p[2] + w * (q[2] + R + 0.8 - p[2]));
        }
      }
      return [p[0], p[1], z];
    });
    for (const p of out) {
      if (!(p[2] < 40 || (zMesa != null && p[2] > zMesa && p[2] < zMesa + 40))) continue; // só o que está deitado no chão ou na mesa
      const q = [p[0], p[1], p[2], raio], k = chave(Math.floor(p[0] / CEL), Math.floor(p[1] / CEL));
      cabosChao.push(q); if (!gradeCabos.has(k)) gradeCabos.set(k, []); gradeCabos.get(k).push(q);
    }
    return out;
  };
  if (L.cabo && L.mesaApoio && L.notebook && L.syncUnit) {
    const cM = cMesa, cmp = El.comprimentoMesa, prof = El.profundidadeMesa;
    const mesa = L.mesaApoio({ comp: cmp, larg: prof }), hT = (mesa.pontos && mesa.pontos.tampo) ? mesa.pontos.tampo[2] : 850;
    zMesa = hT;
    add('montagem', mesa, matBase([-P.s[0], -P.s[1]], [-P.n[0], -P.n[1]], cM)); // frente (−Y local) para o operador
    // malas da Qualisys: a preta em pé sob a mesa e a de alumínio no chão, do lado do experimento
    if (L.malasQualisys) add('montagem', L.malasQualisys({ maleta }), mMalas);
    // sobre a mesa (s ao longo da parede, n para dentro da sala; o operador fica do lado da porta)
    const sobre = (ds, dn, dz = 0) => naParede(P, El.mesaQualisys[0] + ds, El.mesaQualisys[1] + dn, hT + dz);
    const virado = (p) => matBase([-P.s[0], -P.s[1]], [-P.n[0], -P.n[1]], p); // tela virada para o experimento
    const pt = (m, q, def) => (q ? ponto(m, q) : def);
    // na ponta da mesa (−s): o notebook das células; ao lado dele (+s), o da Qualisys com a Camera Sync Unit
    const sQ = -cmp / 2 + 1080, sC = -cmp / 2 + 340; // centro de cada notebook ao longo da mesa
    const nb1 = L.notebook({ modelo: 'qualisys' }), su = L.syncUnit(), mNb1 = virado(sobre(sQ, 80)), mSu = matBase([-P.s[0], -P.s[1]], [-P.n[0], -P.n[1]], sobre(sQ + 330, -230)); // face das portas de rede virada para o notebook
    add('montagem', nb1, mNb1); add('montagem', su, mSu);
    const entSu = pt(mSu, su.pontos && su.pontos.entrada, sobre(sQ, -230)), saiSu = pt(mSu, su.pontos && su.pontos.saida, entSu);
    const portaNb1 = pt(mNb1, nb1.pontos && nb1.pontos.porta, sobre(sQ, 80));
    const nTras = El.mesaQualisys[1] - prof / 2; // borda de trás da mesa (lado do experimento)
    const bordaTras = (p, z = hT) => { const [ps] = daParede(P, p); return naParede(P, ps, nTras - 15, z); }; // desce pela borda de trás
    // cabo entre duas tomadas sobre a mesa: sai reto de cada uma (60 mm, na direção para fora da face) e faz a curva
    // no meio; assim o conector entra de frente na tomada em vez de atravessar a caixa do aparelho de lado
    const dirM = (mm, v) => (v ? unit3([mm[0] * v[0] + mm[4] * v[1] + mm[8] * v[2], mm[1] * v[0] + mm[5] * v[1] + mm[9] * v[2], mm[2] * v[0] + mm[6] * v[1] + mm[10] * v[2]]) : null);
    const ligaPortas = (a, nA, b, nB) => suaveC([a, ...(nA ? [soma(a, nA, 60)] : []), ...(nB ? [soma(b, nB, 60)] : []), b], 8);
    const nSu = dirM(mSu, su.normais && su.normais.entrada), nNb1 = dirM(mNb1, nb1.normais && nb1.normais.porta);
    // câmeras em série: cada cabo vai inteiro da porta de uma câmera à porta da seguinte (a Miqus tem duas portas
    // atrás; fotos 1_equipamento/camera_traseira_numero_serie e cabo_conector_rede), e o da última à Camera Sync Unit
    for (let i = 0; i < ordem.length; i++) {
      const A = cams[ordem[i]], ultimaCam = i === ordem.length - 1, rA = A.cabos && A.cabos[i === 0 ? 0 : 1];
      const rB = ultimaCam ? null : (cams[ordem[i + 1]].cabos || [])[0];
      if (!rA || (!ultimaCam && !rB)) continue;
      const b = ultimaCam ? entSu : rB[0], sobe = ultimaCam ? [bordaTras(entSu, 300), bordaTras(entSu, hT + 5), ...(nSu ? [soma(entSu, nSu, 60)] : [])] : rB.slice(1).reverse();
      const desce = rA.slice(1);
      const rota = assentar(rotaCabo(rA[0], b, 11 + i, { desce, sobe, chao: peloChao(ultimo(desce), sobe[0], 11 + i) }), 3.5);
      add('cameras', L.cabo(rota, { raio: 3.5, plugueFim: ultimaCam ? 'encaixado' : false }), Mt.id());
    }
    add('montagem', L.cabo(assentar(ligaPortas(saiSu, nSu, portaNb1, nNb1), 2.5), { raio: 2.5, plugueInicio: 'encaixado', plugueFim: 'encaixado' }), Mt.id());
    // notebook das células + aquisição Lynx ADS1800 na ponta da mesa. O ADS1800 fica atrás do notebook, com o
    // painel dos bornes virado para o experimento e rente à borda da mesa (os cabos das células sobem por fora
    // da borda e entram nos bornes dos canais 6 e 7) e o painel traseiro, com a rede, virado para o operador
    // (fotos 2_montagem/aquisicao_lynx_ads1800_celulas_canais_6_e_7 e notebook_celulas_e_ads1800_na_mesa).
    if (L.baseCelulas) {
      const nb2 = L.notebook({ modelo: 'precision' }), bc = L.baseCelulas(), eb = (bc.pontos && bc.pontos.entradas) || [[-106, -30, 14], [-106, 30, 14]];
      const mNb2 = virado(sobre(sC, 90)), mB = matBase(P.n, [-P.s[0], -P.s[1]], sobre(sC - 150, -prof / 2 - 6 - eb[0][0]));
      add('montagem', nb2, mNb2); add('montagem', bc, mB);
      const ent = eb.map((q) => ponto(mB, q));
      const sai = pt(mB, bc.pontos && bc.pontos.saida, ent[0]), portaNb2 = pt(mNb2, nb2.pontos && (nb2.pontos.portaRede || nb2.pontos.porta), sobre(sC, 90)); // rede na traseira do notebook
      add('montagem', L.cabo(ligaPortas(sai, dirM(mB, bc.normais && bc.normais.saida), portaNb2, dirM(mNb2, nb2.normais && nb2.normais.portaRede)),
        { raio: 2.6, cor: [0.08, 0.22, 0.72], conectores: 'encaixado' }), Mt.id()); // cabo de rede azul
      // Os cabos das células são cabos pretos (fotos 5_montagem_final); só no fim, junto dos bornes, a capa
      // acaba e aparecem os 4 fios + terra.
      const caboCelula = (rota) => {
        let k = rota.length - 1, resto = 0;
        while (k > 1 && resto < 90) { resto += dist(rota[k], rota[k - 1]); k--; }
        add('montagem', L.cabo(rota.slice(0, k + 1), { raio: 2.6 }), Mt.id());
        add('montagem', L.cabo(rota.slice(k), { fios: 4, malha: true, cores: [[0.78, 0.07, 0.06], [0.06, 0.48, 0.22], [0.92, 0.80, 0.10], [0.04, 0.04, 0.04]] }), Mt.id());
      };
      // chegada ao ADS1800: cada cabo sobe por fora da borda da mesa, na direção do seu borne, e entra nele por
      // baixo (ds abre os dois cabos no chão para não subirem um por cima do outro)
      const ladoEnt = daParede(P, ent[0])[0] >= daParede(P, ent[1])[0] ? 1 : -1; // o borne mais à esquerda abre para a esquerda
      const chegada = (e, ds) => { const [ps, pn] = daParede(P, e);
        return [naParede(P, ps + ds, pn - 35, 300), naParede(P, ps + ds * 0.4, pn - 30, hT - 140), naParede(P, ps, pn - 16, e[2] - 45)]; };
      // célula 1 (braço): o cabo vai até a mesa de pallet e fica enrolado sobre ela (fotos montagem_final_frente
      // e _lateral_cameras); dali desce pela ponta da mesa e segue pelo chão até a mesa dos computadores (estimado)
      if (celulas.braco) {
        const c0b = celulas.braco, zT = 750 + 4, [sp, np] = mv.mesaPallet;
        const sobreP = (ds, dn, dz = 0) => naParede(P, sp + ds, np + dn, zT + dz);
        const rolo = []; for (let i = 0; i <= 40; i++) { const a = 2 * Math.PI * 2.5 * i / 40; rolo.push(sobreP(-260 + 85 * Math.cos(a), -60 + 70 * Math.sin(a), 6 + 3 * Math.sin(a * 0.5))); }
        const meio = [(c0b[0] + rolo[0][0]) / 2, (c0b[1] + rolo[0][1]) / 2, Math.min(c0b[2], zT) + 60];
        const desce = [meio, sobreP(-540, -120, 4), ...rolo, sobreP(-500, 150, 4), sobreP(-590, 200, 4), sobreP(-628, 215, -14), sobreP(-628, 215, -400), sobreP(-628, 215, -715)];
        const sobe = chegada(ent[0], 30 * ladoEnt);
        caboCelula(assentar(rotaCabo(c0b, ent[0], 31, { desce, sobe, chao: peloChao(desce[desce.length - 1], sobe[0], 31) }), 2.6));
      }
      // célula 2 (suporte): desce junto da perna do suporte até a chapa de base, sai pela borda e corre pelo chão até a mesa
      if (celulas.suporte && mSup) {
        const c0s = celulas.suporte, pe = ponto(mSup, [-150, -150, 40]);
        const desce = [[c0s[0], c0s[1], c0s[2] - 80], [pe[0], pe[1], 300], [pe[0], pe[1], 110], [pe[0], pe[1], 37], ponto(mSup, [-150, -205, 36]), ponto(mSup, [-150, -262, 34])];
        const sobe = chegada(ent[1], -30 * ladoEnt);
        caboCelula(assentar(rotaCabo(c0s, ent[1], 23, { desce, sobe, chao: peloChao(desce[desce.length - 1], sobe[0], 23, zonaAberta) }), 2.6));
      }
    }
  }

  if (avisos.length) console.warn('Cena do laboratório:', avisos.join('; '));
  const visada = cams.map((k) => ({ o: k.o, vis: k.vis, todos: k.n === marc.length, seVe: k.seVe, altura: k.alt, nome: k.nome, movida: k.movida, partida: k.diagPartida || [] }));
  return { grupos, medido: !!med, visada, nomes: marc.map((m) => m.nome), parede: P, comprimentos, ramos: med ? med.ramos : null, avisos };
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
