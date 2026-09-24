"""Estudo paramétrico da rigidez à flexão (EI) no modelo BEAM188 do caso principal.

A seção circular maciça (CSOLID) acopla área e inércia (A = pi r^2, I = pi r^4 / 4):
reduzir o raio diminui EI, mas também EA. Aqui a seção vira genérica (ASEC), com a
MESMA área do raio de 1 cm (EA inalterado, cabo praticamente inextensível) e o momento
de inércia I multiplicado por um fator 'fI' (1, 1e-1, ..., 1e-6). Para cada fator,
gera-se uma cópia do catenaria3d.inp, roda-se o ANSYS em lote numa pasta temporária
e extraem-se a posição final de P e T0 (média na metade central de cada trecho, como
no texto do TCC) para comparar com o modelo analítico.

Uso:  python estudo_rigidez.py [fI ...]      (padrão: 1 1e-1 1e-2 1e-3 1e-4 1e-6)
Saída: tabela no terminal + estudo_rigidez.csv
"""
import csv
import math
import os
import re
import subprocess
import sys
import tempfile

import numpy as np

AQUI = os.path.dirname(os.path.abspath(__file__))
ANSYS = r'C:\Program Files\ANSYS Inc\ANSYS Student\v261\ansys\bin\winx64\ANSYS261.exe'
INP = os.path.join(AQUI, 'catenaria3d.inp')

R0 = 0.01                               # raio de referência (modelo do texto)
A0 = math.pi * R0 ** 2
I0 = math.pi * R0 ** 4 / 4
ESTAB = os.environ.get('ESTAB', 'STABILIZE,CONSTANT,ENERGY,1.0E-5')
CARGA_POR_COMPRIMENTO = os.environ.get('CARGA', '1') == '1'
CARGA_APDL = r"""
! ---- peso proprio pelo comprimento real de cada elemento (forma inicial)
FDELE,ALL,ALL
FCUM,ADD
*GET,emx,ELEM,0,NUM,MAX
*DO,e,1,emx
  n1=NELEM(e,1)
  n2=NELEM(e,2)
  *GET,sc,ELEM,e,ATTR,SECN
  le=DISTND(n1,n2)
  qe=q1
  *IF,sc,EQ,3,THEN
    qe=q2
  *ENDIF
  F,n1,FY,-qe*le/2
  F,n2,FY,-qe*le/2
*ENDDO
FCUM,REPL
"""
ANALITICO = {'P': (20.00, 6.36, 2.30), 'T0': (818.54, 818.54, 186.69)}

# pós-processamento extra: coordenadas finais de todos os nós, conectividade e AXF
# de todos os elementos (a ordem ao longo de cada trecho é reconstruída em Python)
POS_EXTRA = r"""
/POST1
SET,LAST
ALLSEL,ALL
ETABLE,AXF,SMISC,1
*GET,nmx,NODE,0,NUM,MAX
*CFOPEN,nos_final,txt
*DO,i,1,nmx
  *IF,NSEL(i),EQ,1,THEN
    xf=NX(i)+UX(i)
    yf=NY(i)+UY(i)
    zf=NZ(i)+UZ(i)
    *VWRITE,i,xf,yf,zf
(F8.0,3E20.10)
  *ENDIF
*ENDDO
*CFCLOS
*GET,emx,ELEM,0,NUM,MAX
*CFOPEN,elems_final,txt
*DO,k,1,emx
  n1=NELEM(k,1)
  n2=NELEM(k,2)
  *GET,sc,ELEM,k,ATTR,SECN
  *GET,ax,ELEM,k,ETAB,AXF
  *VWRITE,k,sc,n1,n2,ax
(4F8.0,E20.10)
*ENDDO
*CFCLOS
/OUT,convergiu,txt
*VWRITE,1
(F4.0)
/OUT
FINISH
"""


def preparar(fI, pasta):
    s = open(INP, encoding='utf8', errors='replace').read()
    I = I0 * fI
    sec_nova = '\n'.join(f'SECTYPE,{k},BEAM,ASEC\nSECDATA,{A0:.6e},{I:.6e},0,{I:.6e},0,{2 * I:.6e}' for k in (1, 2, 3))
    s, n = re.subn(r'SECTYPE,1,BEAM,CSOLID\s*\nSECDATA,[^\n]*\nSECTYPE,2,BEAM,CSOLID\s*\nSECDATA,[^\n]*\n'
                   r'SECTYPE,3,BEAM,CSOLID\s*\nSECDATA,[^\n]*', sec_nova, s)
    assert n == 1, 'bloco de seção não encontrado no .inp'
    # remove a imagem PNG final (lenta e desnecessária aqui) e acrescenta a exportação
    s = s.replace('/SHOW,PNG', '/SHOW,TERM').replace('PLDISP,1', '')
    # estabilização: com EI pequeno o 1o substep é quase singular (cabo ainda sem
    # tração = sem rigidez transversal). REDUCE leva o amortecimento artificial a
    # zero no fim do passo de carga, então o equilíbrio final não é afetado.
    assert 'STABILIZE,CONSTANT,ENERGY,1.0E-5' in s
    s = s.replace('STABILIZE,CONSTANT,ENERGY,1.0E-5', ESTAB).replace('NSUBST,150,1500,30', 'NSUBST,200,20000,50')
    if CARGA_POR_COMPRIMENTO:
        # peso nodal pelo comprimento REAL dos elementos na forma inicial (os nós da
        # parábola inicial não são equiespaçados em arco: carga igual por nó = peso
        # distribuído errado). Cada elemento leva q*le/2 a cada um dos seus 2 nós.
        m = re.search(r'NMODIF,ndC\(41\)[^\n]*\n', s)
        assert m
        s = s[:m.end()] + CARGA_APDL + s[m.end():]
    s += POS_EXTRA
    open(os.path.join(pasta, 'modelo.inp'), 'w', encoding='utf8').write(s)


