"""Gera ansys/experimento_corrente.inp a partir do PRÓPRIO catenaria3d.inp.

O arquivo do TCC é usado como molde: só são trocados o bloco de parâmetros, os dados da seção,
o afastamento dos pontos de orientação e as coordenadas da forma inicial (NMODIF). Malha, elemento,
peso por comprimento de elemento, solução e pós-processamento vêm do catenaria3d.inp sem alteração
(o script confere isso com um diff no final).

A forma inicial segue a regra que produziu os números do catenaria3d.inp, reproduzida aqui e
conferida contra ele (conferir_molde): cada trecho é uma parábola no seu plano vertical,
    x, z lineares em t;  y = y_ancora + t (y_P0 - y_ancora) - 4 f t (1 - t),   t = 0; 1/40; ...; 1
com a flecha f tal que a soma dos comprimentos dos 40 elementos seja exatamente L do trecho
(é assim no catenaria3d.inp: a poligonal de 41 nós mede 25,000 / 30,000 m).

Rigidez: EA e EI são parâmetros arbitrários do modelo. Copiar os valores do caso de 50 m daria
EI = 15,7 N.m2 numa corrente com T0 de 2,7 N: o comprimento de flexão sqrt(EI/T0) seria de 2,4 m,
maior que o cabo, e o modelo viraria uma barra. O que se mantém são os adimensionais do caso do TCC:
    EA/(q1 L1)  = 31416       (cabo praticamente inextensível)
    EI/(q1 L1^3) = 3,14e-6     (EI do modelo final do TCC -> fI = 0,00238; o usado é 0,003, ver FI abaixo)
E = 200 GPa e nu = 0,3 continuam iguais; mudam rsec e fI.

Uso:  python gerar_experimento_corrente.py [fI]
"""
import difflib
import json
import math
import re
import sys
from pathlib import Path

import numpy as np
from scipy.optimize import brentq

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / 'experimento' / 'comparacao'))
import dados_experimento as X  # noqa: E402

MOLDE = AQUI / 'catenaria3d.inp'
SAIDA = AQUI / 'experimento_corrente.inp'
NDIV = 40
E_MOD = 2.0e11

# adimensionais do caso principal do TCC (L1 = 50 m, q1 = 40 N/m, r = 1 cm, fI = 0,01)
PI_A = E_MOD * math.pi * 0.01 ** 2 / (40 * 50)
PI_I = E_MOD * 0.01 * math.pi * 0.01 ** 4 / 4 / (40 * 50 ** 3)
RSEC = round(math.sqrt(PI_A * X.Q1 * X.L1 / (E_MOD * math.pi)), 6)
I0 = math.pi * RSEC ** 4 / 4
FI_SEMELHANCA = PI_I * X.Q1 * X.L1 ** 3 / (E_MOD * I0)      # mesmo EI/(q L^3) do TCC
FI_SEM = float(f'{FI_SEMELHANCA:.3g}')                       # 0,00238
# fI usado: mesmo critério do estudo de rigidez do TCC = o menor EI que converge com as MESMAS
# configurações de solução. Com fI = 0,00238 (o EI do TCC em termos adimensionais) o Newton para
# no 3o subpasso: as normas de referência da convergência têm um piso absoluto (MINREF) que não
# escala com o problema, e aqui as forças são ~150x menores que no caso de 50 m. Com CNVTOL
# explícito (MINREF quase zero) ele converge, a 0,9 mm do resultado com fI = 0,003. Para não mexer
# na estratégia de solução, ficou fI = 0,003 (1,26x o EI de semelhança; 0,0027 também converge).
# Ver estudo_rigidez_experimento.py e resultados/estudo_rigidez_experimento.csv.
FI = 0.003


def parabola(anc, P0, L):
    """41 pontos da forma inicial do trecho anc -> P0, com arco L"""
    anc, P0 = np.array(anc, float), np.array(P0, float)
    t = np.linspace(0, 1, NDIV + 1)

    def pts(tt, f):
        p = anc + np.outer(tt, P0 - anc)
        p[:, 1] -= 4 * f * tt * (1 - tt)
        return p

    arco = lambda f: np.linalg.norm(np.diff(pts(t, f), axis=0), axis=1).sum()
    f = brentq(lambda f: arco(f) - L, 0, 10 * L)
    return pts(t, f)


def linhas_nmodif(pA, pB, pC, P0, LA, LB, LC):
    bl = []
    for nome, anc, L in (('ndA', pA, LA), ('ndB', pB, LB), ('ndC', pC, LC)):
        bl += [f'NMODIF,{nome}({i + 1}),{x:.8f},{y:.8f},{z:.8f}' for i, (x, y, z) in enumerate(parabola(anc, P0, L))]
        bl.append('')
    return bl[:-1]


def conferir_molde(s):
    """a regra da parábola reproduz os NMODIF do catenaria3d.inp?"""
    ger = linhas_nmodif((0, 20, 0), (40, 20, 0), (20, 15, 25), (20, 10, 8), 25, 25, 30)
    orig = re.findall(r'^NMODIF,.*$', s, re.M)
    d = [abs(float(a) - float(b)) for g, o in zip([x for x in ger if x], orig)
         for a, b in zip(g.split(',')[2:], o.split(',')[2:])]
    print(f'regra da parábola x catenaria3d.inp: {len(orig)} nós, diferença máxima {max(d):.2e} m')
    assert len(orig) == 3 * (NDIV + 1) and max(d) < 1e-5


