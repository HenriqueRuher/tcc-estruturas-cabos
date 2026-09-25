"""Casos bidimensionais do TCC (Capítulos 3 e 4) no Ansys, com o mesmo modelo do caso 3D.

Mesmos parâmetros do catenaria3d.inp: BEAM188, seção genérica ASEC com a área de um
círculo de r = 1 cm e inércia reduzida por fI = 0,01 (EI = 15,7 N·m²), aço (E = 200 GPa),
40 elementos por trecho, peso próprio aplicado pelo comprimento real de cada elemento
(q·le/2 em cada nó), forma inicial parabólica com o comprimento de arco correto,
NLGEOM + AUTOTS + NSUBST,200,20000,50 + STABILIZE,REDUCE,ENERGY,1e-2. Nos casos com força
concentrada, a força entra num 2º passo de carga (com estabilização constante e LNSRCH),
seguido de um 3º passo sem estabilização, como em casos_forca.py.

Diferenças inerentes ao 2D: o cabo fica no plano z = 0 (UZ, ROTX e ROTY travados em todos
os nós) e cada "trecho" é a parte do cabo entre ancoragens, trocas de peso e pontos de força
(assim o nó da força ou da troca de peso existe exatamente na posição de arco pedida).

A solução analítica de referência é calculada aqui mesmo, pelo método do caso geral 2D
do visualizador (incógnitas H = T0 e V_A, integração exata trecho a trecho), que reproduz
os Códigos 1, 3 e 4.

Uso:  python casos_2d.py [nome ...]  [--so-converter] [--fI 0.1]
Saída: casos_2d/<nome>.json, casos_2d/resumo.csv e figuras em figuras/
"""
import argparse
import csv
import json
import os
import re
import subprocess
import tempfile
import time
import unicodedata

import numpy as np
from scipy.optimize import brentq

import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'analitico'))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from solver_geral import Analitico  # noqa: E402

AQUI = os.path.dirname(os.path.abspath(__file__))
ANSYS = r'C:\Program Files\ANSYS Inc\ANSYS Student\v261\ansys\bin\winx64\ANSYS261.exe'
RESULTADOS = os.path.join(AQUI, 'casos_2d')
SAIDA_JS = os.path.join(AQUI, '..', 'visualizador', 'casos2d.js')
FIGURAS = os.path.join(AQUI, 'figuras')
NDIV = 40      # elementos por trecho (igual ao 3D)
FI = 0.01      # fator da inércia (igual ao caso principal 3D)

# nome: (descrição, A, B, [(comprimento, q)], [(fração do arco a partir de A, P)])
CASOS = {
    'cap3_L35':   ('Cap. 3 — cabo simples, L = 35 m', (0, 10), (30, 20), [(35, 45)], []),
    'cap3_L32':   ('Cap. 3 — cabo simples sob forte tração, L = 32 m', (0, 10), (30, 20), [(32, 45)], []),
    'hib1_base':  ('Cabo híbrido #1 — caso base', (0, 10), (40, 20), [(30, 10), (20, 5)], []),
    'hib2_valid': ('Cabo híbrido #2 — validação (q1 = q2, l1 = l2)', (0, 10), (40, 10), [(30, 10), (30, 10)], []),
    'hib3_peso':  ('Cabo híbrido #3 — diferença no peso', (0, 10), (40, 20), [(30, 100), (20, 10)], []),
    'hib4_compr': ('Cabo híbrido #4 — diferença no comprimento', (0, 10), (40, 20), [(100, 10), (10, 5)], []),
    'forca1_base': ('Força concentrada #1 — caso base', (0, 10), (30, 10), [(35, 10)], [(0.5, 150)]),
    'forca2_P0':  ('Força concentrada #2 — validação (P = 0)', (0, 10), (30, 20), [(35, 10)], []),
    'forca4_mu1':  ('Força concentrada #4 — μ = 1', (0, 10), (30, 20), [(35, 10)], [(0.5, 350)]),
    'forca4_mu5':  ('Força concentrada #4 — μ = 5', (0, 10), (30, 20), [(35, 10)], [(0.5, 1750)]),
    'forca4_mu10': ('Força concentrada #4 — μ = 10', (0, 10), (30, 20), [(35, 10)], [(0.5, 3500)]),
    'forca4_mu20': ('Força concentrada #4 — μ = 20', (0, 10), (30, 20), [(35, 10)], [(0.5, 7000)]),
}


