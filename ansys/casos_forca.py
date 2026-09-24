"""Casos de força concentrada (vertical, para baixo) no modelo corrigido.

Para cada cabo (A-P e C-P), cada posição (fração do comprimento de arco a partir
da ancoragem) e cada intensidade, gera uma cópia do catenaria3d.inp com a força
aplicada no nó mais próximo daquela posição, roda o ANSYS em lote (um caso por
vez, por causa da licença Student, cada um numa pasta temporária) e junta tudo em
visualizador/casos.js.

Uso:  python casos_forca.py [--paralelo N] [--so-converter]
"""
import argparse
import concurrent.futures as cf
import json
import math
import os
import re
import subprocess
import tempfile
import time
from datetime import datetime, timezone

import numpy as np

AQUI = os.path.dirname(os.path.abspath(__file__))
ANSYS = r'C:\Program Files\ANSYS Inc\ANSYS Student\v261\ansys\bin\winx64\ANSYS261.exe'
INP = os.path.join(AQUI, 'catenaria3d.inp')
RESULTADOS = os.path.join(AQUI, 'casos_forca')          # 1 JSON por caso
SAIDA_JS = os.path.join(AQUI, '..', 'visualizador', 'casos.js')

POSICOES = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95]
MAGNITUDES = [100, 200, 300, 400, 600, 800, 1000, 1300, 1600, 2000]   # N
# Rigidez à flexão nos casos com força concentrada: EI/10 da seção de 1 cm. O caso
# principal (sem força) usa EI/100, mas com EI/100 + força concentrada o Newton não
# converge (as rotações nodais quase não têm rigidez e a "quina" sob a força trava
# a convergência por volta de ~900 N). Com EI/10 converge; sem força, EI/10 fica a
# ~0,2 m do analítico em P, com T0 a +0,1% (A-P) / +0,6% (C-P).
FI_CASOS = 0.1
# primeiro o cabo que ramifica (C-P), depois A-P
CABOS = {  # nome: (vetor de nós do .inp, da ancoragem [1] até P [41]; comprimento)
    'C-P': ('ndC', 'LC'),
    'A-P': ('ndA', 'LA'),
}

FORCA_APDL = r"""
! ---- forca concentrada (casos_forca.py): cabo {cabo}, {frac:.0%} do arco, {mag:g} N
! procura, ao longo do vetor de nos {arr} (ancoragem -> P), o no cujo
! comprimento de arco acumulado (forma inicial) fica mais perto do alvo
starget={frac}*{Lnome}
sacc=0
kbest=1
dbest=1.0E9
sbest=0
*DO,k,2,41
  kk=k-1
  sacc=sacc+DISTND({arr}(kk),{arr}(k))
  dd=ABS(sacc-starget)
  *IF,dd,LT,dbest,THEN
    dbest=dd
    kbest=k
    sbest=sacc
  *ENDIF
*ENDDO
nForca={arr}(kbest)
"""

# 2o passo de carga: a força concentrada só entra DEPOIS que o peso próprio já
# convergiu (cabo tracionado = com rigidez transversal). Aplicada junto com o
# peso, com EI tão pequeno, a "quina" sob a força não converge.
PASSO2_APDL = r"""
! ---- 2o passo de carga: forca concentrada em rampa (casos_forca.py)
FCUM,ADD
F,nForca,FY,-{mag}
FCUM,REPL
TIME,2
NSUBST,50,20000,20
LNSRCH,ON
STABILIZE,CONSTANT,ENERGY,1.0E-2
SOLVE
! ---- 3o passo: MESMA carga, sem amortecimento artificial nenhum -> o estado
! final e um equilibrio estatico "limpo" (a estabilizacao so ajudou a chegar la)
TIME,3
NSUBST,5,1000,2
STABILIZE,OFF
SOLVE
"""

EXPORT_APDL = r"""
/POST1
SET,LAST
ALLSEL,ALL
ETABLE,AXF,SMISC,1
*GET,nmx,NODE,0,NUM,MAX
*CFOPEN,caso,txt
*VWRITE,nForca,sbest
('F',F8.0,E20.10)
*DO,i,1,nmx
  *IF,NSEL(i),EQ,1,THEN
    x0=NX(i)
    y0=NY(i)
    z0=NZ(i)
    xf=x0+UX(i)
    yf=y0+UY(i)
    zf=z0+UZ(i)
    *VWRITE,i,x0,y0,z0,xf,yf,zf
('N',F8.0,6E20.10)
  *ENDIF
*ENDDO
*GET,emx,ELEM,0,NUM,MAX
*DO,k,1,emx
  n1=NELEM(k,1)
  n2=NELEM(k,2)
  *GET,sc,ELEM,k,ATTR,SECN
  *GET,ax,ELEM,k,ETAB,AXF
  *VWRITE,k,sc,n1,n2,ax
('E',4F8.0,E20.10)
*ENDDO
*CFCLOS
FINISH
"""


