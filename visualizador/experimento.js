// Experimento: leitura e visualização dos dados do Qualisys (exportação TSV do QTM).
// Os arquivos de ../experimento/dados/ chegam embutidos em experimento_dados.js
// (gerado por converter_qtm.mjs); também dá para abrir qualquer .tsv pelo botão
// do topo ou arrastando o arquivo para a vista 3D.
(() => {
'use strict';

// ---------------------------------------------------------------- utilidades
const $ = (s) => document.querySelector(s);
const hyp = Math.hypot;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const nf = {};
const fmt = (v, d = 2) => (Number.isFinite(v) ? (nf[d] || (nf[d] = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }))).format(v) : '—');
const sinal = (v, d = 2) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), d);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let TH = {};
function lerTema() {
  const c = getComputedStyle(document.documentElement), g = (n) => c.getPropertyValue(n).trim();
  TH = { surface: g('--surface'), s2: g('--surface-2'), ink: g('--ink'), ink2: g('--ink-2'), muted: g('--muted'),
    grid: g('--grid'), line: g('--line'), accent: g('--accent'), halo: g('--halo') };
}
function niceTicks(lo, hi, n = 6) {
  const span = hi - lo || 1, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || 10 * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9 * step; v += step) out.push(Math.abs(v) < 1e-12 ? 0 : v);
  return { ticks: out, step };
}
const casas = (step) => Math.max(0, Math.min(3, -Math.floor(Math.log10(step) + 1e-9)));
const EIXOS = ['X', 'Y', 'Z'];
// cores dos eixos na tríade da origem (convenção usual: X vermelho, Y verde, Z azul)
const COR_EIXO = ['#d7191c', '#1a9641', '#2a78d6'];

// ---------------------------------------------------------------- leitores
// Aceita dois tipos de entrada:
//  1) a exportação TSV completa do QTM: linhas de cabeçalho "CHAVE<TAB>valor(es)"
//     (NO_OF_FRAMES, FREQUENCY, MARKER_NAMES...), opcionalmente uma linha de títulos
//     (Frame/Time) e uma linha por quadro com X Y Z de cada marcador em sequência;
//  2) uma tabela de coordenadas qualquer (arquivo .csv/.tsv/.txt ou texto colado
//     do QTM/Excel), separada por tabulação, ponto e vírgula, vírgula ou espaços:
//     - "uma linha por marcador": nome; X; Y; Z (coordenadas estáticas);
//     - "uma linha por quadro": [Frame] [Time] X1 Y1 Z1 X2 Y2 Z2... com ou sem
//       linha de títulos ("New 0000 X", "New 0000 Y"...).
// Marcador não visto no quadro: campos vazios ou 0 nos três eixos -> NaN.
function lerTabela(texto, arquivo) {
  if (/^(NO_OF_FRAMES|MARKER_NAMES)\t/m.test(texto)) return lerQTM(texto, arquivo);
  return lerGenerica(texto, arquivo);
}
function lerQTM(texto, arquivo) {
  const linhas = texto.split(/\r?\n/);
  const cab = {};
  let i = 0;
  for (; i < linhas.length; i++) {
    const l = linhas[i];
    if (!l.trim()) continue;
    const c = l.split('\t');
    if (/^[A-Z][A-Z0-9_]*$/.test(c[0].trim())) { cab[c[0].trim()] = c.slice(1).map((s) => s.trim()); continue; }
    break;
  }
  const nomes = (cab.MARKER_NAMES || []).filter((s) => s !== '');
  const nM = nomes.length;
  if (!nM) throw new Error('não encontrei a linha MARKER_NAMES: o arquivo não parece uma exportação TSV 3D do QTM.');
  const freq = parseFloat((cab.FREQUENCY || [])[0]) || 0;
  // linha de títulos das colunas (Frame, Time, "New 0000 X"...)?
  let colTempo = -1, desloc = null;
  const prim = (linhas[i] || '').split('\t');
  if (prim.length && isNaN(parseFloat(prim[0]))) {
    colTempo = prim.findIndex((s) => /^time$/i.test(s.trim()));
    i++;
  }
  const P = [], T = [];
  for (; i < linhas.length; i++) {
    const l = linhas[i];
    if (!l.trim()) continue;
    const c = l.split('\t');
    if (desloc === null) desloc = Math.max(0, c.length - 3 * nM);
    if (c.length - desloc < 3 * nM) continue;
    const base = desloc > 0 && c.length > 3 * nM + desloc ? 0 : desloc;
    P.push(linhaPos(c, base, nM, parseFloat));
    if (colTempo >= 0) T.push(parseFloat(c[colTempo]));
  }
  return montarDados({ arquivo, nomes, P, T: colTempo >= 0 ? T : null, freq,
    cab, cameras: parseInt((cab.NO_OF_CAMERAS || [])[0], 10) || null,
    data: (cab.TIME_STAMP || [])[0] || '', tipo: (cab.DATA_INCLUDED || [])[0] || '' });
}
// X Y Z de nM marcadores a partir da coluna base
function linhaPos(c, base, nM, num) {
  const linha = new Float32Array(3 * nM);
  for (let m = 0; m < nM; m++) {
    let x = num(c[base + 3 * m]), y = num(c[base + 3 * m + 1]), z = num(c[base + 3 * m + 2]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || (x === 0 && y === 0 && z === 0)) x = y = z = NaN;
    linha[3 * m] = x; linha[3 * m + 1] = y; linha[3 * m + 2] = z;
  }
  return linha;
}
function lerGenerica(texto, arquivo) {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim());
  if (!linhas.length) throw new Error('a tabela está vazia.');
  const amostra = linhas.slice(0, 20).join('\n');
  const sep = amostra.includes('\t') ? '\t' : amostra.includes(';') ? ';' : amostra.includes(',') ? ',' : /\s+/;
  // vírgula decimal (Excel em português): separador ; ou tab e números como 12,5
  const decVirg = sep !== ',' && /\d,\d/.test(amostra) && !/\d\.\d/.test(amostra);
  const num = (s) => {
    s = (s ?? '').trim();
    if (!s) return NaN;
    return Number(decVirg ? s.replace(',', '.') : s);
  };
  const dividir = (l) => (sep instanceof RegExp ? l.trim().split(sep) : l.split(sep)).map((s) => s.trim().replace(/^"(.*)"$/, '$1'));
  let cel = linhas.map(dividir);
  const ehNum = (s) => Number.isFinite(num(s));
  const numericos = (c) => c.filter(ehNum).length;
  // linha de títulos: a primeira linha com menos números que a seguinte
  let tit = null;
  if (cel.length > 1 && numericos(cel[0]) < numericos(cel[1])) { tit = cel[0]; cel = cel.slice(1); }
  else if (cel.length === 1 && !numericos(cel[0])) throw new Error('a tabela só tem a linha de títulos.');
  // uma linha por marcador: a primeira célula é um nome (não numérico) e há 3 números
  const porMarcador = cel.every((c) => c[0] !== '' && !ehNum(c[0]) && numericos(c) >= 3);
  if (porMarcador) {
    let ix = [-1, -1, -1];
    if (tit) ix = ['x', 'y', 'z'].map((e) => tit.findIndex((s) => new RegExp(`^${e}\\b|[\\s_]${e}$|^${e}\\s*[\\[(]`, 'i').test(s.trim())));
    if (ix.some((v) => v < 0)) { // sem títulos reconhecíveis: os três primeiros números da linha
      const c0 = cel[0];
      ix = [];
      for (let k = 1; k < c0.length && ix.length < 3; k++) if (ehNum(c0[k])) ix.push(k);
    }
    const nomes = cel.map((c) => c[0]);
    const linha = new Float32Array(3 * nomes.length);
    cel.forEach((c, m) => {
      let p = ix.map((k) => num(c[k]));
      if (p.some((v) => !Number.isFinite(v)) || p.every((v) => v === 0)) p = [NaN, NaN, NaN];
      linha.set(p, 3 * m);
    });
    return montarDados({ arquivo, nomes, P: [linha], T: null, freq: 0, tipo: 'tabela estática' });
  }
  // uma linha por quadro
  const nCol = Math.max(...cel.map((c) => c.length));
  let colT = -1, colF = -1;
  if (tit) {
    colT = tit.findIndex((s) => /^(time|tempo|t)\b/i.test(s));
    colF = tit.findIndex((s) => /^(frame|quadro|#)/i.test(s));
  }
  let cols = [...Array(nCol).keys()].filter((k) => k !== colT && k !== colF);
  // descarta colunas totalmente vazias no fim (tabulação sobrando)
  while (cols.length && cel.every((c) => !(c[cols.at(-1)] ?? '').trim())) cols.pop();
  // sem títulos: se sobram 1 ou 2 colunas além dos trios, elas são Frame/Time
  if (!tit && cols.length % 3) {
    const sobra = cols.length % 3;
    colT = cols[sobra - 1];
    cols = cols.slice(sobra);
  }
  if (!cols.length || cols.length % 3) throw new Error(`não consegui separar as colunas em trios X, Y, Z (${cols.length} colunas de coordenadas).`);
  const nM = cols.length / 3;
  const nomes = [...Array(nM).keys()].map((m) => {
    const h = tit ? (tit[cols[3 * m]] || '') : '';
    return h.replace(/[\s_:.-]*x\s*(\[[^\]]*\]|\([^)]*\))?\s*$/i, '').trim() || `Marcador ${m + 1}`;
  });
  const P = cel.map((c) => linhaPos(cols.map((k) => c[k]), 0, nM, num));
  const T = colT >= 0 ? cel.map((c) => num(c[colT])) : null;
  let freq = 0;
  if (T && T.length > 1) {
    const dts = [];
    for (let f = 1; f < Math.min(T.length, 200); f++) if (T[f] > T[f - 1]) dts.push(T[f] - T[f - 1]);
    dts.sort((a, b) => a - b);
    if (dts.length) {
      freq = 1 / dts[dts.length >> 1];
      freq = Math.abs(freq - Math.round(freq)) < 0.005 * freq ? Math.round(freq) : Math.round(freq * 1000) / 1000; // tempo arredondado no arquivo
    }
  }
  return montarDados({ arquivo, nomes, P, T, freq, tipo: P.length > 1 ? 'tabela por quadro' : 'tabela estática' });
}
// junta as linhas lidas e calcula a estatística de cada marcador
function montarDados({ arquivo, nomes, P, T, freq, cab = {}, cameras = null, data = '', tipo = '' }) {
  const nM = nomes.length, nF = P.length;
  if (!nM) throw new Error('nenhum marcador encontrado.');
  if (!nF) throw new Error('a tabela não tem linhas de dados.');
  const pos = new Float32Array(nF * nM * 3);
  P.forEach((l, f) => pos.set(l, f * nM * 3));
  const t = new Float64Array(nF);
  for (let f = 0; f < nF; f++) t[f] = T && Number.isFinite(T[f]) ? T[f] : (freq ? f / freq : f);
  const est = estatistica(pos, nM, 0, nF - 1);
  if (est.every((e) => !e.validos)) throw new Error('nenhuma coordenada válida na tabela.');
  return { arquivo, cab, nomes, nM, nF, freq, t, pos, est, estTotal: est, f0: 0, f1: nF - 1, cameras, data, tipo };
}
// média, desvio padrão, extremos e quadros válidos de cada marcador entre os quadros f0 e f1
function estatistica(pos, nM, f0, f1) {
  return [...Array(nM).keys()].map((m) => {
    const s = [0, 0, 0], s2 = [0, 0, 0], mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    let n = 0;
    for (let f = f0; f <= f1; f++) {
      const k = (f * nM + m) * 3;
      if (Number.isNaN(pos[k])) continue;
      n++;
      for (let a = 0; a < 3; a++) { const v = pos[k + a]; s[a] += v; s2[a] += v * v; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; }
    }
    const media = s.map((v) => (n ? v / n : NaN));
    const dp = s2.map((v, a) => (n > 1 ? Math.sqrt(Math.max(0, (v - n * media[a] ** 2) / (n - 1))) : NaN));
    const pp = mx.map((v, a) => (n ? v - mn[a] : NaN));
    return { media, dp, pp, mn, mx, validos: n };
  });
}

