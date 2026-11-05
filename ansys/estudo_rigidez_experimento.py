"""Estudo da rigidez à flexão para o modelo do experimento (mesmo critério do estudo_rigidez.py).

Mesmo procedimento do estudo do TCC: área fixa (rsec do experimento_corrente.inp), momento de
inércia multiplicado por fI, uma cópia do .inp por fator rodada em lote numa pasta temporária,
posição final de P e T0 (média na metade central de cada trecho) comparadas com o analítico.
Critério do TCC: o menor EI que converge de forma confiável.

Uso:  python estudo_rigidez_experimento.py [fI ...]
Saída: tabela no terminal + ../experimento/comparacao/resultados/estudo_rigidez_experimento.csv
"""
import csv
import math
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

from estudo_rigidez import POS_EXTRA, extrair, ANSYS   # mesma extração do estudo do TCC
import gerar_experimento_corrente as G

AQUI = Path(__file__).resolve().parent
INP = AQUI / 'experimento_corrente.inp'
SAIDA = G.X.RESULTADOS / 'estudo_rigidez_experimento.csv'


def rodar(fI, extra=''):
    pasta = tempfile.mkdtemp(prefix=f'rigexp_{fI:g}_')
    s = INP.read_text(encoding='utf8')
    s, n = re.subn(r'^fI=.*$', f'fI={fI:.6g}', s, flags=re.M)
    assert n == 1
    s = s.replace('/SHOW,PNG', '/SHOW,TERM').replace('PLDISP,1', '')
    if extra:      # variante numérica (ex.: CNVTOL), inserida logo antes do SOLVE
        s = s.replace('OUTRES,ALL,ALL\nSOLVE', f'OUTRES,ALL,ALL\n{extra}\nSOLVE')
    s += POS_EXTRA
    Path(pasta, 'modelo.inp').write_text(s, encoding='utf8')
    subprocess.run([ANSYS, '-b', '-np', '1', '-i', 'modelo.inp', '-o', 'saida.out', '-j', 'modelo'],
                   cwd=pasta, capture_output=True, timeout=3600)
    saida = Path(pasta, 'saida.out').read_text(errors='replace')
    tempos = re.findall(r'SUBSTEP\s+\d+\s+COMPLETED\.\s+CUM ITER =\s*\d+\s*\n\s*\*\*\* TIME =\s*([\d.Ee+-]+)', saida)
    if not os.path.exists(os.path.join(pasta, 'convergiu.txt')) or not tempos or abs(float(tempos[-1]) - 1) > 1e-6:
        ult = float(tempos[-1]) if tempos else 0.0
        return None, pasta, len(tempos), ult
    return extrair(pasta), pasta, len(tempos), 1.0


def main():
    fatores = [float(v) for v in sys.argv[1:] if not v.startswith('--')] or \
        [G.FI_SEM * 100, G.FI_SEM * 10, G.FI_SEM * 3, 0.0048, 0.0036, 0.003, 0.0027, G.FI_SEM]
    extra = os.environ.get('EXTRA', '')
    an = G.X.ler_json('caso_analitico.json')
    Pa, Ta = np.array(an['P_modelo_m']), [an['ramos'][i]['T0'] for i in 'ABC']
    I0 = math.pi * G.RSEC ** 4 / 4
    print(f'analítico: P = {np.round(Pa, 5)} m, T0 = {np.round(Ta, 4)} N; fI de semelhança com o TCC = {G.FI_SEM:g}')
    if extra:
        print('variante numérica:', extra)
    linhas = []
    for fI in fatores:
        EI = G.E_MOD * I0 * fI
        r, pasta, nsub, ult = rodar(fI, extra)
        if r is None:
            print(f'fI = {fI:<9.4g} EI = {EI:.3e} N.m2  NÃO CONVERGIU (parou no fator de carga {ult:.3g}, {nsub} subpassos; {pasta})', flush=True)
            linhas.append(dict(fI=fI, EI=EI, EI_rel_TCC=fI / G.FI_SEM, convergiu=False, subpassos=nsub, extra=extra))
            continue
        P, res = r
        T = [res[s]['T0_meio'] for s in (1, 2, 3)]
        d = (P - Pa) * 1000
        print(f'fI = {fI:<9.4g} EI = {EI:.3e} N.m2  {nsub:4d} subpassos  P = {np.round(P, 5)}  |P-Pan| = {np.linalg.norm(d):5.2f} mm'
              f'  T0 = {np.round(T, 4)}  dT0 % = {np.round([100 * (t / ta - 1) for t, ta in zip(T, Ta)], 2)}', flush=True)
        linhas.append(dict(fI=fI, EI=EI, EI_rel_TCC=fI / G.FI_SEM, convergiu=True, subpassos=nsub, extra=extra,
                           xP=P[0], yP=P[1], zP=P[2], dP_mm=np.linalg.norm(d),
                           T0A=T[0], T0B=T[1], T0C=T[2], LA=res[1]['L'], LB=res[2]['L'], LC=res[3]['L']))
    novo = not SAIDA.exists()
    with open(SAIDA, 'a', newline='', encoding='utf8') as f:
        w = csv.DictWriter(f, fieldnames=['fI', 'EI', 'EI_rel_TCC', 'convergiu', 'subpassos', 'extra', 'xP', 'yP', 'zP',
                                          'dP_mm', 'T0A', 'T0B', 'T0C', 'LA', 'LB', 'LC'])
        if novo:
            w.writeheader()
        w.writerows(linhas)


if __name__ == '__main__':
    main()