def gerar(fI=FI):
    s = MOLDE.read_text(encoding='utf8', errors='replace').replace('\r\n', '\n')
    conferir_molde(s)
    aj = X.ler_json('ajuste_ramos.json')
    E = X.eixos_salvos()
    pA, pB, pC = (np.round(E.para_modelo(aj['ramos'][r]['fixacao']), 5) + 0.0 for r in ('C1', 'C3', 'C2'))
    # palpite inicial de P, mesma regra relativa do TCC: em x, a fração eta do vão (no TCC,
    # eta = 0,5 e isso é a média); em z, 32% de zC (8 de 25); em y, acima da posição final
    xp0 = pA[0] + X.ETA * (pB[0] - pA[0])
    yp0, zp0 = 0.45, round(0.32 * pC[2], 4)
    P0 = (round(float(xp0), 5), yp0, float(zp0))

    novo = f"""! ============ Parametros fisicos (experimento com correntes, Estatica_corrente.tsv) ============
! Sistema do modelo: y vertical, A e B em z = 0, em m e N/m. Passagem do Qualisys (mm):
! ver experimento/comparacao/dados_experimento.py (classe Eixos). Fixacoes A, B, C NAO medidas:
! catenaria ajustada a cada ramo, prolongada ate o comprimento medido (ajuste_ramos.py).
xa={pA[0]:.5f}     $ ya={pA[1]:.5f}    $ za={pA[2]:.5f}
xb={pB[0]:.5f}     $ yb={pB[1]:.5f}    $ zb={pB[2]:.5f}
xc={pC[0]:.5f}     $ yc={pC[1]:.5f}    $ zc={pC[2]:.5f}

L1={X.L1}
LC={X.LC}
eta={X.ETA}
LA=eta*L1
LB=(1-eta)*L1

! corrente grossa: 1,373 kg em 2,004 m; media: 0,948 kg em 2,002 m; g = 9,80665 m/s2
q1={X.Q1:.6f}
q2={X.Q2:.6f}

xp0={P0[0]}
yp0={P0[1]}
zp0={P0[2]}
"""
    i0 = s.index('! ============ Parametros fisicos')
    i1 = s.index('! ============ Geometria')
    s = s[:i0] + novo + '\n' + s[i1:]
    s = s.replace('/FILNAME,catenaria3d,1', '/FILNAME,experimento_corrente,1')
    s = s.replace('/TITLE,Catenaria 3D - Caso Principal (TCC)', '/TITLE,Experimento com correntes - mesmo modelo do Estudo de Caso 3 (TCC)')
    # pontos de orientacao: mesmo afastamento relativo (5 m em 25 m -> 0,2 m em 1 m)
    for k, c in (('10', 'a'), ('11', 'b'), ('12', 'c')):
        s = s.replace(f'K,{k},x{c},y{c}+5,z{c}', f'K,{k},x{c},y{c}+0.2,z{c}')
    assert s.count('rsec=0.01\n') == 1 and s.count('fI=0.01\n') == 1
    s = s.replace('rsec=0.01\n', f'! rsec e fI: mesmos EA/(q1 L1) e EI/(q1 L1^3) do caso do TCC (ver gerar_experimento_corrente.py)\nrsec={RSEC}\n')
    s = s.replace('fI=0.01\n', f'fI={fI:.4g}\n')
    s = s.replace('! Secao generica (ASEC): area de uma secao circular de raio rsec = 1 cm',
                  '! Secao generica (ASEC): area de uma secao circular de raio rsec')
    s = s.replace('! sao independentes. fI = 0,01 foi o menor valor que converge de forma\n! confiavel (ver estudo_rigidez.py); EI menor ainda deixa o 1o substep',
                  '! sao independentes. fI: ver estudo_rigidez_experimento.py; EI menor ainda deixa o 1o substep')
    s = s.replace('! (elementos de ~0,54 a ~0,81 m). ', '! (elementos de comprimentos diferentes). ')
    nm = linhas_nmodif(pA, pB, pC, P0, X.LA, X.LB, X.LC)
    i0 = s.index('NMODIF,ndA(1)')
    i1 = s.index('! ============ Cargas: peso proprio pelo comprimento')
    s = s[:i0] + '\n'.join(nm) + '\n\n' + s[i1:]
    assert s.isascii()
    SAIDA.write_text(s, encoding='utf8')
    return s, pA, pB, pC, P0


def main():
    fI = float(sys.argv[1]) if len(sys.argv) > 1 else FI
    s, pA, pB, pC, P0 = gerar(fI)
    print(f'A = {pA}  B = {pB}  C = {pC}  P0 = {P0}')
    print(f'rsec = {RSEC} m, A = {math.pi * RSEC ** 2:.4e} m2, EA = {E_MOD * math.pi * RSEC ** 2:.4e} N')
    print(f'fI (semelhança) = {FI_SEM:.4g}; fI usado = {fI:.4g}; EI = {E_MOD * fI * I0:.4e} N.m2')
    # o que mudou em relação ao molde, fora parâmetros e NMODIF
    a = MOLDE.read_text(encoding='utf8', errors='replace').replace('\r\n', '\n').splitlines()
    dif = [l for l in difflib.unified_diff(a, s.splitlines(), lineterm='', n=0)
           if l[:1] in '+-' and l[:3] not in ('+++', '---') and 'NMODIF' not in l]
    print(f'{len(dif)} linhas diferentes do molde fora os NMODIF:')
    print('\n'.join(dif))


if __name__ == '__main__':
    main()
