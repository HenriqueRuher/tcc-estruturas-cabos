// Modelos analíticos do TCC reunidos num solver geral (sem dependências).
//
// 2D — CASO GERAL (junta os Códigos 1 a 4 dos Apêndices A–D):
//   cabo ideal (inextensível, sem rigidez à flexão) entre as ancoragens A e B,
//   formado por trechos consecutivos de comprimento L_i e peso por metro q_i,
//   com forças concentradas verticais P_j em posições s_j (arco medido a partir de A).
//   · Código 1/2: 1 trecho, sem força          · Código 3: 2 trechos (q1, q2)
//   · Código 4: 1 trecho + 1 força concentrada · qualquer combinação dos três
//
//   Como não há carga horizontal, a componente horizontal da tração H (= T0) é a
//   mesma em todo o cabo. A componente vertical V(s) cresce com o peso e as forças
//   entre A e s:  V(s) = V_A + ∫q ds + ΣP. Em cada pedaço com q constante a curva é
//   uma catenária com fórmula fechada:
//     Δx = (H/q)·[asinh(V1/H) − asinh(V0/H)],   Δy = [√(H²+V1²) − √(H²+V0²)]/q
//   (q = 0: segmento reto). As incógnitas são só H e V_A, resolvidas por Newton
//   até a extremidade cair em B. É equivalente aos sistemas dos Códigos 3 e 4
//   (lá escritos com β = q/T0 e constantes c1, c2 por trecho).
//
// 3D — DOIS CABOS LIGADOS EM P (Código 5, Apêndice E):
//   mesmo sistema de 9 equações do TCC, resolvido por Newton amortecido.
(function (raiz) {
  'use strict';

  const hyp = Math.hypot;

  // ---------------------------------------------------------------- álgebra
  function resolverLinear(J, b) { // eliminação de Gauss com pivotamento parcial
    const n = b.length, M = J.map((row, i) => [...row, b[i]]);
    for (let k = 0; k < n; k++) {
      let p = k;
      for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
      [M[k], M[p]] = [M[p], M[k]];
      if (Math.abs(M[k][k]) < 1e-300) return null;
      for (let i = k + 1; i < n; i++) { const f = M[i][k] / M[k][k]; for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j]; }
    }
    const x = new Array(n);
    for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; }
    return x;
  }
  const norma = (r) => Math.sqrt(r.reduce((s, v) => s + v * v, 0));

  // Newton amortecido com jacobiano numérico. 'valido(X)' rejeita passos fora do domínio.
  function newton(F, X0, { tol = 1e-10, maxIt = 200, valido = () => true } = {}) {
    let X = X0.slice(), r = F(X);
    if (!r.every(isFinite)) return null;
    for (let it = 0; it < maxIt && norma(r) > tol; it++) {
      const n = X.length, J = [];
      for (let j = 0; j < n; j++) {
        const h = 1e-7 * Math.max(1, Math.abs(X[j])), Xh = X.slice(); Xh[j] += h;
        const rh = F(Xh);
        for (let i = 0; i < n; i++) (J[i] ||= [])[j] = (rh[i] - r[i]) / h;
      }
      const dx = resolverLinear(J, r.map((v) => -v));
      if (!dx || !dx.every(isFinite)) return null;
      let t = 1, Xn, rn;
      for (; t > 1e-6; t /= 2) {
        Xn = X.map((v, i) => v + t * dx[i]);
        if (!valido(Xn)) continue;
        rn = F(Xn);
        if (rn.every(isFinite) && norma(rn) < norma(r)) break;
      }
      if (t <= 1e-6) return null;
      X = Xn; r = rn;
    }
    return norma(r) <= Math.max(tol, 1e-7) ? { X, residuo: norma(r) } : null;
  }

  // ---------------------------------------------------------------- 2D geral
  // entrada: { A:[x,y], B:[x,y], trechos:[{L, q}], cargas:[{s, P}] }
  function pedacos2D(trechos, cargas) {
    // corta o cabo em pedaços de q constante, com a força concentrada no início de cada pedaço
    const Ltot = trechos.reduce((s, t) => s + t.L, 0);
    const cortes = new Set([0, Ltot]);
    let acc = 0;
    for (const t of trechos) { acc += t.L; cortes.add(+acc.toFixed(12)); }
    for (const c of cargas) if (c.s > 0 && c.s < Ltot) cortes.add(+c.s.toFixed(12));
    const pts = [...cortes].sort((a, b) => a - b);
    const qEm = (s) => { let a = 0; for (const t of trechos) { if (s < a + t.L - 1e-12) return t.q; a += t.L; } return trechos[trechos.length - 1].q; };
    const trechoEm = (s) => { let a = 0; for (let i = 0; i < trechos.length; i++) { if (s < a + trechos[i].L - 1e-12) return i; a += trechos[i].L; } return trechos.length - 1; };
    const out = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const s0 = pts[k], s1 = pts[k + 1];
      if (s1 - s0 < 1e-12) continue;
      const P = cargas.filter((c) => Math.abs(c.s - s0) < 1e-9 && c.s > 0 && c.s < Ltot).reduce((s, c) => s + c.P, 0);
      out.push({ s0, s1, l: s1 - s0, q: qEm((s0 + s1) / 2), trecho: trechoEm((s0 + s1) / 2), P });
    }
    return { pedacos: out, Ltot };
  }

  // integra um pedaço a partir de V0 (componente vertical no início, já com a força P somada)
  function passo(H, V0, q, l) {
    const V1 = V0 + q * l;
    if (q < 1e-12) { const T = hyp(H, V0); return { dx: l * H / T, dy: l * V0 / T, V1: V0 }; }
    return {
      dx: (H / q) * (Math.asinh(V1 / H) - Math.asinh(V0 / H)),
      dy: (hyp(H, V1) - hyp(H, V0)) / q,
      V1,
    };
  }

  function fecho2D(H, VA, pedacos) {
    let x = 0, y = 0, V = VA;
    for (const p of pedacos) { V += p.P; const r = passo(H, V, p.q, p.l); x += r.dx; y += r.dy; V = r.V1; }
    return [x, y];
  }

  function resolver2D(entrada) {
    const { A, B } = entrada;
    const trechos = entrada.trechos.filter((t) => t.L > 0);
    const cargas = (entrada.cargas || []).filter((c) => c.P !== 0);
    if (!trechos.length) throw new Error('Informe ao menos um trecho com comprimento positivo.');
    if (trechos.some((t) => t.q < 0)) throw new Error('O peso por metro não pode ser negativo.');
    const D = B[0] - A[0], dY = B[1] - A[1];
    if (D <= 0) throw new Error('A ancoragem B deve estar à direita de A (x_B > x_A).');
    const { pedacos, Ltot } = pedacos2D(trechos, cargas);
    const corda = hyp(D, dY);
    if (Ltot <= corda + 1e-9) throw new Error(`Cabo curto demais: L = ${Ltot.toFixed(3)} m deve ser maior que a distância entre A e B (${corda.toFixed(3)} m).`);
    for (const c of cargas) if (c.s <= 0 || c.s >= Ltot) throw new Error(`A força de ${c.P} N está fora do cabo (s deve estar entre 0 e ${Ltot} m).`);

    const W = pedacos.reduce((s, p) => s + p.q * p.l + p.P, 0);
    const qm = Math.max(W / Ltot, 1e-6);
    // chute: estimativa de Taylor (Código 2) para H; V_A pela inclinação da corda e metade da carga
    const sEq = Math.sqrt(Math.max(Ltot * Ltot - dY * dY, D * D * 1.0001));
    const H0 = qm * Math.sqrt(D ** 3 / (24 * Math.max(sEq - D, 1e-9)));
    const F = ([u, VA]) => { const [x, y] = fecho2D(Math.exp(u), VA, pedacos); return [(x - D) / Ltot, (y - dY) / Ltot]; };
    let sol = null;
    for (const fH of [1, 0.5, 2, 0.2, 5, 0.05, 20]) {
      const H = H0 * fH;
      for (const fV of [0, -0.25, 0.25]) {
        const VA = H * dY / D - W / 2 + fV * W;
        sol = newton(F, [Math.log(H), VA], { tol: 1e-13 });
        if (sol) break;
      }
      if (sol) break;
    }
    if (!sol) throw new Error('O solver não convergiu para estes dados.');
    const H = Math.exp(sol.X[0]), VA = sol.X[1];

    // amostragem da curva (x, y, T, V) ao longo do arco
    const amostras = [], vertices = [];
    let x = A[0], y = A[1], V = VA;
    const nosPedaco = [];
    for (const p of pedacos) {
      V += p.P;
      nosPedaco.push({ s: p.s0, x, y, P: p.P, V });
      const n = Math.max(8, Math.ceil(240 * p.l / Ltot));
      for (let k = 0; k <= n; k++) {
        const ls = p.l * k / n, r = passo(H, V, p.q, ls);
        const Vk = V + p.q * ls;
        amostras.push({ s: p.s0 + ls, x: x + r.dx, y: y + r.dy, V: Vk, T: hyp(H, Vk), trecho: p.trecho });
      }
      // vértice (V = 0) dentro deste pedaço
      if (p.q > 0 && V < 0 && V + p.q * p.l > 0) {
        const ls = -V / p.q, r = passo(H, V, p.q, ls);
        vertices.push({ s: p.s0 + ls, x: x + r.dx, y: y + r.dy });
      }
      const r = passo(H, V, p.q, p.l);
      x += r.dx; y += r.dy; V = r.V1;
    }
    const VB = V;
    // ponto mais baixo: vértice interno, nó com força concentrada ou uma ancoragem
    let baixo = amostras.reduce((m, a) => (a.y < m.y ? a : m), amostras[0]);
    const Tmax = Math.max(...amostras.map((a) => a.T));

    // L* (Código 1/2): comprimento em que o vértice coincide com a ancoragem mais baixa
    // (só faz sentido para 1 trecho sem forças concentradas)
    let Lcrit = null;
    const simples = trechos.length === 1 && !cargas.length;
    if (simples && Math.abs(dY) > 1e-9 && trechos[0].q > 0) {
      const v = D, h = Math.abs(dY);
      // cosh(α v) − α h − 1 = 0, α > 0 (bisseção)
      let lo = 1e-9, hi = 1;
      while (Math.cosh(hi * v) - hi * h - 1 < 0 && hi < 1e6) hi *= 2;
      for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (Math.cosh(m * v) - m * h - 1 < 0) lo = m; else hi = m; }
      const al = (lo + hi) / 2;
      Lcrit = Math.sinh(al * v) / al;
    } else if (simples) Lcrit = D;

    return {
      H, T0: H, VA, VB, Ltot, W, pedacos, nosPedaco, amostras, vertices, baixo, Tmax,
      TA: hyp(H, VA), TB: hyp(H, VB), Lcrit, simples, residuo: sol.residuo,
      alpha: simples ? H / trechos[0].q : null, // parâmetro da catenária a = T0/q [m]
    };
  }

  // parábola y = a x² + b x + c pelas duas ancoragens com o MESMO comprimento de arco L
  // (Seção "Aproximação por parábola"); a é resolvido exatamente (bisseção na integral).
  function parabola(A, B, L) {
    const [xa, ya] = A, [xb, yb] = B;
    const m = (yb - ya) / (xb - xa);
    const comp = (a) => {
      const b = m - a * (xb + xa);
      const F = (x) => { const u = 2 * a * x + b, r = Math.sqrt(1 + u * u); return (u * r + Math.asinh(u)) / (4 * a); };
      return a < 1e-12 ? hyp(xb - xa, yb - ya) : F(xb) - F(xa);
    };
    if (L <= hyp(xb - xa, yb - ya)) return null;
    let lo = 1e-12, hi = 1e-3;
    while (comp(hi) < L && hi < 1e6) hi *= 2;
    for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (comp(mid) < L) lo = mid; else hi = mid; }
    const a = (lo + hi) / 2, b = m - a * (xb + xa), c = ya - a * xa * xa - b * xa;
    const x0 = -b / (2 * a);
    return { a, b, c, x0, y0: a * x0 * x0 + b * x0 + c, y: (x) => a * x * x + b * x + c };
  }

  // ---------------------------------------------------------------- 3D (Código 5)
  // entrada: { A:[x,y,z], B:[..], C:[..], L1, eta, LC, q1, q2 }   (y = vertical)
  function resolver3D(e) {
    const anc = [e.A, e.B, e.C];
    const L = [e.eta * e.L1, (1 - e.eta) * e.L1, e.LC], q = [e.q1, e.q1, e.q2];
    if (!(e.eta > 0 && e.eta < 1)) throw new Error('η deve estar entre 0 e 1.');
    if (q.some((v) => !(v > 0))) throw new Error('Os pesos por metro devem ser positivos.');
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
    const valido = (X) => X[3] > 0 && X[4] > 0 && X[5] > 0;
    const xi = e.A[0] + e.eta * (e.B[0] - e.A[0]);
    const ymin = Math.min(e.A[1], e.B[1], e.C[1]);
    let sol = null;
    // chute no espírito do Código 5 + pequena varredura (robustez com parâmetros diferentes)
    busca:
    for (const zf of [0.2, 0.05, 0.35, 0.5, 0.1]) {
      for (const dy of [8, 5, 12, 15, 3]) {
        for (const esc of [0.5, 1, 0.25, 2]) {
          const X0 = [xi, ymin - dy, zf * e.C[2], ...q.map((qi, i) => esc * qi * L[i]), -0.5, -0.5, -0.5];
          sol = newton(F, X0, { tol: 1e-9, valido });
          if (sol) break busca;
        }
      }
    }
    if (!sol) throw new Error('O sistema 3D não convergiu para estes parâmetros.');
    const X = sol.X, P = X.slice(0, 3), T0 = X.slice(3, 6), c = X.slice(6, 9);
    const trechos = anc.map((p, i) => {
      const H = hyp(p[0] - P[0], p[2] - P[2]), ux = (p[0] - P[0]) / H, uz = (p[2] - P[2]) / H, a = T0[i] / q[i];
      const pts = [];
      for (let k = 0; k <= 120; k++) {
        const s = H * k / 120, arg = s / a + c[i];
        pts.push({
          p: [P[0] + s * ux, P[1] + a * (Math.cosh(arg) - Math.cosh(c[i])), P[2] + s * uz],
          h: s, arco: a * (Math.sinh(arg) - Math.sinh(c[i])), T: T0[i] * Math.cosh(arg),
        });
      }
      return { nome: ['A', 'B', 'C'][i], anc: p, L: L[i], q: q[i], T0: T0[i], c1: c[i], H, pts, Tmax: Math.max(...pts.map((v) => v.T)) };
    });
    return { P, T0, c, trechos, residuo: sol.residuo };
  }

  const API = { resolver2D, parabola, resolver3D, newton };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.CATENARIA = API;
})(typeof window !== 'undefined' ? window : globalThis);