def gerar_inp(cabo, frac, mag):
    s = open(INP, encoding='utf8', errors='replace').read().replace('\r\n', '\n')
    # rigidez à flexão dos casos com força: EI/10 (ver FI_CASOS)
    assert 'fI=0.01\n' in s
    s = s.replace('fI=0.01\n', f'fI={FI_CASOS}\n')
    arr, Lnome = CABOS[cabo]
    bloco = FORCA_APDL.format(cabo=cabo, frac=frac, mag=mag, arr=arr, Lnome=Lnome)
    # logo depois do peso próprio (que termina em FCUM,REPL)
    assert s.count('FCUM,REPL') == 1
    s = s.replace('FCUM,REPL\n', 'FCUM,REPL\n' + bloco, 1)
    i = s.index('SOLVE\n', s.index('/SOLU')) + len('SOLVE\n')
    s = s[:i] + PASSO2_APDL.format(mag=mag) + s[i:]
    # sem imagem PNG no fim (lenta) e com a exportação completa do estado final
    s = s.replace('/SHOW,PNG', '/SHOW,TERM').replace('PLDISP,1', '')
    return s + EXPORT_APDL


def rodar_caso(cabo, frac, mag):
    tag = f"{cabo.replace('-', '')}_{round(frac * 100):02d}_{mag:04d}"
    destino = os.path.join(RESULTADOS, tag + '.json')
    if os.path.exists(destino):
        return tag, 'já existia'
    pasta = tempfile.mkdtemp(prefix=f'caso_{tag}_')
    open(os.path.join(pasta, 'modelo.inp'), 'w', encoding='utf8').write(gerar_inp(cabo, frac, mag))
    t = time.time()
    subprocess.run([ANSYS, '-b', '-np', '1', '-i', 'modelo.inp', '-o', 'saida.out', '-j', 'modelo'],
                   cwd=pasta, capture_output=True, timeout=3600)
    saida = open(os.path.join(pasta, 'saida.out'), errors='replace').read()
    tempos = re.findall(r'SUBSTEP\s+\d+\s+COMPLETED\.\s+CUM ITER =\s*\d+\s*\n\s*\*\*\* TIME =\s*([\d.Ee+-]+)', saida)
    ok = bool(tempos) and abs(float(tempos[-1]) - 3) < 1e-6 and os.path.exists(os.path.join(pasta, 'caso.txt'))
    if not ok:
        return tag, f'NÃO CONVERGIU ({pasta})'
    res = ler_caso(os.path.join(pasta, 'caso.txt'))
    res.update(cabo=cabo, pos=frac, mag=mag, substeps=len(tempos), segundos=round(time.time() - t, 1))
    json.dump(res, open(destino, 'w'))
    return tag, f'ok ({len(tempos)} substeps, {time.time() - t:.0f} s)'


def ler_caso(arq):
    nos, elems, nF, sF = {}, [], None, None
    for ln in open(arq):
        p = ln.split()
        if p[0] == 'F':
            nF, sF = int(float(p[1])), float(p[2])
        elif p[0] == 'N':
            v = [float(x) for x in p[1:]]
            nos[int(v[0])] = (v[1:4], v[4:7])
        elif p[0] == 'E':
            elems.append((int(float(p[2])), int(float(p[3])), int(float(p[4])), float(p[5])))
    return {'nos': nos, 'elems': elems, 'nF': nF, 'sF': sF}


def topologia(nos, elems):
    """Mesma lógica do converter_dados.mjs: P = nó comum às 3 seções; cada cabo é
    percorrido da ancoragem até P; índices = ids dos nós usados em ordem crescente."""
    usados = sorted({n for e in elems for n in e[1:3]})
    idx = {n: i for i, n in enumerate(usados)}
    secs = {}
    for sc, a, b, _ in elems:
        secs.setdefault(a, set()).add(sc)
        secs.setdefault(b, set()).add(sc)
    (noP,) = [n for n in usados if len(secs[n]) == 3]
    cabos = {}
    for sc in (1, 2, 3):
        es = [e for e in elems if e[0] == sc]
        grau = {}
        for e in es:
            for n in e[1:3]:
                grau[n] = grau.get(n, 0) + 1
        anc = next(n for n, g in grau.items() if g == 1 and n != noP)
        ordem, atual, resto = [anc], anc, es[:]
        axf = []
        while atual != noP:
            e = next(e for e in resto if atual in e[1:3])
            resto.remove(e)
            atual = e[2] if e[1] == atual else e[1]
            ordem.append(atual)
            axf.append(e[3])
        cabos[sc] = (ordem, axf)
    return usados, idx, noP, cabos


def tag_de(cabo, frac, mag):
    return f"{cabo.replace('-', '')}_{round(frac * 100):02d}_{mag:04d}"


# caso de referência: força nula (mesmo modelo EI/10, mesmos 3 passos de carga)
BASE = ('C-P', 0.05, 0)