// ---------------------------------------------------------------- estado
const S = {
  d: null, f: 0, sel: 0, hover: null,
  yaw: -0.75, pitch: 0.38, zoom: 1,
  play: false, vel: 1,
  modo: 'quadro', exag: 1,
  nomes: true, rastro: false, piso: true, origem: true, lab: true, montagem: true, pano: false, visada: false,
  escalaPropria: false,
  pag: 0, seguir: true,
  apelidos: [], ligs: [],
};
const VIEWS = { iso: [-0.75, 0.38], front: [0, 0], side: [-Math.PI / 2, 0], top: [0, Math.PI / 2 - 0.001] };
const cv = $('#cv'), ctx = cv.getContext('2d'), gr = $('#gr'), gx = gr.getContext('2d');
let W = 0, H = 0, DPR = 1, GW = 0, GH = 0;

// nomes editados e ligações ficam no localStorage, por arquivo
const chave = (tipo) => `qtm-${tipo}:${S.d ? S.d.arquivo : ''}`;
function carregarPrefs() {
  const d = S.d;
  S.apelidos = d.nomes.slice();
  S.ligs = [];
  try {
    const a = JSON.parse(localStorage.getItem(chave('nomes')) || 'null');
    if (Array.isArray(a) && a.length === d.nM) S.apelidos = a.map((s, m) => (s && String(s).trim()) || d.nomes[m]);
    const l = JSON.parse(localStorage.getItem(chave('ligacoes')) || 'null');
    if (Array.isArray(l)) S.ligs = l.filter((p) => Array.isArray(p) && p.length === 2 && p.every((m) => m >= 0 && m < d.nM));
  } catch (e) { /* sem storage */ }
  if (!S.ligs.length) S.ligs = ligacoesPadrao(d.nomes);
}
// ensaios com o nó 'centro' e marcadores Ck_0j nos cabos: liga cada cabo do nó para fora (_03 -> _02 -> _01)
function ligacoesPadrao(nomes) {
  const no = nomes.findIndex((n) => /^centro$/i.test(n)), cabos = {};
  if (no < 0) return [];
  nomes.forEach((n, m) => { const r = /^C(\d+)_0?(\d+)$/i.exec(n); if (r) (cabos[r[1]] = cabos[r[1]] || []).push([+r[2], m]); });
  const ligs = [];
  for (const lista of Object.values(cabos)) {
    lista.sort((a, b) => b[0] - a[0]); // 03, 02, 01: do nó para a fixação
    let ant = no;
    for (const [, m] of lista) { ligs.push([ant, m]); ant = m; }
  }
  return ligs;
}
function salvarPrefs() {
  try {
    localStorage.setItem(chave('nomes'), JSON.stringify(S.apelidos));
    localStorage.setItem(chave('ligacoes'), JSON.stringify(S.ligs));
  } catch (e) { /* sem storage */ }
}
const nome = (m) => S.apelidos[m] || S.d.nomes[m];

// ---------------------------------------------------------------- câmera (Z para cima, como no Qualisys)
let CENA = null, CAM = null;
function montarCena() {
  const d = S.d, mn = [0, 0, 0], mx = [0, 0, 0]; // inclui a origem do Qualisys
  d.estTotal.forEach((e) => { if (!e.validos) return; for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], e.mn[a]); mx[a] = Math.max(mx[a], e.mx[a]); } });
  if (!S.origem) { // sem origem: enquadra só os marcadores
    const m2 = [Infinity, Infinity, Infinity], x2 = [-Infinity, -Infinity, -Infinity];
    d.estTotal.forEach((e) => { if (!e.validos) return; for (let a = 0; a < 3; a++) { m2[a] = Math.min(m2[a], e.mn[a]); x2[a] = Math.max(x2[a], e.mx[a]); } });
    if (Number.isFinite(m2[0])) { mn.splice(0, 3, ...m2); mx.splice(0, 3, ...x2); }
  }
  const R = Math.max(50, hyp(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2);
  // grade do piso (Z = 0) cobrindo os marcadores e a origem, com folga
  const pad = R * 0.15;
  const gt = niceTicks(Math.min(mn[0], mn[1]) - pad, Math.max(mx[0], mx[1]) + pad, 10);
  const g = { step: gt.step, x0: Math.floor((mn[0] - pad) / gt.step) * gt.step, x1: Math.ceil((mx[0] + pad) / gt.step) * gt.step,
    y0: Math.floor((mn[1] - pad) / gt.step) * gt.step, y1: Math.ceil((mx[1] + pad) / gt.step) * gt.step };
  CENA = { c: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2], R, g, eixo: Math.max(g.step, Math.round(R * 0.25 / g.step) * g.step) };
}
function camera() {
  const cy = Math.cos(S.yaw), sy = Math.sin(S.yaw), cp = Math.cos(S.pitch), sp = Math.sin(S.pitch);
  if (panoAtivo()) {
    // panorama 360°: olho travado no ponto de captura das fotos; arrastar gira a cabeça, a roda muda a lente.
    // A projeção é a mesma: o centro da vista fica a D do olho, na direção para onde se olha.
    const o = window.LAB_CENA.CONFIG.ambiente.centro, D = 1000, fov = 2 * Math.atan(Math.tan(PANO_FOV / 2) / S.zoom);
    CAM = { cy, sy, cp, sp, D, F: 0.5 * H / Math.tan(fov / 2), fov, c: [o[0] + D * sy * cp, o[1] + D * cy * cp, o[2] - D * sp] };
    return;
  }
  // com o laboratório 3D ligado, a roda aproxima/afasta o ponto de vista (FOV fixo); sem ele, é zoom de lente
  const D = labAtivo() ? 4 * CENA.R / S.zoom : 4 * CENA.R;
  CAM = { cy, sy, cp, sp, D, F: 0.46 * Math.min(W, H) * D / CENA.R * S.zoom, c: CENA.c };
}
function proj(p) {
  const { cy, sy, cp, sp, D, F, c } = CAM;
  const x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2];
  const x1 = x * cy - y * sy, y1 = x * sy + y * cy;      // giro em torno de Z
  const v = z * cp + y1 * sp, dd = y1 * cp - z * sp;      // inclinação
  const k = F / (D + dd);
  return [W / 2 + x1 * k, H / 2 - v * k, D + dd, k];
}
// posição exibida do marcador m no quadro f (com exagero em torno da média)
function posExib(m, f) {
  const d = S.d, e = d.est[m];
  if (S.modo === 'media') return e.validos ? e.media : null;
  const k = (f * d.nM + m) * 3;
  if (Number.isNaN(d.pos[k])) return null;
  return [0, 1, 2].map((a) => e.media[a] + S.exag * (d.pos[k + a] - e.media[a]));
}

