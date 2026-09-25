// Aba 2D da simulação ANSYS: casos dos Capítulos 3 e 4 do TCC (ansys/casos_2d.py -> casos2d.js),
// comparados com a solução analítica exata.
(() => {
'use strict';
const D = window.CASOS2D;

// ---------------------------------------------------------------- utilidades
const $ = (s) => document.querySelector(s);
const hyp = Math.hypot;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const nf = {};
const fmt = (v, d = 2) => (nf[d] || (nf[d] = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }))).format(v);
const sinal = (v, d = 2) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), d);
let TH = {};
function lerTema() {
  const c = getComputedStyle(document.documentElement), g = (n) => c.getPropertyValue(n).trim();
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

// mapas de cores: os mesmos do visualizador 3D
const CMAPS = {
  viridis: ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'],
  ansys: ['#0000d0', '#0050ff', '#00c8ff', '#00e69a', '#00d800', '#b4e600', '#ffc800', '#ff6400', '#e60000'],
};
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function cor(t) {
  const cols = CMAPS[S.cmap].map(hex2rgb);
  t = clamp(t, 0, 1) * (cols.length - 1);
  const i = Math.min(cols.length - 2, Math.floor(t)), f = t - i, a = cols[i], b = cols[i + 1];
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(',')})`;
}
const COR_FORCA = '#e8590c';
// modelo analítico sempre em vermelho, como na aba 3D (app.js)
const corAnalitica = () => (document.documentElement.dataset.theme === 'dark'
  || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches) ? '#ff5a4f' : '#d7191c');

// rótulos curtos dos botões
const ROT = {
  cap3_L35: ['Cap. 3', 'L = 35 m'], cap3_L32: ['Cap. 3', 'L = 32 m'],
  hib1_base: ['Híbrido #1', 'caso base'], hib2_valid: ['Híbrido #2', 'validação'],
  hib3_peso: ['Híbrido #3', 'q₁ = 10 q₂'], hib4_compr: ['Híbrido #4', 'l₁ = 10 l₂'],
  forca1_base: ['Força #1', 'caso base'], forca2_P0: ['Força #2', 'P = 0'],
  forca4_mu1: ['Força #4', 'μ = 1'], forca4_mu5: ['Força #4', 'μ = 5'],
  forca4_mu10: ['Força #4', 'μ = 10'], forca4_mu20: ['Força #4', 'μ = 20'],
};

// ---------------------------------------------------------------- estado / canvas
const S = { c: null, cmap: 'viridis', comp: 'sobrepor', nos: false, corda: false, hover: null };
const cv = $('#cv'), ctx = cv.getContext('2d'), ch = $('#ch'), cx2 = ch.getContext('2d');
let W = 0, H = 0, DPR = 1, MAP = null;
function redimensionar() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  const r = cv.getBoundingClientRect();
  W = r.width; H = r.height;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  const rc = ch.getBoundingClientRect();
  ch.width = Math.round(rc.width * DPR); ch.height = Math.round(230 * DPR);
  desenhar();
}

// descrição dos dados de entrada de um caso
function entradas(c) {
  const [A, B] = [c.A, c.B];
  const tr = c.trechos.map(([L, q], i) => (c.trechos.length > 1 ? `trecho ${i + 1}: L = ${fmt(L, 0)} m, q = ${fmt(q, 0)} N/m` : `L = ${fmt(L, 0)} m, q = ${fmt(q, 0)} N/m`)).join(' · ');
  const fo = c.forcas.map(([z, P]) => `P = ${fmt(P, 0)} N em ζ = ${fmt(z, 2)}`).join(' · ');
  return `${c.descricao}. A = (${fmt(A[0], 0)}; ${fmt(A[1], 0)}) m, B = (${fmt(B[0], 0)}; ${fmt(B[1], 0)}) m · ${tr}${fo ? ' · ' + fo : ''}.`;
}

// ---------------------------------------------------------------- desenho do perfil
function desenhar() {
  if (!W || !S.c) return;
  lerTema();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  perfil();
  grafico();
}
function perfil() {
  const c = S.c;
  ctx.fillStyle = TH.surface; ctx.fillRect(0, 0, W, H);
  const pts = c.xy_mef, an = c.xy_an;
  const xs = pts.map((p) => p[0]).concat(an.map((p) => p[0])), ys = pts.map((p) => p[1]).concat(an.map((p) => p[1]));
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const mg = { l: 58, r: 26, t: 58, b: 46 };
  const dx = (x1 - x0) || 1, dy = (y1 - y0) || 1;
  const k = Math.min((W - mg.l - mg.r) / (dx * 1.1), (H - mg.t - mg.b) / (dy * 1.2));
  const ox = mg.l + (W - mg.l - mg.r) / 2 - (x0 + x1) / 2 * k, oy = mg.t + (H - mg.t - mg.b) / 2 + (y0 + y1) / 2 * k;
  const P = (x, y) => [ox + x * k, oy - y * k];
  MAP = { P };
  // grade e eixos
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
    ctx.beginPath(); ctx.moveTo(...P(...c.A)); ctx.lineTo(...P(...c.B)); ctx.stroke(); ctx.restore();
  }
  // cabo do ANSYS pintado pela força axial de cada elemento (fora do modo "Analítica + nós")
  const Nmin = Math.min(...c.N), Nmax = Math.max(...c.N);
  const sp = pts.map((p) => P(p[0], p[1]));
  const soNos = S.comp === 'nos', verAn = S.comp !== 'mef';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (!soNos) {
    ctx.strokeStyle = TH.halo; ctx.lineWidth = 12; ctx.globalAlpha = .3;
    ctx.beginPath(); sp.forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q))); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.lineWidth = 8;
    for (let i = 1; i < sp.length; i++) {
      ctx.strokeStyle = cor((c.N[i - 1] - Nmin) / ((Nmax - Nmin) || 1));
      ctx.beginPath(); ctx.moveTo(...sp[i - 1]); ctx.lineTo(...sp[i]); ctx.stroke();
    }
  }
  // curva do modelo analítico: vermelho com halo, como na aba 3D
  if (verAn) {
    for (const [cc, lw] of [[TH.surface, 5.5], [corAnalitica(), 2.6]]) {
      ctx.strokeStyle = cc; ctx.lineWidth = lw;
      ctx.beginPath(); an.forEach((p, i) => { const q = P(p[0], p[1]); i ? ctx.lineTo(...q) : ctx.moveTo(...q); }); ctx.stroke();
    }
  }
  // nós do ANSYS sobre a curva analítica / nós da malha (mesmos marcadores da aba 3D)
  if (soNos) {
    ctx.fillStyle = TH.ink; ctx.strokeStyle = TH.surface; ctx.lineWidth = 1.5;
    for (const q of sp) { ctx.beginPath(); ctx.arc(q[0], q[1], 3.6, 0, 6.2832); ctx.fill(); ctx.stroke(); }
  } else if (S.nos) {
    ctx.fillStyle = TH.ink;
    for (const q of sp) { ctx.beginPath(); ctx.arc(q[0], q[1], 2, 0, 6.2832); ctx.fill(); }
  }
  // pontos de corte (troca de peso / força): círculo, como o nó P da aba 3D
  const forcas = c.forcas.map(([z, Pf]) => ({ s: z * c.L, P: Pf }));
  const Pmax = Math.max(1, ...forcas.map((f) => f.P));
  c.cortes_mef.forEach((p, i) => {
    const [sx, sy] = P(p[0], p[1]);
    ctx.fillStyle = TH.ink; ctx.strokeStyle = TH.surface; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sx, sy, 5.5, 0, 6.2832); ctx.fill(); ctx.stroke();
    const sc = c.cortes_s[i + 1], f = forcas.find((ff) => Math.abs(ff.s - sc) < 1e-6);
    if (f && f.P > 0) {
      const len = 24 + 44 * f.P / Pmax;
      seta(sx, sy - len - 8, sx, sy - 9, COR_FORCA);
      ctx.textBaseline = 'bottom'; rotulo(`${fmt(f.P, 0)} N`, sx, sy - len - 12, COR_FORCA, true);
    } else {
      ctx.textBaseline = 'top'; rotulo(`C (${fmt(p[0], 2)}; ${fmt(p[1], 2)})`, sx, sy + 12, TH.ink2);
    }
  });
  // vértice analítico dos cabos homogêneos
  if (!c.cortes_an.length) {
    const v = c.baixo_an, [sx, sy] = P(v[0], v[1]);
    const noVao = v[0] > c.A[0] + 1e-6 && v[0] < c.B[0] - 1e-6;
    if (noVao) {
      ctx.strokeStyle = corAnalitica(); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx - 6, sy - 6); ctx.lineTo(sx + 6, sy + 6); ctx.moveTo(sx + 6, sy - 6); ctx.lineTo(sx - 6, sy + 6); ctx.stroke();
      ctx.textBaseline = 'top'; rotulo(`vértice analítico (${fmt(v[0], 2)}; ${fmt(v[1], 2)})`, sx, sy + 10, corAnalitica());
    }
  }
  // ancoragens
  for (const [pt, nome] of [[c.A, 'A'], [c.B, 'B']]) {
    const [sx, sy] = P(...pt);
    ctx.fillStyle = TH.ink; ctx.strokeStyle = TH.surface; ctx.lineWidth = 2;
    ctx.fillRect(sx - 5, sy - 5, 10, 10); ctx.strokeRect(sx - 5, sy - 5, 10, 10);
    ctx.textBaseline = 'bottom'; rotulo(`${nome} (${fmt(pt[0], 1)}; ${fmt(pt[1], 1)})`, sx, sy - 10, TH.ink, true);
  }
  // destaque do elemento sob o cursor
  if (S.hover != null && !soNos) {
    const a = sp[S.hover], b = sp[S.hover + 1];
    ctx.strokeStyle = TH.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 7, 0, 6.2832); ctx.stroke();
  }
  legenda(Nmin, Nmax);
  // legenda das curvas
  const itens = [];
  if (S.comp !== 'nos') itens.push(['ANSYS (cor = força axial)', 'grad']);
  if (S.comp !== 'mef') itens.push(['analítico (exato)', corAnalitica()]);
  if (S.comp === 'nos') itens.push(['nós do ANSYS', 'nos']);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = '12px "Segoe UI", system-ui, sans-serif';
  let lx = mg.l + 8;
  for (const [txt, c2] of itens) {
    if (c2 === 'nos') { ctx.fillStyle = TH.ink; ctx.beginPath(); ctx.arc(lx + 11, 20, 3.6, 0, 6.2832); ctx.fill(); }
    else {
      if (c2 === 'grad') { const g = ctx.createLinearGradient(lx, 0, lx + 22, 0); g.addColorStop(0, cor(0)); g.addColorStop(1, cor(1)); ctx.strokeStyle = g; ctx.lineWidth = 5; }
      else { ctx.strokeStyle = c2; ctx.lineWidth = 2.6; }
      ctx.beginPath(); ctx.moveTo(lx, 20); ctx.lineTo(lx + 22, 20); ctx.stroke();
    }
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
function legenda(lo, hi) {
  $('#lgBar').style.background = `linear-gradient(90deg, ${CMAPS[S.cmap].join(',')})`;
  const t = niceTicks(lo, hi, 4), d = casas(t.step);
  const tk = t.ticks.filter((v) => v >= lo - 1e-9 && v <= hi + 1e-9);
  $('#lgTicks').innerHTML = tk.map((v) => `<span style="left:${clamp((v - lo) / ((hi - lo) || 1) * 100, 0, 100)}%">${fmt(v, d)}</span>`).join('');
}

// ---------------------------------------------------------------- gráfico de tração
function grafico() {
  const c = S.c, w = ch.width / DPR, h = ch.height / DPR;
  cx2.setTransform(DPR, 0, 0, DPR, 0, 0);
  cx2.clearRect(0, 0, w, h);
  const series = [
    { nome: 'T analítico', x: c.s_an, y: c.T_an, cor: corAnalitica(), w: 1.8 },
    { nome: 'N ANSYS', x: c.s_mef, y: c.N, cor: TH.accent, pontos: true },
    { nome: 'T₀ = N·cos φ ANSYS', x: c.s_mef, y: c.t0, cor: TH.accent, dash: [6, 4], w: 1.8 },
    { nome: 'T₀ analítico', x: [0, c.L], y: [c.T0_an, c.T0_an], cor: corAnalitica(), dash: [6, 4], w: 1.4 },
  ];
  const mg = { l: 56, r: 14, t: 40, b: 34 };
  const xlo = 0, xhi = c.L;
  let ylo = 0, yhi = Math.max(...series.flatMap((s) => s.y)) * 1.08;
  const X = (v) => mg.l + (v - xlo) / ((xhi - xlo) || 1) * (w - mg.l - mg.r), Y = (v) => h - mg.b - (v - ylo) / ((yhi - ylo) || 1) * (h - mg.t - mg.b);
  const tx = niceTicks(xlo, xhi, 8), ty = niceTicks(ylo, yhi, 5);
  cx2.font = '11px "Segoe UI", system-ui, sans-serif'; cx2.lineWidth = 1;
  cx2.strokeStyle = TH.grid; cx2.fillStyle = TH.ink2;
  cx2.textAlign = 'center'; cx2.textBaseline = 'top';
  for (const v of tx.ticks) { cx2.beginPath(); cx2.moveTo(X(v), mg.t); cx2.lineTo(X(v), h - mg.b); cx2.stroke(); cx2.fillText(fmt(v, casas(tx.step)), X(v), h - mg.b + 5); }
  cx2.textAlign = 'right'; cx2.textBaseline = 'middle';
  for (const v of ty.ticks) { cx2.beginPath(); cx2.moveTo(mg.l, Y(v)); cx2.lineTo(w - mg.r, Y(v)); cx2.stroke(); cx2.fillText(fmt(v, casas(ty.step)), mg.l - 6, Y(v)); }
  cx2.fillStyle = TH.muted; cx2.textAlign = 'center'; cx2.textBaseline = 'bottom'; cx2.fillText('s a partir de A [m]', (mg.l + w - mg.r) / 2, h - 2);
  cx2.save(); cx2.translate(12, (mg.t + h - mg.b) / 2); cx2.rotate(-Math.PI / 2); cx2.textBaseline = 'middle'; cx2.fillText('força [N]', 0, 0); cx2.restore();
  for (const sc of c.cortes_s.slice(1, -1)) {
    cx2.save(); cx2.setLineDash([3, 3]); cx2.strokeStyle = COR_FORCA; cx2.globalAlpha = .8;
    cx2.beginPath(); cx2.moveTo(X(sc), mg.t); cx2.lineTo(X(sc), h - mg.b); cx2.stroke(); cx2.restore();
  }
  let lx = mg.l + 4;
  for (const s of series) {
    cx2.save(); if (s.dash) cx2.setLineDash(s.dash); cx2.strokeStyle = s.cor; cx2.fillStyle = TH.surface; cx2.lineWidth = s.w || 2;
    if (s.pontos) {
      cx2.lineWidth = 1.3;
      s.x.forEach((v, i) => { if (i % 2) return; cx2.beginPath(); cx2.arc(X(v), Y(s.y[i]), 2.8, 0, 6.2832); cx2.fill(); cx2.stroke(); });
      cx2.beginPath(); cx2.arc(lx + 9, 12, 2.8, 0, 6.2832); cx2.fill(); cx2.stroke();
    } else {
      cx2.beginPath(); s.x.forEach((v, i) => (i ? cx2.lineTo(X(v), Y(s.y[i])) : cx2.moveTo(X(v), Y(s.y[i])))); cx2.stroke();
      cx2.beginPath(); cx2.moveTo(lx, 12); cx2.lineTo(lx + 18, 12); cx2.stroke();
    }
    cx2.restore();
    cx2.fillStyle = TH.ink2; cx2.textAlign = 'left'; cx2.textBaseline = 'middle'; cx2.fillText(s.nome, lx + 23, 12);
    lx += 36 + cx2.measureText(s.nome).width;
  }
}

// ---------------------------------------------------------------- painéis
const pct = (m, a) => 100 * (m / a - 1);
const par = (p) => `(${fmt(p[0], 2)}; ${fmt(p[1], 2)})`;
function paineis() {
  const c = S.c;
  $('#casoNota').textContent = entradas(c);
  document.querySelectorAll('#casos button').forEach((b) => b.classList.toggle('on', b.dataset.c === c.nome));
  document.querySelectorAll('#tblTodos tbody tr').forEach((tr) => tr.classList.toggle('on', tr.dataset.c === c.nome));
  $('#resumo').innerHTML = [
    ['ΔT₀', `${sinal(pct(c.T0_mef, c.T0_an))} <small>%</small>`],
    ['E<sub>RMS</sub>', `${fmt(c.rms * 100, 1)} <small>cm</small>`],
    ['desvio máx.', `${fmt(c.dmax * 100, 1)} <small>cm</small>`],
  ].map(([l, v]) => `<div><div class="lbl">${l}</div><div class="val">${v}</div></div>`).join('');
  const linhas = [
    ['T₀ [N]', fmt(c.T0_an, 2), fmt(c.T0_mef, 2), `${sinal(pct(c.T0_mef, c.T0_an))} %`],
    ['T em A [N]', fmt(c.TA_an, 1), fmt(c.TA_mef, 1), `${sinal(pct(c.TA_mef, c.TA_an))} %`],
    ['T em B [N]', fmt(c.TB_an, 1), fmt(c.TB_mef, 1), `${sinal(pct(c.TB_mef, c.TB_an))} %`],
  ];
  c.cortes_an.forEach((p, i) => {
    const m = c.cortes_mef[i], f = c.forcas.length ? 'nó da força' : 'nó C (troca de q)';
    linhas.push([`${f} [m]`, par(p), par(m), `${fmt(hyp(m[0] - p[0], m[1] - p[1]) * 100, 1)} cm`]);
  });
  if (!c.cortes_an.length) {
    const v = c.baixo_an, noVao = v[0] > c.A[0] + 1e-6 && v[0] < c.B[0] - 1e-6;
    if (noVao) linhas.push(['vértice [m]', par(v), par(c.baixo_mef), `${fmt(hyp(c.baixo_mef[0] - v[0], c.baixo_mef[1] - v[1]) * 100, 1)} cm`]);
    else linhas.push(['vértice', 'virtual (fora do vão)', '—', '—']);
  }
  if (c.T0_trechos.length > 1) linhas.push(['T₀ entre trechos', 'constante', `var. ${fmt(100 * (Math.max(...c.T0_trechos) - Math.min(...c.T0_trechos)) / c.T0_mef, 2)} %`, '']);
  $('#tblComp').innerHTML = '<thead><tr><th>Grandeza</th><th>Analítico</th><th>ANSYS</th><th>Δ</th></tr></thead><tbody>'
    + linhas.map((l) => `<tr>${l.map((v) => `<td>${v}</td>`).join('')}</tr>`).join('') + '</tbody>';
  const ne = c.N.length;
  $('#modelo').innerHTML = [
    ['EI', `${fmt(c.EI, 1)} <small>N·m²</small>`], ['elementos', `${ne}`], ['substeps', `${c.substeps}`],
  ].map(([l, v]) => `<div><div class="lbl">${l}</div><div class="val">${v}</div></div>`).join('');
  history.replaceState(null, '', '#caso=' + c.nome);
}
function montar() {
  $('#casos').innerHTML = D.casos.map((c) => `<button type="button" data-c="${c.nome}"><b>${ROT[c.nome][0]}</b><br><small>${ROT[c.nome][1]}</small></button>`).join('');
  $('#tblTodos').innerHTML = '<thead><tr><th>Caso</th><th>T₀ an.</th><th>T₀ MEF</th><th>ΔT₀</th><th>RMS</th></tr></thead><tbody>'
    + D.casos.map((c) => `<tr data-c="${c.nome}"><td>${ROT[c.nome][0]} <small>${ROT[c.nome][1]}</small></td><td>${fmt(c.T0_an, 1)}</td><td>${fmt(c.T0_mef, 1)}</td>`
      + `<td>${sinal(pct(c.T0_mef, c.T0_an))}%</td><td>${fmt(c.rms * 100, 1)} cm</td></tr>`).join('') + '</tbody>';
  const escolher = (nome) => { S.c = D.casos.find((c) => c.nome === nome) || D.casos[0]; S.hover = null; $('#tip').hidden = true; paineis(); desenhar(); };
  $('#casos').addEventListener('click', (e) => { const b = e.target.closest('button[data-c]'); if (b) escolher(b.dataset.c); });
  $('#tblTodos').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-c]'); if (tr) escolher(tr.dataset.c); });
  $('#gerado').textContent = new Date(D.gerado).toLocaleString('pt-BR');
  const h = new URLSearchParams(location.hash.slice(1));
  escolher(h.get('caso') || 'cap3_L35');
}

// ---------------------------------------------------------------- eventos
function passarMouse(e) {
  if (!MAP || !S.c) return;
  const rc = cv.getBoundingClientRect(), mx = e.clientX - rc.left, my = e.clientY - rc.top, tip = $('#tip');
  const c = S.c, sp = c.xy_mef.map((p) => MAP.P(p[0], p[1]));
  let melhor = null, dm = 14;
  for (let i = 0; i < sp.length - 1; i++) {
    const d = hyp((sp[i][0] + sp[i + 1][0]) / 2 - mx, (sp[i][1] + sp[i + 1][1]) / 2 - my);
    if (d < dm) { dm = d; melhor = i; }
  }
  S.hover = melhor;
  if (melhor == null) { tip.hidden = true; desenhar(); return; }
  const s = c.s_mef[melhor];
  let j = c.s_an.findIndex((v) => v >= s); if (j < 1) j = 1;
  const f = (s - c.s_an[j - 1]) / ((c.s_an[j] - c.s_an[j - 1]) || 1), Tan = c.T_an[j - 1] + f * (c.T_an[j] - c.T_an[j - 1]);
  const trecho = c.cortes_s.findIndex((v) => v > s);
  tip.innerHTML = `<div><b>elemento ${melhor + 1}</b> · trecho ${trecho}</div>`
    + `<div><span class="k">s</span> ${fmt(s, 2)} m</div>`
    + `<div><span class="k">N ANSYS</span> ${fmt(c.N[melhor], 1)} N · <span class="k">T analítico</span> ${fmt(Tan, 1)} N</div>`
    + `<div><span class="k">T₀ ANSYS</span> ${fmt(c.t0[melhor], 1)} N · <span class="k">analítico</span> ${fmt(c.T0_an, 1)} N</div>`;
  tip.hidden = false;
  let tx = mx + 14, ty = my + 14;
  if (tx + tip.offsetWidth > W - 6) tx = mx - tip.offsetWidth - 14;
  if (ty + tip.offsetHeight > H - 6) ty = my - tip.offsetHeight - 14;
  tip.style.left = tx + 'px'; tip.style.top = ty + 'px';
  desenhar();
}
cv.addEventListener('pointermove', passarMouse);
cv.addEventListener('pointerleave', () => { S.hover = null; $('#tip').hidden = true; desenhar(); });
$('#chNos').addEventListener('change', (e) => { S.nos = e.target.checked; desenhar(); });
$('#chCorda').addEventListener('change', (e) => { S.corda = e.target.checked; desenhar(); });
const marcarComp = () => document.querySelectorAll('#compGroup button').forEach((b) => b.classList.toggle('on', b.dataset.comp === S.comp));
$('#compGroup').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-comp]'); if (!b) return;
  S.comp = b.dataset.comp; marcarComp(); desenhar();
});
marcarComp();
$('#cmap').addEventListener('change', (e) => { S.cmap = e.target.value; desenhar(); });
document.querySelectorAll('.abas button[data-ir]').forEach((b) => b.addEventListener('click', () => { location.href = b.dataset.ir; }));
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
  a.download = `ansys_2d_${S.c.nome}.png`; a.href = cv.toDataURL('image/png'); a.click();
});
new ResizeObserver(redimensionar).observe($('#viewport'));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', desenhar);

if (!D) {
  $('#casoNota').textContent = 'casos2d.js não encontrado: rode ansys/casos_2d.py para gerar os resultados.';
  return;
}
lerTema();
montar();
})();