# ------------------------------------------------------------------ modelo APDL
def forma_inicial(A, B, Lt):
    """parábola y = corda - 4 f t(1-t) com comprimento de arco Lt (f por bisseção)"""
    A, B = np.array(A, float), np.array(B, float)
    t = np.linspace(0, 1, 20001)

    def pts(f):
        p = A + np.outer(t, B - A)
        p[:, 1] -= 4 * f * t * (1 - t)
        return p

    comp = lambda f: np.linalg.norm(np.diff(pts(f), axis=0), axis=1).sum()
    f = brentq(lambda f: comp(f) - Lt, 0, 10 * Lt)
    p = pts(f)
    s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))])
    return lambda sq: np.column_stack([np.interp(sq, s, p[:, 0]), np.interp(sq, s, p[:, 1])])


def gerar_inp(A, B, trechos, forcas, fI):
    an = Analitico(A, B, trechos, forcas)  # só para os cortes
    cortes = an.cortes
    # nós igualmente espaçados em arco dentro de cada trecho (NDIV elementos por trecho)
    s_nos = np.concatenate([np.linspace(a, b, NDIV + 1)[:-1] for a, b in zip(cortes[:-1], cortes[1:])] + [[cortes[-1]]])
    xy = forma_inicial(A, B, an.Lt)(s_nos)
    q_trecho = [an._q((a + b) / 2) for a, b in zip(cortes[:-1], cortes[1:])]
    nos_forca = [(1 + NDIV * cortes.index(min(cortes, key=lambda c: abs(c - s))), P) for s, P in an.fs]

    L = ['/CLEAR,NOSTART', '/FILNAME,cabo2d,1', '/TITLE,Cabo 2D - casos_2d.py', '/PREP7',
         'ET,1,BEAM188', 'MP,EX,1,2.0E11', 'MP,PRXY,1,0.3',
         'rsec=0.01', f'fI={fI}', 'Asec=3.14159265359*rsec**2', 'Isec=fI*3.14159265359*rsec**4/4']
    for k in range(1, len(q_trecho) + 1):
        L += [f'SECTYPE,{k},BEAM,ASEC', 'SECDATA,Asec,Isec,0,Isec,0,2*Isec']
    L += [f'N,{i + 1},{x:.10f},{y:.10f},0' for i, (x, y) in enumerate(xy)]
    L += ['TYPE,1', 'MAT,1']
    for k in range(len(q_trecho)):
        L.append(f'SECNUM,{k + 1}')
        L += [f'E,{k * NDIV + j + 1},{k * NDIV + j + 2}' for j in range(NDIV)]
    nmax = len(xy)
    # cabo no plano z = 0 (análise 2D); ancoragens engastadas
    L += ['NSEL,ALL', 'D,ALL,UZ,0', 'D,ALL,ROTX,0', 'D,ALL,ROTY,0', 'D,1,ALL,0', f'D,{nmax},ALL,0']
    # peso próprio pelo comprimento real de cada elemento (igual ao catenaria3d.inp)
    L += [f'*DIM,qsec,ARRAY,{len(q_trecho)}'] + [f'qsec({k + 1})={q}' for k, q in enumerate(q_trecho)]
    L += ['FCUM,ADD', '*GET,emx,ELEM,0,NUM,MAX', '*DO,e,1,emx', '  n1=NELEM(e,1)', '  n2=NELEM(e,2)',
          '  *GET,sc,ELEM,e,ATTR,SECN', '  le=DISTND(n1,n2)', '  F,n1,FY,-qsec(sc)*le/2',
          '  F,n2,FY,-qsec(sc)*le/2', '*ENDDO', 'FCUM,REPL', 'FINISH',
          '/SOLU', 'ANTYPE,STATIC', 'NLGEOM,ON', 'AUTOTS,ON', 'NSUBST,200,20000,50', 'PIVCHECK,OFF',
          'STABILIZE,REDUCE,ENERGY,1.0E-2', 'OUTRES,ALL,LAST', 'SOLVE']
    passos = 1
    if nos_forca:
        L += ['FCUM,ADD'] + [f'F,{n},FY,-{P}' for n, P in nos_forca] + ['FCUM,REPL',
              'TIME,2', 'NSUBST,50,20000,20', 'LNSRCH,ON', 'STABILIZE,CONSTANT,ENERGY,1.0E-2', 'SOLVE',
              'TIME,3', 'NSUBST,5,1000,2', 'STABILIZE,OFF', 'SOLVE']
        passos = 3
    L += ['FINISH', '/POST1', 'SET,LAST', 'ALLSEL,ALL', 'ETABLE,AXF,SMISC,1',
          '*GET,nmx,NODE,0,NUM,MAX', '*CFOPEN,caso,txt', '*DO,i,1,nmx',
          '  x0=NX(i)', '  y0=NY(i)', '  xf=x0+UX(i)', '  yf=y0+UY(i)', '  *VWRITE,i,x0,y0,xf,yf', "('N',F8.0,4E20.10)",
          '*ENDDO', '*GET,emx,ELEM,0,NUM,MAX', '*DO,k,1,emx', '  *GET,sc,ELEM,k,ATTR,SECN',
          '  *GET,ax,ELEM,k,ETAB,AXF', '  n1=NELEM(k,1)', '  n2=NELEM(k,2)', '  *VWRITE,k,sc,n1,n2,ax', "('E',4F8.0,E20.10)",
          '*ENDDO', '*CFCLOS', 'FINISH']
    return '\n'.join(L) + '\n', passos