// ---------------------------------------------------------------- desenho 3D
let quer = false;
function pedirDesenho() { if (!quer) { quer = true; requestAnimationFrame(() => { quer = false; desenhar(); }); } }
function redimensionar() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  const r = cv.getBoundingClientRect();
  W = r.width; H = r.height;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  const rg = gr.getBoundingClientRect();
  GW = rg.width; GH = rg.height;
  gr.width = Math.round(GW * DPR); gr.height = Math.round(GH * DPR);
  CACHE_GR = null;
  desenhar();
}
let TELA = []; // posição na tela de cada marcador (para o hover)
function desenhar() {
  if (!W || !S.d) return;
  lerTema();
  camera();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (labAtivo()) { ctx.clearRect(0, 0, W, H); desenharLab(); } else { ctx.fillStyle = TH.surface; ctx.fillRect(0, 0, W, H); }
  ctx.font = '11px "Segoe UI", system-ui, sans-serif';
  const d = S.d;
  if (S.origem) desenharGrade();
  // ligações
  ctx.lineCap = 'round';
  for (const [a, b] of S.ligs) {
    const pa = posExib(a, S.f), pb = posExib(b, S.f);
    if (!pa || !pb) continue;
    const A = proj(pa), B = proj(pb);
    ctx.strokeStyle = TH.ink2; ctx.lineWidth = labAtivo() ? 1 : 2.5; ctx.globalAlpha = labAtivo() ? 0.45 : 1; // com o laboratório, a corrente 3D já aparece
    ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); ctx.globalAlpha = 1;
  }
  // linhas de visada: de cada câmera até cada alvo (verde = vê; vermelho = não vê)
  if (S.visada && labAtivo() && LAB.visada) {
    ctx.save(); ctx.lineWidth = 1; ctx.globalAlpha = 0.55;
    LAB.visada.forEach((c) => {
      const o = proj(c.o);
      c.vis.forEach((x, m) => {
        const p = posExib(m, S.f); if (!p) return;
        const q = proj(p);
        ctx.strokeStyle = x.ok ? '#22a35a' : '#e03b3b';
        ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      });
    });
    ctx.restore();
  }
  // rastro do último 1 s
  if (S.rastro && S.modo === 'quadro') {
    const n = Math.max(2, Math.round(d.freq || 100));
    for (let m = 0; m < d.nM; m++) {
      ctx.strokeStyle = m === S.sel ? TH.accent : TH.muted; ctx.globalAlpha = m === S.sel ? 0.75 : 0.4; ctx.lineWidth = m === S.sel ? 1.8 : 1.2;
      ctx.beginPath();
      let aberto = false;
      for (let f = Math.max(0, S.f - n); f <= S.f; f++) {
        const p = posExib(m, f);
        if (!p) { aberto = false; continue; }
        const q = proj(p);
        if (aberto) ctx.lineTo(q[0], q[1]); else { ctx.moveTo(q[0], q[1]); aberto = true; }
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // marcadores, do mais longe para o mais perto
  TELA = [];
  for (let m = 0; m < d.nM; m++) {
    const p = posExib(m, S.f);
    if (!p) continue;
    TELA.push({ m, p, q: proj(p) });
  }
  if (S.piso) {
    ctx.save(); ctx.setLineDash([3, 4]); ctx.strokeStyle = TH.muted; ctx.globalAlpha = 0.45; ctx.lineWidth = 1;
    for (const t of TELA) {
      const b = proj([t.p[0], t.p[1], 0]);
      ctx.beginPath(); ctx.moveTo(t.q[0], t.q[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.setLineDash([]); ctx.beginPath(); ctx.arc(b[0], b[1], 2, 0, 2 * Math.PI); ctx.fillStyle = TH.muted; ctx.fill(); ctx.setLineDash([3, 4]);
    }
    ctx.restore();
  }
  TELA.sort((a, b) => b.q[2] - a.q[2]);
  for (const t of TELA) {
    const sel = t.m === S.sel, hov = t.m === S.hover, r = sel || hov ? 7 : 5.5;
    if (labAtivo()) { // a bolinha 3D aparece por dentro; o anel marca seleção e hover
      const rr = Math.max(r, 0.5 * DIAM_MARCADOR * t.q[3] + 3);
      ctx.beginPath(); ctx.arc(t.q[0], t.q[1], rr, 0, 2 * Math.PI);
      ctx.strokeStyle = TH.surface; ctx.lineWidth = 3.5; ctx.stroke();
      ctx.strokeStyle = sel || hov ? TH.accent : TH.ink2; ctx.lineWidth = sel || hov ? 2.2 : 1.4; ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(t.q[0], t.q[1], r + 2, 0, 2 * Math.PI); ctx.fillStyle = TH.surface; ctx.fill();
      ctx.beginPath(); ctx.arc(t.q[0], t.q[1], r, 0, 2 * Math.PI); ctx.fillStyle = sel ? TH.accent : TH.ink2; ctx.fill();
      if (hov && !sel) { ctx.strokeStyle = TH.accent; ctx.lineWidth = 2; ctx.stroke(); }
    }
    if (S.nomes) { // desligado: nenhum rótulo (o balão do mouse continua mostrando o nome)
      ctx.fillStyle = sel ? TH.ink : TH.ink2; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = `${sel ? 600 : 400} 11.5px "Segoe UI", system-ui, sans-serif`;
      if (labAtivo()) { ctx.lineWidth = 3; ctx.strokeStyle = TH.surface; ctx.lineJoin = 'round'; ctx.strokeText(nome(t.m), t.q[0] + r + 5, t.q[1] - 1); }
      ctx.fillText(nome(t.m), t.q[0] + r + 5, t.q[1] - 1);
    }
  }
  ctx.font = '11px "Segoe UI", system-ui, sans-serif';
  atualizarTempo();
  desenharGrafico();
  acompanharTabela();
}
function desenharGrade() {
  const g = CENA.g;
  ctx.strokeStyle = TH.grid; ctx.lineWidth = 1;
  for (let x = g.x0; x <= g.x1 + 1e-6; x += g.step) { const a = proj([x, g.y0, 0]), b = proj([x, g.y1, 0]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  for (let y = g.y0; y <= g.y1 + 1e-6; y += g.step) { const a = proj([g.x0, y, 0]), b = proj([g.x1, y, 0]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  // cotas da grade (mm) ao longo de duas bordas
  ctx.fillStyle = TH.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const cada = Math.max(1, Math.round((g.x1 - g.x0) / g.step / 6));
  let i = 0;
  for (let x = g.x0; x <= g.x1 + 1e-6; x += g.step, i++) if (i % cada === 0) { const p = proj([x, g.y0 - g.step * 0.45, 0]); ctx.fillStyle = COR_EIXO[0]; ctx.fillText(fmt(x, 0), p[0], p[1]); }
  i = 0;
  for (let y = g.y0; y <= g.y1 + 1e-6; y += g.step, i++) if (i % cada === 0) { const p = proj([g.x0 - g.step * 0.55, y, 0]); ctx.fillStyle = COR_EIXO[1]; ctx.fillText(fmt(y, 0), p[0], p[1]); }
  // tríade na origem
  const o = proj([0, 0, 0]), L = CENA.eixo;
  ctx.lineWidth = 2;
  [[L, 0, 0], [0, L, 0], [0, 0, L]].forEach((v, a) => {
    const p = proj(v);
    ctx.strokeStyle = COR_EIXO[a]; ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
    const ux = p[0] - o[0], uy = p[1] - o[1], n = hyp(ux, uy) || 1;
    ctx.fillStyle = TH.ink; ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(EIXOS[a], p[0] + ux / n * 10, p[1] + uy / n * 10);
  });
  ctx.font = '11px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = TH.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(`grade ${fmt(g.step, 0)} mm no plano Z = 0 · cotas em X (vermelho) e Y (verde)`, 14, H - 26);
}

// ---------------------------------------------------------------- laboratório 3D (camada WebGL atrás do canvas 2D)
// Os scripts de lab/ só são baixados quando a chave é ligada. O panorama e o piso vêm embutidos em
// lab/ambiente_dados.js (data URI), porque aberto por file:// o navegador bloqueia texturas de arquivos.
const cv3d = $('#cv3d'), HINT_ORBITA = $('#hint3d').textContent;
const LAB = { cena: null, estado: 'nada', grupos: null, falhou: false, bolas: [], ultimo: [] };
const DIAM_MARCADOR = 19; // mm, marcador refletivo esférico do Qualisys
const SCRIPTS_LAB = ['lab/lab_geom.js', 'lab/modelo_camera.js', 'lab/modelo_montagem.js', 'lab/cena3d.js', 'lab/cena_lab.js', 'lab/ambiente_dados.js', 'lab/proxies.js', 'lab/sala.js'];
const labAtivo = () => S.lab && !!LAB.cena && !cv3d.hidden;
const panoAtivo = () => S.pano && labAtivo();
const PANO_FOV = 70 * Math.PI / 180; // FOV vertical com zoom 1
// entra/sai do panorama 360°: no panorama o ambiente vira esfera (vista do próprio ponto de captura, sem as quinas da caixa)
function definirPano(on) {
  S.pano = !!on && labAtivo();
  $('#btnPano').classList.toggle('on', S.pano);
  $('#hint3d').textContent = S.pano ? 'arraste = olhar em volta · roda = zoom · duplo clique = sair do panorama' : HINT_ORBITA;
  if (LAB.cena) LAB.cena.ambiente(S.pano ? { ...window.LAB_CENA.CONFIG.ambiente, sala: null, modo: null, raio: 9000 } : window.LAB_CENA.ambiente());
}
function irParaPano() {
  if (!labAtivo()) return;
  // começa olhando para os marcadores
  const o = window.LAB_CENA.CONFIG.ambiente.centro, a = S.d ? alvoLab() : [0, 0, 300];
  const f = [a[0] - o[0], a[1] - o[1], a[2] - o[2]], n = hyp(...f) || 1;
  definirPano(true); marcarVista('pano');
  S.yaw = Math.atan2(f[0], f[1]); S.pitch = Math.asin(-f[2] / n); S.zoom = 1;
  pedirDesenho();
}
function salvarLab() { try { localStorage.setItem('qtm-lab', JSON.stringify({ lab: S.lab, montagem: S.montagem })); } catch (e) { /* sem storage */ } }
function carregarScript(src) {
  return new Promise((ok, erro) => { const s = document.createElement('script'); s.src = src + '?v=20261105e'; s.onload = ok; s.onerror = () => erro(new Error(src)); document.head.appendChild(s); });
}
async function ligarLab() {
  $('#btnPano').hidden = !S.lab || LAB.estado === 'falhou';
  if (!S.lab) { cv3d.hidden = true; pedirDesenho(); return; }
  if (LAB.cena) { cv3d.hidden = false; statusVisada(); statusCorrentes(); pedirDesenho(); return; }
  if (LAB.estado !== 'nada') return;
  LAB.estado = 'carregando';
  try {
    for (const src of SCRIPTS_LAB) await carregarScript(src).catch((e) => { if (!/proxies|sala/.test(src)) throw e; });
    const A = window.LAB_AMBIENTE || {}, C = window.LAB_CENA.CONFIG;
    LAB.cena = window.Cena3D.criar(cv3d, { ambiente: A.ambiente || 'img/lab/ambiente.jpg', piso: A.piso || 'img/lab/piso.jpg', mascara: A.mascara || undefined, pisoLado: C.piso.lado, aoCarregar: pedirDesenho });
    if (!LAB.cena) throw new Error('WebGL2 indisponível');
    LAB.cena.ambiente(window.LAB_CENA.ambiente());
    LAB.estado = 'pronto';
    if (S.d) remontarLab();
    cv3d.hidden = !S.lab;
    statusVisada(); statusCorrentes();
  } catch (err) {
    console.warn('Laboratório 3D indisponível:', err);
    LAB.estado = 'falhou'; S.lab = false; $('#chLab').checked = false; $('#chLab').disabled = true;
    $('#chLab').closest('label').title = 'Seu navegador não tem WebGL2: o laboratório 3D não pode ser mostrado.';
    cv3d.hidden = true; $('#btnPano').hidden = true;
  }
  pedirDesenho();
}
function alvoLab() { // centro das posições médias dos marcadores
  const s = [0, 0, 0]; let n = 0;
  for (const e of S.d.estTotal) if (e.validos) { for (let a = 0; a < 3; a++) s[a] += e.media[a]; n++; }
  return n ? s.map((v) => v / n) : [0, 0, 300];
}
function remontarLab() {
  if (LAB.grupos) for (const ids of Object.values(LAB.grupos)) ids.forEach((id) => LAB.cena.remover(id));
  LAB.bolas.forEach((id) => LAB.cena.remover(id));
  // uma esfera refletiva 3D por marcador, movida a cada quadro em desenharLab()
  const G = window.LAB_GEOM, esf = { partes: [G.parte('marcador', { cor: [0.78, 0.78, 0.8], metal: 0.55, rug: 0.32 }, G.esfera(DIAM_MARCADOR / 2, 24, 16))] };
  LAB.bolas = S.d.nomes.map(() => LAB.cena.adicionar(esf, G.mat.id()));
  LAB.ultimo = S.d.nomes.map(() => null);
  // posições médias dos marcadores, com os nomes do arquivo (a cena reconhece 'centro' e C1_01…C3_03)
  const marc = S.d.est.map((e, m) => ({ nome: S.d.nomes[m], p: e.media })).filter((m) => m.p && m.p.every(Number.isFinite));
  const res = window.LAB_CENA.montar(LAB.cena, alvoLab(), marc);
  LAB.grupos = res.grupos; LAB.visada = res.visada || null; LAB.comprimentos = res.comprimentos || null;
  // vista isométrica do laboratório: de frente para a parede dos perfis, pela esquerda (como nas fotos)
  LAB.iso = null;
  if (res.parede) {
    const P = res.parede, f = [-P.n[0] - 0.55 * P.s[0], -P.n[1] - 0.55 * P.s[1]];
    LAB.iso = [Math.atan2(f[0], f[1]), 0.3];
    if (document.querySelector('.toolbar button[data-view="iso"]').classList.contains('on')) { S.yaw = LAB.iso[0]; S.pitch = LAB.iso[1]; }
  }
  statusVisada(); statusCorrentes();
  // a sala é reposicionada pelo perfil encontrado nos dados: atualiza o ambiente (esfera no panorama 360°)
  LAB.cena.ambiente(S.pano ? { ...window.LAB_CENA.CONFIG.ambiente, sala: null, modo: null, raio: 9000 } : window.LAB_CENA.ambiente());
  visibilidadeLab();
}
// texto: as câmeras veem todos os alvos?
function statusVisada() {
  const el = $('#labVisada'), v = LAB.visada;
  if (!v || !labAtivo()) { el.hidden = true; return; }
  const n = S.d ? S.d.nM : 0, faltam = v.map((c, i) => ({ i, k: c.vis.filter((x) => !x.ok).length })).filter((c) => c.k);
  el.hidden = false;
  el.textContent = faltam.length
    ? `Atenção: ${faltam.map((c) => `câmera ${c.i + 1} não vê ${c.k} alvo(s)`).join('; ')}. Ligue "linhas de visada" para ver quais.`
    : `Visada conferida: as ${v.length} câmeras veem os ${n} alvos (todos no campo de visão e sem nada no caminho).`;
}
// comprimento estimado das correntes (curva pelos marcadores + trecho até a fixação)
function statusCorrentes() {
  const el = $('#labCorrentes'), c = LAB.comprimentos;
  if (!c || !labAtivo()) { el.hidden = true; return; }
  const rot = { perfil: 'braço do perfil', suporte: 'suporte', poste: 'poste' };
  const cm = (v) => fmt(v / 1000, 2);
  el.hidden = false;
  el.innerHTML = '<b>Comprimento estimado das correntes:</b> '
    + c.map((k) => `${rot[k.nome]} ≈ ${cm(k.total)} m`).join(' · ')
    + ` · soma ≈ ${cm(c.reduce((t, k) => t + k.total, 0))} m. <span class="k">Medido pelos marcadores do nó ao último marcador de cada cabo (${c.map((k) => cm(k.medido)).join(' / ')} m); o trecho até a fixação (poucos cm) é estimado.</span>`;
}
function visibilidadeLab() {
  if (!LAB.grupos) return;
  LAB.grupos.montagem.forEach((id) => LAB.cena.visivel(id, S.montagem));
}
function moverBolas() {
  const G = window.LAB_GEOM;
  for (let m = 0; m < LAB.bolas.length; m++) {
    const p = posExib(m, S.f), u = LAB.ultimo[m];
    if (!p) { if (u) { LAB.cena.visivel(LAB.bolas[m], false); LAB.ultimo[m] = null; } continue; }
    if (u && Math.abs(u[0] - p[0]) + Math.abs(u[1] - p[1]) + Math.abs(u[2] - p[2]) < 0.05) continue; // parado: não refaz a sombra
    if (!u) LAB.cena.visivel(LAB.bolas[m], true);
    LAB.cena.mover(LAB.bolas[m], G.mat.trans(p[0], p[1], p[2]));
    LAB.ultimo[m] = p.slice();
  }
}
function desenharLab() {
  if (LAB.bolas.length) moverBolas();
  LAB.cena.fundo(hexLin(TH.surface));
  LAB.cena.desenhar({ yaw: S.yaw, pitch: S.pitch, D: CAM.D, F: CAM.F, c: CAM.c, W, H, DPR });
}
function hexLin(h) { // '#rrggbb' -> [r,g,b] 0..1
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h).trim()); if (!m) return [0.93, 0.93, 0.93];
  const v = parseInt(m[1], 16); return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255];
}
try { const p = JSON.parse(localStorage.getItem('qtm-lab') || 'null'); if (p) { S.lab = p.lab !== false; S.montagem = p.montagem !== false; } } catch (e) { /* sem storage */ }
$('#chLab').checked = S.lab; $('#chMontagem').checked = S.montagem;

// ---------------------------------------------------------------- gráfico deslocamento × tempo
// Um painel por eixo (pequenos múltiplos), uma série por painel: deslocamento do
// marcador selecionado em relação à média. Cada coluna de pixel guarda o mínimo e
// o máximo dos quadros que caem nela (9000 quadros em ~800 px sem perder picos).
let CACHE_GR = null;
const GM = { l: 50, r: 14, t: 10, b: 30, gap: 14 };
function geomGrafico() {
  const ph = (GH - GM.t - GM.b - 2 * GM.gap) / 3, iw = GW - GM.l - GM.r;
  return { ph, iw, top: (a) => GM.t + a * (ph + GM.gap) };
}
function prepararGrafico() {
  const d = S.d, m = S.sel, e = d.est[m], { iw } = geomGrafico();
  const cols = Math.max(1, Math.floor(iw));
  const faixa = [0, 0, 0], serie = [];
  for (let a = 0; a < 3; a++) {
    const lo = new Float32Array(cols).fill(NaN), hi = new Float32Array(cols).fill(NaN);
    for (let f = 0; f < d.nF; f++) {
      const v = d.pos[(f * d.nM + m) * 3 + a];
      if (Number.isNaN(v)) continue;
      const dv = v - e.media[a], c = Math.min(cols - 1, Math.floor(f / d.nF * cols));
      if (!(dv >= lo[c])) lo[c] = Number.isNaN(lo[c]) ? dv : Math.min(lo[c], dv);
      if (!(dv <= hi[c])) hi[c] = Number.isNaN(hi[c]) ? dv : Math.max(hi[c], dv);
      faixa[a] = Math.max(faixa[a], Math.abs(dv));
    }
    serie.push({ lo, hi });
  }
  CACHE_GR = { m, cols, serie, faixa, iw };
}
function desenharGrafico() {
  if (!GW || !S.d) return;
  if (!CACHE_GR || CACHE_GR.m !== S.sel) prepararGrafico();
  const d = S.d, C = CACHE_GR, { ph, iw, top } = geomGrafico();
  gx.setTransform(DPR, 0, 0, DPR, 0, 0);
  gx.fillStyle = TH.surface; gx.fillRect(0, 0, GW, GH);
  gx.font = '11px "Segoe UI", system-ui, sans-serif';
  const T0 = d.t[0], T1 = d.t[d.nF - 1] || 1;
  const X = (t) => GM.l + (t - T0) / ((T1 - T0) || 1) * iw;
  const fGlobal = Math.max(...C.faixa);
  for (let a = 0; a < 3; a++) {
    const y0 = top(a), A = Math.max(S.escalaPropria ? C.faixa[a] : fGlobal, 0.05) * 1.1;
    const Y = (v) => y0 + ph / 2 - v / A * (ph / 2);
    const tk = niceTicks(-A, A, 3);
    gx.strokeStyle = TH.grid; gx.lineWidth = 1; gx.fillStyle = TH.ink2; gx.textAlign = 'right'; gx.textBaseline = 'middle';
    for (const v of tk.ticks) { const y = Y(v); gx.beginPath(); gx.moveTo(GM.l, y); gx.lineTo(GM.l + iw, y); gx.stroke(); gx.fillText(fmt(v, casas(tk.step)), GM.l - 6, y); }
    // nome do eixo
    // série (mín/máx por coluna)
    const s = C.serie[a];
    gx.strokeStyle = TH.accent; gx.lineWidth = 1.6; gx.lineJoin = 'round';
    gx.beginPath();
    let aberto = false;
    for (let c = 0; c < C.cols; c++) {
      if (Number.isNaN(s.lo[c])) { aberto = false; continue; }
      const x = GM.l + (c + 0.5) * iw / C.cols, ya = Y(s.hi[c]), yb = Y(s.lo[c]);
      if (aberto) gx.lineTo(x, ya); else { gx.moveTo(x, ya); aberto = true; }
      if (yb - ya > 0.5) gx.lineTo(x, yb);
    }
    gx.stroke();
    // nome do eixo e pico a pico, sobre um fundo para não brigar com o sinal
    const rot = `Δ${EIXOS[a]}`, pp = `pico a pico ${fmt(d.est[S.sel].pp[a], 2)} mm`;
    gx.font = '600 11.5px "Segoe UI", system-ui, sans-serif'; const w1 = gx.measureText(rot).width;
    gx.font = '11px "Segoe UI", system-ui, sans-serif'; const w2 = gx.measureText(pp).width;
    gx.fillStyle = TH.surface; gx.globalAlpha = 0.85; gx.fillRect(GM.l + 2, y0, w1 + w2 + 18, 16); gx.globalAlpha = 1;
    gx.textAlign = 'left'; gx.textBaseline = 'top';
    gx.fillStyle = TH.ink; gx.font = '600 11.5px "Segoe UI", system-ui, sans-serif'; gx.fillText(rot, GM.l + 6, y0 + 1);
    gx.fillStyle = TH.muted; gx.font = '11px "Segoe UI", system-ui, sans-serif'; gx.fillText(pp, GM.l + 14 + w1, y0 + 2);
  }
  // eixo do tempo
  const tt = niceTicks(T0, T1, 8);
  gx.fillStyle = TH.ink2; gx.textAlign = 'center'; gx.textBaseline = 'top';
  const yb = top(2) + ph;
  gx.strokeStyle = TH.muted; gx.beginPath(); gx.moveTo(GM.l, yb + 0.5); gx.lineTo(GM.l + iw, yb + 0.5); gx.stroke();
  for (const v of tt.ticks) gx.fillText(fmt(v, casas(tt.step)), X(v), yb + 5);
  gx.fillStyle = TH.muted; gx.textAlign = 'right'; gx.fillText('t [s]', GM.l + iw, GH - 12);
  gx.save(); gx.translate(12, GM.t + (yb - GM.t) / 2); gx.rotate(-Math.PI / 2); gx.textAlign = 'center'; gx.textBaseline = 'middle';
  gx.fillText('deslocamento em relação à média [mm]', 0, 0); gx.restore();
  // intervalo da média: escurece o que fica fora e marca as bordas
  if (d.f0 > 0 || d.f1 < d.nF - 1 || GSEL) {
    const [fa, fb] = GSEL ? [Math.min(GSEL.a, GSEL.b), Math.max(GSEL.a, GSEL.b)] : [d.f0, d.f1];
    const xa = X(d.t[fa]), xb = X(d.t[fb]);
    gx.save();
    gx.fillStyle = TH.surface; gx.globalAlpha = 0.68;
    gx.fillRect(GM.l, GM.t - 2, Math.max(0, xa - GM.l), yb - GM.t + 2);
    gx.fillRect(xb, GM.t - 2, Math.max(0, GM.l + iw - xb), yb - GM.t + 2);
    gx.globalAlpha = 0.1; gx.fillStyle = TH.accent; gx.fillRect(xa, GM.t - 2, xb - xa, yb - GM.t + 2);
    gx.globalAlpha = 0.9; gx.strokeStyle = TH.accent; gx.lineWidth = 1.5;
    for (const x of [xa, xb]) { gx.beginPath(); gx.moveTo(x, GM.t - 2); gx.lineTo(x, yb); gx.stroke(); }
    gx.restore();
  }
  // instante atual e hover
  const linhaV = (t, cor, tr) => { const x = X(t); gx.save(); gx.strokeStyle = cor; gx.globalAlpha = 0.7; gx.setLineDash(tr ? [3, 3] : []); gx.lineWidth = 1.2; gx.beginPath(); gx.moveTo(x, GM.t); gx.lineTo(x, yb); gx.stroke(); gx.restore(); };
  linhaV(d.t[S.f], TH.ink, false);
  if (GHOVER != null) linhaV(d.t[GHOVER], TH.ink, true);
}
let GHOVER = null, GSEL = null, gDown = null;
function quadroDoGrafico(e) {
  const r = gr.getBoundingClientRect(), { iw } = geomGrafico(), d = S.d;
  const u = clamp((e.clientX - r.left - GM.l) / iw, 0, 1);
  return Math.round(u * (d.nF - 1));
}
gr.addEventListener('pointermove', (e) => {
  if (!S.d) return;
  const f = quadroDoGrafico(e), d = S.d, m = S.sel, k = (f * d.nM + m) * 3, tip = $('#grTip');
  GHOVER = f;
  tip.innerHTML = `<div><b>t = ${fmt(d.t[f], 3)} s</b> · quadro ${f + 1}</div>`
    + EIXOS.map((n, a) => `<div><span class="sw" style="background:${TH.accent}"></span><span class="k">Δ${n}</span> ${Number.isNaN(d.pos[k]) ? 'sem leitura' : sinal(d.pos[k + a] - d.est[m].media[a], 2) + ' mm'}</div>`).join('');
  tip.hidden = false;
  const r = gr.getBoundingClientRect(), mx = e.clientX - r.left;
  let tx = mx + 14; if (tx + tip.offsetWidth > r.width - 4) tx = mx - tip.offsetWidth - 14;
  tip.style.left = Math.max(0, tx) + 'px'; tip.style.top = '8px';
  desenharGrafico();
});
gr.addEventListener('pointerleave', () => { GHOVER = null; $('#grTip').hidden = true; desenharGrafico(); });
// clique = ir ao instante; arrastar = escolher o intervalo da média
gr.addEventListener('pointerdown', (e) => {
  if (!S.d || S.d.nF < 2) return;
  gr.setPointerCapture(e.pointerId);
  gDown = { x: e.clientX, f: quadroDoGrafico(e) };
});
gr.addEventListener('pointermove', (e) => {
  if (!gDown) return;
  if (!GSEL && Math.abs(e.clientX - gDown.x) > 4) GSEL = { a: gDown.f, b: gDown.f };
  if (GSEL) { GSEL.b = quadroDoGrafico(e); desenharGrafico(); }
});
gr.addEventListener('pointerup', (e) => {
  if (!gDown) return;
  if (GSEL) { const a = Math.min(GSEL.a, GSEL.b), b = Math.max(GSEL.a, GSEL.b); GSEL = null; aplicarIntervalo(a, b); }
  else definirQuadro(quadroDoGrafico(e), true);
  gDown = null;
});
gr.addEventListener('pointercancel', () => { gDown = null; GSEL = null; desenharGrafico(); });

// ---------------------------------------------------------------- intervalo da média
function aplicarIntervalo(f0, f1) {
  const d = S.d;
  f0 = clamp(Math.round(f0), 0, d.nF - 1); f1 = clamp(Math.round(f1), 0, d.nF - 1);
  if (f1 < f0) [f0, f1] = [f1, f0];
  if (f1 - f0 < 1 && d.nF > 1) f1 = Math.min(d.nF - 1, f0 + 1);
  const est = estatistica(d.pos, d.nM, f0, f1);
  if (est.every((e) => !e.validos)) { $('#intInfo').textContent = 'Nenhum marcador visto nesse intervalo.'; return; }
  d.f0 = f0; d.f1 = f1; d.est = est;
  CACHE_GR = null;
  intervaloUI();
  tabelaMarcadores(); tabelaEquilibrio(); ligacoesUI();
  pedirDesenho();
}
const quadroDoTempo = (t) => { const d = S.d; let f = 0; while (f < d.nF - 1 && d.t[f] < t - 1e-9) f++; return f; };
function intervaloUI() {
  const d = S.d, n = d.f1 - d.f0 + 1, dec = d.freq ? 2 : 0;
  $('#intIni').value = +d.t[d.f0].toFixed(dec + 1); $('#intFim').value = +d.t[d.f1].toFixed(dec + 1);
  const inteiro = d.f0 === 0 && d.f1 === d.nF - 1;
  $('#intInfo').innerHTML = (inteiro ? 'Ensaio inteiro' : `De ${fmt(d.t[d.f0], dec)} a ${fmt(d.t[d.f1], dec)}${d.freq ? ' s' : ''}`)
    + ` · ${fmt(n, 0)} quadros${d.freq ? ` (${fmt(n / d.freq, 1)} s)` : ''}`;
  $('#intTudo').disabled = inteiro;
}
// trecho contínuo mais longo em que nenhum marcador varia mais que 3x o ruído (a janela mais quieta)
function trechoParado() {
  const d = S.d, jan = Math.max(2, Math.round((d.freq || 60) * 0.5)), nJ = Math.floor(d.nF / jan);
  if (nJ < 2) return null;
  const amp = new Float64Array(nJ);
  for (let j = 0; j < nJ; j++) {
    let maior = 0;
    for (let m = 0; m < d.nM; m++) for (let a = 0; a < 3; a++) {
      let lo = Infinity, hi = -Infinity;
      for (let f = j * jan; f < (j + 1) * jan; f++) { const v = d.pos[(f * d.nM + m) * 3 + a]; if (v < lo) lo = v; if (v > hi) hi = v; }
      if (hi > lo) maior = Math.max(maior, hi - lo);
    }
    amp[j] = maior;
  }
  const lim = 3 * Math.min(...amp); // ruído das câmeras = janela mais quieta do ensaio
  let melhor = null, ini = -1;
  for (let j = 0; j <= nJ; j++) {
    const quieto = j < nJ && amp[j] <= lim;
    if (quieto && ini < 0) ini = j;
    if (!quieto && ini >= 0) { if (!melhor || j - ini > melhor[1] - melhor[0]) melhor = [ini, j]; ini = -1; }
  }
  if (!melhor) return null;
  const f0 = melhor[0] * jan, f1 = melhor[1] === nJ ? d.nF - 1 : melhor[1] * jan - 1;
  return [f0, f1];
}

// ---------------------------------------------------------------- painéis
function paineis() {
  const d = S.d, estatico = d.nF === 1, dur = d.t[d.nF - 1] - d.t[0] + (d.freq ? 1 / d.freq : 0);
  const cel = (l, v) => `<div><div class="lbl">${l}</div><div class="val">${v}</div></div>`;
  $('#cabecalho').innerHTML = cel('Duração', estatico || !d.freq ? '—' : `${fmt(dur, 1)} <small>s</small>`)
    + cel('Frequência', d.freq ? `${fmt(d.freq, d.freq % 1 ? 1 : 0)} <small>Hz</small>` : '—')
    + cel('Quadros', fmt(d.nF, 0))
    + cel('Marcadores', fmt(d.nM, 0))
    + cel('Câmeras', d.cameras != null ? fmt(d.cameras, 0) : '—')
    + cel('Dados', esc(d.tipo || '—'));
  const dataTxt = d.data ? d.data.replace(/^(\d{4})-(\d{2})-(\d{2}),?\s*/, '$3/$2/$1 ').replace(/\.\d+$/, '') : '';
  $('#arqNome').innerHTML = `<b>${esc(d.arquivo)}</b>${dataTxt ? ' · gravado em ' + esc(dataTxt) : ''}`;
  $('#sub').textContent = `${d.arquivo} · ${fmt(d.nM, 0)} marcadores · `
    + (estatico ? 'coordenadas estáticas' : d.freq ? `${fmt(dur, 1)} s a ${fmt(d.freq, d.freq % 1 ? 1 : 0)} Hz` : `${fmt(d.nF, 0)} quadros`);
  // tabela com um só quadro: sem linha do tempo nem gráfico no tempo
  $('#timeline').hidden = estatico; $('#cardGr').hidden = estatico;
  $('#modoPos').disabled = estatico; $('#exag').disabled = estatico; $('#chRastro').disabled = estatico;
  tabelaCab();
  S.pag = 0; tabelaDados();
  $('#intervalo').hidden = estatico;
  intervaloUI();
  tabelaMarcadores();
  tabelaEquilibrio();
  ligacoesUI();
  const sl = $('#slider'); sl.max = d.nF - 1; sl.value = S.f;
}
// ---------------------------------------------------------------- visualizador da tabela
// Significado das variáveis do cabeçalho, conforme o manual do QTM (Motion data .tsv).
const CAB_SIGNIF = {
  NO_OF_FRAMES: 'Número total de quadros no arquivo exportado.',
  NO_OF_CAMERAS: 'Número de câmeras usadas na captura.',
  NO_OF_MARKERS: 'Número total de trajetórias (marcadores) no arquivo.',
  FREQUENCY: 'Frequência de captura, em quadros por segundo (Hz).',
  NO_OF_ANALOG: 'Número de canais analógicos exportados junto (placas de força, EMG...). 0 = nenhum.*',
  ANALOG_FREQUENCY: 'Frequência de amostragem dos canais analógicos (0 = sem canais analógicos).*',
  DESCRIPTION: 'Atualmente não é usado pelo QTM.',
  TIME_STAMP: 'Data e hora da captura; o segundo valor é o tempo em segundos desde que o computador foi ligado. Marca o início da captura segundo o QTM e não deve ser usado para sincronizar com outros equipamentos.',
  DATA_INCLUDED: 'Tipo de dado do arquivo: 2D ou 3D.',
  MARKER_NAMES: 'Rótulos das trajetórias, na ordem das colunas de dados. Trajetória não identificada aparece sem nome.',
  TRAJECTORY_TYPES: 'Tipo de cada trajetória, na mesma ordem: Measured (medida), Mixed, Virtual, Gap-filled (lacunas preenchidas) ou “-” (sem rótulo).',
};
function tabelaCab() {
  const d = S.d, chaves = Object.keys(d.cab);
  if (!chaves.length) {
    $('#tblCab').innerHTML = `<tbody><tr><td>Tabela importada sem o cabeçalho do QTM (${esc(d.tipo)}): só há as coordenadas.</td></tr></tbody>`;
    return;
  }
  const resumo = (k, v) => {
    if (k === 'MARKER_NAMES') return `${v.filter((x) => x !== '').length} nomes: ${esc(v.slice(0, 3).join(', '))}${v.length > 3 ? ', …' : ''}`;
    if (k === 'TRAJECTORY_TYPES') {
      const n = {}; v.forEach((x) => { if (x) n[x] = (n[x] || 0) + 1; });
      return Object.entries(n).map(([t, c]) => `${c} × ${esc(t)}`).join(', ');
    }
    return esc(v.join('  ·  '));
  };
  $('#tblCab').innerHTML = '<thead><tr><th>Variável</th><th>Valor no arquivo</th><th>Significado</th></tr></thead><tbody>'
    + chaves.map((k) => `<tr><td><code>${esc(k)}</code></td><td>${resumo(k, d.cab[k])}</td><td>${esc(CAB_SIGNIF[k] || '—')}</td></tr>`).join('')
    + '</tbody>';
  if (chaves.some((k) => /ANALOG/.test(k))) $('#tblCab').insertAdjacentHTML('beforeend', '<caption>* Os canais analógicos não são descritos na página do manual; significado inferido do nome da variável.</caption>');
}
const PAG = 50;
function tabelaDados() {
  const d = S.d, nPag = Math.ceil(d.nF / PAG);
  S.pag = clamp(S.pag, 0, nPag - 1);
  const ini = S.pag * PAG, fim = Math.min(d.nF, ini + PAG);
  const DESC = ['X [mm]: direção do braço longo do L-frame', 'Y [mm]: direção do braço curto do L-frame', 'Z [mm]: perpendicular ao L-frame (para cima)'];
  let html = '<thead><tr><th rowspan="2">Quadro</th><th rowspan="2">' + (d.freq ? 't [s]' : 't') + '</th>'
    + d.nomes.map((_, m) => `<th colspan="3" class="grp${m === S.sel ? ' on' : ''}" title="${esc(d.nomes[m])}">${esc(nome(m))}</th>`).join('')
    + '</tr><tr>' + d.nomes.map(() => EIXOS.map((e, a) => `<th class="ax a${a}" title="${DESC[a]}">${e}</th>`).join('')).join('') + '</tr></thead><tbody>';
  for (let f = ini; f < fim; f++) {
    html += `<tr data-f="${f}"${f === S.f ? ' class="on"' : ''}><td>${fmt(f + 1, 0)}</td><td>${fmt(d.t[f], d.freq ? 4 : 0)}</td>`;
    for (let m = 0; m < d.nM; m++) {
      const k = (f * d.nM + m) * 3;
      if (Number.isNaN(d.pos[k])) html += '<td class="dim">—</td><td class="dim">—</td><td class="dim">—</td>';
      else html += `<td class="g0">${fmt(d.pos[k], 3)}</td><td>${fmt(d.pos[k + 1], 3)}</td><td>${fmt(d.pos[k + 2], 3)}</td>`;
    }
    html += '</tr>';
  }
  $('#tblDados').innerHTML = html + '</tbody>';
  $('#pgInfo').textContent = `quadros ${fmt(ini + 1, 0)}–${fmt(fim, 0)} de ${fmt(d.nF, 0)}`;
  $('#pgAnt').disabled = S.pag === 0; $('#pgProx').disabled = S.pag >= nPag - 1;
  const um = d.nF <= PAG;
  ['#pgAnt', '#pgProx', '#pgAtual'].forEach((id) => { $(id).hidden = um; });
  $('#chSeguir').parentElement.hidden = um;
}
function acompanharTabela() {
  if (!S.d) return;
  const pag = Math.floor(S.f / PAG);
  if (S.seguir && pag !== S.pag) { S.pag = pag; tabelaDados(); return; }
  const tb = $('#tblDados tbody'); if (!tb) return;
  const ant = tb.querySelector('tr.on'); if (ant && +ant.dataset.f !== S.f) ant.classList.remove('on');
  const at = tb.querySelector(`tr[data-f="${S.f}"]`); if (at) at.classList.add('on');
}
function tabelaMarcadores() {
  const d = S.d;
  $('#tblMarc').innerHTML = '<thead><tr><th>Nome</th><th>X̄</th><th>Ȳ</th><th>Z̄</th><th>Pico a pico</th><th>Vistos</th></tr></thead><tbody>'
    + d.est.map((e, m) => {
      const ppMax = Math.max(...e.pp), eixo = EIXOS[e.pp.indexOf(ppMax)];
      return `<tr data-m="${m}" class="${m === S.sel ? 'on' : ''}"><td><input type="text" value="${esc(nome(m))}" data-nome="${m}" aria-label="Nome do marcador ${esc(d.nomes[m])}" title="${esc(d.nomes[m])}"></td>`
        + `<td>${fmt(e.media[0], 1)}</td><td>${fmt(e.media[1], 1)}</td><td>${fmt(e.media[2], 1)}</td>`
        + `<td>${fmt(ppMax, 1)} <small>em ${eixo}</small></td><td>${fmt(100 * e.validos / (d.f1 - d.f0 + 1), 0)}%</td></tr>`;
    }).join('') + '</tbody>';
}
function tabelaEquilibrio() {
  const d = S.d;
  $('#tblEq').innerHTML = '<thead><tr><th>Marcador</th><th>X [mm]</th><th>Y [mm]</th><th>Z [mm]</th></tr></thead><tbody>'
    + d.est.map((e, m) => `<tr><td>${esc(nome(m))}</td>` + [0, 1, 2].map((a) => `<td>${fmt(e.media[a], 1)} <small>± ${fmt(e.dp[a], 1)}</small></td>`).join('') + '</tr>').join('')
    + '</tbody>';
}
function ligacoesUI() {
  const d = S.d, ops = d.nomes.map((_, m) => `<option value="${m}">${esc(nome(m))}</option>`).join('');
  const a = $('#ligA'), b = $('#ligB'), va = a.value, vb = b.value;
  a.innerHTML = ops; b.innerHTML = ops;
  a.value = va && +va < d.nM ? va : '0'; b.value = vb && +vb < d.nM ? vb : String(Math.min(1, d.nM - 1));
  $('#ligLista').innerHTML = S.ligs.length
    ? S.ligs.map(([p, q], i) => {
      const e1 = d.est[p].media, e2 = d.est[q].media, L = hyp(e1[0] - e2[0], e1[1] - e2[1], e1[2] - e2[2]);
      return `<li><span>${esc(nome(p))} — ${esc(nome(q))}</span><small>${fmt(L, 1)} mm</small><button type="button" class="rm" data-rm="${i}" aria-label="Remover ligação" title="Remover">×</button></li>`;
    }).join('')
    : '<li class="vazio">nenhuma ligação</li>';
}
function atualizarTempo() {
  const d = S.d;
  $('#tlTempo').textContent = d.freq ? `t = ${fmt(d.t[S.f], 3)} s` : `quadro ${fmt(S.f + 1, 0)}`;
  $('#tlQuadro').textContent = `quadro ${fmt(S.f + 1, 0)} de ${fmt(d.nF, 0)}`;
  $('#grTitulo').textContent = `Deslocamento × tempo · ${nome(S.sel)}`;
  const tag = $('#exagTag');
  tag.hidden = S.modo === 'media' || S.exag === 1;
  tag.textContent = S.modo === 'media' ? '' : `deslocamentos ×${S.exag}`;
}
function selecionar(m) {
  S.sel = m;
  document.querySelectorAll('#tblDados th.grp').forEach((th, i) => th.classList.toggle('on', i === m));
  document.querySelectorAll('#tblMarc tbody tr').forEach((tr) => tr.classList.toggle('on', +tr.dataset.m === m));
  pedirDesenho();
}

// ---------------------------------------------------------------- reprodução
let ultimo = 0, acum = 0;
function definirQuadro(f, pausar) {
  if (pausar) parar();
  S.f = clamp(Math.round(f), 0, S.d.nF - 1);
  $('#slider').value = S.f;
  pedirDesenho();
}
function tocar() {
  if (!S.d) return;
  if (S.f >= S.d.nF - 1) S.f = 0;
  S.play = true; $('#btnPlay').textContent = '⏸'; $('#btnPlay').setAttribute('aria-label', 'Pausar');
  ultimo = performance.now(); acum = 0; requestAnimationFrame(loop);
}
function parar() { S.play = false; $('#btnPlay').textContent = '▶'; $('#btnPlay').setAttribute('aria-label', 'Reproduzir'); }
function loop(agora) {
  if (!S.play) return;
  const d = S.d, dt = (agora - ultimo) / 1000; ultimo = agora;
  acum += dt * S.vel * (d.freq || 30);
  const passo = Math.floor(acum); acum -= passo;
  if (passo) {
    S.f += passo;
    if (S.f >= d.nF - 1) { S.f = d.nF - 1; parar(); }
    $('#slider').value = S.f; desenhar();
  }
  if (S.play) requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- carregar
function abrir(dados) {
  parar();
  S.d = dados; S.f = 0; S.sel = Math.min(S.sel, dados.nM - 1); S.hover = null;
  CACHE_GR = null;
  carregarPrefs();
  montarCena();
  if (LAB.cena) remontarLab();
  paineis();
  redimensionar();
}
function abrirTexto(texto, arquivo) {
  try { abrir(lerTabela(texto, arquivo)); return true; }
  catch (err) { alert(`Não foi possível ler ${arquivo}: ${err.message}`); }
}
function abrirArquivo(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => abrirTexto(String(r.result), file.name);
  r.readAsText(file);
}

// ---------------------------------------------------------------- eventos
['#arquivo', '#arquivo2'].forEach((id) => $(id).addEventListener('change', (e) => { abrirArquivo(e.target.files[0]); e.target.value = ''; }));
// colar tabela (texto copiado do QTM ou do Excel)
const dlgColar = $('#dlgColar');
$('#btnColar').addEventListener('click', () => { $('#colarErro').hidden = true; dlgColar.showModal(); $('#colarTexto').focus(); });
$('#colarCancelar').addEventListener('click', () => dlgColar.close());
$('#colarOk').addEventListener('click', () => {
  const texto = $('#colarTexto').value, nomeEns = $('#colarNome').value.trim() || 'tabela colada';
  try { abrir(lerTabela(texto, nomeEns)); dlgColar.close(); }
  catch (err) { $('#colarErro').textContent = `Não foi possível ler a tabela: ${err.message}`; $('#colarErro').hidden = false; }
});
const vp = $('#viewport');
['dragenter', 'dragover'].forEach((t) => vp.addEventListener(t, (e) => { e.preventDefault(); $('#soltar').hidden = false; }));
['dragleave', 'drop'].forEach((t) => vp.addEventListener(t, (e) => { e.preventDefault(); if (t === 'drop' || !vp.contains(e.relatedTarget)) $('#soltar').hidden = true; }));
vp.addEventListener('drop', (e) => abrirArquivo(e.dataTransfer.files[0]));

const tip = $('#tip'), ptrs = new Map();
let arrasto = null, pinch0 = null, moveu = false;
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  moveu = false;
  if (ptrs.size === 1) { arrasto = { x: e.clientX, y: e.clientY }; cv.classList.add('drag'); }
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = { d: hyp(a.x - b.x, a.y - b.y), z: S.zoom }; }
});
cv.addEventListener('pointermove', (e) => {
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2 && pinch0) {
    const [a, b] = [...ptrs.values()];
    S.zoom = clamp(pinch0.z * hyp(a.x - b.x, a.y - b.y) / pinch0.d, panoAtivo() ? 0.7 : 0.3, panoAtivo() ? 8 : 12); pedirDesenho(); return;
  }
  if (arrasto && ptrs.size === 1) {
    const dx = e.clientX - arrasto.x, dy = e.clientY - arrasto.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) moveu = true;
    if (moveu) {
      if (panoAtivo()) { // "pegar" a imagem: ela acompanha o mouse
        const k = 2 * Math.atan(Math.tan(PANO_FOV / 2) / S.zoom) / (H || 1);
        S.yaw -= dx * k; S.pitch = clamp(S.pitch - dy * k, -1.55, 1.55);
      } else { S.yaw += dx * 0.008; S.pitch = clamp(S.pitch + dy * 0.008, -1.5707, 1.5707); }
      arrasto = { x: e.clientX, y: e.clientY }; tip.hidden = true; marcarVista(S.pano ? 'pano' : null); pedirDesenho();
    }
    return;
  }
  passarMouse(e);
});
const fim = (e) => {
  if (ptrs.size === 1 && !moveu && S.hover != null) selecionar(S.hover);
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch0 = null;
  if (ptrs.size === 0) { arrasto = null; cv.classList.remove('drag'); }
};
cv.addEventListener('pointerup', fim);
cv.addEventListener('pointercancel', fim);
cv.addEventListener('pointerleave', () => { if (S.hover != null) { S.hover = null; pedirDesenho(); } tip.hidden = true; });
cv.addEventListener('wheel', (e) => { e.preventDefault(); S.zoom = clamp(S.zoom * Math.exp(-e.deltaY * 0.0012), panoAtivo() ? 0.7 : labAtivo() ? 0.06 : 0.3, panoAtivo() ? 8 : 12); pedirDesenho(); }, { passive: false });
cv.addEventListener('dblclick', () => irParaVista('iso'));
function passarMouse(e) {
  if (!S.d) return;
  const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  let melhor = null, dm = 14;
  for (const t of TELA) { const dd = hyp(t.q[0] - mx, t.q[1] - my); if (dd < dm) { dm = dd; melhor = t.m; } }
  if (melhor !== S.hover) { S.hover = melhor; pedirDesenho(); }
  if (melhor == null) { tip.hidden = true; cv.style.cursor = ''; return; }
  cv.style.cursor = 'pointer';
  const d = S.d, e2 = d.est[melhor], k = (S.f * d.nM + melhor) * 3, vis = !Number.isNaN(d.pos[k]);
  tip.innerHTML = `<div><b>${esc(nome(melhor))}</b>${nome(melhor) !== d.nomes[melhor] ? ` <span class="k">(${esc(d.nomes[melhor])})</span>` : ''}</div>`
    + (S.modo === 'quadro' && vis ? `<div><span class="k">no quadro</span> ${[0, 1, 2].map((a) => fmt(d.pos[k + a], 1)).join(' · ')} mm</div>` : '')
    + `<div><span class="k">média</span> ${e2.media.map((v) => fmt(v, 1)).join(' · ')} mm</div>`
    + `<div><span class="k">pico a pico</span> X ${fmt(e2.pp[0], 1)} · Y ${fmt(e2.pp[1], 1)} · Z ${fmt(e2.pp[2], 1)} mm</div>`
    + '<div class="k">clique para selecionar</div>';
  tip.hidden = false;
  let tx = mx + 14, ty = my + 14;
  if (tx + tip.offsetWidth > W - 6) tx = mx - tip.offsetWidth - 14;
  if (ty + tip.offsetHeight > H - 6) ty = my - tip.offsetHeight - 14;
  tip.style.left = tx + 'px'; tip.style.top = ty + 'px';
}
function marcarVista(v) { document.querySelectorAll('.toolbar button[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === v)); }
function irParaVista(v) {
  if (v === 'pano') { irParaPano(); return; }
  if (S.pano) { definirPano(false); camera(); }
  const [ty, tp] = (v === 'iso' && labAtivo() && LAB.iso) ? LAB.iso : VIEWS[v], y0 = S.yaw, p0 = S.pitch, z0 = S.zoom, t0 = performance.now();
  let dy = ((ty - y0) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
  marcarVista(v);
  const passo = (agora) => {
    const u = Math.min(1, (agora - t0) / 450), e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
    S.yaw = y0 + dy * e; S.pitch = p0 + (tp - p0) * e; S.zoom = z0 + (1 - z0) * e;
    desenhar();
    if (u < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}
document.querySelectorAll('.toolbar button[data-view]').forEach((b) => b.addEventListener('click', () => irParaVista(b.dataset.view)));
$('#btnPng').addEventListener('click', () => {
  const a = document.createElement('a');
  a.download = `experimento_${(S.d ? S.d.arquivo : 'qualisys').replace(/\.[^.]+$/, '')}_q${S.f + 1}.png`;
  if (labAtivo()) { // junta a camada WebGL (fundo) com a do canvas 2D
    const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height;
    const c2 = t.getContext('2d'); c2.drawImage(cv3d, 0, 0, t.width, t.height); c2.drawImage(cv, 0, 0);
    a.href = t.toDataURL('image/png');
  } else a.href = cv.toDataURL('image/png');
  a.click();
});

$('#tblMarc').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-m]');
  if (tr) selecionar(+tr.dataset.m);
});
$('#tblMarc').addEventListener('input', (e) => {
  const m = e.target.dataset.nome; if (m == null) return;
  S.apelidos[+m] = e.target.value.trim() || S.d.nomes[+m];
  salvarPrefs(); pedirDesenho();
});
$('#tblMarc').addEventListener('change', (e) => { if (e.target.dataset.nome != null) { tabelaEquilibrio(); ligacoesUI(); tabelaDados(); } });
$('#pgAnt').addEventListener('click', () => { S.pag--; S.seguir = false; $('#chSeguir').checked = false; tabelaDados(); });
$('#pgProx').addEventListener('click', () => { S.pag++; S.seguir = false; $('#chSeguir').checked = false; tabelaDados(); });
$('#pgAtual').addEventListener('click', () => { S.pag = Math.floor(S.f / PAG); tabelaDados(); });
$('#chSeguir').addEventListener('change', (e) => { S.seguir = e.target.checked; if (S.seguir) acompanharTabela(); });
$('#tblDados').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-f]'); if (tr) definirQuadro(+tr.dataset.f, true); });
$('#ligAdd').addEventListener('click', () => {
  const a = +$('#ligA').value, b = +$('#ligB').value;
  if (a === b || S.ligs.some(([p, q]) => (p === a && q === b) || (p === b && q === a))) return;
  S.ligs.push([a, b]); salvarPrefs(); ligacoesUI(); pedirDesenho();
});
$('#ligLista').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-rm]'); if (!b) return;
  S.ligs.splice(+b.dataset.rm, 1); salvarPrefs(); ligacoesUI(); pedirDesenho();
});
const lerCampo = (id) => { const v = parseFloat(String($(id).value).replace(',', '.')); return Number.isFinite(v) ? v : null; };
['#intIni', '#intFim'].forEach((id) => $(id).addEventListener('change', () => {
  const d = S.d; if (!d) return;
  const a = lerCampo('#intIni'), b = lerCampo('#intFim');
  aplicarIntervalo(a == null ? d.f0 : quadroDoTempo(a), b == null ? d.f1 : quadroDoTempo(b));
}));
$('#intDeAgora').addEventListener('click', () => { const d = S.d; if (d) aplicarIntervalo(S.f, Math.max(S.f + 1, d.f1)); });
$('#intAteAgora').addEventListener('click', () => { const d = S.d; if (d) aplicarIntervalo(Math.min(d.f0, S.f - 1), S.f); });
$('#intTudo').addEventListener('click', () => { const d = S.d; if (d) aplicarIntervalo(0, d.nF - 1); });
$('#intRepouso').addEventListener('click', () => {
  const r = trechoParado();
  if (r) aplicarIntervalo(r[0], r[1]);
  else $('#intInfo').textContent = 'Não encontrei um trecho parado: os marcadores se movem durante todo o ensaio.';
});
$('#btnCsv').addEventListener('click', () => {
  const d = S.d; if (!d) return;
  // vírgula decimal e ; como separador: abre direto no Excel em português
  const n = (v) => (Number.isFinite(v) ? v.toFixed(3).replace('.', ',') : '');
  const ti = d.t[d.f0], tf = d.t[d.f1], inteiro = d.f0 === 0 && d.f1 === d.nF - 1;
  const linhas = ['marcador;nome_qtm;x_mm;y_mm;z_mm;dp_x_mm;dp_y_mm;dp_z_mm;validos;t_ini_s;t_fim_s']
    .concat(d.est.map((e, m) => [nome(m), d.nomes[m], ...e.media.map(n), ...e.dp.map(n), e.validos, n(ti), n(tf)].join(';')));
  const a = document.createElement('a');
  const sufixo = inteiro ? '' : `_t${ti.toFixed(1)}-${tf.toFixed(1)}s`.replace(/\./g, ',');
  a.download = `equilibrio_${d.arquivo.replace(/\.[^.]+$/, '')}${sufixo}.csv`;
  a.href = URL.createObjectURL(new Blob(['﻿' + linhas.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }));
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('#modoPos').addEventListener('change', (e) => { S.modo = e.target.value; pedirDesenho(); });
$('#exag').addEventListener('change', (e) => { S.exag = +e.target.value; pedirDesenho(); });
$('#chNomes').addEventListener('change', (e) => { S.nomes = e.target.checked; pedirDesenho(); });
$('#chRastro').addEventListener('change', (e) => { S.rastro = e.target.checked; pedirDesenho(); });
$('#chPiso').addEventListener('change', (e) => { S.piso = e.target.checked; pedirDesenho(); });
$('#chOrigem').addEventListener('change', (e) => { S.origem = e.target.checked; if (S.d) montarCena(); pedirDesenho(); });
$('#chLab').addEventListener('change', (e) => {
  S.lab = e.target.checked; salvarLab();
  if (!S.lab && S.pano) { definirPano(false); irParaVista('iso'); }
  ligarLab(); statusVisada(); statusCorrentes();
});
$('#chVisada').addEventListener('change', (e) => { S.visada = e.target.checked; pedirDesenho(); });
$('#chMontagem').addEventListener('change', (e) => { S.montagem = e.target.checked; salvarLab(); visibilidadeLab(); pedirDesenho(); });
$('#chEscala').addEventListener('change', (e) => { S.escalaPropria = e.target.checked; desenharGrafico(); });

$('#slider').addEventListener('input', (e) => definirQuadro(+e.target.value, true));
$('#btnPlay').addEventListener('click', () => (S.play ? parar() : tocar()));
const pulo = (e) => (e && e.shiftKey ? Math.max(1, Math.round(S.d.freq || 1)) : 1);
$('#btnPrev').addEventListener('click', (e) => definirQuadro(S.f - pulo(e), true));
$('#btnNext').addEventListener('click', (e) => definirQuadro(S.f + pulo(e), true));
$('#speed').addEventListener('change', (e) => { S.vel = +e.target.value; });
document.addEventListener('keydown', (e) => {
  if (!S.d || e.target.closest('input, select, textarea')) return;
  if (e.key === ' ') { e.preventDefault(); S.play ? parar() : tocar(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); definirQuadro(S.f - pulo(e), true); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); definirQuadro(S.f + pulo(e), true); }
});
$('#btnTema').addEventListener('click', () => {
  const atual = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const novo = atual === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = novo;
  try { localStorage.setItem('cat3d-tema', novo); } catch (e) { /* sem storage */ }
  desenhar();
});
try { const t = localStorage.getItem('cat3d-tema'); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* sem storage */ }
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => desenhar());
new ResizeObserver(redimensionar).observe($('#viewport'));
new ResizeObserver(redimensionar).observe(gr);

// ---------------------------------------------------------------- início
const LISTA = Array.isArray(window.QTM_ARQUIVOS) ? window.QTM_ARQUIVOS : [];
if (LISTA.length > 1) {
  $('#ensaioRow').hidden = false;
  $('#ensaioSel').innerHTML = LISTA.map((a, i) => `<option value="${i}">${esc(a.arquivo)}</option>`).join('');
  $('#ensaioSel').addEventListener('change', (e) => { const a = LISTA[+e.target.value]; abrirTexto(a.texto, a.arquivo); });
}
lerTema();
ligarLab();
if (LISTA.length) abrirTexto(LISTA[0].texto, LISTA[0].arquivo);
else $('#arqNome').textContent = 'Nenhum ensaio embutido (experimento_dados.js não encontrado). Abra um arquivo .tsv pelo botão do topo ou arrastando-o para a vista 3D.';
})();
