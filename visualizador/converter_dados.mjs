// Converte dados_ansys.txt (gerado por exportar_resultados.inp) em dados.js,
// que o visualizador carrega via <script> (funciona abrindo ansys.html direto,
// sem servidor). Tambem le os parametros fisicos de ../catenaria3d.inp.
//
// Uso: node converter_dados.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const aqui = dirname(fileURLToPath(import.meta.url));
const txt = readFileSync(join(aqui, 'dados_ansys.txt'), 'utf8').split(/\r?\n/);
// (sem comentarios APDL: tudo depois de '!' -- evita casar 'rsec = 1 cm' de um comentario)
const inp = readFileSync(join(aqui, '..', 'ansys', 'catenaria3d.inp'), 'utf8').replace(/!.*$/gm, '');

// ---------- parametros do .inp -----------------------------------------
const num = (nome) => {
  const m = inp.match(new RegExp(`(?:^|[\\s$])${nome}\\s*=\\s*([-+0-9.Ee]+)\\s*(?:$|[\\s$!])`, 'm'));
  if (!m) throw new Error(`parametro ${nome} nao encontrado em catenaria3d.inp`);
  return parseFloat(m[1]);
};
// secao generica (ASEC): area do circulo de raio rsec, inercia reduzida pelo fator fI
const raio = num('rsec'), fI = num('fI');
const E = parseFloat(inp.match(/MP,EX,1,\s*([0-9.Ee+-]+)/)[1]);
const p = {
  A: [num('xa'), num('ya'), num('za')],
  B: [num('xb'), num('yb'), num('zb')],
  C: [num('xc'), num('yc'), num('zc')],
  P0: [(num('xa') + num('xb')) / 2, num('yp0'), num('zp0')],
  L1: num('L1'), LC: num('LC'), eta: num('eta'), q1: num('q1'), q2: num('q2'),
  NDIV: num('NDIV'), raio, fI, E,
};
p.LA = p.eta * p.L1;
p.LB = (1 - p.eta) * p.L1;
p.area = Math.PI * raio ** 2;          // m^2
p.inercia = fI * Math.PI * raio ** 4 / 4;   // m^4 (reduzida: ver catenaria3d.inp)

// ---------- leitura do dados_ansys.txt ---------------------------------
const nos0 = new Map();   // id -> [x0,y0,z0]
const elems = [];         // {id, sec, ni, nj}
const frames = [];        // {passo, fator, u: Map, b: Map}
let atual = null;
for (const linha of txt) {
  const t = linha.trim().split(/\s+/);
  const tag = t[0];
  const v = t.slice(1).map(Number);
  if (tag === 'N') nos0.set(v[0], v.slice(1, 4));
  else if (tag === 'E') elems.push({ id: v[0], sec: v[1], ni: v[2], nj: v[3] });
  else if (tag === 'S') { atual = { passo: v[0], fator: v[1], u: new Map(), b: new Map() }; frames.push(atual); }
  else if (tag === 'U') atual.u.set(v[0], v.slice(1, 4));
  else if (tag === 'B') atual.b.set(v[0], v.slice(1, 8));
}

// ---------- topologia: cabos ordenados da ancoragem ate P --------------
const usados = new Set(elems.flatMap((e) => [e.ni, e.nj]));
const noP = [...usados].find((n) => new Set(elems.filter((e) => e.ni === n || e.nj === n).map((e) => e.sec)).size === 3);
if (!noP) throw new Error('no P (comum aos tres cabos) nao encontrado');

const nomes = { 1: 'A–P', 2: 'B–P', 3: 'C–P' };
const cabos = [];
for (const sec of [1, 2, 3]) {
  const es = elems.filter((e) => e.sec === sec);
  const grau = new Map();
  for (const e of es) for (const n of [e.ni, e.nj]) grau.set(n, (grau.get(n) || 0) + 1);
  const ancora = [...grau].find(([n, g]) => g === 1 && n !== noP)[0];
  // percorre a corrente a partir da ancoragem
  const nosOrd = [ancora], elemsOrd = [], sentido = [];
  const restante = new Set(es.map((e) => e.id));
  while (nosOrd.at(-1) !== noP) {
    const cur = nosOrd.at(-1);
    const e = es.find((x) => restante.has(x.id) && (x.ni === cur || x.nj === cur));
    restante.delete(e.id);
    elemsOrd.push(e.id);
    sentido.push(e.ni === cur ? 1 : -1);   // +1: I->J segue o sentido ancora->P
    nosOrd.push(e.ni === cur ? e.nj : e.ni);
  }
  cabos.push({ sec, nome: nomes[sec], ancora, nos: nosOrd, elems: elemsOrd, sentido });
}

// ---------- monta a saida compacta -------------------------------------
const nosIds = [...usados].sort((a, b) => a - b);
const idx = new Map(nosIds.map((n, i) => [n, i]));
const elemIds = elems.map((e) => e.id).sort((a, b) => a - b);
const r = (x, d = 6) => Number(x.toPrecision(d));

const saida = {
  gerado: new Date().toISOString(),
  params: p,
  noP: idx.get(noP),
  nos0: nosIds.map((n) => nos0.get(n).map((x) => r(x, 8))),
  cabos: cabos.map((c) => ({
    nome: c.nome, sec: c.sec,
    nos: c.nos.map((n) => idx.get(n)),
    elems: c.elems.map((e) => elemIds.indexOf(e)),
  })),
  elems: elemIds.map((id) => {
    const e = elems.find((x) => x.id === id);
    return { id, sec: e.sec, i: idx.get(e.ni), j: idx.get(e.nj) };
  }),
  frames: frames.map((f) => ({
    passo: f.passo,
    fator: r(f.fator, 6),
    // deslocamentos [ux,uy,uz] por no (m)
    u: nosIds.map((n) => f.u.get(n).map((x) => r(x, 7))),
    // por elemento: [FXi,FXj,MYi,MYj,MZi,MZj,TQ]  (N, N.m)
    b: elemIds.map((id) => f.b.get(id).map((x) => r(x, 6))),
  })),
};

writeFileSync(join(aqui, 'dados.js'), 'window.SIM = ' + JSON.stringify(saida) + ';\n');

// ---------- conferencia contra os resultados originais -----------------
const ult = frames.at(-1);
const [ux, uy, uz] = ult.u.get(noP);
const P = nos0.get(noP).map((x, k) => x + [ux, uy, uz][k]);
console.log(`nos usados: ${nosIds.length}  elementos: ${elemIds.length}  substeps: ${frames.length}`);
console.log(`no P (id ${noP}) final = ${P.map((x) => x.toFixed(5)).join(', ')}`);
console.log('  (resultado_noP.txt original: 19.97987, 7.50742, 4.02429)');
for (const c of cabos) {
  const eN = c.elems.at(-1);
  const fx = ult.b.get(eN)[0];
  console.log(`cabo ${c.nome}: ancoragem no ${c.ancora}, ${c.elems.length} elementos, FX no elemento junto a P = ${fx.toFixed(3)} N`);
}
console.log('dados.js gerado.');