def extrair(pasta):
    nos = {}
    for ln in open(os.path.join(pasta, 'nos_final.txt')):
        p = ln.split()
        nos[int(float(p[0]))] = np.array([float(v) for v in p[1:4]])
    elems = []
    for ln in open(os.path.join(pasta, 'elems_final.txt')):
        k, sc, n1, n2, ax = ln.split()
        elems.append((int(float(sc)), int(float(n1)), int(float(n2)), float(ax)))
    P = None
    res = {}
    # nó P = único nó comum aos três trechos
    conj = [set(n for e in elems if e[0] == s for n in e[1:3]) for s in (1, 2, 3)]
    (nP,) = conj[0] & conj[1] & conj[2]
    P = nos[nP]
    for s in (1, 2, 3):
        es = [e for e in elems if e[0] == s]
        # percorre do nó P até a ancoragem pela conectividade
        ordem, atual, restantes = [], nP, es[:]
        while restantes:
            e = next(e for e in restantes if atual in e[1:3])
            restantes.remove(e)
            prox = e[2] if e[1] == atual else e[1]
            d = nos[prox] - nos[atual]
            ordem.append((e[3], d))
            atual = prox
        ordem.reverse()  # ancoragem -> P
        n = len(ordem)
        T0 = np.array([ax * math.hypot(d[0], d[2]) / np.linalg.norm(d) for ax, d in ordem])
        meio = slice(n // 4, 3 * n // 4)
        res[s] = {'T0_meio': T0[meio].mean(), 'T0_P': T0[-1], 'Nmax': max(ax for ax, _ in ordem),
                  'L': sum(np.linalg.norm(d) for _, d in ordem)}
    return P, res


def rodar(fI):
    pasta = tempfile.mkdtemp(prefix=f'rig_{fI:g}_')
    preparar(fI, pasta)
    subprocess.run([ANSYS, '-b', '-i', 'modelo.inp', '-o', 'saida.out', '-j', 'modelo'],
                   cwd=pasta, capture_output=True, timeout=1800)
    if not os.path.exists(os.path.join(pasta, 'convergiu.txt')):
        return None, pasta
    # convergiu = o último substep concluído chegou ao fator de carga 1
    saida = open(os.path.join(pasta, 'saida.out'), errors='replace').read()
    tempos = re.findall(r'SUBSTEP\s+\d+\s+COMPLETED\.\s+CUM ITER =\s*\d+\s*\n\s*\*\*\* TIME =\s*([\d.Ee+-]+)', saida)
    if not tempos or abs(float(tempos[-1]) - 1) > 1e-6:
        return None, pasta
    return extrair(pasta), pasta


def main():
    fatores = [float(v) for v in sys.argv[1:]] or [1, 1e-1, 1e-2, 1e-3, 1e-4, 1e-6]
    linhas = []
    Pa, Ta = ANALITICO['P'], ANALITICO['T0']
    print(f"{'fI':>8} {'EI [N.m2]':>11} {'xP':>7} {'yP':>7} {'zP':>7} {'T0A':>8} {'T0B':>8} {'T0C':>8}"
          f" {'dyP':>6} {'dzP':>6} {'dT0A%':>6} {'dT0C%':>6}")
    for fI in fatores:
        r, pasta = rodar(fI)
        EI = 2.0e11 * I0 * fI
        if r is None:
            print(f'{fI:8g} {EI:11.3e}  NÃO CONVERGIU (ver {pasta})')
            linhas.append({'fI': fI, 'EI': EI, 'convergiu': False})
            continue
        P, res = r
        T = [res[s]['T0_meio'] for s in (1, 2, 3)]
        lin = {'fI': fI, 'EI': EI, 'convergiu': True, 'xP': P[0], 'yP': P[1], 'zP': P[2],
               'T0A': T[0], 'T0B': T[1], 'T0C': T[2],
               'T0A_P': res[1]['T0_P'], 'T0C_P': res[3]['T0_P'],
               'LA': res[1]['L'], 'LB': res[2]['L'], 'LC': res[3]['L']}
        linhas.append(lin)
        print(f'{fI:8g} {EI:11.3e} {P[0]:7.3f} {P[1]:7.3f} {P[2]:7.3f} {T[0]:8.2f} {T[1]:8.2f} {T[2]:8.2f}'
              f' {P[1] - Pa[1]:+6.2f} {P[2] - Pa[2]:+6.2f} {100 * (T[0] / Ta[0] - 1):+6.1f} {100 * (T[2] / Ta[2] - 1):+6.1f}',
              flush=True)
    with open(os.path.join(AQUI, 'estudo_rigidez.csv'), 'w', newline='', encoding='utf8') as f:
        campos = ['fI', 'EI', 'convergiu', 'xP', 'yP', 'zP', 'T0A', 'T0B', 'T0C', 'T0A_P', 'T0C_P', 'LA', 'LB', 'LC']
        w = csv.DictWriter(f, fieldnames=campos)
        w.writeheader()
        w.writerows(linhas)


if __name__ == '__main__':
    main()
