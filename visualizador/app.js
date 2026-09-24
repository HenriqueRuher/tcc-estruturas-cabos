// Visualizador da simulação "Catenária 3D" (ANSYS) — sem dependências.
// Lê window.SIM (dados.js, gerado por converter_dados.mjs).
(() => {
'use strict';

const SIM = window.SIM;
const PR = SIM.params;
const AREA = PR.area;
const CAB = SIM.cabos;                       // {nome, sec, nos[], elems[]}
const ELEMS = SIM.elems;                     // {id, sec, i, j}
const CAB_VAR = ['--c1', '--c2', '--c3'];

// Valores da Tabela 4.14 do TCC (modelo analítico/Python) para comparação.
const TCC = { P: [20.00, 6.36, 2.30], T0: [818.54, 818.54, 186.69] };

// ---------------------------------------------------------------- dados
// frame 0 = configuração inicial (sem carga); 1..N = substeps do ANSYS.
const FR = [{
  passo: 0, fator: 0,
  u: SIM.nos0.map(() => [0, 0, 0]),
  b: ELEMS.map(() => [0, 0, 0, 0, 0, 0, 0]),
}, ...SIM.frames];
const NF = FR.length, ULT = NF - 1;
const POS = FR.map((f) => SIM.nos0.map((p, k) => [p[0] + f.u[k][0], p[1] + f.u[k][1], p[2] + f.u[k][2]]));

const hyp = Math.hypot;
const QTY = {
  sigma: {
    nome: 'Tensão axial σ = N/A', un: 'MPa', dig: 2,
    curto: 'σ axial',
    elem: (b) => [b[0] / AREA / 1e6, b[1] / AREA / 1e6],
    nota: `Tensão normal média na seção do cabo: força axial dividida pela área A = π·r² com r = ${Math.round(PR.raio * 100)} cm (${(AREA * 1e4).toFixed(2).replace('.', ',')} cm²). `
      + `A rigidez à flexão foi reduzida a 1/${Math.round(1 / (PR.fI || 1))} só pelo momento de inércia (seção genérica ASEC); a área, e portanto EA e σ, não mudam. `
      + 'É a grandeza fisicamente relevante para um cabo ideal.',
  },
  forca: {
    nome: 'Força axial N', un: 'N', dig: 0,
    curto: 'N',
    elem: (b) => [b[0], b[1]],
    nota: 'Esforço normal (SMISC 1 do BEAM188) — é o mesmo AXF listado nos arquivos forcas_linha*.txt. Positivo = tração.',
  },
  desl: {
    nome: 'Deslocamento |u|', un: 'm', dig: 2,
    curto: '|u|',
    node: true,
    nota: 'Módulo do deslocamento nodal em relação à forma inicial parabólica (a folga do cabo vem dessa forma inicial).',
  },
};
const QKEYS = Object.keys(QTY);

// ---------------------------------------------------------------- modelo analítico
// Mesmo sistema de 9 equações do Estudo de Caso #3 do TCC (compatibilidade de
// altura e comprimento de cada trecho + equilíbrio do nó P), resolvido aqui por
// Newton amortecido com os parâmetros lidos do próprio dados.js. Incógnitas:
// X = [xp, yp, zp, T0A, T0B, T0C, C1A, C1B, C1C].
function solucaoAnalitica() {
  const anc = [PR.A, PR.B, PR.C];
  const L = [PR.LA, PR.LB, PR.LC], q = [PR.q1, PR.q1, PR.q2];
  const F = (X) => {
    const [xp, yp, zp] = X, r = [], T = X.slice(3, 6), c = X.slice(6, 9), H = [];
    for (let i = 0; i < 3; i++) {
      const p = anc[i], a = T[i] / q[i];
      H[i] = hyp(p[0] - xp, p[2] - zp);
      r.push(a * (Math.cosh(H[i] / a + c[i]) - Math.cosh(c[i])) - (p[1] - yp));
      r.push(a * (Math.sinh(H[i] / a + c[i]) - Math.sinh(c[i])) - L[i]);
    }
    r.push(T.reduce((s, t, i) => s + t * (anc[i][0] - xp) / H[i], 0));
    r.push(T.reduce((s, t, i) => s + t * (anc[i][2] - zp) / H[i], 0));
    r.push(T.reduce((s, t, i) => s + t * Math.sinh(c[i]), 0));
    return r;
  };
  const norma = (r) => Math.sqrt(r.reduce((s, v) => s + v * v, 0));
  // chute inicial no espírito do TCC: P abaixo das ancoragens, pouco fora do
  // plano de A e B, trações da ordem do peso de cada trecho
  const ymin = Math.min(PR.A[1], PR.B[1], PR.C[1]);
  let X = [PR.P0[0], ymin - 8, PR.P0[2] / 3, ...q.map((qi, i) => qi * L[i]), -0.5, -0.5, -0.5];
  let r = F(X);
  for (let it = 0; it < 200 && norma(r) > 1e-9; it++) {
    const J = [];
    for (let j = 0; j < 9; j++) {
      const h = 1e-7 * Math.max(1, Math.abs(X[j])), Xh = X.slice(); Xh[j] += h;
      const rh = F(Xh);
      for (let i = 0; i < 9; i++) (J[i] ||= [])[j] = (rh[i] - r[i]) / h;
    }
    // eliminação de Gauss com pivotamento parcial: J·dx = −r
    const M = J.map((row, i) => [...row, -r[i]]);
    for (let k = 0; k < 9; k++) {
      let p = k;
      for (let i = k + 1; i < 9; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
      [M[k], M[p]] = [M[p], M[k]];
      for (let i = k + 1; i < 9; i++) { const f = M[i][k] / M[k][k]; for (let j = k; j < 10; j++) M[i][j] -= f * M[k][j]; }
    }
    const dx = new Array(9);
    for (let i = 8; i >= 0; i--) { let s = M[i][9]; for (let j = i + 1; j < 9; j++) s -= M[i][j] * dx[j]; dx[i] = s / M[i][i]; }
    // passo amortecido: reduz até o resíduo cair (mantendo T0 > 0)
    let t = 1, Xn, rn;
    for (; t > 1e-4; t /= 2) {
      Xn = X.map((v, i) => v + t * dx[i]);
      if (Xn[3] > 0 && Xn[4] > 0 && Xn[5] > 0) { rn = F(Xn); if (rn.every(isFinite) && norma(rn) < norma(r)) break; }
    }
    if (t <= 1e-4) return null;
    X = Xn; r = rn;
  }
  if (!(norma(r) < 1e-6)) return null;
  const P = X.slice(0, 3), T0 = X.slice(3, 6), c = X.slice(6, 9);
  // pontos 3D de cada catenária (no plano vertical que liga P à ancoragem)
  const curvas = anc.map((p, i) => {
    const H = hyp(p[0] - P[0], p[2] - P[2]), ux = (p[0] - P[0]) / H, uz = (p[2] - P[2]) / H, a = T0[i] / q[i];
    const pts = [];
    for (let k = 0; k <= 80; k++) {
      const s = H * k / 80;
      pts.push([P[0] + s * ux, P[1] + a * (Math.cosh(s / a + c[i]) - Math.cosh(c[i])), P[2] + s * uz]);
    }
    return pts;
  });
  return { P, T0, c, q, curvas };
}
const ANALITICA = solucaoAnalitica();

// Erro por mínimos quadrados (RMS) entre os nós do ANSYS no último passo e a
// catenária analítica, por trecho — mesma definição do figuras_mef.py/TCC:
// d_k = menor distância do nó k à curva; E = sqrt(média de d_k²).
//  posição: distância 3D absoluta (inclui o deslocamento do nó P);
//  forma: perfil no plano vertical, cada modelo com origem no seu próprio P.
function erroRms() {
  if (!ANALITICA) return null;
  const { P, T0, c, q } = ANALITICA, pos = POS[ULT], Pf = pos[SIM.noP], N = 2000;
  const anc = [PR.A, PR.B, PR.C];
  return CAB.map((cab, i) => {
    const p = anc[i], H = hyp(p[0] - P[0], p[2] - P[2]), ux = (p[0] - P[0]) / H, uz = (p[2] - P[2]) / H, a = T0[i] / q[i];
    const s = [], y = [];
    for (let k = 0; k <= N; k++) { s[k] = H * k / N; y[k] = P[1] + a * (Math.cosh(s[k] / a + c[i]) - Math.cosh(c[i])); }
    let e3 = 0, e2 = 0, m3 = 0, m2 = 0;
    for (const n of cab.nos) {
      const x = pos[n], r = hyp(x[0] - Pf[0], x[2] - Pf[2]);
      let d3 = Infinity, d2 = Infinity;
      for (let k = 0; k <= N; k++) {
        d3 = Math.min(d3, hyp(x[0] - (P[0] + s[k] * ux), x[1] - y[k], x[2] - (P[2] + s[k] * uz)));
        d2 = Math.min(d2, hyp(r - s[k], x[1] - y[k]));
      }
      e3 += d3 * d3; e2 += d2 * d2; m3 = Math.max(m3, d3); m2 = Math.max(m2, d2);
    }
    const n = cab.nos.length;
    return { pos: Math.sqrt(e3 / n), posMax: m3, forma: Math.sqrt(e2 / n), formaMax: m2 };
  });
}
const ERRO = erroRms();

// valores por nó de cada cabo (cadeia ancoragem → P), com cache
const cache = new Map();
function valoresCabo(q, f, ci) {
  const key = q + '|' + f + '|' + ci;
  if (cache.has(key)) return cache.get(key);
  const cab = CAB[ci], n = cab.elems.length, Q = QTY[q], out = new Array(n + 1);
  if (Q.node) {
    for (let k = 0; k <= n; k++) out[k] = hyp(...FR[f].u[cab.nos[k]]);
  } else {
    const st = [], en = [];
    for (let k = 0; k < n; k++) {
      const ei = cab.elems[k];
      const [vi, vj] = Q.elem(FR[f].b[ei]);
      if (ELEMS[ei].i === cab.nos[k]) { st[k] = vi; en[k] = vj; } else { st[k] = vj; en[k] = vi; }
    }
    out[0] = st[0]; out[n] = en[n - 1];
    for (let k = 1; k < n; k++) out[k] = (en[k - 1] + st[k]) / 2;
  }
  cache.set(key, out);
  return out;
}
const valorElem = (q, f, ei) => {
  const Q = QTY[q];
  if (Q.node) { const e = ELEMS[ei]; return (hyp(...FR[f].u[e.i]) + hyp(...FR[f].u[e.j])) / 2; }
  const [a, b] = Q.elem(FR[f].b[ei]);
  return (a + b) / 2;
};

const rangeCache = {};
function faixaGlobal(q) {
  if (rangeCache[q]) return rangeCache[q];
  let lo = Infinity, hi = -Infinity;
  for (let f = 0; f < NF; f++) for (let c = 0; c < CAB.length; c++)
    for (const v of valoresCabo(q, f, c)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (lo > 0) lo = 0;
  return (rangeCache[q] = [lo, hi]);
}
function faixaFrame(q, f) {
  let lo = Infinity, hi = -Infinity;
  for (let c = 0; c < CAB.length; c++)
    for (const v of valoresCabo(q, f, c)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return [lo, hi];
}

// grandezas derivadas por passo
// T0 = componente horizontal da força axial, N·cos(φ), média na metade central do
// trecho (mesma definição do texto do TCC e do estudo_rigidez.py). Junto às
// extremidades (engaste e ligação rígida em P) ainda há um pequeno efeito de
// flexão, por isso o elemento colado em P não é usado como referência.
function t0(f, ci) {
  const cab = CAB[ci], n = cab.elems.length;
  let soma = 0, cont = 0;
  for (let k = Math.floor(n / 4); k < Math.floor(3 * n / 4); k++) {
    const N = FR[f].b[cab.elems[k]][0];
    const a = POS[f][cab.nos[k]], b = POS[f][cab.nos[k + 1]];
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    soma += N * hyp(dx, dz) / hyp(dx, dy, dz); cont++;
  }
  return soma / cont;
}
function comprimento(f, ci) {
  const cab = CAB[ci]; let L = 0;
  for (let k = 0; k < cab.nos.length - 1; k++) {
    const a = POS[f][cab.nos[k]], b = POS[f][cab.nos[k + 1]];
    L += hyp(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }
  return L;
}
function arcos(f, ci) {                     // abscissa curvilínea de cada nó
  const cab = CAB[ci], s = [0];
  for (let k = 0; k < cab.nos.length - 1; k++) {
    const a = POS[f][cab.nos[k]], b = POS[f][cab.nos[k + 1]];
    s.push(s[k] + hyp(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
  }
  return s;
}

// ---------------------------------------------------------------- utilidades
const $ = (s) => document.querySelector(s);
const nfCache = {};
const fmt = (v, d = 2) => (nfCache[d] || (nfCache[d] = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }))).format(v);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function niceTicks(lo, hi, n = 5) {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw)), r = raw / mag;
  const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
  const out = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}
function niceMax(hi, n = 4) {
  const t = niceTicks(0, hi, n);
  if (t.length < 2) return hi;
  const step = t[1] - t[0];
  return t.at(-1) >= hi - step * 1e-9 ? t.at(-1) : t.at(-1) + step;
}
const decimaisTick = (ticks) => {
  if (ticks.length < 2) return 1;
  const st = Math.abs(ticks[1] - ticks[0]);
  return st >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(st) - 1e-9));
};

// ---------------------------------------------------------------- mapas de cor
const CMAPS = {
  viridis: ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'],
  ansys: ['#0000d0', '#0050ff', '#00c8ff', '#00e69a', '#00d800', '#b4e600', '#ffc800', '#ff6400', '#e60000'],
};
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const LUT = {};
for (const [nome, stops] of Object.entries(CMAPS)) {
  const cols = stops.map(hex2rgb), lut = [];
  for (let i = 0; i < 256; i++) {
    const t = i / 255 * (cols.length - 1), k = Math.min(cols.length - 2, Math.floor(t)), a = t - k;
    lut.push(cols[k].map((c, j) => Math.round(c + (cols[k + 1][j] - c) * a)));
  }
  LUT[nome] = lut;
}

// ---------------------------------------------------------------- estado
const S = {
  f: ULT, q: 'sigma', cmap: 'viridis', escala: 'global',
  inicial: true, piso: true, nos: false,
  yaw: -0.62, pitch: 0.42, zoom: 1,
  play: false, vel: 1, hover: null,
  cena: 'analise', // 'analise' (padrão, inalterado) | 'cenario' (torres + céu + terreno)
  casoCabo: 'C-P', casoPos: null, casoMag: null, // caso de força concentrada ativo (null = anima o caso principal)
  comp: 'mef', // 'mef' (só ANSYS) | 'sobrepor' (ANSYS + analítica) | 'nos' (analítica + nós do ANSYS)
};
const VIEWS = {
  iso: [-0.62, 0.42], front: [0, 0], side: [Math.PI / 2, 0], top: [0, Math.PI / 2 - 0.001],
};
// no modo "cena" o zoom e a inclinação da câmera são mais restritos (evita
// afastar/aproximar demais e, principalmente, evita a câmera "entrar" no
// chão ao inclinar demais para baixo); no modo análise fica como sempre foi.
const ZOOM_LIM = () => (S.cena === 'cenario' ? [0.65, 2.6] : [0.4, 6]);
const PITCH_LIM = () => (S.cena === 'cenario' ? [0.02, 1.3] : [-1.5707, 1.5707]);
// estado inicial opcional via #f=25&q=sigma&cmap=ansys&yaw=-.6&pitch=.4&zoom=1&escala=frame
(() => {
  const h = new URLSearchParams(location.hash.slice(1));
  const num = (k) => (h.has(k) && isFinite(+h.get(k)) ? +h.get(k) : null);
  if (num('f') !== null) S.f = clamp(Math.round(num('f')), 0, ULT);
  if (QTY[h.get('q')]) S.q = h.get('q');
  if (CMAPS[h.get('cmap')]) S.cmap = h.get('cmap');
  if (['global', 'frame'].includes(h.get('escala'))) S.escala = h.get('escala');
  if (num('yaw') !== null) S.yaw = num('yaw');
  if (num('pitch') !== null) S.pitch = num('pitch');
  if (num('zoom') !== null) S.zoom = num('zoom');
  if (h.get('inicial') === '0') S.inicial = false;
  if (h.get('nos') === '1') S.nos = true;
  if (['mef', 'sobrepor', 'nos'].includes(h.get('comp'))) S.comp = h.get('comp');
  if (h.has('tema')) document.documentElement.dataset.theme = h.get('tema');
})();

// ---------------------------------------------------------------- tema
const css = () => getComputedStyle(document.documentElement);
let TH = {};
function lerTema() {
  const c = css(), g = (n) => c.getPropertyValue(n).trim();
  const escuro = (document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
  TH = {
    surface: g('--surface'), ink: g('--ink'), ink2: g('--ink-2'), muted: g('--muted'),
    grid: g('--grid'), halo: g('--halo'), accent: g('--accent'), line: g('--line'),
    cab: CAB_VAR.map(g),
    // cores da "cena" (torres/céu/grama) — independentes do tema claro/escuro da UI,
    // com uma variante noturna sutil quando o tema está escuro.
    ceuTopo: escuro ? '#101a2e' : '#8ec5ff',
    ceuBase: escuro ? '#2a3a55' : '#dff0ff',
    grama: escuro ? '#26361f' : '#5fa832',
    gramaEscura: escuro ? '#1f2c19' : '#54992c',
    analitica: escuro ? '#ff5a4f' : '#d7191c', // curva do modelo analítico
  };
}
const btnCena = $('#btnCena');
function atualizarBtnCena() {
  const on = S.cena === 'cenario';
  btnCena.textContent = on ? '📊 Análise' : '🗼 Cena';
  btnCena.title = on ? 'Voltar ao modo de análise técnica' : 'Ver cena com torres, céu e terreno';
  btnCena.classList.toggle('on', on);
}
const layoutEl = document.querySelector('.layout');
btnCena.addEventListener('click', () => {
  S.cena = S.cena === 'cenario' ? 'analise' : 'cenario';
  atualizarBtnCena();
  layoutEl.classList.toggle('cena-cheia', S.cena === 'cenario');
  if (S.cena === 'cenario') {
    // cena de apresentação: sem animação, sempre na forma final já convergida
    if (typeof parar === 'function') parar();
    definirFrame(ULT);
    S.pitch = clamp(S.pitch, ...PITCH_LIM());
    S.zoom = clamp(S.zoom, ...ZOOM_LIM());
  }
  try { localStorage.setItem('cat3d-cena', S.cena); } catch (e) { /* sem storage */ }
  redimensionar();
  pedirDesenho();
});
try {
  const c = localStorage.getItem('cat3d-cena');
  if (c === 'cenario' || c === 'analise') S.cena = c;
} catch (e) { /* sem storage */ }
layoutEl.classList.toggle('cena-cheia', S.cena === 'cenario');
atualizarBtnCena();

$('#btnTema').addEventListener('click', () => {
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const atual = document.documentElement.dataset.theme || (dark ? 'dark' : 'light');
  const novo = atual === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = novo;
  try { localStorage.setItem('cat3d-tema', novo); } catch (e) { /* sem storage */ }
  atualizarTudo();
});
try {
  const t = localStorage.getItem('cat3d-tema');
  if ((t === 'dark' || t === 'light') && !document.documentElement.dataset.theme) document.documentElement.dataset.theme = t;
} catch (e) { /* sem storage */ }
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => atualizarTudo());

// ---------------------------------------------------------------- câmera 3D
const cv = $('#cv'), ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1;

// centro e raio da cena (inclui o piso e todos os passos)
const CENA = (() => {
  const mn = [-5, 0, -5], mx = [45, 22, 30];
  return { c: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2 - 1, (mn[2] + mx[2]) / 2], R: hyp(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2 };
})();

let CAM = null;
function camera() {
  const cy = Math.cos(S.yaw), sy = Math.sin(S.yaw), cp = Math.cos(S.pitch), sp = Math.sin(S.pitch);
  const D = 4 * CENA.R;
  CAM = { cy, sy, cp, sp, D, F: 0.62 * Math.min(W, H) * D / CENA.R * S.zoom };
}
function proj(p) {
  const { cy, sy, cp, sp, D, F } = CAM, c = CENA.c;
  const x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2];
  const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
  const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
  const d = D - z2, k = F / d;
  return [W / 2 + x1 * k, H / 2 - y2 * k, d, k];
}

let quer = false;
function pedirDesenho() {
  if (quer) return;
  quer = true;
  requestAnimationFrame(() => { quer = false; desenhar(); });
}
function redimensionar() {
  const r = cv.getBoundingClientRect();
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = r.width; H = r.height;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  pedirDesenho();
}
new ResizeObserver(redimensionar).observe(cv);

// frame "visível": o substep atual ou, com um caso de força selecionado, o frame
// virtual FC (montado a partir do casos.js em montarFrameCaso)
const FC = NF;
let casoMontado = null;
function montarFrameCaso(c) {
  if (casoMontado === c) return;
  FR[FC] = {
    passo: 'caso', fator: 1, u: c.u,
    // só força axial (o casos.js não traz momentos: cabo ideal não resiste à flexão)
    b: ELEMS.map((e) => { const n = c.N ? c.N[e.id - 1] : 0; return [n, n, 0, 0, 0, 0, 0]; }),
  };
  POS[FC] = posDoCaso(c);
  for (const k of [...cache.keys()]) if (k.split('|')[1] === String(FC)) cache.delete(k);
  casoMontado = c;
}
function fV() {
  const c = casoAtivo();
  if (!c) return S.f;
  montarFrameCaso(c);
  return FC;
}
function faixaAtual() {
  // com caso selecionado a escala é sempre a do próprio caso (a força muda muito a faixa)
  if (casoAtivo()) return faixaFrame(S.q, fV());
  return S.escala === 'global' ? faixaGlobal(S.q) : faixaFrame(S.q, S.f);
}
function corDe(v, lo, hi) {
  const t = hi > lo ? clamp((v - lo) / (hi - lo), 0, 1) : 0;
  const c = LUT[S.cmap][Math.round(t * 255)];
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// ---------------------------------------------------------------- cena (torres/céu/grama)
// Modo alternativo de exibição — não interfere em nada do modo "análise".

// direção da luz do sol, como uma posição FIXA NO ESPAÇO 3D (não presa à
// tela): ao girar a câmera, o sol se move pela cena como um sol de verdade,
// e a direção horizontal dessa mesma luz é reaproveitada para as sombras.
const LUZ_3D = (() => { const v = [0.5, 0.8, 0.32]; const n = hyp(hyp(v[0], v[1]), v[2]); return v.map((c) => c / n); })();
const SOL_DIST = 260;
const LUZ_H = (() => { const n = hyp(LUZ_3D[0], LUZ_3D[2]); return { x: LUZ_3D[0] / n, z: LUZ_3D[2] / n }; })();

// terreno com relevo FUNCIONAL: um morro sob as ancoragens A/B (z≈0) que desce
// suavemente até o terreno baixo sob a ancoragem C (z≈25). É esse desnível do
// terreno — e não a altura das torres — que explica A/B ficarem mais altas
// (y=20) que C (y=15): as 3 torres têm a MESMA altura (15 m), apoiadas em
// cotas de terreno diferentes (5 m sob A/B, 0 m sob C).
const MORRO_ALT = 5, MORRO_Z0 = 0, MORRO_Z1 = 25;
// desloca TODO o relevo pra baixo (mantendo a mesma diferença de cota entre
// A/B e C, logo as 3 torres continuam com a MESMA altura, só que maiores):
// o ponto mais baixo do cabo C-P (y≈1,67 em x≈20,z≈12,6) ficava ABAIXO da
// superfície do terreno ali (≈2,7) com o relevo original — o cabo "afundava"
// visualmente no chão. Baixando o terreno em 2,5 m dá ~1,3 m de folga real
// no ponto mais crítico (conferido numericamente) e, de quebra, deixa as
// torres ~2,5 m mais altas (17,5 m em vez de 15 m).
const TERRENO_DESLOC = 2.5;
function alturaTerreno(x, z) {
  const t = clamp((z - MORRO_Z0) / (MORRO_Z1 - MORRO_Z0), 0, 1);
  const suave = t * t * (3 - 2 * t); // smoothstep
  const morro = MORRO_ALT * (1 - suave);
  // textura fina (ondulação decorativa de baixa amplitude, não estrutural)
  const textura = 0.35 * Math.sin(x * 0.22 + 0.6) * Math.cos(z * 0.19);
  return morro - TERRENO_DESLOC + textura;
}

// sombra projetada no chão de um objeto vertical (base em (x,z), do chão até 'altura')
function sombra(x, z, altura, largura = 1) {
  // sombra fina e alongada na direção da luz (não um borrão redondo): o
  // comprimento cresce com a altura do objeto, a largura fica quase fixa.
  const comp = altura * 0.85;
  const sx = x + LUZ_H.x * comp, sz = z + LUZ_H.z * comp;
  const p0 = proj([x, alturaTerreno(x, z) + 0.02, z]);
  const p1 = proj([sx, alturaTerreno(sx, sz) + 0.02, sz]);
  const meiaLarg = Math.max(2.5, largura * (CAM.F / CAM.D) * 0.45);
  ctx.save();
  ctx.globalAlpha = .22; ctx.fillStyle = '#10140a';
  ctx.beginPath();
  ctx.ellipse((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, hyp(p1[0] - p0[0], p1[1] - p0[1]) / 2 + meiaLarg * .6, meiaLarg,
    Math.atan2(p1[1] - p0[1], p1[0] - p0[0]), 0, 6.2832);
  ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------- malhas 3D reais
// Renderizador simples de triângulos (pintor's algorithm + sombreamento
// plano por face), para as malhas em window.MALHAS: as três árvores low
// poly de Simulacao/3D/Low Poly Trees/ e a cabana de toras de
// Simulacao/3D/Snow House/ (ver processa_malhas.py), e para as malhas
// low poly geradas aqui mesmo (montanhas, lago, pedras, nuvens).
// 'base' = cota do chão da malha (padrão: o terreno em x,z).
const PERTO = 0.5; // triângulos com vértice atrás da câmera (ou colado nela) são descartados
function hexRgb(h) {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
// névoa leve de distância ("perspectiva aérea"): fração da cor do horizonte
// misturada à cor do objeto, em função da distância à câmera -- a mesma
// para malhas, terreno e chão, para tudo "sumir" no horizonte por igual
const nevoaF = (d) => clamp((d - 90) / 620, 0, 0.5);
function comNevoa(rgb, f) {
  const n = hexRgb(TH.ceuBase);
  const c = rgb.map((k, i) => Math.round(k * (1 - f) + n[i] * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function desenharMalha(malha, x, z, escala = 1, rotY = 0, base = alturaTerreno(x, z)) {
  if (!malha) return;
  const cy = Math.cos(rotY), sy = Math.sin(rotY);
  const pts = malha.verts.map(([vx, vy, vz]) => {
    const rx = vx * cy - vz * sy, rz = vx * sy + vz * cy;
    return [x + rx * escala, base + vy * escala, z + rz * escala];
  });
  const proj_pts = pts.map(proj);

  const tris = [];
  for (const [a, b, c, ci] of malha.faces) {
    const pA = proj_pts[a], pB = proj_pts[b], pC = proj_pts[c];
    if (pA[2] < PERTO || pB[2] < PERTO || pC[2] < PERTO) continue;
    const pa = pts[a], pb = pts[b], pc = pts[c];
    // normal da face (nao precisa normalizar p/ o sinal do sombreamento)
    const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    const v = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    let nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
    const nn = hyp(hyp(nx, ny), nz) || 1;
    nx /= nn; ny /= nn; nz /= nn;
    const luz = clamp(nx * LUZ_3D[0] + ny * LUZ_3D[1] + nz * LUZ_3D[2], -1, 1);
    const sombreado = clamp(0.45 + 0.55 * luz, 0.28, 1);
    const cor = malha.cores[ci] || [0.5, 0.5, 0.5];
    const d = (pA[2] + pB[2] + pC[2]) / 3;
    tris.push({ pA, pB, pC, d, cor: comNevoa(cor.map((k) => k * 255 * sombreado), nevoaF(d)) });
  }
  tris.sort((u, v) => v.d - u.d); // pintor's algorithm: fundo -> frente
  // contorno da mesma cor fecha as frestas de antialiasing entre triângulos
  // vizinhos -- só onde elas aparecem (cabana e píer: malha.contorno),
  // porque dobra o custo de desenho
  const contorno = malha.contorno || malha === (window.MALHAS && MALHAS.casa);
  // câmera dentro/encostada no objeto: ele fica translúcido (não some), para
  // não tampar a vista -- opacidade cresce com a distância do vértice mais próximo
  const dMin = proj_pts.reduce((m, p) => Math.min(m, p[2]), Infinity);
  const alfaAntes = ctx.globalAlpha;
  ctx.globalAlpha = dMin < 35 ? clamp((dMin - 4) / 31, 0.22, 1) : 1;
  ctx.lineWidth = 0.6; ctx.lineJoin = 'round';
  for (const t of tris) {
    ctx.fillStyle = t.cor;
    ctx.beginPath();
    ctx.moveTo(t.pA[0], t.pA[1]); ctx.lineTo(t.pB[0], t.pB[1]); ctx.lineTo(t.pC[0], t.pC[1]);
    ctx.closePath(); ctx.fill();
    if (contorno) { ctx.strokeStyle = t.cor; ctx.stroke(); }
  }
  ctx.globalAlpha = alfaAntes;
  return malha.verts.reduce((m, v) => Math.max(m, v[1]), 0) * escala;
}

function desenharPoste(topoXZ, altura) {
  // Torre treliçada esquemática (inspirada nas proporções de Simulacao/3D/Torre.obj),
  // desenhada só com segmentos de linha via proj(), do chão até 'altura' — todas as
  // torres usam a MESMA altura (uniformes), com a base pousada no terreno ondulado.
  const [cx, , cz] = topoXZ;
  const base = alturaTerreno(cx, cz);
  const h = Math.max(altura, 1);
  const baseW = h * 0.11, topoW = h * 0.028;
  const niveis = 5;
  const anel = (t) => {
    const y = base + t * h, w = baseW + (topoW - baseW) * t;
    return [[cx - w, y, cz - w], [cx + w, y, cz - w], [cx + w, y, cz + w], [cx - w, y, cz + w]];
  };
  ctx.strokeStyle = TH.ink2; ctx.lineWidth = 1.3; ctx.globalAlpha = .8;
  let prevAnel = null;
  for (let i = 0; i <= niveis; i++) {
    const t = i / niveis;
    const anelAtual = anel(t).map(proj);
    ctx.beginPath();
    for (let k = 0; k < 4; k++) { const a = anelAtual[k], b = anelAtual[(k + 1) % 4]; ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();
    if (prevAnel) {
      ctx.beginPath();
      for (let k = 0; k < 4; k++) { const a = prevAnel[k], b = anelAtual[k]; ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      for (let k = 0; k < 4; k++) {
        const a = prevAnel[k], b = anelAtual[(k + 1) % 4], c = prevAnel[(k + 1) % 4], d = anelAtual[k];
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
        ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]);
      }
      ctx.stroke();
    }
    prevAnel = anelAtual;
  }
  ctx.globalAlpha = 1;
  return h;
}

// Duas "espécies" esquemáticas, com proporções (altura × largura da copa)
// inspiradas nos dois modelos em Simulacao/3D/Arvore_01.obj (mais alta e
// cônica, como uma conífera) e Arvore_02.obj (mais baixa e arredondada).
function desenharArvore(x, z, porte = 1, tipo = 0) {
  const base = alturaTerreno(x, z);
  if (tipo === 0) {
    // tipo cônico/alto (Arvore_01: altura/largura ≈ 1,6)
    const alturaTronco = 1.6 * porte, hCopa = 4.2 * porte, rCopa = 1.15 * porte;
    const pBase = proj([x, base, z]), pTopo = proj([x, base + alturaTronco, z]);
    ctx.strokeStyle = '#6b4a2f'; ctx.lineWidth = Math.max(2, 3 * porte * (CAM.F / CAM.D)); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.moveTo(pBase[0], pBase[1]); ctx.lineTo(pTopo[0], pTopo[1]); ctx.stroke();
    const niveis = 4, cores = ['#2f6b26', '#357029', '#3d7a2e', '#468433'];
    for (let i = 0; i < niveis; i++) {
      const t = i / (niveis - 1); // 0 = base da copa, 1 = topo
      const y = base + alturaTronco + hCopa * (0.15 + 0.78 * t);
      const r = rCopa * (1 - 0.72 * t);
      const p = proj([x, y, z]);
      const raioTela = Math.max(5, r * (CAM.F / CAM.D) * 1.7);
      ctx.fillStyle = cores[i]; ctx.globalAlpha = .96;
      ctx.beginPath(); ctx.arc(p[0], p[1], raioTela, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
    return alturaTronco + hCopa;
  }
  // tipo arredondado/baixo (Arvore_02: altura/largura ≈ 1,0)
  const alturaTronco = 1.1 * porte, raioCopa = 1.55 * porte;
  const pBase = proj([x, base, z]), pTopoTronco = proj([x, base + alturaTronco, z]);
  ctx.strokeStyle = '#6b4a2f'; ctx.lineWidth = Math.max(2, 3.5 * porte * (CAM.F / CAM.D)); ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.moveTo(pBase[0], pBase[1]); ctx.lineTo(pTopoTronco[0], pTopoTronco[1]); ctx.stroke();
  const copas = [
    [x, base + alturaTronco + raioCopa * .7, z],
    [x - raioCopa * .5, base + alturaTronco + raioCopa * .3, z + raioCopa * .2],
    [x + raioCopa * .5, base + alturaTronco + raioCopa * .35, z - raioCopa * .2],
  ];
  const coresCopa = ['#3d7a2e', '#468433', '#357029'];
  copas.forEach((c, i) => {
    const p = proj(c);
    const r = raioCopa * (CAM.F / CAM.D) * (i === 0 ? 1 : 0.78);
    ctx.fillStyle = coresCopa[i]; ctx.globalAlpha = .95;
    ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(6, r), 0, 6.2832); ctx.fill();
  });
  ctx.globalAlpha = 1;
  return alturaTronco + raioCopa * 1.4;
}

function desenharCabana(x, z) {
  const base = alturaTerreno(x, z);
  const larg = 5, prof = 4, peD = 2.6, altTelhado = 1.8, beiral = 0.5;
  const v = (dx, dy, dz) => proj([x + dx, base + dy, z + dz]);
  const face = (pts, cor) => {
    ctx.fillStyle = cor; ctx.strokeStyle = '#5a4028'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  };
  // paredes (caixa simples): x=largura, z=profundidade, frente em z=-prof/2
  const a0 = v(-larg / 2, 0, -prof / 2), b0 = v(larg / 2, 0, -prof / 2), c0 = v(larg / 2, 0, prof / 2), d0 = v(-larg / 2, 0, prof / 2);
  const a1 = v(-larg / 2, peD, -prof / 2), b1 = v(larg / 2, peD, -prof / 2), c1 = v(larg / 2, peD, prof / 2), d1 = v(-larg / 2, peD, prof / 2);
  face([b0, c0, c1, b1], '#a9855a'); // parede lateral (mais escura)
  face([a0, b0, b1, a1], '#d1ab74'); // parede frontal
  // telhado de duas águas: cumeeira corre ao longo de X (z=0), com beiral nas
  // pontas em X; as duas aguas descem para as paredes frontal (z=-prof/2) e
  // de tras (z=+prof/2).
  const cumeA = v(-larg / 2 - beiral, peD + altTelhado, 0), cumeB = v(larg / 2 + beiral, peD + altTelhado, 0);
  const beiralFA = v(-larg / 2 - beiral, peD, -prof / 2 - beiral), beiralFB = v(larg / 2 + beiral, peD, -prof / 2 - beiral);
  const beiralTA = v(-larg / 2 - beiral, peD, prof / 2 + beiral), beiralTB = v(larg / 2 + beiral, peD, prof / 2 + beiral);
  face([beiralFA, beiralFB, cumeB, cumeA], '#8f4736'); // agua da frente
  face([beiralTA, beiralTB, cumeB, cumeA], '#7a3b2e'); // agua de tras (mais escura)
  // porta
  const dPorta = [v(-0.6, 0, -prof / 2 - .01), v(0.6, 0, -prof / 2 - .01), v(0.6, 1.5, -prof / 2 - .01), v(-0.6, 1.5, -prof / 2 - .01)];
  face(dPorta, '#5a3a22');
  return peD + altTelhado;
}

// posições de árvores: geradas de forma pseudo-aleatória (mas com semente
// fixa, para não "pular" a cada redesenho) e espalhadas por toda a área do
// terreno, evitando apenas o corredor central onde os cabos e as torres ficam.
function rngSeed(semente) {
  let s = semente >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const CABANA = [53, -13]; // afastada da torre B (antes ficava a só ~11 m dela)
function gerarArvores() {
  const rnd = rngSeed(20260922);
  const pts = [];
  let tent = 0;
  while (pts.length < 26 && tent < 800) {
    tent++;
    const x = -16 + rnd() * 73, z = -16 + rnd() * 58;
    // evita o corredor central onde ficam as torres e os cabos -- faixa mais
    // larga que antes (folga maior em torno do vão A–B–C), pra manter as
    // árvores mais afastadas da cena-alvo (as catenárias)
    if (x > -11 && x < 51 && z > -11 && z < 36) continue;
    if (hyp(x - CABANA[0], z - CABANA[1]) < 6) continue; // deixa espaço livre em torno da cabana
    // evita amontoar arvores muito perto umas das outras
    if (pts.some((p) => hyp(p[0] - x, p[1] - z) < 3.2)) continue;
    pts.push([x, z, 0.7 + rnd() * 0.7, Math.floor(rnd() * 3), rnd() * 6.2832]); // tipo 0..2 = arvore0..2
  }
  return pts;
}
const ARVORES = gerarArvores();

// ------------------------------------------- cenário de fundo (low poly)
// Tudo gerado aqui com semente fixa, no mesmo estilo facetado das árvores:
// montanhas no horizonte, um lago com margem, pedras, nuvens e mata ao redor.
// O que é grande (montanhas/nuvens) fica FORA do raio em que a câmera orbita
// (~130 m do centro), para nunca tampar a vista; o que ficar atrás da câmera
// é descartado em desenharMalha.

// monta uma malha a partir de triângulos, orientando cada face para fora de
// 'centro' (a luz em desenharMalha depende do sentido da normal); com
// centro = null os triângulos já vêm orientados e ficam como estão
function malhaDeTris(tris, cores, centro) {
  const verts = [], faces = [];
  for (const [a, b, c, ci] of tris) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    let fora = true;
    if (centro) {
      const m = [(a[0] + b[0] + c[0]) / 3 - centro[0], (a[1] + b[1] + c[1]) / 3 - centro[1], (a[2] + b[2] + c[2]) / 3 - centro[2]];
      fora = n[0] * m[0] + n[1] * m[1] + n[2] * m[2] >= 0;
    }
    const i = verts.length;
    verts.push(a, fora ? b : c, fora ? c : b);
    faces.push([i, i + 1, i + 2, ci]);
  }
  return { verts, faces, cores };
}

// "bolota" facetada: octaedro subdividido 1x com os vértices sacudidos
// (base de pedras e nuvens)
function bolota(rnd, rx, ry, rz, cx = 0, cy = 0, cz = 0, ci = 0, sacode = 0.25) {
  const O = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const F = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]];
  const cache = new Map();
  const ponto = (v) => {
    const k = v.map((c) => c.toFixed(3)).join();
    if (!cache.has(k)) {
      const n = hyp(v[0], v[1], v[2]), j = 1 + (rnd() - 0.5) * 2 * sacode;
      cache.set(k, [cx + v[0] / n * rx * j, cy + v[1] / n * ry * j, cz + v[2] / n * rz * j]);
    }
    return cache.get(k);
  };
  const meio = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const tris = [];
  for (const [i, j, k] of F) {
    const a = O[i], b = O[j], c = O[k], ab = meio(a, b), bc = meio(b, c), ca = meio(c, a);
    for (const t of [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]]) tris.push([...t.map(ponto), ci]);
  }
  return tris;
}

function gerarMontanha(rnd, alt, raio, nevada) {
  // anéis concêntricos com ângulo e raio sacudidos + pico deslocado: faces
  // grandes e irregulares, cara de montanha low poly
  const n = 9, niveis = [[0, 1], [0.38, 0.72], [0.7, 0.4]];
  const aneis = niveis.map(([h, r]) => Array.from({ length: n }, (_, k) => {
    const ang = (k + (rnd() - 0.5) * 0.5) / n * 6.2832, rr = raio * r * (0.8 + rnd() * 0.4);
    return [Math.cos(ang) * rr, h === 0 ? -4 : h * alt * (0.85 + rnd() * 0.3), Math.sin(ang) * rr];
  }));
  const pico = [(rnd() - 0.5) * raio * 0.2, alt, (rnd() - 0.5) * raio * 0.2];
  // cores: 0 mata escura, 1 rocha, 2 rocha clara, 3 neve
  const corDe = (y) => (nevada && y > alt * 0.68 ? 3 : y > alt * 0.42 ? (rnd() < 0.5 ? 1 : 2) : 0);
  const tris = [];
  for (let l = 0; l < aneis.length - 1; l++) {
    for (let k = 0; k < n; k++) {
      const a = aneis[l][k], b = aneis[l][(k + 1) % n], c = aneis[l + 1][(k + 1) % n], d = aneis[l + 1][k];
      tris.push([a, b, c, corDe((a[1] + b[1] + c[1]) / 3)]);
      tris.push([a, c, d, corDe((a[1] + c[1] + d[1]) / 3)]);
    }
  }
  const topo = aneis[aneis.length - 1];
  for (let k = 0; k < n; k++) tris.push([topo[k], topo[(k + 1) % n], pico, corDe((topo[k][1] + pico[1]) / 2 + alt * 0.1)]);
  return malhaDeTris(tris, [[0.24, 0.40, 0.22], [0.47, 0.47, 0.45], [0.56, 0.55, 0.52], [0.95, 0.96, 0.98]], [0, alt * 0.25, 0]);
}

const MONTANHAS = (() => {
  const rnd = rngSeed(777), lista = [];
  const n = 16;
  for (let i = 0; i < n; i++) {
    const ang = (i + rnd() * 0.6) / n * 6.2832, dist = 270 + rnd() * 90;
    const alt = 45 + rnd() * 75, raio = alt * (1.1 + rnd() * 0.6);
    lista.push({ x: CENA.c[0] + Math.cos(ang) * dist, z: CENA.c[2] + Math.sin(ang) * dist, m: gerarMontanha(rnd, alt, raio, alt > 75) });
  }
  // morros baixos e verdes, na frente das montanhas (ainda fora da órbita da câmera)
  for (let i = 0; i < 12; i++) {
    const ang = (i + rnd()) / 12 * 6.2832, dist = 215 + rnd() * 35;
    const alt = 14 + rnd() * 16; // raio <= 66 m: a borda fica a >= 149 m do centro, fora da órbita da câmera (~130 m)
    lista.push({ x: CENA.c[0] + Math.cos(ang) * dist, z: CENA.c[2] + Math.sin(ang) * dist, m: gerarMontanha(rnd, alt, alt * 2.2, false) });
  }
  return lista;
})();

// lago: espelho d'água facetado (tons alternados) + margem de terra um pouco maior
const LAGO = { x: -42, z: -22, rx: 17, rz: 11 };
const MALHA_LAGO = (() => {
  const rnd = rngSeed(4242), n = 14;
  const borda = Array.from({ length: n }, (_, k) => {
    const a = k / n * 6.2832, j = 0.85 + rnd() * 0.3;
    return [Math.cos(a) * LAGO.rx * j, Math.sin(a) * LAGO.rz * j];
  });
  const anel = (esc, y) => borda.map(([x, z]) => [x * esc, y, z * esc]);
  const margem = anel(1.18, 0.04), agua = anel(1, 0.08), meio = anel(0.5, 0.08);
  const trisM = [], trisA = [];
  for (let k = 0; k < n; k++) {
    const k2 = (k + 1) % n;
    trisM.push([margem[k], margem[k2], [0, 0.04, 0], 0]);
    trisA.push([agua[k], agua[k2], meio[k2], k % 3], [agua[k], meio[k2], meio[k], (k + 1) % 3]);
    trisA.push([meio[k], meio[k2], [0, 0.08, 0], (k + 2) % 3]);
  }
  return {
    margem: malhaDeTris(trisM, [[0.55, 0.47, 0.33]], [0, -10, 0]),
    agua: malhaDeTris(trisA, [[0.25, 0.55, 0.78], [0.30, 0.62, 0.85], [0.21, 0.49, 0.72]], [0, -10, 0]),
  };
})();
const naAgua = (x, z, folga = 0) => hyp((x - LAGO.x) / (LAGO.rx * 1.2 + folga), (z - LAGO.z) / (LAGO.rz * 1.2 + folga)) < 1;

// píer com pescador e cachorrinho, na margem do lago voltada para a cena.
// Montados com caixas orientadas por dois pontos (braços, pernas, vara,
// linha, rabo) + "bolotas" (cabeça, boia); cada peça é orientada para fora
// do próprio centro e depois tudo vira uma malha só.
function caixaEixos(c, e1, e2, e3, ci) {
  // caixa de centro c e semi-eixos e1,e2,e3 (vetores), 12 triângulos
  const P = (i, j, k) => [0, 1, 2].map((n) => c[n] + i * e1[n] + j * e2[n] + k * e3[n]);
  const q = [
    [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1]], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
    [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]],
    [[-1, -1, -1], [-1, 1, -1], [-1, 1, 1], [-1, -1, 1]], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]],
  ];
  const tris = [];
  for (const f of q) {
    const [a, b, cc, d] = f.map((v) => P(...v));
    tris.push([a, b, cc, ci], [a, cc, d, ci]);
  }
  return orientadas(tris, c);
}
function orientadas(tris, centro) {
  const m = malhaDeTris(tris, [], centro);
  return m.faces.map(([a, b, c, ci]) => [m.verts[a], m.verts[b], m.verts[c], ci]);
}
function caixa(c, h, ci) { return caixaEixos(c, [h[0], 0, 0], [0, h[1], 0], [0, 0, h[2]], ci); }
function segmento(a, b, larg, ci, esp = larg) {
  // caixa "barra" de a até b, seção larg x esp
  const e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = hyp(e[0], e[1], e[2]);
  const t = e.map((v) => v / L);
  const ref = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let u = [t[1] * ref[2] - t[2] * ref[1], t[2] * ref[0] - t[0] * ref[2], t[0] * ref[1] - t[1] * ref[0]];
  const nu = hyp(u[0], u[1], u[2]); u = u.map((v) => v / nu);
  const w = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
  const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  return caixaEixos(c, e.map((v) => v / 2), u.map((v) => v * larg / 2), w.map((v) => v * esp / 2), ci);
}

const PIER = (() => {
  // direção margem -> centro do lago (o píer entra na água nessa direção)
  const dx = CENA.c[0] - LAGO.x, dz = CENA.c[2] - LAGO.z, n = hyp(dx, dz);
  const ux = dx / n, uz = dz / n;
  const rEdge = 1 / hyp(ux / LAGO.rx, uz / LAGO.rz); // raio da elipse nessa direção
  // ponta do píer: ~3,5 m para dentro d'água a partir da margem
  const x = LAGO.x + ux * (rEdge - 3.5), z = LAGO.z + uz * (rEdge - 3.5);
  // +Z local = "para dentro do lago" (sentido -u)
  const rot = Math.atan2(ux, -uz);
  return { x, z, rot, margem: [LAGO.x + ux * rEdge, LAGO.z + uz * rEdge] };
})();

const MALHA_PIER = (() => {
  const rnd = rngSeed(1357);
  const cores = [
    [0.55, 0.40, 0.25], // 0 madeira do píer
    [0.22, 0.27, 0.42], // 1 calça
    [0.72, 0.22, 0.18], // 2 camisa
    [0.92, 0.74, 0.58], // 3 pele
    [0.80, 0.70, 0.46], // 4 chapéu
    [0.32, 0.22, 0.13], // 5 vara / botas
    [0.92, 0.92, 0.92], // 6 linha / boia branca
    [0.92, 0.16, 0.10], // 7 boia vermelha
    [0.80, 0.56, 0.30], // 8 cachorro
    [0.42, 0.28, 0.16], // 9 cachorro (orelhas, focinho)
    [0.40, 0.46, 0.30], // 10 colete
  ];
  const T = [];
  const y0 = 0.5; // piso do píer (a água fica em ~0,08)

  // píer: tábuas + pilares, de z=-6 (margem) até z=0,4 (ponta)
  for (let k = 0; k < 9; k++) {
    const z = -6 + 0.2 + k * 0.72;
    T.push(...caixa([(rnd() - 0.5) * 0.04, y0 - 0.05, z], [0.7, 0.05, 0.33], 0));
  }
  for (const sx of [-0.62, 0.62]) {
    T.push(...caixa([sx, y0 - 0.1, -2.8], [0.06, 0.06, 3.2], 0)); // vigas
    for (const z of [-5.6, -2.8, 0.1]) T.push(...caixa([sx, y0 - 0.55, z], [0.08, 0.5, 0.08], 5));
  }

  // pescador em pé na ponta, olhando para o lago (+Z)
  const px = -0.25, pz = -0.45;
  const quadril = y0 + 0.9, ombro = y0 + 1.5;
  for (const s of [-1, 1]) {
    T.push(...segmento([px + s * 0.12, y0 + 0.08, pz], [px + s * 0.12, quadril, pz], 0.17, 1)); // pernas
    T.push(...caixa([px + s * 0.12, y0 + 0.06, pz + 0.05], [0.09, 0.06, 0.15], 5)); // botas
  }
  T.push(...caixa([px, (quadril + ombro) / 2, pz], [0.24, 0.32, 0.14], 2)); // tronco (camisa)
  T.push(...caixa([px, (quadril + ombro) / 2 + 0.03, pz], [0.25, 0.26, 0.15], 10)); // colete
  const maos = [px + 0.02, y0 + 1.15, pz + 0.42];
  for (const s of [-1, 1]) {
    const cot = [px + s * 0.3, y0 + 1.18, pz + 0.12];
    T.push(...segmento([px + s * 0.29, ombro - 0.05, pz], cot, 0.1, 2)); // braço
    T.push(...segmento(cot, [maos[0] + s * 0.06, maos[1], maos[2]], 0.09, 2)); // antebraço
  }
  T.push(...caixa([px, ombro + 0.06, pz], [0.06, 0.06, 0.06], 3)); // pescoço
  T.push(...orientadas(bolota(rnd, 0.13, 0.15, 0.13, px, ombro + 0.25, pz, 3, 0.08), [px, ombro + 0.25, pz])); // cabeça
  T.push(...caixa([px, ombro + 0.36, pz], [0.24, 0.015, 0.24], 4)); // aba do chapéu
  T.push(...caixa([px, ombro + 0.44, pz], [0.13, 0.08, 0.13], 4)); // copa do chapéu

  // vara, linha e boia
  const ponta = [px + 0.25, y0 + 2.9, pz + 2.9];
  T.push(...segmento([maos[0], maos[1] - 0.15, maos[2] - 0.35], ponta, 0.035, 5));
  const boia = [px + 0.3, 0.12, pz + 3.6];
  T.push(...segmento(ponta, [boia[0], boia[1] + 0.06, boia[2]], 0.012, 6));
  T.push(...orientadas(bolota(rnd, 0.06, 0.05, 0.06, boia[0], boia[1] + 0.03, boia[2], 7, 0.05), boia));
  T.push(...orientadas(bolota(rnd, 0.04, 0.03, 0.04, boia[0], boia[1] + 0.09, boia[2], 6, 0.05), boia));

  // cachorrinho sentado ao lado, também olhando o lago
  const cx = 0.38, cz = -0.55, cy0 = y0;
  T.push(...segmento([cx, cy0 + 0.12, cz - 0.18], [cx, cy0 + 0.38, cz + 0.02], 0.22, 8, 0.2)); // corpo inclinado (sentado)
  for (const s of [-1, 1]) {
    T.push(...segmento([cx + s * 0.07, cy0 + 0.25, cz + 0.06], [cx + s * 0.07, cy0 + 0.02, cz + 0.08], 0.06, 8)); // patas da frente
    T.push(...caixa([cx + s * 0.1, cy0 + 0.06, cz - 0.14], [0.05, 0.06, 0.1], 8)); // patas de trás
  }
  const cab = [cx, cy0 + 0.5, cz + 0.08];
  T.push(...caixa(cab, [0.09, 0.08, 0.09], 8)); // cabeça
  T.push(...caixa([cab[0], cab[1] - 0.03, cab[2] + 0.12], [0.05, 0.04, 0.05], 9)); // focinho
  for (const s of [-1, 1]) T.push(...segmento([cab[0] + s * 0.07, cab[1] + 0.07, cab[2] - 0.02], [cab[0] + s * 0.1, cab[1] - 0.04, cab[2] - 0.03], 0.05, 9, 0.02)); // orelhas
  T.push(...segmento([cx, cy0 + 0.1, cz - 0.26], [cx + 0.05, cy0 + 0.3, cz - 0.42], 0.04, 8)); // rabo

  return { ...malhaDeTris(T, cores, null), contorno: true };
})();

// pedras: 3 formatos, espalhadas na margem do lago e pelo campo
const MALHAS_PEDRA = (() => {
  const rnd = rngSeed(99);
  return [0, 1, 2].map(() => malhaDeTris(bolota(rnd, 1, 0.65, 0.85, 0, 0.2, 0, 0, 0.3), [[0.52, 0.52, 0.50]], [0, 0.2, 0]));
})();
const PEDRAS = (() => {
  const rnd = rngSeed(31337), lista = [];
  for (let i = 0; i < 12; i++) { // na margem do lago
    const a = rnd() * 6.2832, x = LAGO.x + Math.cos(a) * LAGO.rx * 1.2, z = LAGO.z + Math.sin(a) * LAGO.rz * 1.2;
    const escala = 0.5 + rnd() * 0.9, tipo = i % 3, rot = rnd() * 6.28;
    if (hyp(x - PIER.margem[0], z - PIER.margem[1]) < 3.5) continue; // deixa a entrada do píer livre
    lista.push([x, z, escala, tipo, rot]);
  }
  for (let i = 0; i < 18; i++) { // soltas no campo, fora do vão dos cabos
    const a = rnd() * 6.2832, dist = 42 + rnd() * 70;
    const x = CENA.c[0] + Math.cos(a) * dist, z = CENA.c[2] + Math.sin(a) * dist;
    if (naAgua(x, z, 2)) continue;
    lista.push([x, z, 0.4 + rnd() * 1.1, i % 3, rnd() * 6.28]);
  }
  return lista;
})();

// nuvens: cachos de 3-5 bolotas achatadas, bem acima da altura da câmera
// (~55 m) e fora da órbita dela -- senão uma nuvem pode tampar a tela inteira
const NUVENS = (() => {
  const rnd = rngSeed(2468), lista = [];
  for (let i = 0; i < 9; i++) {
    const ang = rnd() * 6.2832, dist = 210 + rnd() * 110, alt = 115 + rnd() * 35;
    const tris = [], partes = 3 + Math.floor(rnd() * 3);
    for (let p = 0; p < partes; p++) {
      const r = 7 + rnd() * 6;
      tris.push(...bolota(rnd, r * 1.4, r * 0.6, r, (p - partes / 2) * 9 + rnd() * 4, alt + rnd() * 3, (rnd() - 0.5) * 8, 0, 0.18));
    }
    lista.push({ x: CENA.c[0] + Math.cos(ang) * dist, z: CENA.c[2] + Math.sin(ang) * dist, rot: rnd() * 6.28, m: malhaDeTris(tris, [[0.97, 0.97, 0.99]], [0, alt, 0]) });
  }
  return lista;
})();

// mata ao redor do terreno: manchas de floresta (agrupadas) + árvores soltas,
// num anel entre a área dos cabos e a órbita da câmera (só os dois modelos
// mais leves, arvore0/1, porque são muitas)
const ARVORES_FUNDO = (() => {
  const rnd = rngSeed(8080), pts = [];
  const livre = (x, z) => {
    const r = hyp(x - CENA.c[0], z - CENA.c[2]);
    if (r < 48 || r > 112) return false;
    if (x > -18 && x < 59 && z > -18 && z < 44) return false; // já é a área das árvores de perto
    if (naAgua(x, z, 3) || hyp(x - CABANA[0], z - CABANA[1]) < 8) return false;
    return !pts.some((p) => hyp(p[0] - x, p[1] - z) < 3.6);
  };
  for (let g = 0; g < 9; g++) { // manchas de mata
    const ang = rnd() * 6.2832, dist = 60 + rnd() * 45;
    const cx = CENA.c[0] + Math.cos(ang) * dist, cz = CENA.c[2] + Math.sin(ang) * dist;
    for (let t = 0, feitas = 0; t < 60 && feitas < 12; t++) {
      const x = cx + (rnd() - 0.5) * 30, z = cz + (rnd() - 0.5) * 30;
      if (livre(x, z)) { pts.push([x, z, 0.8 + rnd() * 0.7, rnd() < 0.5 ? 0 : 1, rnd() * 6.2832]); feitas++; }
    }
  }
  for (let t = 0; t < 400 && pts.length < 130; t++) { // soltas
    const ang = rnd() * 6.2832, dist = 48 + rnd() * 64;
    const x = CENA.c[0] + Math.cos(ang) * dist, z = CENA.c[2] + Math.sin(ang) * dist;
    if (livre(x, z)) pts.push([x, z, 0.7 + rnd() * 0.7, rnd() < 0.5 ? 0 : 1, rnd() * 6.2832]);
  }
  return pts;
})();

function desenharCenario() {
  // céu (gradiente + sol) no lugar do fundo técnico do modo análise
  const ceu = ctx.createLinearGradient(0, 0, 0, H);
  ceu.addColorStop(0, TH.ceuTopo); ceu.addColorStop(1, TH.ceuBase);
  ctx.fillStyle = ceu; ctx.fillRect(0, 0, W, H);

  const solPos3D = [CENA.c[0] + LUZ_3D[0] * SOL_DIST, CENA.c[1] + LUZ_3D[1] * SOL_DIST, CENA.c[2] + LUZ_3D[2] * SOL_DIST];
  const solP = proj(solPos3D);
  if (solP[2] > 0) { // so desenha se estiver na frente da camera (nao atras)
    const solX = solP[0], solY = solP[1], raioSol = clamp(24 * solP[3] * CENA.R * 0.02, 10, 40);
    const brilho = ctx.createRadialGradient(solX, solY, 0, solX, solY, raioSol * 4);
    brilho.addColorStop(0, 'rgba(255,246,214,.9)'); brilho.addColorStop(0.35, 'rgba(255,236,170,.45)'); brilho.addColorStop(1, 'rgba(255,236,170,0)');
    ctx.fillStyle = brilho; ctx.beginPath(); ctx.arc(solX, solY, raioSol * 4, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#fff6cf'; ctx.beginPath(); ctx.arc(solX, solY, raioSol, 0, 6.2832); ctx.fill();
  }

  // chão "infinito": preenche TODA a tela abaixo da linha do horizonte (que
  // é exata: y = H/2 - F·tan(pitch)). Antes eram anéis de quads ao redor da
  // cena; com a câmera "deitada", os quads que passavam por trás dela eram
  // projetados errado e deixavam buracos por onde o céu (azul) aparecia.
  // O degradê aplica a mesma névoa das malhas conforme a distância no chão.
  {
    const { cy: cyc, sy: syc, cp: cpc, D, F } = CAM;
    const yH = H / 2 - F * Math.tan(S.pitch);
    if (yH < H) {
      const camX = CENA.c[0] - syc * D * cpc, camZ = CENA.c[2] + cyc * D * cpc;
      const yChao = (L) => proj([camX + syc * L, 0, camZ - cyc * L])[1];
      const y0 = Math.max(0, yH), yPerto = yChao(90);
      const grama = hexRgb(TH.gramaEscura);
      if (yPerto > yH + 1) {
        const g = ctx.createLinearGradient(0, yH, 0, yPerto);
        g.addColorStop(0, comNevoa(grama, nevoaF(1e9)));
        for (const L of [600, 350, 200, 130]) {
          const t = (yChao(L) - yH) / (yPerto - yH);
          if (t > 0 && t < 1) g.addColorStop(t, comNevoa(grama, nevoaF(L)));
        }
        g.addColorStop(1, TH.gramaEscura);
        ctx.fillStyle = g;
      } else ctx.fillStyle = TH.gramaEscura;
      ctx.globalAlpha = 1;
      ctx.fillRect(0, y0, W, H - y0);
    }
  }

  // montanhas, morros e nuvens do horizonte (do mais distante ao mais próximo)
  const fundo = [...MONTANHAS, ...NUVENS].map((o) => ({ o, d: proj([o.x, 0, o.z])[2] }));
  fundo.sort((u, v) => v.d - u.d);
  for (const { o } of fundo) desenharMalha(o.m, o.x, o.z, 1, o.rot || 0, 0);

  // terreno ondulado: malha de quadriláteros (não é um plano reto)
  const N = 22, x0 = -15, x1 = 55, z0 = -15, z1 = 40;
  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const xa = x0 + (x1 - x0) * ix / N, xb = x0 + (x1 - x0) * (ix + 1) / N;
      const za = z0 + (z1 - z0) * iz / N, zb = z0 + (z1 - z0) * (iz + 1) / N;
      const q = [[xa, za], [xb, za], [xb, zb], [xa, zb]].map(([x, z]) => proj([x, alturaTerreno(x, z), z]));
      // mesma cor opaca do chão ao redor (sem sombreamento por altura, que
      // deixava a área do terreno ondulado com tom diferente do resto)
      const dq = (q[0][2] + q[1][2] + q[2][2] + q[3][2]) / 4;
      ctx.fillStyle = comNevoa(hexRgb(TH.gramaEscura), nevoaF(dq)); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]);
      for (let k = 1; k < 4; k++) ctx.lineTo(q[k][0], q[k][1]);
      ctx.closePath(); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // lago (margem de terra e espelho d'água, rente ao chão)
  desenharMalha(MALHA_LAGO.margem, LAGO.x, LAGO.z);
  desenharMalha(MALHA_LAGO.agua, LAGO.x, LAGO.z);

  // sombras no chão (antes dos objetos, para ficarem por baixo)
  const alturaPostesSombra = PR.A[1] - MORRO_ALT + TERRENO_DESLOC;
  sombra(PR.A[0], PR.A[2], alturaPostesSombra, 1.4);
  sombra(PR.B[0], PR.B[2], alturaPostesSombra, 1.4);
  sombra(PR.C[0], PR.C[2], alturaPostesSombra, 1.4);
  for (const [x, z, porte] of ARVORES) sombra(x, z, 2.7 * porte, 2.6 * porte);
  for (const [x, z, porte] of ARVORES_FUNDO) sombra(x, z, 2.7 * porte, 2.6 * porte);
  sombra(CABANA[0], CABANA[1], 3, 7);

  // cabana, árvores e torres: não há z-buffer (algoritmo do pintor), então
  // os objetos são desenhados do mais distante para o mais próximo da câmera
  // a cada quadro -- senão um objeto do fundo desenhado depois "sobe" por
  // cima de um que está na frente dele ao girar a vista.
  const alturaPostes = PR.A[1] - MORRO_ALT + TERRENO_DESLOC; // mesma altura p/ as 3 torres (apoiadas no relevo do terreno)
  const objetos = [];
  const prof = (x, z) => proj([x, alturaTerreno(x, z), z])[2];
  objetos.push({
    d: prof(CABANA[0], CABANA[1]),
    // rotY = 0,92 rad: vira a fachada da porta/janela (+Z da malha) para o vão dos cabos
    f: () => (window.MALHAS && MALHAS.casa ? desenharMalha(MALHAS.casa, CABANA[0], CABANA[1], 1, 0.92) : desenharCabana(CABANA[0], CABANA[1])),
  });
  // píer com o pescador e o cachorro: mesma cota do lago (não do terreno local)
  const baseLago = alturaTerreno(LAGO.x, LAGO.z);
  objetos.push({ d: prof(PIER.x, PIER.z), f: () => desenharMalha(MALHA_PIER, PIER.x, PIER.z, 1, PIER.rot, baseLago) });
  for (const [x, z, escala, tipo, rot] of PEDRAS) objetos.push({ d: prof(x, z), f: () => desenharMalha(MALHAS_PEDRA[tipo], x, z, escala, rot) });
  for (const [x, z, porte, tipo, rot] of [...ARVORES, ...ARVORES_FUNDO]) {
    const malha = window.MALHAS && MALHAS['arvore' + tipo];
    objetos.push({ d: prof(x, z), f: () => (malha ? desenharMalha(malha, x, z, porte, rot) : desenharArvore(x, z, porte, tipo)) });
  }
  for (const P of [PR.A, PR.B, PR.C]) objetos.push({ d: prof(P[0], P[2]), f: () => desenharPoste(P, alturaPostes) });
  objetos.sort((u, v) => v.d - u.d); // fundo -> frente
  for (const o of objetos) o.f();
}

function desenhar() {
  if (!W) return;
  camera();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  if (S.cena === 'cenario') {
    desenharCenario();
  } else {
  ctx.fillStyle = TH.surface; ctx.fillRect(0, 0, W, H);

  // ---- piso
  if (S.piso) {
    ctx.strokeStyle = TH.grid; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -5; x <= 45; x += 5) { const a = proj([x, 0, -5]), b = proj([x, 0, 30]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    for (let z = -5; z <= 30; z += 5) { const a = proj([-5, 0, z]), b = proj([45, 0, z]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();
    ctx.fillStyle = TH.muted; ctx.font = '11px "Segoe UI", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let x = 0; x <= 40; x += 10) { const p = proj([x, 0, -5]); ctx.fillText(x + '', p[0], p[1] + (Math.cos(S.pitch) > 0.3 ? 11 : 0)); }
    for (let z = 0; z <= 25; z += 10) { const p = proj([-5, 0, z]); ctx.fillText(z + '', p[0] - 11, p[1]); }
  }
  }

  const caso = casoAtivo();
  const pos = POS[fV()];
  const [lo, hi] = faixaAtual();
  const nome = S.q;
  const naCena = S.cena === 'cenario';
  // modelo analítico: só no modo análise e no caso principal (a solução
  // analítica não inclui a força concentrada dos casos)
  const verAnalitica = !naCena && !caso && ANALITICA && S.comp !== 'mef';
  const soNos = verAnalitica && S.comp === 'nos';
  $('#legend').style.visibility = soNos ? 'hidden' : ''; // nada é pintado nesse modo

  // ---- forma inicial (tracejada)
  if (S.inicial && S.f > 0) {
    ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeStyle = TH.muted; ctx.lineWidth = 1.2; ctx.globalAlpha = .75;
    for (const cab of CAB) {
      ctx.beginPath();
      cab.nos.forEach((n, k) => { const p = proj(SIM.nos0[n]); k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---- linhas de projeção no piso (leitura de altura) — só no modo análise
  if (S.piso && !naCena) {
    ctx.save(); ctx.setLineDash([2, 4]); ctx.strokeStyle = TH.muted; ctx.lineWidth = 1; ctx.globalAlpha = .6;
    const pts = [SIM.params.A, SIM.params.B, SIM.params.C, pos[SIM.noP]];
    for (const p of pts) { const a = proj(p), b = proj([p[0], 0, p[2]]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    ctx.restore();
  }

  // ---- segmentos dos cabos
  const segs = [];
  CAB.forEach((cab, ci) => {
    const vals = valoresCabo(nome, fV(), ci), n = cab.nos.length;
    const pp = cab.nos.map((k) => proj(pos[k]));
    for (let k = 0; k < n - 1; k++) {
      segs.push({ a: pp[k], b: pp[k + 1], va: vals[k], vb: vals[k + 1], d: (pp[k][2] + pp[k + 1][2]) / 2, ci, k });
    }
  });
  const larg =(s) => clamp(5.2 * ((s.a[3] + s.b[3]) / 2) / (CAM.F / CAM.D), 3.2, 8) * Math.min(1.25, Math.max(0.85, S.zoom));
  // 1) halos (na cena de apresentação os cabos são só pretos, sem halo)
  if (!naCena && !soNos) {
    ctx.strokeStyle = TH.halo;
    for (const s of segs) { ctx.lineWidth = larg(s) + 2.6; ctx.beginPath(); ctx.moveTo(s.a[0], s.a[1]); ctx.lineTo(s.b[0], s.b[1]); ctx.stroke(); }
  }
  // 2) cores, do fundo para a frente (no modo "analítica + nós" os cabos do
  // ANSYS não são desenhados, só os nós, mais abaixo)
  segs.sort((u, v) => v.d - u.d);
  if (!soNos) for (const s of segs) {
    ctx.lineWidth = larg(s);
    if (naCena) {
      ctx.strokeStyle = '#111';
    } else {
      const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1];
      if (dx * dx + dy * dy > 0.25) {
        const g = ctx.createLinearGradient(s.a[0], s.a[1], s.b[0], s.b[1]);
        g.addColorStop(0, corDe(s.va, lo, hi)); g.addColorStop(1, corDe(s.vb, lo, hi));
        ctx.strokeStyle = g;
      } else ctx.strokeStyle = corDe(s.va, lo, hi);
    }
    ctx.beginPath(); ctx.moveTo(s.a[0], s.a[1]); ctx.lineTo(s.b[0], s.b[1]); ctx.stroke();
  }

  // ---- curvas do modelo analítico (vermelho, com halo para destacar do cabo)
  if (verAnalitica) {
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const [cor, lw] of [[TH.surface, 5.5], [TH.analitica, 2.6]]) {
      ctx.strokeStyle = cor; ctx.lineWidth = lw;
      for (const pts of ANALITICA.curvas) {
        ctx.beginPath();
        pts.forEach((p, k) => { const q = proj(p); k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ---- nós do ANSYS sobre a curva analítica
  if (soNos) {
    ctx.fillStyle = TH.ink; ctx.strokeStyle = TH.surface; ctx.lineWidth = 1.5;
    for (const cab of CAB) for (const n of cab.nos) {
      const p = proj(pos[n]); ctx.beginPath(); ctx.arc(p[0], p[1], 3.6, 0, 6.2832); ctx.fill(); ctx.stroke();
    }
  }

  // ---- destaque do segmento sob o cursor
  if (S.hover && !soNos) {
    const s = segs.find((x) => x.ci === S.hover.ci && x.k === S.hover.k);
    if (s) {
      ctx.strokeStyle = TH.ink; ctx.lineWidth = larg(s) + 4; ctx.globalAlpha = .9;
      ctx.beginPath(); ctx.moveTo(s.a[0], s.a[1]); ctx.lineTo(s.b[0], s.b[1]); ctx.stroke();
      ctx.globalAlpha = 1; ctx.strokeStyle = corDe((s.va + s.vb) / 2, lo, hi); ctx.lineWidth = larg(s);
      ctx.beginPath(); ctx.moveTo(s.a[0], s.a[1]); ctx.lineTo(s.b[0], s.b[1]); ctx.stroke();
    }
  }

  // ---- nós da malha
  if (S.nos && !soNos) {
    ctx.fillStyle = TH.ink;
    for (const cab of CAB) for (const n of cab.nos) { const p = proj(pos[n]); ctx.beginPath(); ctx.arc(p[0], p[1], 2, 0, 6.2832); ctx.fill(); }
  }

  // ---- força concentrada do caso selecionado (seta no nó carregado; nos 2 modos)
  if (caso) desenharForca(pos, caso);

  // ---- ancoragens e nó P (marcadores + coordenadas) — só no modo análise;
  // na cena de apresentação isso não aparece, fica só a câmera/orientação
  if (!naCena) {
    ctx.font = '600 13px "Segoe UI", system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const rot = (p, txt, dx, dy, forma) => {
      const q = proj(p);
      ctx.fillStyle = TH.ink; ctx.strokeStyle = TH.surface; ctx.lineWidth = 2;
      if (forma === 'quad') { ctx.fillRect(q[0] - 5, q[1] - 5, 10, 10); ctx.strokeRect(q[0] - 5, q[1] - 5, 10, 10); }
      else { ctx.beginPath(); ctx.arc(q[0], q[1], 6, 0, 6.2832); ctx.fill(); ctx.stroke(); }
      ctx.lineWidth = 3.5; ctx.strokeStyle = TH.surface; ctx.strokeText(txt, q[0] + dx, q[1] + dy);
      ctx.fillStyle = TH.ink; ctx.fillText(txt, q[0] + dx, q[1] + dy);
    };
    const pA = PR.A, pB = PR.B, pC = PR.C, pP = pos[SIM.noP];
    rot(pA, 'A', 10, -8, 'quad'); rot(pB, 'B', 10, -8, 'quad'); rot(pC, 'C', 10, -8, 'quad');
    rot(pP, `P (${fmt(pP[0], 2)}; ${fmt(pP[1], 2)}; ${fmt(pP[2], 2)})`, 10, 14, 'circ');
    if (verAnalitica) {
      // P analítico: rótulo à esquerda para não colidir com o P do ANSYS
      const a = ANALITICA.P, q = proj(a), txt = `P analítico (${fmt(a[0], 2)}; ${fmt(a[1], 2)}; ${fmt(a[2], 2)})`;
      ctx.fillStyle = TH.analitica; ctx.strokeStyle = TH.surface; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(q[0], q[1], 6, 0, 6.2832); ctx.fill(); ctx.stroke();
      ctx.textAlign = 'right'; ctx.lineWidth = 3.5; ctx.strokeText(txt, q[0] - 10, q[1] + 14);
      ctx.fillText(txt, q[0] - 10, q[1] + 14); ctx.textAlign = 'left';
    }
  }

  // ---- gizmo de eixos
  const gx = W - 46, gy = H - 52, L = 24;
  const eixo = (v, t) => {
    const { cy, sy, cp, sp } = CAM;
    const x1 = v[0] * cy + v[2] * sy, z1 = -v[0] * sy + v[2] * cy, y2 = v[1] * cp - z1 * sp;
    const ex = gx + x1 * L, ey = gy - y2 * L;
    ctx.strokeStyle = TH.ink2; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.fillStyle = TH.ink2; ctx.font = '600 11px "Segoe UI", system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(t, gx + x1 * (L + 9), gy - y2 * (L + 9));
  };
  if (W > 480) { eixo([1, 0, 0], 'X'); eixo([0, 1, 0], 'Y'); eixo([0, 0, 1], 'Z'); }
}

// ---------------------------------------------------------------- interação 3D
const tip = $('#tip');
const ptrs = new Map();
let arrasto = null, pinch0 = null;

cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) { arrasto = { x: e.clientX, y: e.clientY }; cv.classList.add('drag'); tip.hidden = true; }
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = { d: hyp(a.x - b.x, a.y - b.y), z: S.zoom }; }
});
cv.addEventListener('pointermove', (e) => {
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2 && pinch0) {
    const [a, b] = [...ptrs.values()];
    S.zoom = clamp(pinch0.z * hyp(a.x - b.x, a.y - b.y) / pinch0.d, ...ZOOM_LIM()); pedirDesenho(); return;
  }
  if (arrasto && ptrs.size === 1) {
    S.yaw += (e.clientX - arrasto.x) * 0.008;
    S.pitch = clamp(S.pitch + (e.clientY - arrasto.y) * 0.008, ...PITCH_LIM());
    arrasto = { x: e.clientX, y: e.clientY };
    marcarVista(null); pedirDesenho(); return;
  }
  if (!arrasto) escolher(e);
});
const fim = (e) => {
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch0 = null;
  if (ptrs.size === 0) { arrasto = null; cv.classList.remove('drag'); }
  else if (ptrs.size === 1) { const p = [...ptrs.values()][0]; arrasto = { x: p.x, y: p.y }; }
};
cv.addEventListener('pointerup', fim);
cv.addEventListener('pointercancel', fim);
cv.addEventListener('pointerleave', () => { if (S.hover) { S.hover = null; pedirDesenho(); } tip.hidden = true; });
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  S.zoom = clamp(S.zoom * Math.exp(-e.deltaY * 0.0012), ...ZOOM_LIM()); pedirDesenho();
}, { passive: false });
cv.addEventListener('dblclick', () => irParaVista('iso'));

function escolher(e) {
  const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  camera();
  let melhor = null, dm = 12;
  CAB.forEach((cab, ci) => {
    const pp = cab.nos.map((k) => proj(POS[fV()][k]));
    for (let k = 0; k < pp.length - 1; k++) {
      const [ax, ay] = pp[k], [bx, by] = pp[k + 1], vx = bx - ax, vy = by - ay;
      const l2 = vx * vx + vy * vy, t = l2 ? clamp(((mx - ax) * vx + (my - ay) * vy) / l2, 0, 1) : 0;
      const d = hyp(mx - (ax + t * vx), my - (ay + t * vy));
      if (d < dm) { dm = d; melhor = { ci, k }; }
    }
  });
  const mudou = (melhor && !S.hover) || (!melhor && S.hover) || (melhor && S.hover && (melhor.ci !== S.hover.ci || melhor.k !== S.hover.k));
  S.hover = melhor;
  if (!melhor) { tip.hidden = true; if (mudou) pedirDesenho(); return; }
  const fv = fV(), cab = CAB[melhor.ci], ei = cab.elems[melhor.k], b = FR[fv].b[ei];
  const s = arcos(fv, melhor.ci), sm = (s[melhor.k] + s[melhor.k + 1]) / 2;
  const N = (b[0] + b[1]) / 2;
  tip.innerHTML =
    `<div><span class="sw" style="background:${TH.cab[melhor.ci]}"></span><b>Cabo ${cab.nome}</b> · elemento ${ELEMS[ei].id}</div>` +
    `<div><span class="k">s desde a ancoragem</span> ${fmt(sm, 2)} m</div>` +
    `<div><span class="k">N</span> ${fmt(N, 1)} N · <span class="k">σ axial</span> ${fmt(N / AREA / 1e6, 2)} MPa</div>`;
  tip.hidden = false;
  const vp = $('#viewport').getBoundingClientRect();
  let tx = e.clientX - vp.left + 14, ty = e.clientY - vp.top + 14;
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  if (tx + tw > vp.width - 6) tx = e.clientX - vp.left - tw - 14;
  if (ty + th > vp.height - 6) ty = e.clientY - vp.top - th - 14;
  tip.style.left = Math.max(6, tx) + 'px'; tip.style.top = Math.max(6, ty) + 'px';
  if (mudou) pedirDesenho();
}

// vistas predefinidas (com transição)
let tween = null;
function marcarVista(v) {
  document.querySelectorAll('.toolbar [data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
}
function irParaVista(v) {
  const [ty, tpRaw] = VIEWS[v], y0 = S.yaw, p0 = S.pitch, z0 = S.zoom, t0_ = performance.now();
  const tp = clamp(tpRaw, ...PITCH_LIM()), zAlvo = clamp(1, ...ZOOM_LIM());
  // gira pelo menor caminho
  let dy = ((ty - y0 + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  marcarVista(v);
  const id = tween = {};
  const passo = (t) => {
    if (tween !== id) return;
    const a = clamp((t - t0_) / 380, 0, 1), e = a < .5 ? 2 * a * a : 1 - (-2 * a + 2) ** 2 / 2;
    S.yaw = y0 + dy * e; S.pitch = p0 + (tp - p0) * e; S.zoom = z0 + (zAlvo - z0) * e;
    desenhar();
    if (a < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}
document.querySelectorAll('.toolbar [data-view]').forEach((b) => b.addEventListener('click', () => irParaVista(b.dataset.view)));

$('#btnPng').addEventListener('click', () => {
  desenhar();
  cv.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `catenaria3d_passo${String(S.f).padStart(2, '0')}_${S.q}.png`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
});

// ---------------------------------------------------------------- legenda de cores
function atualizarLegenda() {
  const Q = QTY[S.q], [lo, hi] = faixaAtual();
  $('#lgName').textContent = Q.nome;
  $('#lgUnit').textContent = `(${Q.un})`;
  const stops = CMAPS[S.cmap].join(',');
  $('#lgBar').style.background = `linear-gradient(to right, ${stops})`;
  const ticks = niceTicks(lo, hi, 4), d = Math.max(decimaisTick(ticks), 0);
  const pct = (v) => hi > lo ? ((v - lo) / (hi - lo)) * 100 : 0;
  $('#lgTicks').innerHTML = ticks.map((t) => `<span style="left:${pct(t)}%">${fmt(t, d)}</span>`).join('');
  const [fl, fh] = faixaFrame(S.q, S.f), mk = (el, v) => { el.style.left = clamp(pct(v), 0, 100) + '%'; el.style.display = S.escala === 'global' && S.f > 0 ? '' : 'none'; };
  mk($('#mkMin'), fl); mk($('#mkMax'), fh);
}

// ---------------------------------------------------------------- painel: resultados
function atualizarResultados() {
  const f = fV(), pP = POS[f][SIM.noP], u = FR[f].u[SIM.noP];
  $('#pBox').innerHTML = ['x', 'y', 'z'].map((ax, k) =>
    `<div><div class="lbl">${ax}<sub>P</sub></div><div class="val">${fmt(pP[k], 3)} <small>m</small></div></div>`).join('');

  const cab = CAB.map((c, ci) => {
    const n = c.elems.map((ei) => valorElem('forca', f, ei));
    const sg = c.elems.map((ei) => valorElem('sigma', f, ei));
    return { nome: c.nome, cor: TH.cab[ci], T0: t0(f, ci), Nmax: Math.max(...n), smax: Math.max(...sg), L: comprimento(f, ci) };
  });
  $('#tblCabos').innerHTML =
    `<tr><th>Cabo</th><th>T₀ (N)</th><th>N máx (N)</th><th>σ máx (MPa)</th><th>L (m)</th></tr>` +
    cab.map((c) => `<tr><td><span class="sw" style="background:${c.cor}"></span>${c.nome}</td><td>${fmt(c.T0, 1)}</td><td>${fmt(c.Nmax, 1)}</td><td>${fmt(c.smax, 2)}</td><td>${fmt(c.L, 3)}</td></tr>`).join('');

  // comparação com o TCC: só faz sentido para o caso principal (sem força
  // concentrada); com um caso de força selecionado, mostra o caso principal final
  const comCaso = f === FC;
  const fc = comCaso ? ULT : f, final = fc === ULT;
  const pc = POS[fc][SIM.noP], T0c = [0, 1, 2].map((ci) => t0(fc, ci));
  const linhas = [
    ['x<sub>P</sub> (m)', pc[0], TCC.P[0], 2], ['y<sub>P</sub> (m)', pc[1], TCC.P[1], 2], ['z<sub>P</sub> (m)', pc[2], TCC.P[2], 2],
    ['T₀,A (N)', T0c[0], TCC.T0[0], 2], ['T₀,B (N)', T0c[1], TCC.T0[1], 2], ['T₀,C (N)', T0c[2], TCC.T0[2], 2],
  ];
  $('#tblTcc').innerHTML =
    `<tr><th>Grandeza</th><th>ANSYS</th><th>TCC</th><th>Δ</th></tr>` +
    linhas.map(([nm, a, t, d]) => {
      const dif = a - t, rel = Math.abs(t) > 1e-9 ? dif / t * 100 : 0;
      const dt = ['x', 'y', 'z'].some((c) => nm.startsWith(c + '<')) ? `${dif >= 0 ? '+' : ''}${fmt(dif, 2)} m` : `${rel >= 0 ? '+' : ''}${fmt(rel, 1)} %`;
      return `<tr class="${final ? '' : 'dim'}"><td>${nm}</td><td>${fmt(a, d)}</td><td>${fmt(t, d)}</td><td class="delta">${dt}</td></tr>`;
    }).join('');
  $('#tccNote').textContent = comCaso
    ? 'Com uma força concentrada selecionada, a tabela mostra o caso principal (sem força), que é o único que o TCC resolve analiticamente.'
    : final ? 'Passo final (carga total). Referência: modelo analítico do TCC, Tabela 4.14.'
      : 'Carga parcial: a comparação só vale no último passo (fator de carga 1,000).';
}

// ---------------------------------------------------------------- gráficos
function grafico(el, { series, xMin, xMax, yMin, yMax, xLabel, yLabel, marker, dx, dy, pickX, fmtTip }) {
  const w = Math.max(240, el.clientWidth || 360), h = 210, m = { l: 46, r: 34, t: 22, b: 34 };
  const iw = w - m.l - m.r, ih = h - m.t - m.b;
  const X = (v) => m.l + (v - xMin) / (xMax - xMin) * iw, Y = (v) => m.t + ih - (v - yMin) / (yMax - yMin) * ih;
  const yt = niceTicks(yMin, yMax, 4), xt = niceTicks(xMin, xMax, 5);
  const dyt = Math.max(decimaisTick(yt), 0), dxt = Math.max(decimaisTick(xt), 0);
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${yLabel} versus ${xLabel}">`;
  for (const t of yt) s += `<line class="gridline" x1="${m.l}" x2="${m.l + iw}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${m.l - 6}" y="${Y(t) + 4}" text-anchor="end">${fmt(t, dyt)}</text>`;
  for (const t of xt) s += `<text x="${X(t)}" y="${m.t + ih + 15}" text-anchor="middle">${fmt(t, dxt)}</text>`;
  s += `<line class="axis" x1="${m.l}" x2="${m.l + iw}" y1="${m.t + ih}" y2="${m.t + ih}"/>`;
  s += `<text class="ttl" x="${m.l + iw / 2}" y="${h - 4}" text-anchor="middle">${xLabel}</text>`;
  s += `<text class="ttl" x="4" y="11" text-anchor="start">${yLabel}</text>`;
  if (marker != null) s += `<line class="mk" x1="${X(marker)}" x2="${X(marker)}" y1="${m.t}" y2="${m.t + ih}"/>`;
  const fins = series.map((sr) => Y(sr.pts.at(-1)[1]));
  series.forEach((sr, si) => {
    const d = sr.pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
    s += `<path d="${d}" fill="none" stroke="${sr.color}" stroke-width="${si === 0 ? 3.6 : 2}" stroke-linejoin="round" stroke-linecap="round"/>`;
    const last = sr.pts.at(-1);
    if (!fins.some((y, j) => j !== si && Math.abs(y - fins[si]) < 13)) s += `<text x="${X(last[0]) + 5}" y="${Y(last[1]) + 4}">${sr.rot}</text>`;
    if (sr.marcar != null) { const p = sr.pts[sr.marcar]; s += `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="${si === 0 ? 5 : 3.5}" fill="${sr.color}" stroke="var(--surface)" stroke-width="2"/>`; }
  });
  s += `<line class="mk hv" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" style="display:none"/>`;
  s += `<g class="hd"></g>`;
  s += `<rect class="cap" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent" style="cursor:${pickX ? 'pointer' : 'crosshair'}"/></svg><div class="tip" hidden></div>`;
  el.innerHTML = s;

  const svg = el.querySelector('svg'), cap = el.querySelector('.cap'), hv = el.querySelector('.hv'), hd = el.querySelector('.hd'), tp = el.querySelector('.tip');
  const dataX = (e) => {
    const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) * (w / r.width);
    return clamp(xMin + (px - m.l) / iw * (xMax - xMin), xMin, xMax);
  };
  cap.addEventListener('pointermove', (e) => {
    const xv = dataX(e), linhas = [];
    let dots = '', xs = null;
    for (const sr of series) {
      let bi = 0, bd = Infinity;
      sr.pts.forEach((p, i) => { const d = Math.abs(p[0] - xv); if (d < bd) { bd = d; bi = i; } });
      const p = sr.pts[bi];
      dots += `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="4" fill="${sr.color}" stroke="var(--surface)" stroke-width="2"/>`;
      linhas.push(`<div><span class="sw" style="background:${sr.color}"></span><span class="k">${sr.rot}</span> ${fmtTip(p, bi, sr)}</div>`);
      if (xs === null) xs = p[0];
    }
    hv.setAttribute('x1', X(xs)); hv.setAttribute('x2', X(xs)); hv.style.display = '';
    hd.innerHTML = dots;
    tp.innerHTML = `<div><b>${dx(xs)}</b></div>` + linhas.join('');
    tp.hidden = false;
    const r = el.getBoundingClientRect();
    let tx = e.clientX - r.left + 12; if (tx + tp.offsetWidth > r.width) tx = e.clientX - r.left - tp.offsetWidth - 12;
    tp.style.left = Math.max(0, tx) + 'px'; tp.style.top = '6px';
  });
  cap.addEventListener('pointerleave', () => { hv.style.display = 'none'; hd.innerHTML = ''; tp.hidden = true; });
  if (pickX) cap.addEventListener('click', (e) => pickX(dataX(e)));
}

function atualizarGraficos() {
  const Q = QTY[S.q], [glo, ghi] = faixaGlobal(S.q);
  const yMax = niceMax(ghi * 1.03), yMin = Math.min(0, glo);
  // com uma força concentrada selecionada, a escala do perfil tem que caber o caso
  // (a força eleva bastante a tração); o histórico continua na escala dos substeps
  const caso = casoAtivo();
  const [clo, chi] = caso ? faixaFrame(S.q, fV()) : [glo, ghi];
  const yMax1 = niceMax(Math.max(ghi, chi) * 1.03), yMin1 = Math.min(0, glo, clo);

  // 1) perfil ao longo do cabo (passo atual ou caso de força selecionado)
  $('#ch1Title').textContent = caso
    ? `${Q.curto} ao longo do cabo · força de ${fmt(caso.mag, 0)} N no ${caso.cabo.replace('-', '–')}`
    : `${Q.curto} ao longo do cabo`;
  const perf = CAB.map((c, ci) => {
    const s = arcos(fV(), ci), v = valoresCabo(S.q, fV(), ci);
    return { rot: c.nome, color: TH.cab[ci], pts: s.map((x, k) => [x, v[k]]) };
  });
  $('#serLegend').innerHTML = CAB.map((c, ci) => `<span><span class="sw" style="background:${TH.cab[ci]}"></span>${c.nome}</span>`).join('');
  let smax = 0; for (let f = 0; f < NF; f++) for (let c = 0; c < CAB.length; c++) smax = Math.max(smax, comprimento(f, c));
  grafico($('#ch1'), {
    series: perf, xMin: 0, xMax: Math.ceil(smax), yMin: yMin1, yMax: yMax1,
    xLabel: 's desde a ancoragem (m)', yLabel: `${Q.curto} (${Q.un})`,
    dx: (x) => `s = ${fmt(x, 2)} m`,
    fmtTip: (p) => `${fmt(p[1], Q.dig)} ${Q.un}`,
  });

  // 2) histórico (máximo por cabo em cada substep)
  $('#ch2Title').textContent = `Histórico: ${Q.curto} máx. × fator de carga`;
  const hist = CAB.map((c, ci) => ({
    rot: c.nome, color: TH.cab[ci], marcar: S.f,
    pts: FR.slice(0, NF).map((fr, i) => [fr.fator, Math.max(...valoresCabo(S.q, i, ci))]),
  }));
  grafico($('#ch2'), {
    series: hist, xMin: 0, xMax: 1, yMin, yMax,
    xLabel: 'fator de carga (fração do peso próprio)', yLabel: `${Q.curto} máx. (${Q.un})`,
    marker: FR[S.f].fator,
    dx: (x) => `fator ${fmt(x, 3)}`,
    fmtTip: (p, i) => `${fmt(p[1], Q.dig)} ${Q.un} <span class="k">· passo ${i}</span>`,
    pickX: (x) => { let bi = 0, bd = Infinity; FR.slice(0, NF).forEach((fr, i) => { const d = Math.abs(fr.fator - x); if (d < bd) { bd = d; bi = i; } }); definirFrame(bi, true); },
  });
}

// ---------------------------------------------------------------- tabela de elementos
function atualizarTabela() {
  if (!$('#tabela').open) return;
  const f = fV(), rows = [];
  CAB.forEach((c, ci) => c.elems.forEach((ei, k) => {
    const b = FR[f].b[ei], N = (b[0] + b[1]) / 2;
    rows.push(`<tr><td><span class="sw" style="background:${TH.cab[ci]}"></span>${ELEMS[ei].id}</td><td>${c.nome}</td><td>${fmt(N, 1)}</td><td>${fmt(N / AREA / 1e6, 3)}</td></tr>`);
  }));
  // sem momento fletor / tensão de fibra: um cabo ideal não resiste à flexão
  $('#tblElem').innerHTML = `<tr><th>Elem.</th><th>Cabo</th><th>N (N)</th><th>σ axial (MPa)</th></tr>` + rows.join('');
}
$('#tabela').addEventListener('toggle', atualizarTabela);
$('#btnCsv').addEventListener('click', () => {
  const f = fV(), v = (x, d = 6) => String(+x.toPrecision(d)).replace('.', ',');
  const ls = ['elemento;cabo;N_i (N);N_j (N);MY_i (N.m);MY_j (N.m);MZ_i (N.m);MZ_j (N.m);TQ (N.m);sigma_axial (MPa)'];
  CAB.forEach((c) => c.elems.forEach((ei) => {
    const b = FR[f].b[ei], e = ELEMS[ei];
    ls.push([e.id, c.nome, ...b.slice(0, 7).map((x) => v(x)), v((b[0] + b[1]) / 2 / AREA / 1e6)].join(';'));
  }));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + ls.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = `catenaria3d_passo${String(f).padStart(2, '0')}_elementos.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ---------------------------------------------------------------- controles
const grp = $('#qtyGroup');
grp.innerHTML = QKEYS.map((k) => `<button type="button" role="radio" data-q="${k}" aria-checked="false"><span>${QTY[k].nome}</span><span>${QTY[k].un}</span></button>`).join('');
grp.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-q]'); if (!b) return;
  S.q = b.dataset.q; atualizarTudo();
});
$('#cmap').addEventListener('change', (e) => { S.cmap = e.target.value; atualizarTudo(); });
$('#scaleMode').addEventListener('change', (e) => { S.escala = e.target.value; atualizarTudo(); });
$('#chInicial').addEventListener('change', (e) => { S.inicial = e.target.checked; pedirDesenho(); });
$('#chGrid').addEventListener('change', (e) => { S.piso = e.target.checked; pedirDesenho(); });
$('#chNos').addEventListener('change', (e) => { S.nos = e.target.checked; pedirDesenho(); });
$('#speed').addEventListener('change', (e) => { S.vel = +e.target.value; });

// ---------------------------------------------------------------- casos de força concentrada
// window.CASOS (casos.js, gerado por ../casos_forca.py): para cada cabo carregado
// (C-P = ramal, A-P), 10 posições (fração do comprimento de arco a partir da
// ancoragem) × 10 intensidades; cada caso traz o estado final (u de todos os nós),
// o nó onde a força foi aplicada (noF) e o comprimento de arco real até ele (s).
const COR_FORCA = '#e8590c';
function temCasos() { return !!(window.CASOS && CASOS.casos && CASOS.casos.length && CASOS.cabos); }
function casoAtivo() {
  if (!temCasos() || S.casoPos == null || S.casoMag == null) return null;
  return CASOS.casos.find((c) => c.cabo === S.casoCabo && c.pos === S.casoPos && c.mag === S.casoMag) || null;
}
function posDoCaso(caso) {
  return SIM.nos0.map((p, i) => [p[0] + caso.u[i][0], p[1] + caso.u[i][1], p[2] + caso.u[i][2]]);
}
const ancoraDe = (cabo) => cabo.split('-')[0];

// seta da força no 3D: ponta no nó carregado (posição final), vertical, com
// comprimento proporcional à intensidade (1,2 m + 5,5 m na força máxima)
function desenharForca(pos, c) {
  const p = pos[c.noF], magMax = Math.max(...CASOS.magnitudes);
  const comp = 1.2 + 5.5 * c.mag / magMax;
  const a = proj([p[0], p[1] + comp, p[2]]), b = proj(p);
  const dx = b[0] - a[0], dy = b[1] - a[1], L = hyp(dx, dy) || 1, ux = dx / L, uy = dy / L;
  const h = clamp(L * 0.35, 9, 18), w = h * 0.55;           // ponta da seta (px)
  const bx = b[0] - ux * 3, by = b[1] - uy * 3;              // folga para não cobrir o nó
  const cx = bx - ux * h, cy = by - uy * h;
  ctx.save();
  ctx.lineCap = 'round';
  // halo para destacar de cabos/fundo
  ctx.strokeStyle = S.cena === 'cenario' ? 'rgba(255,255,255,.75)' : TH.surface; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(cx, cy); ctx.stroke();
  ctx.strokeStyle = COR_FORCA; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(cx, cy); ctx.stroke();
  ctx.fillStyle = COR_FORCA;
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(cx - uy * w, cy + ux * w); ctx.lineTo(cx + uy * w, cy - ux * w); ctx.closePath(); ctx.fill();
  // nó carregado + rótulo com a intensidade
  ctx.beginPath(); ctx.arc(b[0], b[1], 4, 0, 6.2832); ctx.fill();
  ctx.font = '700 13px "Segoe UI", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  const txt = `${fmt(c.mag, 0)} N`;
  ctx.lineWidth = 3.5; ctx.strokeStyle = S.cena === 'cenario' ? 'rgba(255,255,255,.85)' : TH.surface;
  ctx.strokeText(txt, a[0], a[1] - 6); ctx.fillText(txt, a[0], a[1] - 6);
  ctx.restore();
}

// ---- ícones (SVG inline) dos botões de cabo
const ICONE_CABO = {
  'C-P': '<svg viewBox="0 0 46 26" aria-hidden="true"><path d="M3 6 Q16 26 30 16" fill="none" stroke="currentColor" stroke-width="2"/><path d="M30 16 L43 5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 2"/><rect x="1" y="4" width="4" height="4" fill="currentColor"/><circle cx="30" cy="16" r="2.4" fill="currentColor"/><path d="M15 2 V11" stroke="#e8590c" stroke-width="2"/><path d="M11.5 9 L15 14 L18.5 9 Z" fill="#e8590c"/></svg>',
  'A-P': '<svg viewBox="0 0 46 26" aria-hidden="true"><path d="M3 6 Q14 24 23 19 Q32 24 43 6" fill="none" stroke="currentColor" stroke-width="2"/><rect x="1" y="4" width="4" height="4" fill="currentColor"/><rect x="41" y="4" width="4" height="4" fill="currentColor"/><circle cx="23" cy="19" r="2.4" fill="currentColor"/><path d="M12 2 V11" stroke="#e8590c" stroke-width="2"/><path d="M8.5 9 L12 14 L15.5 9 Z" fill="#e8590c"/></svg>',
  off: '<svg viewBox="0 0 46 26" aria-hidden="true"><path d="M3 6 Q23 26 43 6" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="23" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M19 13 L27 5" stroke="currentColor" stroke-width="1.6"/></svg>',
};
const NOME_CABO = { 'C-P': 'Cabo C–P', 'A-P': 'Cabo A–P', off: 'Sem força' };
const SUB_CABO = { 'C-P': 'ramal', 'A-P': 'principal', off: 'caso principal' };

// ---- régua: desenho esquemático do cabo (ancoragem -> P) com as posições clicáveis
const REGUA = { x0: 26, y0: 40, x1: 274, y1: 46, cx: 150, cy: 88 };
function pontoRegua(t) { // bézier quadrática (só visual)
  const { x0, y0, x1, y1, cx, cy } = REGUA, m = 1 - t;
  return [m * m * x0 + 2 * m * t * cx + t * t * x1, m * m * y0 + 2 * m * t * cy + t * t * y1];
}
function desenharRegua() {
  const svg = $('#casoRegua'), cabo = S.casoCabo, anc = ancoraDe(cabo);
  const { x0, y0, x1, y1, cx, cy } = REGUA;
  const c = casoAtivo(), magMax = Math.max(...CASOS.magnitudes);
  let h = `<path class="cabo" d="M${x0} ${y0} Q${cx} ${cy} ${x1} ${y1}"/>`
    + `<rect class="ancora" x="${x0 - 12}" y="${y0 - 5}" width="10" height="10"/><text x="${x0 - 7}" y="${y0 - 10}" text-anchor="middle">${anc}</text>`
    + `<circle class="ancora" cx="${x1}" cy="${y1}" r="5"/><text x="${x1 + 2}" y="${y1 - 10}" text-anchor="middle">P</text>`;
  CASOS.posicoes.forEach((t, i) => {
    const [x, y] = pontoRegua(t), on = S.casoPos === t && S.casoMag != null;
    if (on) {
      const len = 10 + 26 * S.casoMag / magMax;
      h += `<line class="seta" x1="${x}" y1="${y - 9 - len}" x2="${x}" y2="${y - 13}"/>`
        + `<path class="ponta" d="M${x - 5} ${y - 15} L${x} ${y - 7} L${x + 5} ${y - 15} Z"/>`;
    }
    h += `<circle class="ponto${on ? ' on' : ''}" cx="${x}" cy="${y}" r="5.5"/>`
      + `<circle class="alvo" data-i="${i}" cx="${x}" cy="${y}" r="13"><title>${fmt(t * 100, 0)}% do comprimento a partir de ${anc}</title></circle>`;
  });
  svg.innerHTML = h;
  $('#casoPosTxt').textContent = S.casoPos == null ? '—'
    : `${fmt(S.casoPos * 100, 0)}% · ${fmt(c ? c.s : S.casoPos * CASOS.comprimento[cabo], 1)} m de ${anc}`;
}

function atualizarCasoInfo() {
  const c = casoAtivo();
  const info = $('#casoInfo'), aviso = $('#casoAviso');
  $('#casoMagTxt').textContent = S.casoMag == null ? '—' : `${fmt(S.casoMag, 0)} N`;
  if (!c) {
    info.innerHTML = '<div><span class="lbl">Estado</span><br><span class="val">animação (caso principal)</span></div>';
    aviso.hidden = true; $('#casoResumo').textContent = ''; return;
  }
  // referência: mesmo modelo dos casos (EI/10) sem força; na falta dela, o caso principal
  const P0 = CASOS.base ? CASOS.base.noP : POS[ULT][SIM.noP], [px, py, pz] = c.noP;
  const dP = hyp(px - P0[0], py - P0[1], pz - P0[2]);
  const iCabo = c.cabo === 'C-P' ? 2 : 0;
  $('#casoResumo').textContent = `${NOME_CABO[c.cabo]} · ${fmt(c.mag, 0)} N`;
  info.innerHTML = `
    <div><span class="lbl">Nó P final</span><br><span class="val">${fmt(px, 2)}; ${fmt(py, 2)}; ${fmt(pz, 2)}</span></div>
    <div><span class="lbl">P desloca (vs. 0 N)</span><br><span class="val">${fmt(dP, 2)} <small>m</small></span></div>
    <div><span class="lbl">N máx. (${c.cabo.replace('-', '–')})</span><br><span class="val">${fmt(c.Nmax[iCabo], 0)} <small>N</small></span></div>
    <div><span class="lbl">T0 A–P</span><br><span class="val">${fmt(c.T0[0], 0)} <small>N</small></span></div>
    <div><span class="lbl">T0 B–P</span><br><span class="val">${fmt(c.T0[1], 0)} <small>N</small></span></div>
    <div><span class="lbl">T0 C–P</span><br><span class="val">${fmt(c.T0[2], 0)} <small>N</small></span></div>`;
  aviso.hidden = !c.compressao;
}

function iniciarCasos() {
  if (!temCasos()) return;
  $('#cardCasos').hidden = false;
  if (!CASOS.cabos.includes(S.casoCabo)) S.casoCabo = CASOS.cabos[0];
  $('#casoNota').textContent = `${CASOS.casos.length} casos rodados no ANSYS com o mesmo modelo do caso principal, `
    + 'mas com rigidez à flexão EI/10 em vez de EI/100 (com EI/100 a força concentrada não converge). '
    + 'A força entra num 2º passo de carga, depois do peso próprio.';
  const grp = $('#casoCaboGrp');
  grp.innerHTML = [...CASOS.cabos, 'off'].map((k) =>
    `<button type="button" data-cabo="${k}" role="radio">${ICONE_CABO[k] || ''}<span>${NOME_CABO[k] || k}</span><small>${SUB_CABO[k] || ''}</small></button>`).join('');
  const magR = $('#casoMagR');
  magR.max = CASOS.magnitudes.length - 1;
  const ativar = () => { // garante uma combinação válida ao escolher algo
    parar();
    if (S.casoPos == null) S.casoPos = CASOS.posicoes[Math.floor(CASOS.posicoes.length / 2)];
    if (S.casoMag == null) S.casoMag = CASOS.magnitudes[+magR.value] ?? CASOS.magnitudes[0];
  };
  const marcar = (inicial = false) => {
    const semForca = S.casoPos == null || S.casoMag == null;
    grp.querySelectorAll('button').forEach((b) => {
      const on = semForca ? b.dataset.cabo === 'off' : b.dataset.cabo === S.casoCabo;
      b.classList.toggle('on', on); b.setAttribute('aria-checked', on);
    });
    if (S.casoMag != null) magR.value = CASOS.magnitudes.indexOf(S.casoMag);
    desenharRegua();
    atualizarCasoInfo();
    if (inicial) { pedirDesenho(); return; } // (na carga, o resto da UI ainda não existe)
    atualizarComp();
    atualizarTudo();
  };
  grp.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-cabo]'); if (!b) return;
    if (b.dataset.cabo === 'off') { S.casoPos = null; S.casoMag = null; }
    else { S.casoCabo = b.dataset.cabo; ativar(); }
    marcar();
  });
  $('#casoRegua').addEventListener('click', (e) => {
    const alvo = e.target.closest('[data-i]'); if (!alvo) return;
    ativar(); S.casoPos = CASOS.posicoes[+alvo.dataset.i]; marcar();
  });
  magR.addEventListener('input', () => { ativar(); S.casoMag = CASOS.magnitudes[+magR.value]; marcar(); });
  const passo = (d) => {
    ativar();
    const i = clamp(CASOS.magnitudes.indexOf(S.casoMag) + d, 0, CASOS.magnitudes.length - 1);
    S.casoMag = CASOS.magnitudes[i]; marcar();
  };
  $('#casoMagMenos').addEventListener('click', () => passo(-1));
  $('#casoMagMais').addEventListener('click', () => passo(+1));
  marcar(true);
}
iniciarCasos();

// ---- card "Modelo analítico"
function atualizarComp() {
  const grupo = $('#compGroup'), nota = $('#compNote');
  grupo.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('on', b.dataset.comp === S.comp);
    b.disabled = !ANALITICA && b.dataset.comp !== 'mef';
  });
  if (!ANALITICA) { nota.textContent = 'O sistema analítico não convergiu para estes parâmetros.'; return; }
  const [x, y, z] = ANALITICA.P, T = ANALITICA.T0;
  let txt = `Solução do sistema de 9 equações do TCC com os mesmos parâmetros do ANSYS: P = (${fmt(x, 2)}; ${fmt(y, 2)}; ${fmt(z, 2)}) m, `
    + `T0 = ${fmt(T[0], 1)} / ${fmt(T[1], 1)} / ${fmt(T[2], 1)} N. A curva é o equilíbrio final (carga total); compare com o último passo.`;
  if (ERRO) {
    txt += ' Erro RMS (mínimos quadrados) dos nós do ANSYS à curva, posição 3D / forma no plano: '
      + CAB.map((cab, i) => `${cab.nome} ${fmt(ERRO[i].pos, 3)} / ${fmt(ERRO[i].forma, 3)} m`).join(' · ') + '.';
  }
  if (casoAtivo()) txt += ' Oculta enquanto um caso de força concentrada estiver selecionado (o modelo analítico não inclui essa força).';
  nota.textContent = txt;
}
$('#compGroup').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  S.comp = b.dataset.comp; atualizarComp(); pedirDesenho();
});
atualizarComp();
$('#nSub').textContent = ULT;

const slider = $('#slider');
slider.max = ULT;
slider.addEventListener('input', () => { parar(); definirFrame(+slider.value); });
$('#btnPrev').addEventListener('click', () => { parar(); definirFrame(Math.max(0, S.f - 1)); });
$('#btnNext').addEventListener('click', () => { parar(); definirFrame(Math.min(ULT, S.f + 1)); });
$('#btnPlay').addEventListener('click', () => (S.play ? parar() : tocar()));
addEventListener('keydown', (e) => {
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'range') return;
  if (e.code === 'Space') { e.preventDefault(); S.play ? parar() : tocar(); }
  else if (e.key === 'ArrowLeft') { parar(); definirFrame(Math.max(0, S.f - 1)); }
  else if (e.key === 'ArrowRight') { parar(); definirFrame(Math.min(ULT, S.f + 1)); }
  else if (e.key === 'Home') { parar(); definirFrame(0); }
  else if (e.key === 'End') { parar(); definirFrame(ULT); }
});

let acc = 0, tPrev = 0;
function tocar() {
  if (S.f >= ULT) definirFrame(0);
  S.play = true; acc = 0; tPrev = 0;
  $('#btnPlay').textContent = '⏸'; $('#btnPlay').setAttribute('aria-label', 'Pausar');
  requestAnimationFrame(loop);
}
function parar() {
  S.play = false;
  $('#btnPlay').textContent = '▶'; $('#btnPlay').setAttribute('aria-label', 'Reproduzir');
}
function loop(t) {
  if (!S.play) return;
  if (tPrev) acc += (t - tPrev) / 1000 * 6 * S.vel;     // 6 substeps/s na velocidade 1×
  tPrev = t;
  while (acc >= 1 && S.f < ULT) { acc -= 1; definirFrame(S.f + 1); }
  if (S.f >= ULT) { parar(); return; }
  requestAnimationFrame(loop);
}

function definirFrame(f, pausar) {
  if (pausar) parar();
  S.f = clamp(f, 0, ULT); S.hover = null; tip.hidden = true;
  atualizarTudo();
}

function atualizarTudo() {
  lerTema();
  grp.querySelectorAll('button').forEach((b) => { const on = b.dataset.q === S.q; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  const Q = QTY[S.q];
  const nota = $('#qtyNote'); nota.textContent = Q.nota; nota.classList.toggle('warn', !!Q.warn);
  $('#cmap').value = S.cmap; $('#scaleMode').value = S.escala;
  $('#chInicial').checked = S.inicial; $('#chGrid').checked = S.piso; $('#chNos').checked = S.nos;
  slider.value = S.f;
  const fr = FR[S.f];
  $('#tlPasso').textContent = S.f === 0 ? 'Forma inicial (sem carga)' : `Substep ${fr.passo} de ${ULT}`;
  $('#tlFator').textContent = `fator de carga ${fmt(fr.fator, 3)} · ${fmt(fr.fator * 100, 1)} % do peso próprio`;
  atualizarLegenda();
  atualizarResultados();
  atualizarGraficos();
  atualizarTabela();
  pedirDesenho();
}

// ---------------------------------------------------------------- início
$('#gerado').textContent = new Date(SIM.gerado).toLocaleString('pt-BR');
marcarVista(Math.abs(S.yaw - VIEWS.iso[0]) < 1e-6 ? 'iso' : null);
addEventListener('resize', () => { atualizarGraficos(); });
// abriu já no modo cena (preferência salva): mesma regra do botão -- forma
// final e câmera dentro dos limites da cena
if (S.cena === 'cenario') {
  S.f = ULT;
  S.pitch = clamp(S.pitch, ...PITCH_LIM());
  S.zoom = clamp(S.zoom, ...ZOOM_LIM());
}
atualizarTudo();
redimensionar();

})();