def salvar_inps(fI=FI):
    """Grava o modelo APDL de cada caso em casos_2d/inp/<nome>.inp (pode ser rodado direto
    no Ansys: File > Read Input from..., ou em lote: ANSYS261 -b -i <nome>.inp -o saida.out)."""
    pasta = os.path.join(RESULTADOS, 'inp')
    os.makedirs(pasta, exist_ok=True)
    for nome, (desc, A, B, trechos, forcas) in CASOS.items():
        inp, _ = gerar_inp(A, B, trechos, forcas, fI)
        cab = '\n'.join([
            f'! {desc}',
            f'! Gerado por casos_2d.py: A = {A}, B = {B}, trechos (L, q) = {trechos}, forcas (fracao do arco, P) = {forcas}',
            '! Resultado final gravado em caso.txt (nos e forca axial dos elementos)', ''])
        # o APDL lê o arquivo em ASCII: tira os acentos do cabeçalho
        cab = unicodedata.normalize('NFKD', cab.replace('—', '-').replace('μ', 'mu')).encode('ascii', 'ignore').decode()
        open(os.path.join(pasta, nome + '.inp'), 'w', encoding='utf8').write(cab + inp)
    print(f'modelos APDL em {pasta}')


def rodar(nome, fI):
    desc, A, B, trechos, forcas = CASOS[nome]
    inp, passos = gerar_inp(A, B, trechos, forcas, fI)
    pasta = tempfile.mkdtemp(prefix=f'cabo2d_{nome}_')
    open(os.path.join(pasta, 'modelo.inp'), 'w', encoding='utf8').write(inp)
    t = time.time()
    subprocess.run([ANSYS, '-b', '-np', '1', '-i', 'modelo.inp', '-o', 'saida.out', '-j', 'modelo'],
                   cwd=pasta, capture_output=True, timeout=3600)
    saida = open(os.path.join(pasta, 'saida.out'), errors='replace').read()
    tempos = re.findall(r'SUBSTEP\s+\d+\s+COMPLETED\.\s+CUM ITER =\s*\d+\s*\n\s*\*\*\* TIME =\s*([\d.Ee+-]+)', saida)
    ok = bool(tempos) and abs(float(tempos[-1]) - passos) < 1e-6 and os.path.exists(os.path.join(pasta, 'caso.txt'))
    if not ok:
        return False, f'NÃO CONVERGIU (fI = {fI}; {pasta})'
    nos, elems = {}, []
    for ln in open(os.path.join(pasta, 'caso.txt')):
        p = ln.split()
        if p[0] == 'N':
            v = [float(x) for x in p[1:]]
            nos[int(v[0])] = v[1:]
        elif p[0] == 'E':
            elems.append([int(float(x)) for x in p[1:5]] + [float(p[5])])
    json.dump({'nome': nome, 'fI': fI, 'substeps': len(tempos), 'segundos': round(time.time() - t, 1),
               'nos': nos, 'elems': elems}, open(os.path.join(RESULTADOS, nome + '.json'), 'w'))
    return True, f'ok (fI = {fI}, {len(tempos)} subpassos, {time.time() - t:.0f} s)'