def processar(r, nos0_ref, tag):
    """Estado final de um caso -> deslocamentos na ordem de nós do dados.js, T0
    (média na metade central de cada trecho), N máx. e checagem de compressão."""
    nos = {int(k): v for k, v in r['nos'].items()}
    usados, idx, noP, cab = topologia(nos, [tuple(e) for e in r['elems']])
    x0 = np.array([nos[n][0] for n in usados])
    assert np.abs(x0 - nos0_ref).max() < 1e-4, f'{tag}: ordem de nós difere do dados.js'
    xf = np.array([nos[n][1] for n in usados])
    u = xf - x0
    T0, Nmax, compr = [], [], False
    for sc in (1, 2, 3):
        ordem, axf = cab[sc]
        d = np.diff(xf[[idx[n] for n in ordem]], axis=0)
        t0 = np.array(axf) * np.hypot(d[:, 0], d[:, 2]) / np.linalg.norm(d, axis=1)
        m = len(t0)
        T0.append(round(float(t0[m // 4: 3 * m // 4].mean()), 3))
        Nmax.append(round(max(axf), 2))
        compr = compr or min(axf) < 0
    return {
        's': round(r['sF'], 4), 'noF': idx[r['nF']],
        'T0': T0, 'Nmax': Nmax, 'compressao': compr,
        'noP': [round(float(v), 5) for v in xf[idx[noP]]],
        'u': [[round(float(c), 4) for c in v] for v in u],
        # força axial de cada elemento, na ordem do id (elemento k = índice k-1),
        # para o visualizador pintar o cabo com a tração real do caso
        'N': [round(e[3], 1) for e in r['elems']],
    }


def converter():
    sim_txt = open(os.path.join(AQUI, '..', 'visualizador', 'dados.js'), encoding='utf8').read()
    SIM = json.loads(re.sub(r'^window\.SIM = ', '', sim_txt).rstrip().rstrip(';'))
    nos0_ref = np.array(SIM['nos0'])
    casos, faltando = [], []
    for cabo in CABOS:
        for frac in POSICOES:
            for mag in MAGNITUDES:
                tag = f"{cabo.replace('-', '')}_{round(frac * 100):02d}_{mag:04d}"
                arq = os.path.join(RESULTADOS, tag + '.json')
                if not os.path.exists(arq):
                    faltando.append(tag)
                    continue
                casos.append({'cabo': cabo, 'pos': frac, 'mag': mag, **processar(json.load(open(arq)), nos0_ref, tag)})
    # referência sem força com o MESMO modelo dos casos (EI/10), para comparar P e T0
    arq_base = os.path.join(RESULTADOS, tag_de(*BASE) + '.json')
    base = None
    if os.path.exists(arq_base):
        b = processar(json.load(open(arq_base)), nos0_ref, 'base')
        base = {'noP': b['noP'], 'T0': b['T0'], 'Nmax': b['Nmax']}
    else:
        faltando.append('base (sem força)')
    saida = {
        'gerado': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'cabos': list(CABOS), 'posicoes': POSICOES, 'magnitudes': MAGNITUDES,
        'comprimento': {'A-P': 25.0, 'C-P': 30.0}, 'fI': FI_CASOS,
        'base': base,
        'casos': casos,
    }
    open(SAIDA_JS, 'w', encoding='utf8').write('window.CASOS = ' + json.dumps(saida, separators=(',', ':')) + ';\n')
    print(f'casos.js: {len(casos)} casos ({os.path.getsize(SAIDA_JS) / 1e3:.0f} kB)')
    if faltando:
        print('faltando:', ', '.join(faltando))
    comp = [f"{c['cabo']} {c['pos']:.0%} {c['mag']} N" for c in casos if c['compressao']]
    print('casos com compressão:', ', '.join(comp) if comp else 'nenhum')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--paralelo', type=int, default=1)  # licença Student: 1 solução por vez
    ap.add_argument('--so-converter', action='store_true')
    ap.add_argument('--teste', action='store_true', help='roda só 2 casos para conferir')
    a = ap.parse_args()
    os.makedirs(RESULTADOS, exist_ok=True)
    if not a.so_converter:
        lista = [BASE] + [(c, f, m) for c in CABOS for f in POSICOES for m in MAGNITUDES]
        if a.teste:
            lista = [('C-P', 0.45, 1000), ('A-P', 0.25, 600)]
        t = time.time()
        with cf.ThreadPoolExecutor(a.paralelo) as ex:
            futs = {ex.submit(rodar_caso, *c): c for c in lista}
            for i, fu in enumerate(cf.as_completed(futs), 1):
                tag, msg = fu.result()
                print(f'[{i}/{len(lista)}] {tag}: {msg}  ({(time.time() - t) / 60:.1f} min)', flush=True)
    converter()


if __name__ == '__main__':
    main()
