// Visualizador do modelo analítico: caso geral 2D (Códigos 1–4) e sistema 3D (Código 5).
// Os cálculos ficam em analitico_solver.js (window.CATENARIA).
(() => {
'use strict';
const { resolver2D, parabola, resolver3D } = window.CATENARIA;

// ---------------------------------------------------------------- utilidades
const $ = (s) => document.querySelector(s);
const hyp = Math.hypot;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const nf = {};
const fmt = (v, d = 2) => (nf[d] || (nf[d] = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }))).format(v);
const css = () => getComputedStyle(document.documentElement);
let TH = {};
function lerTema() {
  const c = css(), g = (n) => c.getPropertyValue(n).trim();
  TH = { surface: g('--surface'), s2: g('--surface-2'), ink: g('--ink'), ink2: g('--ink-2'), muted: g('--muted'), grid: g('--grid'),
    line: g('--line'), accent: g('--accent'), cab: [g('--c1'), g('--c2'), g('--c3')], halo: g('--halo') };
}
function niceTicks(lo, hi, n = 6) {
  const span = hi - lo || 1, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || 10 * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9 * step; v += step) out.push(Math.abs(v) < 1e-12 ? 0 : v);
  return { ticks: out, step };
}
const casas = (step) => Math.max(0, Math.min(3, -Math.floor(Math.log10(step) + 1e-9)));