# ------------------------------------------------------------------ comparação
def comparar(nome):
    desc, A, B, trechos, forcas = CASOS[nome]
    r = json.load(open(os.path.join(RESULTADOS, nome + '.json')))
    an = Analitico(A, B, trechos, forcas)
    ids = sorted(int(k) for k in r['nos'])
    xf = np.array([r['nos'][str(i)][2:4] for i in ids])
    el = sorted(r['elems'], key=lambda e: e[0])
    N = np.array([e[4] for e in el])
    d = np.diff(xf, axis=0)
    t0 = N * np.abs(d[:, 0]) / np.linalg.norm(d, axis=1)
    # T0: média na metade central de cada trecho (como no 3D)
    ntr = len(an.cortes) - 1
    T0_tr = [float(t0[k * NDIV + NDIV // 4: k * NDIV + 3 * NDIV // 4].mean()) for k in range(ntr)]
    # erro RMS: menor distância de cada nó à curva analítica
    s, curva = an.curva(20000)
    dist = np.array([np.min(np.linalg.norm(curva - p, axis=1)) for p in xf])
    # pontos notáveis: nós nos cortes internos (troca de peso / força) e o mais baixo
    cortes_mef = [xf[k * NDIV].tolist() for k in range(1, ntr)]
    cortes_an = [an.ponto(c)[0].tolist() for c in an.cortes[1:-1]]
    # ponto mais baixo: parábola pelos 3 nós em volta do nó mais baixo (se interno)
    ib = int(np.argmin(xf[:, 1]))
    baixo = xf[ib]
    if 0 < ib < len(xf) - 1 and not any(abs(ib - k * NDIV) <= 1 for k in range(1, ntr)):
        c = np.polyfit(xf[ib - 1:ib + 2, 0], xf[ib - 1:ib + 2, 1], 2)
        xb = -c[1] / (2 * c[0])
        baixo = np.array([xb, np.polyval(c, xb)])
    return {
        'nome': nome, 'descricao': desc, 'fI': r['fI'], 'EI': 2e11 * r['fI'] * np.pi * 0.01 ** 4 / 4,
        'substeps': r['substeps'],
        'T0_an': an.H, 'T0_mef': float(np.mean(T0_tr)), 'T0_trechos': T0_tr,
        'T0_var': float((max(T0_tr) - min(T0_tr)) / np.mean(T0_tr)),
        # tração nas ancoragens: o Ansys dá a força do elemento, então compara-se com
        # a tração analítica no meio do primeiro / último elemento
        'TA_an': an.ponto(an.cortes[1] / NDIV / 2)[2], 'TA_mef': float(N[0]),
        'TB_an': an.ponto(an.Lt - (an.Lt - an.cortes[-2]) / NDIV / 2)[2], 'TB_mef': float(N[-1]),
        'cortes_an': cortes_an, 'cortes_mef': cortes_mef,
        'baixo_an': an.mais_baixo().tolist(), 'baixo_mef': baixo.tolist(),
        'rms': float(np.sqrt(np.mean(dist ** 2))), 'dmax': float(dist.max()), 'L': an.Lt,
        'compressao': bool(N.min() < 0),
        'xy_mef': xf.tolist(), 'xy_an': curva[::20].tolist(),
        # tração ao longo do arco: N de cada elemento (no meio dele) x T analítico
        's_mef': (np.concatenate([[0], np.cumsum(np.linalg.norm(d, axis=1))])[:-1]
                  + np.linalg.norm(d, axis=1) / 2).tolist(),
        'N_mef': N.tolist(), 't0_mef': t0.tolist(),
        's_an': s[::20].tolist(), 'T_an': [float(an.ponto(si)[2]) for si in s[::20]],
        'A': list(A), 'B': list(B), 'trechos': [list(t) for t in trechos],
        'forcas': [list(f) for f in forcas], 'cortes_s': [float(c) for c in an.cortes],
        'substeps': r['substeps'],
    }


def figuras(res):
    import matplotlib
    matplotlib.use('Agg')
    sys.path.insert(0, os.path.join(AQUI, '..'))
    import estilo_tcc as E
    E.aplicar()
    # ---- perfis: analítico (linha) x nós do MEF (círculos), um painel por caso
    n, cols = len(res), 3
    rows = -(-n // cols)
    fig, axs = E.figura(cols, rows, largura=12, altura=3.3 * rows)
    for ax, c in zip(axs.flat, res):
        a, m = np.array(c['xy_an']), np.array(c['xy_mef'])
        ax.plot(a[:, 0], a[:, 1], '-', color=E.ANALITICO, lw=1.6, label='Analítico')
        ax.plot(m[::2, 0], m[::2, 1], 'o', ms=3.4, mfc='white', mew=1.1, color=E.C1, label='MEF (Ansys)')
        for p_ in c['cortes_mef']:
            E.no(ax, p_, ms=6.5)
        ax.plot(*np.array([c['A'], c['B']]).T, '^', ms=7, color=E.TINTA, zorder=6)
        grupo, sub = c['descricao'].split(' — ')
        ax.set_title(f'{grupo}\n{sub}', fontsize=9)
        ax.text(0.03, 0.04, f"$T_0$ = {c['T0_an']:.1f} / {c['T0_mef']:.1f} N\nRMS = {c['rms'] * 100:.1f} cm"
                .replace('.', ','), transform=ax.transAxes, fontsize=8, color=E.TINTA2,
                bbox=dict(fc='white', ec=E.GRADE, lw=0.6, pad=2.5))
        ax.set_aspect('equal', adjustable='datalim')
        ax.tick_params(labelsize=8)
    for ax in list(axs.flat)[n:]:
        ax.axis('off')
    h, l = axs.flat[0].get_legend_handles_labels()
    h.append(axs.flat[2].lines[-2])
    l.append('Troca de trecho / ponto da força')
    fig.legend(h, l, loc='lower center', ncol=3, frameon=False, bbox_to_anchor=(0.5, -0.01))
    fig.tight_layout(rect=(0, 0.03, 1, 1))
    E.salvar(fig, 'MEF_Casos_2D', FIGURAS)

    # ---- tração ao longo do cabo em quatro casos representativos
    sel = [c for c in res if c['nome'] in ('cap3_L35', 'hib3_peso', 'forca1_base', 'forca4_mu5')]
    fig, axs = E.figura(2, 2, largura=11, altura=6.6)
    for ax, c in zip(axs.flat, sel):
        ax.plot(c['s_an'], c['T_an'], '-', color=E.ANALITICO, lw=1.6, label='$T$ analítico')
        ax.plot(c['s_mef'][::2], c['N_mef'][::2], 'o', ms=3.4, mfc='white', mew=1.1, color=E.C1,
                label='$N$ MEF')
        ax.plot(c['s_mef'], c['t0_mef'], '--', color=E.C1, lw=1.4, label='$T_0 = N\\cos\\varphi$ MEF')
        ax.axhline(c['T0_an'], color=E.ANALITICO, ls='--', lw=1.3, label='$T_0$ analítico')
        for sc in c['cortes_s'][1:-1]:
            ax.axvline(sc, color=E.DESTAQUE, lw=0.9, ls=':')
        ax.set_title(c['descricao'].replace(' — ', ': ').replace('Cap. 3: c', 'C'), fontsize=9.5)
        ax.set_xlabel('Arco $s$ a partir de A [m]')
        ax.set_ylabel('[N]')
        ax.set_ylim(bottom=0)
    h, l = axs.flat[0].get_legend_handles_labels()
    fig.legend(h, l, loc='lower center', ncol=4, frameon=False, bbox_to_anchor=(0.5, -0.02))
    fig.tight_layout(rect=(0, 0.04, 1, 1))
    E.salvar(fig, 'MEF_Casos_2D_Tracao', FIGURAS)


def exportar_js(res):
    """casos2d.js para a aba 2D do visualizador"""
    from datetime import datetime, timezone
    chaves = ['nome', 'descricao', 'EI', 'substeps', 'L', 'A', 'B', 'trechos', 'forcas', 'cortes_s',
              'T0_an', 'T0_mef', 'T0_trechos', 'TA_an', 'TA_mef', 'TB_an', 'TB_mef', 'cortes_an', 'cortes_mef',
              'baixo_an', 'baixo_mef', 'rms', 'dmax', 'compressao']
    r4 = lambda v: round(v, 4) if isinstance(v, float) else [r4(x) for x in v] if isinstance(v, list) else v
    casos = []
    for c in res:
        d = {k: r4(c[k]) for k in chaves}
        d['xy_mef'] = r4(c['xy_mef'])
        d['xy_an'] = r4(c['xy_an'])
        d['N'] = [round(v, 2) for v in c['N_mef']]
        d['t0'] = [round(v, 2) for v in c['t0_mef']]
        d['s_mef'] = r4(c['s_mef'])
        d['s_an'] = r4(c['s_an'])
        d['T_an'] = [round(v, 2) for v in c['T_an']]
        casos.append(d)
    saida = {'gerado': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'ndiv': NDIV, 'casos': casos}
    open(SAIDA_JS, 'w', encoding='utf8').write('window.CASOS2D = ' + json.dumps(saida, ensure_ascii=False,
                                                                              separators=(',', ':')) + ';\n')
    print(f'casos2d.js: {len(casos)} casos ({os.path.getsize(SAIDA_JS) / 1e3:.0f} kB)')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('nomes', nargs='*')
    ap.add_argument('--so-converter', action='store_true')
    ap.add_argument('--fI', type=float, default=FI)
    ap.add_argument('--refazer', action='store_true')
    a = ap.parse_args()
    os.makedirs(RESULTADOS, exist_ok=True)
    nomes = a.nomes or list(CASOS)
    if not a.so_converter:
        for nome in nomes:
            if os.path.exists(os.path.join(RESULTADOS, nome + '.json')) and not a.refazer:
                print(f'{nome}: já existia')
                continue
            ok, msg = rodar(nome, a.fI)
            # como nos casos 3D com força: se EI/100 não converge, tenta EI/10
            if not ok and a.fI < 0.1:
                print(f'{nome}: {msg} -> tentando fI = 0.1', flush=True)
                ok, msg = rodar(nome, 0.1)
            print(f'{nome}: {msg}', flush=True)
    salvar_inps(a.fI)
    res = [comparar(n) for n in CASOS if os.path.exists(os.path.join(RESULTADOS, n + '.json'))]
    with open(os.path.join(RESULTADOS, 'resumo.csv'), 'w', newline='', encoding='utf8') as f:
        w = csv.writer(f, delimiter=';')
        w.writerow(['caso', 'EI', 'T0_an', 'T0_mef', 'dT0_%', 'var_T0_trechos_%', 'TA_an', 'TA_mef', 'TB_an',
                    'TB_mef', 'corte_an', 'corte_mef', 'baixo_an', 'baixo_mef', 'rms_m', 'dmax_m', 'compressao'])
        for c in res:
            fmt = lambda ps: ' '.join(f'({p[0]:.2f};{p[1]:.2f})' for p in ps)
            w.writerow([c['nome'], f"{c['EI']:.1f}", f"{c['T0_an']:.2f}", f"{c['T0_mef']:.2f}",
                        f"{100 * (c['T0_mef'] / c['T0_an'] - 1):+.2f}", f"{100 * c['T0_var']:.2f}",
                        f"{c['TA_an']:.2f}", f"{c['TA_mef']:.2f}", f"{c['TB_an']:.2f}", f"{c['TB_mef']:.2f}",
                        fmt(c['cortes_an']), fmt(c['cortes_mef']), fmt([c['baixo_an']]), fmt([c['baixo_mef']]),
                        f"{c['rms']:.4f}", f"{c['dmax']:.4f}", c['compressao']])
    print(open(os.path.join(RESULTADOS, 'resumo.csv'), encoding='utf8').read())
    if res:
        figuras(res)
        exportar_js(res)


if __name__ == '__main__':
    main()