// mapa de cores viridis (perceptual), mesmo do visualizador ANSYS
const VIR = ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
function cor(t) {
  t = clamp(t, 0, 1) * (VIR.length - 1);
  const i = Math.min(VIR.length - 2, Math.floor(t)), f = t - i, a = VIR[i], b = VIR[i + 1];
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(',')})`;
}
const COR_FORCA = '#e8590c', COR_PARAB = '#d7191c';

// ---------------------------------------------------------------- canvas
const cv = $('#cv'), ctx = cv.getContext('2d'), ch = $('#ch'), cx2 = ch.getContext('2d');
let W = 0, H = 0, DPR = 1;
function redimensionar() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  const r = cv.getBoundingClientRect();
  W = r.width; H = r.height;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  const rc = ch.getBoundingClientRect();
  ch.width = Math.round(rc.width * DPR); ch.height = Math.round(230 * DPR);
  desenhar();
}

// ---------------------------------------------------------------- estado
const S = {
  modo: location.hash === '#3d' ? '3d' : '2d',
  e2: null, parab: false, corda: true, r2: null, erro2: null,
  e3: null, r3: null, erro3: null,
  yaw: -0.62, pitch: 0.42, zoom: 1, hover: null,
};

const PRESETS_2D = [
  { id: 'c1', nome: 'Cód. 1', sub: 'cabo simples', nota: 'Cabo simples entre duas ancoragens: vértice e comprimento crítico L*.',
    e: { A: [0, 10], B: [30, 20], trechos: [{ L: 35, q: 45 }], cargas: [] }, parab: false },
  { id: 'c2', nome: 'Cód. 2', sub: 'exato × parábola', nota: 'Mesmo cabo, com a distribuição de tração e a comparação com a parábola de mesmo comprimento.',
    e: { A: [0, 10], B: [30, 20], trechos: [{ L: 35, q: 45 }], cargas: [] }, parab: true },
  { id: 'c3', nome: 'Cód. 3', sub: 'dois pesos', nota: 'Cabo híbrido: dois trechos com pesos por metro diferentes.',
    e: { A: [0, 10], B: [40, 20], trechos: [{ L: 30, q: 20 }, { L: 20, q: 10 }], cargas: [] }, parab: false },
  { id: 'c4', nome: 'Cód. 4', sub: 'força concentrada', nota: 'Cabo com uma força concentrada P aplicada ao longo do arco.',
    e: { A: [0, 10], B: [30, 20], trechos: [{ L: 35, q: 10 }], cargas: [{ s: 17.5, P: 150 }] }, parab: false },
  { id: 'geral', nome: 'Geral', sub: 'tudo junto', nota: 'Caso geral: vários trechos e forças, resolvidos pelo mesmo sistema.',
    e: { A: [0, 12], B: [45, 18], trechos: [{ L: 18, q: 30 }, { L: 15, q: 60 }, { L: 20, q: 15 }], cargas: [{ s: 9, P: 250 }, { s: 40, P: 120 }] }, parab: false },
];
const PRESETS_3D = [
  { id: 'principal', nome: 'Caso principal', sub: 'Tabela 4.13', e: { A: [0, 20, 0], B: [40, 20, 0], C: [20, 15, 25], L1: 50, eta: 0.5, LC: 30, q1: 40, q2: 20 } },
  { id: 'eta', nome: 'η = 0,15', sub: 'nó perto de A', e: { A: [0, 20, 0], B: [40, 20, 0], C: [20, 15, 25], L1: 50, eta: 0.15, LC: 30, q1: 40, q2: 20 } },
  { id: 'q2', nome: 'q₂ = 5·q₁', sub: 'ramal pesado', e: { A: [0, 20, 0], B: [40, 20, 0], C: [20, 15, 25], L1: 50, eta: 0.5, LC: 30, q1: 40, q2: 200 } },
];
const clone = (o) => JSON.parse(JSON.stringify(o));

// ================================================================ 2D
function montarPresets(el, lista, aplicar) {
  el.innerHTML = lista.map((p) => `<button type="button" data-p="${p.id}"><b>${p.nome}</b><br><small>${p.sub}</small></button>`).join('');
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-p]'); if (!b) return;
    aplicar(lista.find((p) => p.id === b.dataset.p));
  });
}
function marcarPreset(el, id) { el.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.p === id)); }

function aplicarPreset2D(p) {
  S.e2 = clone(p.e); S.parab = p.parab; S.preset2 = p; $('#chParab').checked = p.parab;
  marcarPreset($('#presets2d'), p.id); $('#presetNota').textContent = p.nota;
  preencher2D(); calcular2D();
}
function preencher2D() {
  const e = S.e2;
  $('#xA').value = e.A[0]; $('#yA').value = e.A[1]; $('#xB').value = e.B[0]; $('#yB').value = e.B[1];
  $('#tbTrechos').innerHTML = '<tr><th>#</th><th>L (m)</th><th>q (N/m)</th><th></th></tr>' + e.trechos.map((t, i) =>
    `<tr><td>${i + 1}</td><td><input type="number" step="any" min="0" data-t="${i}" data-k="L" value="${t.L}"></td>`
    + `<td><input type="number" step="any" min="0" data-t="${i}" data-k="q" value="${t.q}"></td>`
    + `<td>${e.trechos.length > 1 ? `<button type="button" class="rm" data-rmt="${i}" aria-label="Remover trecho">×</button>` : ''}</td></tr>`).join('');
  $('#tbCargas').innerHTML = e.cargas.length ? '<tr><th>#</th><th>s (m)</th><th>P (N)</th><th></th></tr>' + e.cargas.map((c, i) =>
    `<tr><td>${i + 1}</td><td><input type="number" step="any" min="0" data-c="${i}" data-k="s" value="${c.s}"></td>`
    + `<td><input type="number" step="any" data-c="${i}" data-k="P" value="${c.P}"></td>`
    + `<td><button type="button" class="rm" data-rmc="${i}" aria-label="Remover força">×</button></td></tr>`).join('')
    : '<tr><td class="dim">nenhuma força concentrada</td></tr>';
}
function lerEntradas2D() {
  const n = (id) => parseFloat($(id).value);
  S.e2.A = [n('#xA'), n('#yA')]; S.e2.B = [n('#xB'), n('#yB')];
}
function calcular2D() {
  marcarPresetSeMudou();
  try {
    const e = S.e2;
    if ([...e.A, ...e.B].some((v) => !isFinite(v))) throw new Error('Preencha as coordenadas das ancoragens.');
    if (e.trechos.some((t) => !isFinite(t.L) || !isFinite(t.q))) throw new Error('Preencha L e q de todos os trechos.');
    if (e.cargas.some((c) => !isFinite(c.s) || !isFinite(c.P))) throw new Error('Preencha s e P de todas as forças.');
    S.r2 = resolver2D(e); S.erro2 = null;
  } catch (err) { S.r2 = null; S.erro2 = err.message; }
  S.hover = null;
  atualizarRes2D(); desenhar();
}
function marcarPresetSeMudou() {
  // desmarca o exemplo se o usuário editar os dados
  const p = S.preset2;
  if (p && JSON.stringify(p.e) === JSON.stringify(S.e2)) return;
  S.preset2 = null;
  marcarPreset($('#presets2d'), null);
  $('#presetNota').textContent = 'Dados editados: caso personalizado.';
}

function atualizarRes2D() {
  const r = S.r2, box = $('#res2d'), tb = $('#tbRes2d'), er = $('#erro2d');
  er.hidden = !S.erro2; er.textContent = S.erro2 ? '⚠ ' + S.erro2 : '';
  $('#notaParab').textContent = '';
  if (!r) { box.innerHTML = ''; tb.innerHTML = ''; $('#nota2d').innerHTML = ''; return; }
  const baixo = r.baixo, vert = r.vertices[0];
  const cel = (l, v, u = '') => `<div><span class="lbl">${l}</span><br><span class="val">${v}${u ? ` <small>${u}</small>` : ''}</span></div>`;
  let h = cel('Tração horizontal T<sub>0</sub>', fmt(r.T0, 2), 'N')
    + cel('Tração máxima', fmt(r.Tmax, 1), 'N')
    + cel('Comprimento total', fmt(r.Ltot, 2), 'm')
    + cel('T na ancoragem A', fmt(r.TA, 1), 'N')
    + cel('T na ancoragem B', fmt(r.TB, 1), 'N')
    + cel('Peso total + forças', fmt(r.W, 0), 'N')
    + cel('Ponto mais baixo', `${fmt(baixo.x, 2)}; ${fmt(baixo.y, 2)}`, 'm');
  if (r.simples) {
    h += cel('Parâmetro α = T<sub>0</sub>/q', fmt(r.alpha, 3), 'm');
    h += cel('Comprimento crítico L*', fmt(r.Lcrit, 3), 'm');
  }
  box.innerHTML = h;
  const notas = [];
  if (vert) notas.push(`Vértice (T = T<sub>0</sub>) dentro do vão em x = ${fmt(vert.x, 2)} m, y = ${fmt(vert.y, 2)} m.`);
  else notas.push('Sem vértice dentro do vão: o cabo é monotônico (vértice virtual, fora dos apoios)'
    + (r.simples ? `, pois L = ${fmt(r.Ltot, 2)} m < L* = ${fmt(r.Lcrit, 2)} m.` : '.'));
  // tabela por trecho
  let t = '<tr><th>Trecho</th><th>L (m)</th><th>q (N/m)</th><th>T início (N)</th><th>T fim (N)</th><th>fim (x; y)</th></tr>';
  const porTrecho = {};
  for (const a of r.amostras) (porTrecho[a.trecho] ||= []).push(a);
  S.e2.trechos.forEach((tr, i) => {
    const a = porTrecho[i]; if (!a) return;
    const f = a[a.length - 1];
    t += `<tr><td>${i + 1}</td><td>${fmt(tr.L, 2)}</td><td>${fmt(tr.q, 1)}</td><td>${fmt(a[0].T, 1)}</td><td>${fmt(f.T, 1)}</td><td>${fmt(f.x, 2)}; ${fmt(f.y, 2)}</td></tr>`;
  });
  const cargas = r.nosPedaco.filter((n) => n.P);
  if (cargas.length) {
    t += '<tr><th>Força</th><th>s (m)</th><th>P (N)</th><th colspan="3">ponto de aplicação (x; y)</th></tr>';
    cargas.forEach((c, i) => { t += `<tr><td>${i + 1}</td><td>${fmt(c.s, 2)}</td><td>${fmt(c.P, 0)}</td><td colspan="3">${fmt(c.x, 2)}; ${fmt(c.y, 2)}</td></tr>`; });
  }
  tb.innerHTML = t;
  // parábola
  if (S.parab) {
    if (!r.simples) $('#notaParab').textContent = 'A comparação com a parábola só vale para 1 trecho sem forças concentradas (Códigos 1–2).';
    else {
      const p = parabola(S.e2.A, S.e2.B, r.Ltot);
      let dmax = 0;
      for (const a of r.amostras) dmax = Math.max(dmax, Math.abs(p.y(a.x) - a.y));
      $('#notaParab').innerHTML = `Parábola com o mesmo comprimento de arco: y = ${fmt(p.a, 6)}·x² ${p.b < 0 ? '−' : '+'} ${fmt(Math.abs(p.b), 4)}·x + ${fmt(p.c, 3)}; `
        + `vértice (${fmt(p.x0, 2)}; ${fmt(p.y0, 2)}) m. Maior diferença vertical para a catenária: ${fmt(dmax, 3)} m.`;
    }
  }
  $('#nota2d').innerHTML = notas.join(' ');
}

// ---- desenho 2D: eixos com escala igual em x e y
let map2 = null;
function desenhar2D() {
  const r = S.r2;
  ctx.fillStyle = TH.surface; ctx.fillRect(0, 0, W, H);
  if (!r) { msgVazia(S.erro2 || ''); return; }
  const e = S.e2;
  const p = S.parab && r.simples ? parabola(e.A, e.B, r.Ltot) : null;
  let xs = r.amostras.map((a) => a.x), ys = r.amostras.map((a) => a.y);
  if (p) for (let k = 0; k <= 60; k++) { const x = e.A[0] + (e.B[0] - e.A[0]) * k / 60; xs.push(x); ys.push(p.y(x)); }
  const Pmax = Math.max(1, ...r.nosPedaco.map((n) => n.P));
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const mg = { l: 58, r: 26, t: 58, b: 46 };
  const dx = (x1 - x0) || 1, dy = (y1 - y0) || 1;
  const k = Math.min((W - mg.l - mg.r) / (dx * 1.08), (H - mg.t - mg.b) / (dy * 1.15));
  const cxm = (x0 + x1) / 2, cym = (y0 + y1) / 2;
  const ox = mg.l + (W - mg.l - mg.r) / 2 - cxm * k, oy = mg.t + (H - mg.t - mg.b) / 2 + cym * k;
  const P = (x, y) => [ox + x * k, oy - y * k];
  map2 = { P, k };
  // grade
  const X0 = (mg.l - ox) / k, X1 = (W - mg.r - ox) / k, Y0 = (oy - (H - mg.b)) / k, Y1 = (oy - mg.t) / k;
  const tx = niceTicks(X0, X1, 8), ty = niceTicks(Y0, Y1, 6);
  ctx.strokeStyle = TH.grid; ctx.lineWidth = 1; ctx.fillStyle = TH.ink2; ctx.font = '11px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const v of tx.ticks) { const [sx] = P(v, 0); ctx.beginPath(); ctx.moveTo(sx, mg.t); ctx.lineTo(sx, H - mg.b); ctx.stroke(); ctx.fillText(fmt(v, casas(tx.step)), sx, H - mg.b + 6); }
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const v of ty.ticks) { const [, sy] = P(0, v); ctx.beginPath(); ctx.moveTo(mg.l, sy); ctx.lineTo(W - mg.r, sy); ctx.stroke(); ctx.fillText(fmt(v, casas(ty.step)), mg.l - 8, sy); }
  ctx.fillStyle = TH.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText('x [m]', (mg.l + W - mg.r) / 2, H - 6);
  ctx.save(); ctx.translate(16, (mg.t + H - mg.b) / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'; ctx.fillText('y [m]', 0, 0); ctx.restore();
  // corda
  if (S.corda) {
    ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeStyle = TH.muted; ctx.globalAlpha = .6; ctx.lineWidth = 1.2;
    const a = P(...e.A), b = P(...e.B); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); ctx.restore();
  }
  // parábola
  if (p) {
    ctx.save(); ctx.setLineDash([7, 5]); ctx.strokeStyle = COR_PARAB; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) { const x = e.A[0] + (e.B[0] - e.A[0]) * i / 200, q = P(x, p.y(x)); i ? ctx.lineTo(...q) : ctx.moveTo(...q); }
    ctx.stroke(); ctx.restore();
  }
  // cabo pintado pela tração
  const Tmin = Math.min(...r.amostras.map((a) => a.T)), Tmx = r.Tmax;
  S.faixa = [Tmin, Tmx];
  const pts = r.amostras.map((a) => P(a.x, a.y));
  ctx.lineCap = 'round';
  ctx.strokeStyle = TH.halo; ctx.lineWidth = 8; ctx.globalAlpha = .35;
  ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q))); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.lineWidth = 5;
  for (let i = 1; i < pts.length; i++) {
    const t = ((r.amostras[i].T + r.amostras[i - 1].T) / 2 - Tmin) / ((Tmx - Tmin) || 1);
    ctx.strokeStyle = cor(t); ctx.beginPath(); ctx.moveTo(...pts[i - 1]); ctx.lineTo(...pts[i]); ctx.stroke();
  }
  // divisões entre trechos (mudança de q)
  let acc = 0;
  e.trechos.slice(0, -1).forEach((t) => {
    acc += t.L;
    const a = r.amostras.reduce((m, v) => (Math.abs(v.s - acc) < Math.abs(m.s - acc) ? v : m));
    const [sx, sy] = P(a.x, a.y);
    ctx.fillStyle = TH.surface; ctx.strokeStyle = TH.ink; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(sx, sy - 6); ctx.lineTo(sx + 6, sy); ctx.lineTo(sx, sy + 6); ctx.lineTo(sx - 6, sy); ctx.closePath(); ctx.fill(); ctx.stroke();
  });
  // rótulos de q por trecho
  ctx.font = '11px "Segoe UI", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  acc = 0;
  if (e.trechos.length > 1) e.trechos.forEach((t) => {
    const sm = acc + t.L / 2; acc += t.L;
    const a = r.amostras.reduce((m, v) => (Math.abs(v.s - sm) < Math.abs(m.s - sm) ? v : m));
    const [sx, sy] = P(a.x, a.y);
    ctx.textBaseline = 'bottom'; rotulo(`q = ${fmt(t.q, 0)} N/m`, sx, sy - 10, TH.ink2);
  });
  // vértice
  for (const v of r.vertices) {
    const [sx, sy] = P(v.x, v.y);
    ctx.strokeStyle = TH.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx - 6, sy - 6); ctx.lineTo(sx + 6, sy + 6); ctx.moveTo(sx + 6, sy - 6); ctx.lineTo(sx - 6, sy + 6); ctx.stroke();
    ctx.textBaseline = 'top'; rotulo(`vértice (${fmt(v.x, 2)}; ${fmt(v.y, 2)})`, sx, sy + 10, TH.ink2);
  }
  if (p) {
    const [sx, sy] = P(p.x0, p.y0);
    ctx.fillStyle = COR_PARAB; ctx.beginPath(); ctx.arc(sx, sy, 4, 0, 6.2832); ctx.fill();
  }
  // forças concentradas (seta ∝ P)
  for (const n of r.nosPedaco) {
    if (!n.P) continue;
    const [sx, sy] = P(n.x, n.y), len = 22 + 46 * n.P / Pmax;
    seta(sx, sy - len, sx, sy - 5, COR_FORCA);
    ctx.textBaseline = 'bottom'; rotulo(`${fmt(n.P, 0)} N`, sx, sy - len - 4, COR_FORCA, true);
  }
  // ancoragens
  for (const [pt, nome] of [[e.A, 'A'], [e.B, 'B']]) {
    const [sx, sy] = P(...pt);
    ctx.fillStyle = TH.ink; ctx.strokeStyle = TH.surface; ctx.lineWidth = 2;
    ctx.fillRect(sx - 6, sy - 6, 12, 12); ctx.strokeRect(sx - 6, sy - 6, 12, 12);
    ctx.textBaseline = 'bottom'; rotulo(`${nome} (${fmt(pt[0], 1)}; ${fmt(pt[1], 1)})`, sx, sy - 10, TH.ink, true);
  }
  // legenda de cores
  legenda(Tmin, Tmx);
  // destaque do ponto sob o cursor
  if (S.hover && S.hover.modo === '2d') {
    const a = S.hover.a, [sx, sy] = P(a.x, a.y);
    ctx.strokeStyle = TH.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, 6, 0, 6.2832); ctx.stroke();
  }
  // legenda das curvas
  const itens = [['catenária (exata)', null]];
  if (p) itens.push(['parábola (mesmo L)', COR_PARAB]);
  if (S.corda) itens.push(['corda A–B', TH.muted]);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = '12px "Segoe UI", system-ui, sans-serif';
  let lx = mg.l + 8;
  for (const [txt, c] of itens) {
    if (c) { ctx.save(); ctx.setLineDash([6, 4]); ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lx, 20); ctx.lineTo(lx + 22, 20); ctx.stroke(); ctx.restore(); }
    else { const g = ctx.createLinearGradient(lx, 0, lx + 22, 0); g.addColorStop(0, cor(0)); g.addColorStop(1, cor(1)); ctx.strokeStyle = g; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(lx, 20); ctx.lineTo(lx + 22, 20); ctx.stroke(); }
    ctx.fillStyle = TH.ink2; ctx.fillText(txt, lx + 28, 20); lx += 40 + ctx.measureText(txt).width;
  }
}
function rotulo(txt, x, y, c, negrito = false) {
  ctx.font = `${negrito ? '600 ' : ''}12px "Segoe UI", system-ui, sans-serif`; ctx.textAlign = 'center';
  ctx.lineWidth = 3.5; ctx.strokeStyle = TH.surface; ctx.strokeText(txt, x, y); ctx.fillStyle = c; ctx.fillText(txt, x, y);
}
function seta(x0, y0, x1, y1, c, w = 3) {
  const dx = x1 - x0, dy = y1 - y0, L = hyp(dx, dy) || 1, ux = dx / L, uy = dy / L, h = clamp(L * .35, 8, 14), hw = h * .55;
  const bx = x1 - ux * h, by = y1 - uy * h;
  ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(bx, by); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(bx - uy * hw, by + ux * hw); ctx.lineTo(bx + uy * hw, by - ux * hw); ctx.closePath(); ctx.fill();
}
function msgVazia(txt) {
  ctx.fillStyle = TH.muted; ctx.font = '14px "Segoe UI", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(txt || 'Sem solução', W / 2, H / 2);
  $('#legend').style.visibility = 'hidden';
}
function legenda(lo, hi) {
  const lg = $('#legend'); lg.style.visibility = '';
  $('#lgBar').style.background = `linear-gradient(90deg, ${[0, .25, .5, .75, 1].map(cor).join(',')})`;
  const t = niceTicks(lo, hi, 4), d = casas(t.step);
  const tk = (hi - lo) < 1e-9 ? [lo] : t.ticks.filter((v) => v >= lo - 1e-9 && v <= hi + 1e-9);
  $('#lgTicks').innerHTML = tk.map((v) => `<span style="left:${(hi - lo) < 1e-9 ? 50 : clamp((v - lo) / (hi - lo) * 100, 0, 100)}%">${fmt(v, d)}</span>`).join('');
}

// ---- gráfico de tração ao longo do cabo (canvas)
function grafico(series, { xlab, ylab, marcas = [] }) {
  const w = ch.width / DPR, h = ch.height / DPR;
  cx2.setTransform(DPR, 0, 0, DPR, 0, 0);
  cx2.clearRect(0, 0, w, h);
  if (!series.length) return;
  const mg = { l: 56, r: 14, t: 40, b: 34 };
  const xsA = series.flatMap((s) => s.x), ysA = series.flatMap((s) => s.y);
  const xlo = Math.min(...xsA), xhi = Math.max(...xsA);
  let ylo = Math.min(...ysA), yhi = Math.max(...ysA);
  const pad = (yhi - ylo) * 0.08 || Math.abs(yhi) * 0.05 || 1; ylo -= pad; yhi += pad;
  if (ylo > 0 && ylo < (yhi - ylo) * 1.2) ylo = 0;
  const X = (v) => mg.l + (v - xlo) / ((xhi - xlo) || 1) * (w - mg.l - mg.r), Y = (v) => h - mg.b - (v - ylo) / ((yhi - ylo) || 1) * (h - mg.t - mg.b);
  const tx = niceTicks(xlo, xhi, 8), ty = niceTicks(ylo, yhi, 5);
  cx2.font = '11px "Segoe UI", system-ui, sans-serif'; cx2.lineWidth = 1;
  cx2.strokeStyle = TH.grid; cx2.fillStyle = TH.ink2;
  cx2.textAlign = 'center'; cx2.textBaseline = 'top';
  for (const v of tx.ticks) { cx2.beginPath(); cx2.moveTo(X(v), mg.t); cx2.lineTo(X(v), h - mg.b); cx2.stroke(); cx2.fillText(fmt(v, casas(tx.step)), X(v), h - mg.b + 5); }
  cx2.textAlign = 'right'; cx2.textBaseline = 'middle';
  for (const v of ty.ticks) { cx2.beginPath(); cx2.moveTo(mg.l, Y(v)); cx2.lineTo(w - mg.r, Y(v)); cx2.stroke(); cx2.fillText(fmt(v, casas(ty.step)), mg.l - 6, Y(v)); }
  cx2.fillStyle = TH.muted; cx2.textAlign = 'center'; cx2.textBaseline = 'bottom'; cx2.fillText(xlab, (mg.l + w - mg.r) / 2, h - 2);
  cx2.save(); cx2.translate(12, (mg.t + h - mg.b) / 2); cx2.rotate(-Math.PI / 2); cx2.textBaseline = 'middle'; cx2.fillText(ylab, 0, 0); cx2.restore();
  for (const m of marcas) {
    cx2.save(); cx2.setLineDash([3, 3]); cx2.strokeStyle = m.cor || TH.muted; cx2.globalAlpha = .8;
    cx2.beginPath(); cx2.moveTo(X(m.x), mg.t); cx2.lineTo(X(m.x), h - mg.b); cx2.stroke(); cx2.restore();
    if (m.txt) { cx2.fillStyle = m.cor || TH.muted; cx2.textAlign = 'center'; cx2.textBaseline = 'bottom'; cx2.fillText(m.txt, X(m.x), mg.t - 2); }
  }
  let lx = mg.l + 4;
  for (const s of series) {
    cx2.save(); if (s.dash) cx2.setLineDash(s.dash); cx2.strokeStyle = s.cor; cx2.lineWidth = s.w || 2.2;
    cx2.beginPath(); s.x.forEach((v, i) => (i ? cx2.lineTo(X(v), Y(s.y[i])) : cx2.moveTo(X(v), Y(s.y[i])))); cx2.stroke();
    cx2.beginPath(); cx2.moveTo(lx, 12); cx2.lineTo(lx + 18, 12); cx2.stroke(); cx2.restore();
    cx2.fillStyle = TH.ink2; cx2.textAlign = 'left'; cx2.textBaseline = 'middle'; cx2.fillText(s.nome, lx + 23, 12);
    lx += 36 + cx2.measureText(s.nome).width;
  }
}
function grafico2D() {
  const r = S.r2;
  if (!r) { grafico([], {}); return; }
  const s = r.amostras.map((a) => a.s);
  let acc = 0; const marcas = [];
  S.e2.trechos.slice(0, -1).forEach((t, i) => { acc += t.L; marcas.push({ x: acc, txt: `trecho ${i + 1}|${i + 2}` }); });
  r.nosPedaco.filter((n) => n.P).forEach((n) => marcas.push({ x: n.s, txt: `${fmt(n.P, 0)} N`, cor: COR_FORCA }));
  $('#chTitulo').textContent = 'Tração ao longo do cabo (s medido a partir de A)';
  grafico([
    { nome: 'tração T(s)', x: s, y: r.amostras.map((a) => a.T), cor: TH.accent },
    { nome: 'componente horizontal T₀', x: [s[0], s[s.length - 1]], y: [r.T0, r.T0], cor: TH.muted, dash: [6, 4], w: 1.6 },
    { nome: '|componente vertical|', x: s, y: r.amostras.map((a) => Math.abs(a.V)), cor: TH.cab[1], w: 1.6 },
  ], { xlab: 's [m]', ylab: 'força [N]', marcas });
}

// ================================================================ 3D
function aplicarPreset3D(p) {
  S.e3 = clone(p.e); marcarPreset($('#presets3d'), p.id); preencher3D(); calcular3D();
}
const ids3 = ['Ax', 'Ay', 'Az', 'Bx', 'By', 'Bz', 'Cx', 'Cy', 'Cz'];
function preencher3D() {
  const e = S.e3;
  ids3.forEach((id) => { $('#' + id).value = e[id[0]]['xyz'.indexOf(id[1])]; });
  for (const k of ['L1', 'eta', 'LC', 'q1', 'q2']) $('#' + k).value = e[k];
}
function lerEntradas3D() {
  const e = S.e3;
  ids3.forEach((id) => { e[id[0]]['xyz'.indexOf(id[1])] = parseFloat($('#' + id).value); });
  for (const k of ['L1', 'eta', 'LC', 'q1', 'q2']) e[k] = parseFloat($('#' + k).value);
  const p = PRESETS_3D.find((x) => JSON.stringify(x.e) === JSON.stringify(e));
  marcarPreset($('#presets3d'), p ? p.id : null);
}
function calcular3D() {
  try {
    const e = S.e3;
    if ([...e.A, ...e.B, ...e.C, e.L1, e.eta, e.LC, e.q1, e.q2].some((v) => !isFinite(v))) throw new Error('Preencha todos os campos.');
    S.r3 = resolver3D(e); S.erro3 = null;
  } catch (err) { S.r3 = null; S.erro3 = err.message; }
  S.hover = null;
  enquadrar3D(); atualizarRes3D(); desenhar();
}
function atualizarRes3D() {
  const r = S.r3, box = $('#res3d'), tb = $('#tbRes3d'), er = $('#erro3d');
  er.hidden = !S.erro3; er.textContent = S.erro3 ? '⚠ ' + S.erro3 : '';
  if (!r) { box.innerHTML = ''; tb.innerHTML = ''; return; }
  const cel = (l, v, u = '') => `<div><span class="lbl">${l}</span><br><span class="val">${v}${u ? ` <small>${u}</small>` : ''}</span></div>`;
  box.innerHTML = cel('x<sub>P</sub>', fmt(r.P[0], 3), 'm') + cel('y<sub>P</sub>', fmt(r.P[1], 3), 'm') + cel('z<sub>P</sub>', fmt(r.P[2], 3), 'm')
    + r.trechos.map((t) => cel(`T<sub>0,${t.nome}</sub>`, fmt(t.T0, 2), 'N')).join('');
  tb.innerHTML = '<tr><th>Trecho</th><th>L (m)</th><th>q (N/m)</th><th>T₀ (N)</th><th>T máx (N)</th><th>C₁</th></tr>'
    + r.trechos.map((t, i) => `<tr><td><span class="sw" style="background:${TH.cab[i]}"></span>${t.nome}–P</td><td>${fmt(t.L, 2)}</td><td>${fmt(t.q, 1)}</td><td>${fmt(t.T0, 2)}</td><td>${fmt(t.Tmax, 1)}</td><td>${fmt(t.c1, 4)}</td></tr>`).join('');
}

// câmera 3D (órbita em torno do centro da cena)
let CAM = null, CENA = { c: [20, 10, 10], R: 30 };
function enquadrar3D() {
  const r = S.r3, e = S.e3; if (!e) return;
  const pts = [e.A, e.B, e.C, ...(r ? r.trechos.flatMap((t) => t.pts.map((p) => p.p)) : [])];
  const mn = [0, 1, 2].map((k) => Math.min(0, ...pts.map((p) => p[k]))), mx = [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k])));
  CENA = { c: mn.map((v, k) => (v + mx[k]) / 2), R: hyp(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2 || 10, mn, mx };
}
function camera() {
  const D = 4 * CENA.R;
  CAM = { cy: Math.cos(S.yaw), sy: Math.sin(S.yaw), cp: Math.cos(S.pitch), sp: Math.sin(S.pitch), D, F: 0.62 * Math.min(W, H) * D / CENA.R * S.zoom };
}
function proj(p) {
  const { cy, sy, cp, sp, D, F } = CAM, c = CENA.c;
  const x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2];
  const x1 = x * cy + z * sy, z1 = -x * sy + z * cy, y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
  const d = D - z2, k = F / d;
  return [W / 2 + x1 * k, H / 2 - y2 * k, d];
}
function desenhar3D() {
  ctx.fillStyle = TH.surface; ctx.fillRect(0, 0, W, H);
  const r = S.r3;
  if (!r) { msgVazia(S.erro3 || ''); return; }
  camera();
  const e = S.e3, mn = CENA.mn, mx = CENA.mx;
  // piso (y = 0) com grade
  const t = niceTicks(Math.min(mn[0], mn[2]) - 2, Math.max(mx[0], mx[2]) + 2, 8).step;
  const gx0 = Math.floor((mn[0] - 3) / t) * t, gx1 = Math.ceil((mx[0] + 3) / t) * t, gz0 = Math.floor((mn[2] - 3) / t) * t, gz1 = Math.ceil((mx[2] + 3) / t) * t;
  ctx.strokeStyle = TH.grid; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = gx0; x <= gx1 + 1e-9; x += t) { const a = proj([x, 0, gz0]), b = proj([x, 0, gz1]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
  for (let z = gz0; z <= gz1 + 1e-9; z += t) { const a = proj([gx0, 0, z]), b = proj([gx1, 0, z]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
  ctx.stroke();
  ctx.fillStyle = TH.muted; ctx.font = '11px "Segoe UI", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let x = gx0; x <= gx1 + 1e-9; x += t) { const a = proj([x, 0, gz0 - t * .4]); ctx.fillText(fmt(x, 0), a[0], a[1]); }
  for (let z = gz0; z <= gz1 + 1e-9; z += t) { const a = proj([gx0 - t * .4, 0, z]); ctx.fillText(fmt(z, 0), a[0], a[1]); }
  // linhas de projeção no piso
  ctx.save(); ctx.setLineDash([3, 4]); ctx.strokeStyle = TH.muted; ctx.globalAlpha = .6;
  for (const p of [e.A, e.B, e.C, r.P]) { const a = proj(p), b = proj([p[0], 0, p[2]]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  ctx.restore();
  // cabos pintados pela tração (escala comum aos três)
  const Tmin = Math.min(...r.trechos.flatMap((tr) => tr.pts.map((p) => p.T))), Tmx = Math.max(...r.trechos.map((tr) => tr.Tmax));
  const segs = [];
  r.trechos.forEach((tr, i) => {
    const pp = tr.pts.map((p) => proj(p.p));
    for (let k = 1; k < pp.length; k++) segs.push({ a: pp[k - 1], b: pp[k], T: (tr.pts[k].T + tr.pts[k - 1].T) / 2, d: (pp[k][2] + pp[k - 1][2]) / 2 });
  });
  segs.sort((u, v) => v.d - u.d);
  ctx.lineCap = 'round';
  for (const s of segs) {
    const w = clamp(5 * (CAM.F / CAM.D) / (s.d / CAM.D) * 0.9, 3, 9);
    ctx.strokeStyle = TH.halo; ctx.globalAlpha = .3; ctx.lineWidth = w + 3; ctx.beginPath(); ctx.moveTo(s.a[0], s.a[1]); ctx.lineTo(s.b[0], s.b[1]); ctx.stroke();
    ctx.globalAlpha = 1; ctx.strokeStyle = cor((s.T - Tmin) / ((Tmx - Tmin) || 1)); ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(s.a[0], s.a[1]); ctx.lineTo(s.b[0], s.b[1]); ctx.stroke();
  }
  legenda(Tmin, Tmx);
  // marcadores
  const marca = (p, txt, quad, dx, dy) => {
    const q = proj(p);
    ctx.fillStyle = TH.ink; ctx.strokeStyle = TH.surface; ctx.lineWidth = 2;
    if (quad) { ctx.fillRect(q[0] - 5, q[1] - 5, 10, 10); ctx.strokeRect(q[0] - 5, q[1] - 5, 10, 10); }
    else { ctx.beginPath(); ctx.arc(q[0], q[1], 6, 0, 6.2832); ctx.fill(); ctx.stroke(); }
    ctx.font = '600 13px "Segoe UI", system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3.5; ctx.strokeStyle = TH.surface; ctx.strokeText(txt, q[0] + dx, q[1] + dy); ctx.fillStyle = TH.ink; ctx.fillText(txt, q[0] + dx, q[1] + dy);
  };
  marca(e.A, 'A', true, 10, -8); marca(e.B, 'B', true, 10, -8); marca(e.C, 'C', true, 10, -8);
  marca(r.P, `P (${fmt(r.P[0], 2)}; ${fmt(r.P[1], 2)}; ${fmt(r.P[2], 2)})`, false, 10, 14);
  if (S.hover && S.hover.modo === '3d') {
    const q = proj(S.hover.p.p); ctx.strokeStyle = TH.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q[0], q[1], 6, 0, 6.2832); ctx.stroke();
  }
  // gizmo de eixos
  const gx = W - 46, gy = H - 52, L = 24;
  for (const [v, nome] of [[[1, 0, 0], 'X'], [[0, 1, 0], 'Y'], [[0, 0, 1], 'Z']]) {
    const { cy, sy, cp, sp } = CAM, x1 = v[0] * cy + v[2] * sy, z1 = -v[0] * sy + v[2] * cy, y2 = v[1] * cp - z1 * sp;
    ctx.strokeStyle = TH.ink2; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + x1 * L, gy - y2 * L); ctx.stroke();
    ctx.fillStyle = TH.ink2; ctx.font = '11px "Segoe UI", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(nome, gx + x1 * (L + 9), gy - y2 * (L + 9));
  }
}
function grafico3D() {
  const r = S.r3;
  if (!r) { grafico([], {}); return; }
  $('#chTitulo').textContent = 'Tração ao longo de cada trecho (comprimento de arco medido a partir de P)';
  grafico(r.trechos.map((t, i) => ({ nome: `${t.nome}–P`, x: t.pts.map((p) => p.arco), y: t.pts.map((p) => p.T), cor: TH.cab[i] })),
    { xlab: 'arco a partir de P [m]', ylab: 'tração T [N]' });
}

// ================================================================ geral
function desenhar() {
  if (!W) return;
  lerTema();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (S.modo === '2d') { desenhar2D(); grafico2D(); } else { desenhar3D(); grafico3D(); }
}
let pedido = false;
const pedirDesenho = () => { if (pedido) return; pedido = true; requestAnimationFrame(() => { pedido = false; desenhar(); }); };

function trocarModo(m) {
  S.modo = m; S.hover = null; $('#tip').hidden = true;
  document.querySelectorAll('.abas button').forEach((b) => b.classList.toggle('on', b.dataset.modo === m));
  $('#painel2d').hidden = m !== '2d'; $('#painel3d').hidden = m !== '3d';
  document.querySelector('.modo3d').hidden = m !== '3d';
  $('#tagModo').textContent = m === '2d' ? 'Caso geral 2D' : 'Sistema 3D';
  $('#subModo').textContent = m === '2d'
    ? 'Cabo ideal (inextensível, sem rigidez à flexão): trechos com pesos diferentes e forças concentradas · reúne os Códigos 1 a 4 do TCC'
    : 'Dois cabos ligados no nó P fora do plano (Código 5 do TCC): sistema de 9 equações resolvido por Newton';
  $('#hint').textContent = m === '2d' ? 'passe o mouse sobre o cabo para ler os valores' : 'arraste = girar · roda = zoom · duplo clique = reiniciar vista · mouse sobre o cabo = valores';
  cv.style.cursor = m === '3d' ? 'grab' : 'crosshair';
  history.replaceState(null, '', m === '3d' ? '#3d' : '#');
  desenhar();
}

// ---- eventos: 2D
document.querySelectorAll('.abas button').forEach((b) => b.addEventListener('click', () => trocarModo(b.dataset.modo)));
montarPresets($('#presets2d'), PRESETS_2D, aplicarPreset2D);
montarPresets($('#presets3d'), PRESETS_3D, aplicarPreset3D);
for (const id of ['#xA', '#yA', '#xB', '#yB']) $(id).addEventListener('input', () => { lerEntradas2D(); calcular2D(); });
$('#tbTrechos').addEventListener('input', (e) => {
  const i = e.target.dataset.t; if (i == null) return;
  S.e2.trechos[+i][e.target.dataset.k] = parseFloat(e.target.value); calcular2D();
});
$('#tbCargas').addEventListener('input', (e) => {
  const i = e.target.dataset.c; if (i == null) return;
  S.e2.cargas[+i][e.target.dataset.k] = parseFloat(e.target.value); calcular2D();
});
$('#tbTrechos').addEventListener('click', (e) => {
  const b = e.target.closest('[data-rmt]'); if (!b) return;
  S.e2.trechos.splice(+b.dataset.rmt, 1); preencher2D(); calcular2D();
});
$('#tbCargas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-rmc]'); if (!b) return;
  S.e2.cargas.splice(+b.dataset.rmc, 1); preencher2D(); calcular2D();
});
$('#addTrecho').addEventListener('click', () => {
  const u = S.e2.trechos[S.e2.trechos.length - 1];
  S.e2.trechos.push({ L: 10, q: u ? u.q : 20 }); preencher2D(); calcular2D();
});
$('#addCarga').addEventListener('click', () => {
  const L = S.e2.trechos.reduce((s, t) => s + (t.L || 0), 0);
  S.e2.cargas.push({ s: +(L / 2).toFixed(2), P: 100 }); preencher2D(); calcular2D();
});
$('#chParab').addEventListener('change', (e) => { S.parab = e.target.checked; atualizarRes2D(); desenhar(); });
$('#chCorda').addEventListener('change', (e) => { S.corda = e.target.checked; desenhar(); });
// ---- eventos: 3D
for (const id of [...ids3, 'L1', 'eta', 'LC', 'q1', 'q2']) $('#' + id).addEventListener('input', () => { lerEntradas3D(); calcular3D(); });
const VISTAS = { iso: [-0.62, 0.42], front: [0, 0], side: [Math.PI / 2, 0], top: [0, Math.PI / 2 - 1e-3] };
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
  [S.yaw, S.pitch] = VISTAS[b.dataset.view];
  document.querySelectorAll('[data-view]').forEach((x) => x.classList.toggle('on', x === b)); desenhar();
}));
let arrasto = null;
cv.addEventListener('pointerdown', (e) => { if (S.modo !== '3d') return; arrasto = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; });
cv.addEventListener('pointerup', () => { arrasto = null; if (S.modo === '3d') cv.style.cursor = 'grab'; });
cv.addEventListener('pointermove', (e) => {
  if (arrasto) {
    S.yaw -= (e.clientX - arrasto.x) * 0.008; S.pitch = clamp(S.pitch + (e.clientY - arrasto.y) * 0.008, -1.5707, 1.5707);
    arrasto = { x: e.clientX, y: e.clientY };
    document.querySelectorAll('[data-view]').forEach((x) => x.classList.remove('on'));
    pedirDesenho(); return;
  }
  passarMouse(e);
});
cv.addEventListener('pointerleave', () => { if (S.hover) { S.hover = null; $('#tip').hidden = true; pedirDesenho(); } });
cv.addEventListener('wheel', (e) => {
  if (S.modo !== '3d') return;
  e.preventDefault(); S.zoom = clamp(S.zoom * Math.exp(-e.deltaY * 0.0012), 0.4, 6); pedirDesenho();
}, { passive: false });
cv.addEventListener('dblclick', () => { if (S.modo !== '3d') return; [S.yaw, S.pitch] = VISTAS.iso; S.zoom = 1; desenhar(); });

function passarMouse(e) {
  const rc = cv.getBoundingClientRect(), mx = e.clientX - rc.left, my = e.clientY - rc.top, tip = $('#tip');
  let melhor = null, dm = 14;
  if (S.modo === '2d' && S.r2 && map2) {
    for (const a of S.r2.amostras) { const [sx, sy] = map2.P(a.x, a.y), d = hyp(sx - mx, sy - my); if (d < dm) { dm = d; melhor = { modo: '2d', a }; } }
  } else if (S.modo === '3d' && S.r3 && CAM) {
    S.r3.trechos.forEach((t, i) => t.pts.forEach((p) => { const q = proj(p.p), d = hyp(q[0] - mx, q[1] - my); if (d < dm) { dm = d; melhor = { modo: '3d', p, t, i }; } }));
  }
  S.hover = melhor;
  if (!melhor) { tip.hidden = true; pedirDesenho(); return; }
  if (melhor.modo === '2d') {
    const a = melhor.a, ang = Math.atan2(a.V, S.r2.H) * 180 / Math.PI;
    tip.innerHTML = `<div><b>s = ${fmt(a.s, 2)} m</b> · trecho ${a.trecho + 1}</div>`
      + `<div><span class="k">x; y</span> ${fmt(a.x, 2)}; ${fmt(a.y, 2)} m</div>`
      + `<div><span class="k">T</span> ${fmt(a.T, 1)} N · <span class="k">inclinação</span> ${fmt(ang, 1)}°</div>`
      + `<div><span class="k">T₀</span> ${fmt(S.r2.H, 1)} N · <span class="k">V</span> ${fmt(a.V, 1)} N</div>`;
  } else {
    const { p, t, i } = melhor;
    tip.innerHTML = `<div><span class="sw" style="background:${TH.cab[i]}"></span><b>Trecho ${t.nome}–P</b></div>`
      + `<div><span class="k">arco desde P</span> ${fmt(p.arco, 2)} m</div>`
      + `<div><span class="k">posição</span> ${fmt(p.p[0], 2)}; ${fmt(p.p[1], 2)}; ${fmt(p.p[2], 2)} m</div>`
      + `<div><span class="k">T</span> ${fmt(p.T, 1)} N · <span class="k">T₀</span> ${fmt(t.T0, 1)} N</div>`;
  }
  tip.hidden = false;
  let tx = mx + 14, ty = my + 14;
  if (tx + tip.offsetWidth > W - 6) tx = mx - tip.offsetWidth - 14;
  if (ty + tip.offsetHeight > H - 6) ty = my - tip.offsetHeight - 14;
  tip.style.left = tx + 'px'; tip.style.top = ty + 'px';
  pedirDesenho();
}

// ---- tema, PNG, tamanho
$('#btnTema').addEventListener('click', () => {
  const atual = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const novo = atual === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = novo;
  try { localStorage.setItem('cat3d-tema', novo); } catch (e) { /* sem storage */ }
  desenhar();
});
try { const t = localStorage.getItem('cat3d-tema'); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* sem storage */ }
$('#btnPng').addEventListener('click', () => {
  const a = document.createElement('a');
  a.download = S.modo === '2d' ? 'catenaria_analitica_2d.png' : 'catenaria_analitica_3d.png';
  a.href = cv.toDataURL('image/png'); a.click();
});
new ResizeObserver(redimensionar).observe($('#viewport'));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', desenhar);

// ---- início
lerTema();
aplicarPreset2D(PRESETS_2D[0]);
aplicarPreset3D(PRESETS_3D[0]);
trocarModo(S.modo);
})();
